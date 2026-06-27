import {
  buildDependencyRows,
  EMPTY_COLUMN_FILTERS,
  filterDependencyRows,
  type ColumnFilters,
} from './dependencyTable';
import { filterByFeatureCluster, listFeatureOptions } from './featureFocus';
import { filterByProject, listProjectOptions, type ProjectOption } from './projectFilter';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

const vscode = acquireVsCodeApi();

const VIEW_EDGE_KINDS: Record<string, string[] | null> = {
  reducer: ['reducesTo'],
  effects: ['effectListensFor', 'effectDispatches'],
  components: ['componentSubscribesTo', 'componentDispatches'],
  all: null,
};

interface GraphNode {
  id: string;
  kind: string;
  displayName: string;
  filePath?: string;
  line?: number;
  featureStateId?: string | null;
  projectPath?: string | null;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphEdge {
  fromId: string;
  toId: string;
  kind: string;
  source?: GraphNode | string;
  target?: GraphNode | string;
}

interface CycleReport {
  nodeIds?: string[];
}

interface ProjectOption {
  id: string;
  label: string;
}

interface FullGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  cycles: CycleReport[];
  view?: string;
  projects?: ProjectOption[];
  activeProjectPath?: string | null;
}

let fullGraph: FullGraph = { nodes: [], edges: [], cycles: [] };
let currentView = 'reducer';
let currentProject: string | null = null;
let currentFeature: string | null = null;
let activePanel: 'graph' | 'table' = 'graph';
let columnFilters: ColumnFilters = { ...EMPTY_COLUMN_FILTERS };
let simulation: d3.Simulation<GraphNode, GraphEdge> | undefined;
let svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, unknown> | undefined;
let g: d3.Selection<SVGGElement, unknown, HTMLElement, unknown> | undefined;
let zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | undefined;
let linkSelection: d3.Selection<SVGLineElement, GraphEdge, SVGGElement, unknown> | undefined;
let nodeSelection: d3.Selection<SVGGElement, GraphNode, SVGGElement, unknown> | undefined;
const restingPositions = new Map<string, { x: number; y: number }>();

const viewSelect = document.getElementById('viewSelect') as HTMLSelectElement;
const projectSelect = document.getElementById('projectSelect') as HTMLSelectElement;
const featureSelect = document.getElementById('featureSelect') as HTMLSelectElement;
const searchInput = document.getElementById('search') as HTMLInputElement;
const statsEl = document.getElementById('stats') as HTMLSpanElement;
const tabGraph = document.getElementById('tabGraph') as HTMLButtonElement;
const tabTable = document.getElementById('tabTable') as HTMLButtonElement;
const graphPanel = document.getElementById('graphPanel') as HTMLDivElement;
const tablePanel = document.getElementById('tablePanel') as HTMLDivElement;
const tableBody = document.querySelector('#dependencyTable tbody') as HTMLTableSectionElement;
const tableStatsEl = document.getElementById('tableStats') as HTMLParagraphElement;
const filterInputs = Array.from(
  document.querySelectorAll<HTMLInputElement>('#dependencyTable .col-filter'),
);

viewSelect.addEventListener('change', () => {
  currentView = viewSelect.value;
  render();
});

projectSelect.addEventListener('change', () => {
  currentProject = projectSelect.value || null;
  syncProjectColumnFilterFromToolbar();
  clearInvalidFeatureSelection();
  populateFeatureSelect(fullGraph.nodes);
  render();
});

featureSelect.addEventListener('change', () => {
  currentFeature = featureSelect.value || null;
  syncFeatureColumnFilterFromToolbar();
  render();
});

searchInput.addEventListener('input', () => {
  applySearchDimming();
});

tabGraph.addEventListener('click', () => setActivePanel('graph'));
tabTable.addEventListener('click', () => setActivePanel('table'));

for (const input of filterInputs) {
  input.addEventListener('input', () => {
    columnFilters = readColumnFilters();
    syncToolbarProjectFromColumnFilter();
    syncToolbarFeatureFromColumnFilter();
    renderTable();
    if (activePanel === 'graph') {
      renderGraph();
    }
  });
}

