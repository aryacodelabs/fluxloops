"use strict";
(() => {
  // src/webview/projectFilter.ts
  function listProjectOptions(nodes) {
    const byId = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      if (!node.projectPath) {
        continue;
      }
      const normalized = normalizePath(node.projectPath);
      if (!byId.has(normalized)) {
        byId.set(normalized, projectLabel(normalized));
      }
    }
    return [...byId.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }
  function filterByProject(nodes, edges, projectPath, projects = []) {
    if (!projectPath) {
      return { nodes, edges };
    }
    const normalizedProject = normalizePath(projectPath);
    const projectDir = dirname(normalizedProject).toLowerCase();
    const filteredNodes = nodes.filter(
      (node) => nodeBelongsToProject(node, normalizedProject, projectDir, projects)
    );
    const ids = new Set(filteredNodes.map((node) => node.id));
    const filteredEdges = edges.filter((edge) => ids.has(edge.fromId) && ids.has(edge.toId));
    return { nodes: filteredNodes, edges: filteredEdges };
  }
  function nodeBelongsToProject(node, projectPath, projectDir, projects) {
    const resolved = resolveProjectPath(node, projects);
    if (resolved) {
      return resolved.toLowerCase() === projectPath.toLowerCase();
    }
    if (!node.filePath) {
      return false;
    }
    const file = normalizePath(node.filePath).toLowerCase();
    return file.startsWith(`${projectDir}/`) || file === projectDir;
  }
  function resolveProjectLabel(node, projects = []) {
    const projectPath = resolveProjectPath(node, projects);
    return projectPath ? projectLabel(projectPath) : "";
  }
  function resolveProjectPath(node, projects = []) {
    if (node.projectPath) {
      return normalizePath(node.projectPath);
    }
    if (!node.filePath) {
      return null;
    }
    const file = normalizePath(node.filePath).toLowerCase();
    for (const project of projects) {
      const dir = dirname(normalizePath(project.id)).toLowerCase();
      if (file.startsWith(`${dir}/`) || file === dir) {
        return normalizePath(project.id);
      }
    }
    return null;
  }
  function projectLabel(projectPath) {
    const base = basename(projectPath);
    return base.endsWith(".csproj") ? base.slice(0, -".csproj".length) : base;
  }
  function normalizePath(value) {
    return value.replace(/\\/g, "/");
  }
  function basename(value) {
    const parts = normalizePath(value).split("/");
    return parts[parts.length - 1] ?? value;
  }
  function dirname(value) {
    const parts = normalizePath(value).split("/");
    parts.pop();
    return parts.join("/");
  }

  // src/webview/dependencyTable.ts
  function toExportRow(row) {
    return {
      project: row.project,
      feature: row.feature,
      fromKind: row.fromKind,
      fromName: row.fromName,
      relationship: row.relationship,
      toKind: row.toKind,
      toName: row.toName,
      filePath: row.filePath
    };
  }
  var EMPTY_COLUMN_FILTERS = {
    project: "",
    feature: "",
    fromKind: "",
    fromName: "",
    relationship: "",
    toKind: "",
    toName: "",
    filePath: ""
  };
  var EDGE_LABELS = {
    reducesTo: "reduces to",
    effectListensFor: "listens for",
    effectDispatches: "dispatches",
    componentSubscribesTo: "subscribes to",
    componentDispatches: "dispatches"
  };
  function buildDependencyRows(nodes, edges, featureOptions, projects = []) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const featureLabelById = new Map(featureOptions.map((option) => [option.id, option.label]));
    const rows = [];
    for (const edge of edges) {
      const from = nodeById.get(edge.fromId);
      const to = nodeById.get(edge.toId);
      if (!from || !to) {
        continue;
      }
      const featureId = resolveFeatureId(from, to);
      rows.push({
        project: resolveProjectLabel(from, projects) || resolveProjectLabel(to, projects),
        feature: featureLabelById.get(featureId) ?? featureId,
        featureId,
        fromKind: from.kind,
        fromName: from.displayName,
        relationship: EDGE_LABELS[edge.kind] ?? edge.kind,
        toKind: to.kind,
        toName: to.displayName,
        filePath: from.filePath ?? to.filePath ?? "",
        line: from.line ?? to.line ?? 1,
        fromId: from.id,
        toId: to.id
      });
    }
    return dedupeDependencyRows(rows).sort((a, b) => {
      const feature = a.feature.localeCompare(b.feature);
      if (feature !== 0) {
        return feature;
      }
      const from = a.fromName.localeCompare(b.fromName);
      if (from !== 0) {
        return from;
      }
      return a.relationship.localeCompare(b.relationship);
    });
  }
  function filterDependencyRows(rows, filters) {
    return rows.filter((row) => matchesColumnFilter(row.project, filters.project) && matchesColumnFilter(row.feature, filters.feature) && matchesColumnFilter(row.fromKind, filters.fromKind) && matchesColumnFilter(row.fromName, filters.fromName) && matchesColumnFilter(row.relationship, filters.relationship) && matchesColumnFilter(row.toKind, filters.toKind) && matchesColumnFilter(row.toName, filters.toName) && matchesColumnFilter(row.filePath, filters.filePath));
  }
  function dedupeDependencyRows(rows) {
    const seen = /* @__PURE__ */ new Set();
    const unique = [];
    for (const row of rows) {
      const key = `${row.fromId}|${row.toId}|${row.relationship}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      unique.push(row);
    }
    return unique;
  }
  function resolveFeatureId(from, to) {
    if (from.featureStateId) {
      return from.featureStateId;
    }
    if (to.featureStateId) {
      return to.featureStateId;
    }
    if (from.kind === "state") {
      return from.id;
    }
    if (to.kind === "state") {
      return to.id;
    }
    return "";
  }
  function matchesColumnFilter(value, filter) {
    const term = filter.trim().toLowerCase();
    if (!term) {
      return true;
    }
    return value.toLowerCase().includes(term);
  }

  // src/webview/graphExport.ts
  var INLINE_STYLE_PROPS = [
    "fill",
    "stroke",
    "stroke-width",
    "stroke-opacity",
    "stroke-dasharray",
    "font-size",
    "font-family",
    "font-weight",
    "opacity",
    "fill-opacity",
    "text-anchor"
  ];
  var PNG_SCALE = 2;
  async function exportSvgToPngBase64(svgElement) {
    const rect = svgElement.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const clone = svgElement.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    const background = getComputedStyle(document.body).backgroundColor || "#1e1e1e";
    const backgroundRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    backgroundRect.setAttribute("width", "100%");
    backgroundRect.setAttribute("height", "100%");
    backgroundRect.setAttribute("fill", background);
    clone.insertBefore(backgroundRect, clone.firstChild);
    inlineSvgStyles(svgElement, clone);
    const svgString = new XMLSerializer().serializeToString(clone);
    const svgUrl = URL.createObjectURL(new Blob([svgString], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const image = await loadImage(svgUrl);
      const canvas = document.createElement("canvas");
      canvas.width = width * PNG_SCALE;
      canvas.height = height * PNG_SCALE;
      const context = canvas.getContext("2d");
      if (!context) {
        return void 0;
      }
      context.scale(PNG_SCALE, PNG_SCALE);
      context.drawImage(image, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/png");
      const commaIndex = dataUrl.indexOf(",");
      return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : void 0;
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }
  function inlineSvgStyles(sourceRoot, targetRoot) {
    const sourceElements = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll("*"))];
    const targetElements = [targetRoot, ...Array.from(targetRoot.querySelectorAll("*"))];
    for (let index = 0; index < sourceElements.length; index++) {
      const source = sourceElements[index];
      const target = targetElements[index];
      if (!source || !target) {
        continue;
      }
      const computed = getComputedStyle(source);
      const style = INLINE_STYLE_PROPS.map((prop) => {
        const value = computed.getPropertyValue(prop);
        return value ? `${prop}:${value}` : "";
      }).filter(Boolean).join(";");
      if (style) {
        target.setAttribute("style", style);
      }
    }
  }
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to render SVG for PNG export."));
      image.src = url;
    });
  }

  // src/webview/featureFocus.ts
  function listFeatureOptions(nodes, projectPath, projects = []) {
    const states = nodes.filter((node) => node.kind === "state");
    const scoped = projectPath ? states.filter((node) => nodeBelongsToProject2(node, projectPath, projects)) : states;
    const raw = scoped.map((node) => ({
      id: node.id,
      label: node.displayName,
      projectLabel: resolveProjectLabel(node, projects)
    }));
    const duplicateLabels = new Set(
      raw.map((option) => option.label).filter((label, index, labels) => labels.indexOf(label) !== index)
    );
    const labeled = raw.map((option) => ({
      id: option.id,
      label: duplicateLabels.has(option.label) && option.projectLabel ? `${option.label} (${option.projectLabel})` : option.label
    }));
    return dedupeFeatureOptions(labeled);
  }
  function dedupeFeatureOptions(options) {
    const byLabel = /* @__PURE__ */ new Map();
    for (const option of options) {
      const existing = byLabel.get(option.label);
      if (!existing || option.id.length > existing.id.length) {
        byLabel.set(option.label, option);
      }
    }
    return [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label));
  }
  function filterByFeatureCluster(nodes, edges, featureStateId, projects = []) {
    if (!featureStateId) {
      return { nodes, edges };
    }
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const seed = nodeById.get(featureStateId);
    const projectScope = seed ? resolveProjectScope(seed, projects) : null;
    const scopedNodes = projectScope ? nodes.filter((node) => nodeMatchesProjectScope(node, projectScope, projects)) : nodes;
    const scopedNodeById = new Map(scopedNodes.map((node) => [node.id, node]));
    const adjacency = /* @__PURE__ */ new Map();
    for (const edge of edges) {
      if (!scopedNodeById.has(edge.fromId) || !scopedNodeById.has(edge.toId)) {
        continue;
      }
      addNeighbor(adjacency, edge.fromId, edge.toId);
      addNeighbor(adjacency, edge.toId, edge.fromId);
    }
    const clusterIds = /* @__PURE__ */ new Set();
    const queue = [];
    if (!scopedNodeById.has(featureStateId)) {
      return { nodes: [], edges: [] };
    }
    clusterIds.add(featureStateId);
    queue.push(featureStateId);
    while (queue.length > 0) {
      const current = queue.shift();
      const currentNode = scopedNodeById.get(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        const neighborNode = scopedNodeById.get(neighbor);
        if (!neighborNode || clusterIds.has(neighbor)) {
          continue;
        }
        if (neighborNode.kind === "state" && neighbor !== featureStateId) {
          continue;
        }
        if (currentNode?.kind === "action" && neighborNode.kind === "reducer") {
          if (!reducerTargetsFeature(neighbor, featureStateId, edges)) {
            continue;
          }
        }
        clusterIds.add(neighbor);
        queue.push(neighbor);
      }
    }
    const filteredNodes = scopedNodes.filter((node) => clusterIds.has(node.id));
    const filteredEdges = edges.filter(
      (edge) => clusterIds.has(edge.fromId) && clusterIds.has(edge.toId)
    );
    return { nodes: filteredNodes, edges: filteredEdges };
  }
  function resolveProjectScope(seed, projects) {
    return resolveProjectPathForNode(seed, projects);
  }
  function nodeMatchesProjectScope(node, projectScope, projects) {
    const resolved = resolveProjectPathForNode(node, projects);
    return resolved?.toLowerCase() === projectScope.toLowerCase();
  }
  function nodeBelongsToProject2(node, projectPath, projects) {
    const resolved = resolveProjectPathForNode(node, projects);
    return resolved?.toLowerCase() === normalizePath2(projectPath).toLowerCase();
  }
  function resolveProjectPathForNode(node, projects) {
    if (node.projectPath) {
      return normalizePath2(node.projectPath);
    }
    if (!node.filePath) {
      return null;
    }
    const file = normalizePath2(node.filePath).toLowerCase();
    for (const project of projects) {
      const dir = dirname2(normalizePath2(project.id)).toLowerCase();
      if (file.startsWith(`${dir}/`) || file === dir) {
        return normalizePath2(project.id);
      }
    }
    return null;
  }
  function normalizePath2(value) {
    return value.replace(/\\/g, "/");
  }
  function dirname2(value) {
    const parts = normalizePath2(value).split("/");
    parts.pop();
    return parts.join("/");
  }
  function reducerTargetsFeature(reducerId, featureStateId, edges) {
    return edges.some(
      (edge) => edge.fromId === reducerId && edge.toId === featureStateId && edge.kind === "reducesTo"
    );
  }
  function addNeighbor(adjacency, from, to) {
    if (!adjacency.has(from)) {
      adjacency.set(from, /* @__PURE__ */ new Set());
    }
    adjacency.get(from).add(to);
  }

  // src/webview/graph.ts
  var vscode = acquireVsCodeApi();
  var VIEW_EDGE_KINDS = {
    reducer: ["reducesTo"],
    effects: ["effectListensFor", "effectDispatches"],
    components: ["componentSubscribesTo", "componentDispatches"],
    all: null
  };
  var fullGraph = { nodes: [], edges: [], cycles: [] };
  var currentView = "reducer";
  var currentProject = null;
  var currentFeature = null;
  var activePanel = "graph";
  var columnFilters = { ...EMPTY_COLUMN_FILTERS };
  var simulation;
  var svg;
  var g;
  var zoom;
  var linkSelection;
  var nodeSelection;
  var restingPositions = /* @__PURE__ */ new Map();
  var viewSelect = document.getElementById("viewSelect");
  var projectSelect = document.getElementById("projectSelect");
  var featureSelect = document.getElementById("featureSelect");
  var searchInput = document.getElementById("search");
  var statsEl = document.getElementById("stats");
  var tabGraph = document.getElementById("tabGraph");
  var tabTable = document.getElementById("tabTable");
  var graphPanel = document.getElementById("graphPanel");
  var tablePanel = document.getElementById("tablePanel");
  var tableBody = document.querySelector("#dependencyTable tbody");
  var tableStatsEl = document.getElementById("tableStats");
  var filterInputs = Array.from(
    document.querySelectorAll("#dependencyTable .col-filter")
  );
  var exportGraphBtn = document.getElementById("exportGraphBtn");
  var exportTableBtn = document.getElementById("exportTableBtn");
  viewSelect.addEventListener("change", () => {
    currentView = viewSelect.value;
    render();
  });
  projectSelect.addEventListener("change", () => {
    currentProject = projectSelect.value || null;
    syncProjectColumnFilterFromToolbar();
    clearInvalidFeatureSelection();
    populateFeatureSelect(fullGraph.nodes);
    render();
  });
  featureSelect.addEventListener("change", () => {
    currentFeature = featureSelect.value || null;
    syncFeatureColumnFilterFromToolbar();
    render();
  });
  searchInput.addEventListener("input", () => {
    applySearchDimming();
  });
  tabGraph.addEventListener("click", () => setActivePanel("graph"));
  tabTable.addEventListener("click", () => setActivePanel("table"));
  exportGraphBtn.addEventListener("click", () => {
    void handleExportGraphPng();
  });
  exportTableBtn.addEventListener("click", () => {
    handleExportTable();
  });
  for (const input of filterInputs) {
    input.addEventListener("input", () => {
      columnFilters = readColumnFilters();
      syncToolbarProjectFromColumnFilter();
      syncToolbarFeatureFromColumnFilter();
      renderTable();
      if (activePanel === "graph") {
        renderGraph();
      }
    });
  }
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.type !== "update") {
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
  function setActivePanel(panel) {
    activePanel = panel;
    tabGraph.classList.toggle("active", panel === "graph");
    tabTable.classList.toggle("active", panel === "table");
    tabGraph.setAttribute("aria-selected", panel === "graph" ? "true" : "false");
    tabTable.setAttribute("aria-selected", panel === "table" ? "true" : "false");
    graphPanel.classList.toggle("hidden", panel !== "graph");
    tablePanel.classList.toggle("hidden", panel !== "table");
    searchInput.style.display = panel === "graph" ? "" : "none";
    exportGraphBtn.classList.toggle("hidden", panel !== "graph");
    exportTableBtn.classList.toggle("hidden", panel !== "table");
  }
  function getProjectOptions() {
    return fullGraph.projects ?? listProjectOptions(fullGraph.nodes);
  }
  function render() {
    renderTable();
    renderGraph();
  }
  function getTableRowSets() {
    const projects = getProjectOptions();
    const { nodes, edges } = filterGraphData(false);
    const featureOptions = listFeatureOptions(fullGraph.nodes, currentProject, projects);
    const rows = buildDependencyRows(nodes, edges, featureOptions, projects);
    const effectiveFilters = {
      ...columnFilters,
      project: currentProject ? "" : columnFilters.project
    };
    return { all: rows, filtered: filterDependencyRows(rows, effectiveFilters) };
  }
  function renderTable() {
    const { all: rows, filtered } = getTableRowSets();
    tableBody.replaceChildren();
    for (const row of filtered) {
      const tr = document.createElement("tr");
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
      tr.addEventListener("click", () => {
        vscode.postMessage({ type: "navigate", filePath: row.filePath, line: row.line });
      });
      tableBody.appendChild(tr);
    }
    tableStatsEl.textContent = `${filtered.length} of ${rows.length} dependencies`;
  }
  function renderGraph() {
    const { nodes, edges, totalNodes, totalEdges } = filterGraphData(true);
    const { set: cycleEdges, cycleNodes } = cycleEdgeSet();
    statsEl.textContent = formatStats(nodes, edges, totalNodes, totalEdges);
    const width = window.innerWidth;
    const height = contentHeight();
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const simEdges = edges.filter((edge) => nodeById.has(edge.fromId) && nodeById.has(edge.toId)).map((edge) => ({ ...edge, source: edge.fromId, target: edge.toId }));
    stopSimulation();
    if (nodes.length === 0) {
      g?.selectAll("*").remove();
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
  function startForceSimulation(nodes, simEdges, width, height) {
    const focused = currentFeature != null;
    simulation = d3.forceSimulation(nodes).alpha(focused ? 0.9 : 1).force(
      "link",
      d3.forceLink(simEdges).id((node) => node.id).distance(focused ? 80 : 90)
    ).force("charge", d3.forceManyBody().strength(focused ? -260 : -320)).force("center", d3.forceCenter(width / 2, height / 2)).force("collision", d3.forceCollide(focused ? 32 : 28)).on("tick", () => updateLinkAndNodePositions(simEdges)).on("end", () => {
      for (const node of nodes) {
        if (node.x != null && node.y != null) {
          restingPositions.set(node.id, { x: node.x, y: node.y });
        }
      }
    });
  }
  function drawGraph(nodes, simEdges, cycleEdges, cycleNodes) {
    g.selectAll("*").remove();
    linkSelection = g.append("g").attr("class", "links").selectAll("line").data(simEdges).join("line").attr("class", (edge) => {
      const classes = ["link"];
      if (cycleEdges.has(`${edge.fromId}->${edge.toId}`)) {
        classes.push("cycle");
      }
      if (edge.kind === "effectDispatches") {
        classes.push("effect-dispatch");
      }
      return classes.join(" ");
    });
    nodeSelection = g.append("g").attr("class", "nodes").selectAll("g").data(nodes, (node) => node.id).join("g").attr("class", (node) => cycleNodes.has(node.id) ? "node cycle-node" : "node").attr("transform", (node) => `translate(${node.x ?? 0},${node.y ?? 0})`).call(
      d3.drag().on("start", dragStarted).on("drag", dragged).on("end", dragEnded)
    ).on("click", (_, node) => {
      vscode.postMessage({ type: "navigate", filePath: node.filePath, line: node.line });
    });
    nodeSelection.each(function(node) {
      const el = d3.select(this);
      el.selectAll("*").remove();
      const color = kindColor(node.kind);
      if (node.kind === "action") {
        el.append("polygon").attr("points", "0,-14 14,0 0,14 -14,0").attr("fill", color);
      } else if (node.kind === "effect") {
        el.append("polygon").attr("points", "-12,-10 12,-10 16,0 12,10 -12,10 -16,0").attr("fill", color);
      } else if (node.kind === "reducer") {
        el.append("rect").attr("x", -16).attr("y", -10).attr("width", 32).attr("height", 20).attr("rx", 4).attr("fill", color);
      } else if (node.kind === "component") {
        el.append("circle").attr("r", 14).attr("fill", color);
      } else {
        el.append("rect").attr("x", -18).attr("y", -11).attr("width", 36).attr("height", 22).attr("rx", 6).attr("fill", color);
      }
      el.append("text").attr("dy", 28).attr("text-anchor", "middle").text(truncate(node.displayName, 22));
    });
    updateLinkAndNodePositions(simEdges);
    applySearchDimming();
  }
  function updateLinkAndNodePositions(simEdges) {
    linkSelection?.attr("x1", (edge) => nodeCoordinate(edge.source, "x")).attr("y1", (edge) => nodeCoordinate(edge.source, "y")).attr("x2", (edge) => nodeCoordinate(edge.target, "x")).attr("y2", (edge) => nodeCoordinate(edge.target, "y"));
    nodeSelection?.attr("transform", (node) => `translate(${node.x ?? 0},${node.y ?? 0})`);
  }
  function nodeCoordinate(endpoint, axis) {
    if (!endpoint || typeof endpoint === "string") {
      return 0;
    }
    return endpoint[axis] ?? 0;
  }
  function seedNodePositions(nodes, width, height) {
    if (currentFeature) {
      const radius = Math.min(120, 40 + nodes.length * 8);
      nodes.forEach((node, index) => {
        const angle = index / Math.max(nodes.length, 1) * Math.PI * 2;
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
  function populateProjectSelect(options, activeProjectPath) {
    const previous = currentProject;
    projectSelect.replaceChildren();
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All projects";
    projectSelect.appendChild(allOption);
    for (const option of options) {
      const el = document.createElement("option");
      el.value = option.id;
      el.textContent = option.label;
      projectSelect.appendChild(el);
    }
    const preferred = activeProjectPath && options.some((option) => option.id === activeProjectPath) ? activeProjectPath : previous;
    if (preferred && options.some((option) => option.id === preferred)) {
      projectSelect.value = preferred;
      currentProject = preferred;
    } else {
      projectSelect.value = "";
      currentProject = null;
    }
    syncProjectColumnFilterFromToolbar();
  }
  function clearInvalidFeatureSelection() {
    if (!currentFeature) {
      return;
    }
    const options = listFeatureOptions(fullGraph.nodes, currentProject, getProjectOptions());
    if (!options.some((option) => option.id === currentFeature)) {
      currentFeature = null;
      featureSelect.value = "";
      columnFilters.feature = "";
      const featureInput = filterInputs.find((input) => input.dataset.col === "feature");
      if (featureInput) {
        featureInput.value = "";
      }
    }
  }
  function populateFeatureSelect(nodes) {
    const options = listFeatureOptions(nodes, currentProject, getProjectOptions());
    const previous = currentFeature;
    featureSelect.replaceChildren();
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All features";
    featureSelect.appendChild(allOption);
    for (const option of options) {
      const el = document.createElement("option");
      el.value = option.id;
      el.textContent = option.label;
      featureSelect.appendChild(el);
    }
    if (previous && options.some((option) => option.id === previous)) {
      featureSelect.value = previous;
      currentFeature = previous;
    } else {
      featureSelect.value = "";
      currentFeature = null;
    }
    syncFeatureColumnFilterFromToolbar();
  }
  function syncProjectColumnFilterFromToolbar() {
    const projectInput = filterInputs.find((input) => input.dataset.col === "project");
    if (!projectInput) {
      return;
    }
    if (!currentProject) {
      projectInput.value = "";
      columnFilters.project = "";
      return;
    }
    const label = projectSelect.selectedOptions[0]?.textContent ?? listProjectOptions(fullGraph.nodes).find((option) => option.id === currentProject)?.label ?? "";
    projectInput.value = label;
    columnFilters.project = label;
  }
  function syncToolbarProjectFromColumnFilter() {
    const term = columnFilters.project.trim().toLowerCase();
    if (!term) {
      if (currentProject) {
        currentProject = null;
        projectSelect.value = "";
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
  function syncFeatureColumnFilterFromToolbar() {
    const featureInput = filterInputs.find((input) => input.dataset.col === "feature");
    if (!featureInput) {
      return;
    }
    if (!currentFeature) {
      featureInput.value = "";
      columnFilters.feature = "";
      return;
    }
    const label = featureSelect.selectedOptions[0]?.textContent ?? listFeatureOptions(fullGraph.nodes, currentProject, getProjectOptions()).find((option) => option.id === currentFeature)?.label ?? "";
    featureInput.value = label;
    columnFilters.feature = label;
  }
  function syncToolbarFeatureFromColumnFilter() {
    const term = columnFilters.feature.trim().toLowerCase();
    if (!term) {
      if (currentFeature) {
        currentFeature = null;
        featureSelect.value = "";
        renderGraph();
      }
      return;
    }
    const match = listFeatureOptions(fullGraph.nodes, currentProject, getProjectOptions()).find(
      (option) => option.label.toLowerCase() === term
    );
    if (match && match.id !== currentFeature) {
      currentFeature = match.id;
      featureSelect.value = match.id;
      renderGraph();
    }
  }
  function readColumnFilters() {
    const next = { ...EMPTY_COLUMN_FILTERS };
    for (const input of filterInputs) {
      const column = input.dataset.col;
      if (column) {
        next[column] = input.value;
      }
    }
    return next;
  }
  function ensureSvg() {
    if (svg) {
      return;
    }
    const width = window.innerWidth;
    const height = contentHeight();
    svg = d3.select("#graph").attr("viewBox", [0, 0, width, height]);
    g = svg.append("g");
    zoom = d3.zoom().scaleExtent([0.2, 4]).on("zoom", (event) => {
      g.attr("transform", event.transform);
    });
    svg.call(zoom);
  }
  function filterGraphData(forGraph) {
    const projects = getProjectOptions();
    const { nodes: projectNodes, edges: projectEdges } = filterByProject(
      fullGraph.nodes,
      fullGraph.edges,
      currentProject,
      projects
    );
    const { nodes: featureNodes, edges: featureEdges } = filterByFeatureCluster(
      projectNodes,
      projectEdges,
      currentFeature,
      projects
    );
    if (currentFeature) {
      const clusterIds = new Set(featureNodes.map((node) => node.id));
      const edges2 = forGraph ? featureEdges.filter((edge) => clusterIds.has(edge.fromId) && clusterIds.has(edge.toId)) : applyViewFilter(featureEdges);
      return {
        nodes: featureNodes,
        edges: edges2,
        totalNodes: projectNodes.length,
        totalEdges: projectEdges.length
      };
    }
    const edges = applyViewFilter(featureEdges);
    const ids = /* @__PURE__ */ new Set();
    for (const edge of edges) {
      ids.add(edge.fromId);
      ids.add(edge.toId);
    }
    const nodes = projectNodes.filter((node) => ids.has(node.id));
    return {
      nodes,
      edges,
      totalNodes: fullGraph.nodes.length,
      totalEdges: fullGraph.edges.length
    };
  }
  function applyViewFilter(edges) {
    const kinds = VIEW_EDGE_KINDS[currentView];
    return kinds ? edges.filter((edge) => kinds.includes(edge.kind)) : edges;
  }
  function cycleEdgeSet() {
    const set = /* @__PURE__ */ new Set();
    const cycleNodes = /* @__PURE__ */ new Set();
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
  function formatStats(nodes, edges, totalNodes, totalEdges) {
    const parts = [];
    if (currentProject) {
      const label = projectSelect.selectedOptions[0]?.textContent ?? listProjectOptions(fullGraph.nodes).find((option) => option.id === currentProject)?.label ?? currentProject;
      parts.push(label);
    }
    if (currentFeature) {
      const label = featureSelect.selectedOptions[0]?.textContent ?? listFeatureOptions(fullGraph.nodes, currentProject, getProjectOptions()).find((option) => option.id === currentFeature)?.label ?? currentFeature;
      parts.push(label);
    }
    parts.push(`${nodes.length} nodes \xB7 ${edges.length} edges`);
    if (currentProject || currentFeature) {
      parts.push(`of ${totalNodes} total`);
    }
    return parts.join(" \xB7 ");
  }
  function applySearchDimming() {
    const term = searchInput.value.trim().toLowerCase();
    d3.selectAll(".node").classed("dimmed", function(node) {
      if (!term) {
        return false;
      }
      return !node.displayName.toLowerCase().includes(term) && !node.kind.toLowerCase().includes(term);
    });
  }
  function kindColor(kind) {
    switch (kind) {
      case "action":
        return "#5dade2";
      case "state":
        return "#58d68d";
      case "reducer":
        return "#f5b041";
      case "effect":
        return "#af7ac5";
      case "component":
        return "#ec7063";
      default:
        return "#95a5a6";
    }
  }
  function truncate(text, max) {
    return text.length > max ? `${text.slice(0, max - 1)}\u2026` : text;
  }
  function shortPath(filePath) {
    if (!filePath) {
      return "";
    }
    const parts = filePath.replace(/\\/g, "/").split("/");
    return parts.length <= 2 ? filePath : parts.slice(-2).join("/");
  }
  function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function contentHeight() {
    return window.innerHeight - 84;
  }
  function stopSimulation() {
    if (simulation) {
      simulation.stop();
      simulation = void 0;
    }
  }
  function dragStarted(event, node) {
    if (simulation && !event.active) {
      simulation.alphaTarget(0.3).restart();
    }
    node.fx = node.x;
    node.fy = node.y;
  }
  function dragged(event, node) {
    node.fx = event.x;
    node.fy = event.y;
    node.x = event.x;
    node.y = event.y;
    if (linkSelection) {
      updateLinkAndNodePositions(linkSelection.data());
    }
  }
  function dragEnded(event, node) {
    if (simulation && !event.active) {
      simulation.alphaTarget(0);
    }
    node.fx = null;
    node.fy = null;
    if (node.x != null && node.y != null) {
      restingPositions.set(node.id, { x: node.x, y: node.y });
    }
  }
  function handleExportTable() {
    const { filtered } = getTableRowSets();
    if (filtered.length === 0) {
      vscode.postMessage({ type: "exportEmpty", target: "table" });
      return;
    }
    vscode.postMessage({
      type: "exportTable",
      rows: filtered.map(toExportRow),
      suggestedFilename: buildDependenciesFilename()
    });
  }
  async function handleExportGraphPng() {
    const { nodes } = filterGraphData(true);
    if (nodes.length === 0 || !svg) {
      vscode.postMessage({ type: "exportEmpty", target: "graph" });
      return;
    }
    exportGraphBtn.disabled = true;
    try {
      const svgElement = document.getElementById("graph");
      if (!svgElement) {
        vscode.postMessage({ type: "exportEmpty", target: "graph" });
        return;
      }
      const pngBase64 = await exportSvgToPngBase64(svgElement);
      if (!pngBase64) {
        vscode.postMessage({ type: "exportError", target: "graph" });
        return;
      }
      vscode.postMessage({
        type: "exportGraphPng",
        pngBase64,
        suggestedFilename: buildGraphPngFilename()
      });
    } catch {
      vscode.postMessage({ type: "exportError", target: "graph" });
    } finally {
      exportGraphBtn.disabled = false;
    }
  }
  function buildDependenciesFilename() {
    const projectLabel2 = currentProject ? projectSelect.selectedOptions[0]?.textContent ?? null : null;
    return formatDependenciesFilename(projectLabel2);
  }
  function buildGraphPngFilename() {
    const featureLabel = currentFeature ? featureSelect.selectedOptions[0]?.textContent ?? null : null;
    return formatGraphPngFilename(featureLabel);
  }
  function formatDependenciesFilename(projectLabel2) {
    const segment = sanitizeSegment(projectLabel2 ?? "all");
    return `fluxloops-dependencies-${segment}-${formatDateStamp()}.xlsx`;
  }
  function formatGraphPngFilename(featureLabel) {
    const segment = sanitizeSegment(featureLabel ?? "all");
    return `fluxloops-graph-${segment}-${formatDateStamp()}.png`;
  }
  function sanitizeSegment(segment) {
    const cleaned = segment.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
    return cleaned || "all";
  }
  function formatDateStamp(date = /* @__PURE__ */ new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
})();
//# sourceMappingURL=graph.js.map