window.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || message.type !== 'update') {
    return;
  }

  fullGraph = message.data;
  populateProjectSelect(fullGraph.projects ?? listProjectOptions(fullGraph.nodes), fullGraph.activeProjectPath);
  populateFeatureSelect(fullGraph.nodes);

  if (message.data.view) {
    currentView = message.data.view;
    viewSelect.value = currentView;
  }

  ensureSvg();
  render();
});

function setActivePanel(panel: 'graph' | 'table'): void {
  activePanel = panel;
  tabGraph.classList.toggle('active', panel === 'graph');
  tabTable.classList.toggle('active', panel === 'table');
  graphPanel.classList.toggle('hidden', panel !== 'graph');
  tablePanel.classList.toggle('hidden', panel !== 'table');
  searchInput.style.display = panel === 'graph' ? '' : 'none';
}

function getProjectOptions(): ProjectOption[] {
  return fullGraph.projects ?? listProjectOptions(fullGraph.nodes);
}

function render(): void {
  renderTable();
  renderGraph();
}

function renderTable(): void {
  const projects = getProjectOptions();
  const { nodes, edges } = filterGraphData(false);
  const featureOptions = listFeatureOptions(fullGraph.nodes, currentProject, projects);
  const rows = buildDependencyRows(nodes, edges, featureOptions, projects);
  const effectiveFilters = {
    ...columnFilters,
    project: currentProject ? '' : columnFilters.project,
  };
  const filtered = filterDependencyRows(rows, effectiveFilters);

  tableBody.replaceChildren();
  for (const row of filtered) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(row.project)}</td>
      <td>${escapeHtml(row.feature)}</td>
      <td>${escapeHtml(row.fromKind)}</td>
      <td>${escapeHtml(row.fromName)}</td>
      <td>${escapeHtml(row.relationship)}</td>
      <td>${escapeHtml(row.toKind)}</td>
      <td>${escapeHtml(row.toName)}</td>
      <td class="path-cell" title="${escapeHtml(row.filePath)}">${escapeHtml(shortPath(row.filePath))}</td>
    `;
    tr.addEventListener('click', () => {
      vscode.postMessage({ type: 'navigate', filePath: row.filePath, line: row.line });
    });
    tableBody.appendChild(tr);
  }

  tableStatsEl.textContent = `${filtered.length} of ${rows.length} dependencies`;
}

function renderGraph(): void {
  const { nodes, edges, totalNodes, totalEdges } = filterGraphData(true);
  const { set: cycleEdges, cycleNodes } = cycleEdgeSet();

  statsEl.textContent = formatStats(nodes, edges, totalNodes, totalEdges);

  const width = window.innerWidth;
  const height = contentHeight();

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const simEdges = edges
    .filter((edge) => nodeById.has(edge.fromId) && nodeById.has(edge.toId))
    .map((edge) => ({ ...edge, source: edge.fromId, target: edge.toId }));

  stopSimulation();

  if (nodes.length === 0) {
    g?.selectAll('*').remove();
    return;
  }

  for (const node of nodes) {
    node.fx = null;
    node.fy = null;
  }

  seedNodePositions(nodes, width, height);
  drawGraph(nodes, simEdges, cycleEdges, cycleNodes);
  startForceSimulation(nodes, simEdges, width, height);
}

function startForceSimulation(nodes: GraphNode[], simEdges: GraphEdge[], width: number, height: number): void {
  const focused = currentFeature != null;

  simulation = d3
    .forceSimulation(nodes)
    .alpha(focused ? 0.9 : 1)
    .force(
      'link',
      d3
        .forceLink<GraphNode, GraphEdge>(simEdges)
        .id((node) => node.id)
        .distance(focused ? 80 : 90),
    )
    .force('charge', d3.forceManyBody().strength(focused ? -260 : -320))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide(focused ? 32 : 28))
    .on('tick', () => updateLinkAndNodePositions(simEdges))
    .on('end', () => {
      for (const node of nodes) {
        if (node.x != null && node.y != null) {
          restingPositions.set(node.id, { x: node.x, y: node.y });
        }
      }
    });
}

function drawGraph(
  nodes: GraphNode[],
  simEdges: GraphEdge[],
  cycleEdges: Set<string>,
  cycleNodes: Set<string>,
): void {
  g!.selectAll('*').remove();

  linkSelection = g!
    .append('g')
    .attr('class', 'links')
    .selectAll('line')
    .data(simEdges)
    .join('line')
    .attr('class', (edge) => {
      const classes = ['link'];
      if (cycleEdges.has(`${edge.fromId}->${edge.toId}`)) {
        classes.push('cycle');
      }
      if (edge.kind === 'effectDispatches') {
        classes.push('effect-dispatch');
      }
      return classes.join(' ');
    });

  nodeSelection = g!
    .append('g')
    .attr('class', 'nodes')
    .selectAll<SVGGElement, GraphNode>('g')
    .data(nodes, (node) => node.id)
    .join('g')
    .attr('class', (node) => (cycleNodes.has(node.id) ? 'node cycle-node' : 'node'))
    .attr('transform', (node) => `translate(${node.x ?? 0},${node.y ?? 0})`)
    .call(
      d3
        .drag<SVGGElement, GraphNode>()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded),
    )
    .on('click', (_, node) => {
      vscode.postMessage({ type: 'navigate', filePath: node.filePath, line: node.line });
    });

  nodeSelection.each(function (node) {
    const el = d3.select(this);
    el.selectAll('*').remove();
    const color = kindColor(node.kind);
    if (node.kind === 'action') {
      el.append('polygon').attr('points', '0,-14 14,0 0,14 -14,0').attr('fill', color);
    } else if (node.kind === 'effect') {
      el.append('polygon').attr('points', '-12,-10 12,-10 16,0 12,10 -12,10 -16,0').attr('fill', color);
    } else if (node.kind === 'reducer') {
      el.append('rect').attr('x', -16).attr('y', -10).attr('width', 32).attr('height', 20).attr('rx', 4).attr('fill', color);
    } else if (node.kind === 'component') {
      el.append('circle').attr('r', 14).attr('fill', color);
    } else {
      el.append('rect').attr('x', -18).attr('y', -11).attr('width', 36).attr('height', 22).attr('rx', 6).attr('fill', color);
    }

    el.append('text').attr('dy', 28).attr('text-anchor', 'middle').text(truncate(node.displayName, 22));
  });

  updateLinkAndNodePositions(simEdges);
  applySearchDimming();
}

function updateLinkAndNodePositions(simEdges: GraphEdge[]): void {
  linkSelection
    ?.attr('x1', (edge) => nodeCoordinate(edge.source, 'x'))
    .attr('y1', (edge) => nodeCoordinate(edge.source, 'y'))
    .attr('x2', (edge) => nodeCoordinate(edge.target, 'x'))
    .attr('y2', (edge) => nodeCoordinate(edge.target, 'y'));

  nodeSelection?.attr('transform', (node) => `translate(${node.x ?? 0},${node.y ?? 0})`);
}

function nodeCoordinate(endpoint: GraphNode | string | undefined, axis: 'x' | 'y'): number {
  if (!endpoint || typeof endpoint === 'string') {
    return 0;
  }
  return endpoint[axis] ?? 0;
}

function seedNodePositions(nodes: GraphNode[], width: number, height: number): void {
  if (currentFeature) {
    const radius = Math.min(120, 40 + nodes.length * 8);
    nodes.forEach((node, index) => {
      const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
      node.x = width / 2 + Math.cos(angle) * radius;
      node.y = height / 2 + Math.sin(angle) * radius;
    });
    return;
  }

  for (const node of nodes) {
    const saved = restingPositions.get(node.id);
    if (saved) {
      node.x = saved.x;
      node.y = saved.y;
    }
  }
}

function populateProjectSelect(options: ProjectOption[], activeProjectPath?: string | null): void {
  const previous = currentProject;

  projectSelect.replaceChildren();
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'All projects';
  projectSelect.appendChild(allOption);

  for (const option of options) {
    const el = document.createElement('option');
    el.value = option.id;
    el.textContent = option.label;
    projectSelect.appendChild(el);
  }

  const preferred = activeProjectPath && options.some((option) => option.id === activeProjectPath)
    ? activeProjectPath
    : previous;

  if (preferred && options.some((option) => option.id === preferred)) {
    projectSelect.value = preferred;
    currentProject = preferred;
  } else {
    projectSelect.value = '';
    currentProject = null;
  }

  syncProjectColumnFilterFromToolbar();
}

function clearInvalidFeatureSelection(): void {
  if (!currentFeature) {
    return;
  }

  const options = listFeatureOptions(fullGraph.nodes, currentProject, getProjectOptions());
  if (!options.some((option) => option.id === currentFeature)) {
    currentFeature = null;
    featureSelect.value = '';
    columnFilters.feature = '';
    const featureInput = filterInputs.find((input) => input.dataset.col === 'feature');
    if (featureInput) {
      featureInput.value = '';
    }
  }
}

function populateFeatureSelect(nodes: GraphNode[]): void {
  const options = listFeatureOptions(nodes, currentProject, getProjectOptions());
  const previous = currentFeature;

  featureSelect.replaceChildren();
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'All features';
  featureSelect.appendChild(allOption);

  for (const option of options) {
    const el = document.createElement('option');
    el.value = option.id;
    el.textContent = option.label;
    featureSelect.appendChild(el);
  }

  if (previous && options.some((option) => option.id === previous)) {
    featureSelect.value = previous;
    currentFeature = previous;
  } else {
    featureSelect.value = '';
    currentFeature = null;
  }

  syncFeatureColumnFilterFromToolbar();
}

function syncProjectColumnFilterFromToolbar(): void {
  const projectInput = filterInputs.find((input) => input.dataset.col === 'project');
  if (!projectInput) {
    return;
  }

  if (!currentProject) {
    projectInput.value = '';
    columnFilters.project = '';
    return;
  }

  const label =
    projectSelect.selectedOptions[0]?.textContent ??
    listProjectOptions(fullGraph.nodes).find((option) => option.id === currentProject)?.label ??
    '';
  projectInput.value = label;
  columnFilters.project = label;
}

function syncToolbarProjectFromColumnFilter(): void {
  const term = columnFilters.project.trim().toLowerCase();
  if (!term) {
    if (currentProject) {
      currentProject = null;
      projectSelect.value = '';
      renderGraph();
    }
    return;
  }

  const options = fullGraph.projects ?? listProjectOptions(fullGraph.nodes);
  const match = options.find((option) => option.label.toLowerCase() === term);
  if (match && match.id !== currentProject) {
    currentProject = match.id;
    projectSelect.value = match.id;
    renderGraph();
  }
}

function syncFeatureColumnFilterFromToolbar(): void {
  const featureInput = filterInputs.find((input) => input.dataset.col === 'feature');
  if (!featureInput) {
    return;
  }

  if (!currentFeature) {
    featureInput.value = '';
    columnFilters.feature = '';
    return;
  }

  const label =
    featureSelect.selectedOptions[0]?.textContent ??
    listFeatureOptions(fullGraph.nodes, currentProject, getProjectOptions()).find((option) => option.id === currentFeature)?.label ??
    '';
  featureInput.value = label;
  columnFilters.feature = label;
}

function syncToolbarFeatureFromColumnFilter(): void {
  const term = columnFilters.feature.trim().toLowerCase();
  if (!term) {
    if (currentFeature) {
      currentFeature = null;
      featureSelect.value = '';
      renderGraph();
    }
    return;
  }

  const match = listFeatureOptions(fullGraph.nodes, currentProject, getProjectOptions()).find(
    (option) => option.label.toLowerCase() === term,
  );
  if (match && match.id !== currentFeature) {
    currentFeature = match.id;
    featureSelect.value = match.id;
    renderGraph();
  }
}

function readColumnFilters(): ColumnFilters {
  const next = { ...EMPTY_COLUMN_FILTERS };
  for (const input of filterInputs) {
    const column = input.dataset.col as keyof ColumnFilters | undefined;
    if (column) {
      next[column] = input.value;
    }
  }
  return next;
}

function ensureSvg(): void {
  if (svg) {
    return;
  }

  const width = window.innerWidth;
  const height = contentHeight();

  svg = d3.select('#graph').attr('viewBox', [0, 0, width, height]);
  g = svg.append('g');

  zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.2, 4])
    .on('zoom', (event) => {
      g!.attr('transform', event.transform);
    });
  svg.call(zoom);
}

interface FilteredGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  totalNodes: number;
  totalEdges: number;
}

function filterGraphData(forGraph: boolean): FilteredGraph {
  const projects = getProjectOptions();
  const { nodes: projectNodes, edges: projectEdges } = filterByProject(
    fullGraph.nodes,
    fullGraph.edges,
    currentProject,
    projects,
  );
  const { nodes: featureNodes, edges: featureEdges } = filterByFeatureCluster(
    projectNodes,
    projectEdges,
    currentFeature,
    projects,
  );

  if (currentFeature) {
    const clusterIds = new Set(featureNodes.map((node) => node.id));
    const edges = forGraph
      ? featureEdges.filter((edge) => clusterIds.has(edge.fromId) && clusterIds.has(edge.toId))
      : applyViewFilter(featureEdges);

    return {
      nodes: featureNodes,
      edges,
      totalNodes: projectNodes.length,
      totalEdges: projectEdges.length,
    };
  }

  const edges = applyViewFilter(featureEdges);
  const ids = new Set<string>();
  for (const edge of edges) {
    ids.add(edge.fromId);
    ids.add(edge.toId);
  }
  const nodes = projectNodes.filter((node) => ids.has(node.id));

  return {
    nodes,
    edges,
    totalNodes: fullGraph.nodes.length,
    totalEdges: fullGraph.edges.length,
  };
}

function applyViewFilter(edges: GraphEdge[]): GraphEdge[] {
  const kinds = VIEW_EDGE_KINDS[currentView];
  return kinds ? edges.filter((edge) => kinds.includes(edge.kind)) : edges;
}

function cycleEdgeSet(): { set: Set<string>; cycleNodes: Set<string> } {
  const set = new Set<string>();
  const cycleNodes = new Set<string>();
  for (const cycle of fullGraph.cycles || []) {
    for (const nodeId of cycle.nodeIds || []) {
      cycleNodes.add(nodeId);
    }
    const ids = cycle.nodeIds || [];
    for (let i = 0; i < ids.length - 1; i++) {
      set.add(`${ids[i]}->${ids[i + 1]}`);
    }
  }
  return { set, cycleNodes };
}

function formatStats(
  nodes: GraphNode[],
  edges: GraphEdge[],
  totalNodes: number,
  totalEdges: number,
): string {
  const parts: string[] = [];
  if (currentProject) {
    const label =
      projectSelect.selectedOptions[0]?.textContent ??
      listProjectOptions(fullGraph.nodes).find((option) => option.id === currentProject)?.label ??
      currentProject;
    parts.push(label);
  }
  if (currentFeature) {
    const label =
      featureSelect.selectedOptions[0]?.textContent ??
      listFeatureOptions(fullGraph.nodes, currentProject, getProjectOptions()).find((option) => option.id === currentFeature)?.label ??
      currentFeature;
    parts.push(label);
  }
  parts.push(`${nodes.length} nodes · ${edges.length} edges`);
  if (currentProject || currentFeature) {
    parts.push(`of ${totalNodes} total`);
  }
  return parts.join(' · ');
}

function applySearchDimming(): void {
  const term = searchInput.value.trim().toLowerCase();
  d3.selectAll<SVGGElement, GraphNode>('.node').classed('dimmed', function (node) {
    if (!term) {
      return false;
    }
    return !node.displayName.toLowerCase().includes(term) && !node.kind.toLowerCase().includes(term);
  });
}

function kindColor(kind: string): string {
  switch (kind) {
    case 'action':
      return '#5dade2';
    case 'state':
      return '#58d68d';
    case 'reducer':
      return '#f5b041';
    case 'effect':
      return '#af7ac5';
    case 'component':
      return '#ec7063';
    default:
      return '#95a5a6';
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function shortPath(filePath: string): string {
  if (!filePath) {
    return '';
  }
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts.length <= 2 ? filePath : parts.slice(-2).join('/');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function contentHeight(): number {
  return window.innerHeight - 84;
}

function stopSimulation(): void {
  if (simulation) {
    simulation.stop();
    simulation = undefined;
  }
}

function dragStarted(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, node: GraphNode): void {
  if (simulation && !event.active) {
    simulation.alphaTarget(0.3).restart();
  }
  node.fx = node.x;
  node.fy = node.y;
}

function dragged(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, node: GraphNode): void {
  node.fx = event.x;
  node.fy = event.y;
  node.x = event.x;
  node.y = event.y;
  if (linkSelection) {
    updateLinkAndNodePositions(linkSelection.data());
  }
}

function dragEnded(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, node: GraphNode): void {
  if (simulation && !event.active) {
    simulation.alphaTarget(0);
  }
  node.fx = null;
  node.fy = null;
  if (node.x != null && node.y != null) {
    restingPositions.set(node.id, { x: node.x, y: node.y });
  }
}