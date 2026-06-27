import { resolveProjectLabel, type ProjectOption } from './projectFilter';

export interface FocusNode {
  id: string;
  kind: string;
  displayName: string;
  featureStateId?: string | null;
  projectPath?: string | null;
  filePath?: string;
}

export interface FocusEdge {
  fromId: string;
  toId: string;
  kind: string;
}

export interface FeatureOption {
  id: string;
  label: string;
}

export function listFeatureOptions(
  nodes: FocusNode[],
  projectPath?: string | null,
  projects: ProjectOption[] = [],
): FeatureOption[] {
  const states = nodes.filter((node) => node.kind === 'state');
  const scoped = projectPath ? states.filter((node) => nodeBelongsToProject(node, projectPath, projects)) : states;

  const raw = scoped.map((node) => ({
    id: node.id,
    label: node.displayName,
    projectLabel: resolveProjectLabel(node, projects),
  }));

  const duplicateLabels = new Set(
    raw
      .map((option) => option.label)
      .filter((label, index, labels) => labels.indexOf(label) !== index),
  );

  const labeled = raw.map((option) => ({
    id: option.id,
    label:
      duplicateLabels.has(option.label) && option.projectLabel
        ? `${option.label} (${option.projectLabel})`
        : option.label,
  }));

  return dedupeFeatureOptions(labeled);
}

function dedupeFeatureOptions(options: FeatureOption[]): FeatureOption[] {
  const byLabel = new Map<string, FeatureOption>();

  for (const option of options) {
    const existing = byLabel.get(option.label);
    if (!existing || option.id.length > existing.id.length) {
      byLabel.set(option.label, option);
    }
  }

  return [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Collect all nodes belonging to a feature state cluster (BFS), scoped to the seed state's project. */
export function filterByFeatureCluster(
  nodes: FocusNode[],
  edges: FocusEdge[],
  featureStateId: string | null,
  projects: ProjectOption[] = [],
): { nodes: FocusNode[]; edges: FocusEdge[] } {
  if (!featureStateId) {
    return { nodes, edges };
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const seed = nodeById.get(featureStateId);
  const projectScope = seed ? resolveProjectScope(seed, projects) : null;
  const scopedNodes = projectScope
    ? nodes.filter((node) => nodeMatchesProjectScope(node, projectScope, projects))
    : nodes;

  const scopedNodeById = new Map(scopedNodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (!scopedNodeById.has(edge.fromId) || !scopedNodeById.has(edge.toId)) {
      continue;
    }
    addNeighbor(adjacency, edge.fromId, edge.toId);
    addNeighbor(adjacency, edge.toId, edge.fromId);
  }

  const clusterIds = new Set<string>();
  const queue: string[] = [];

  if (!scopedNodeById.has(featureStateId)) {
    return { nodes: [], edges: [] };
  }

  clusterIds.add(featureStateId);
  queue.push(featureStateId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentNode = scopedNodeById.get(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      const neighborNode = scopedNodeById.get(neighbor);
      if (!neighborNode || clusterIds.has(neighbor)) {
        continue;
      }

      if (neighborNode.kind === 'state' && neighbor !== featureStateId) {
        continue;
      }

      if (currentNode?.kind === 'action' && neighborNode.kind === 'reducer') {
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
    (edge) => clusterIds.has(edge.fromId) && clusterIds.has(edge.toId),
  );

  return { nodes: filteredNodes, edges: filteredEdges };
}

function resolveProjectScope(seed: FocusNode, projects: ProjectOption[]): string | null {
  return resolveProjectPathForNode(seed, projects);
}

function nodeMatchesProjectScope(node: FocusNode, projectScope: string, projects: ProjectOption[]): boolean {
  const resolved = resolveProjectPathForNode(node, projects);
  return resolved?.toLowerCase() === projectScope.toLowerCase();
}

function nodeBelongsToProject(node: FocusNode, projectPath: string, projects: ProjectOption[]): boolean {
  const resolved = resolveProjectPathForNode(node, projects);
  return resolved?.toLowerCase() === normalizePath(projectPath).toLowerCase();
}

function resolveProjectPathForNode(node: FocusNode, projects: ProjectOption[]): string | null {
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

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function dirname(value: string): string {
  const parts = normalizePath(value).split('/');
  parts.pop();
  return parts.join('/');
}

function reducerTargetsFeature(reducerId: string, featureStateId: string, edges: FocusEdge[]): boolean {
  return edges.some(
    (edge) => edge.fromId === reducerId && edge.toId === featureStateId && edge.kind === 'reducesTo',
  );
}

function addNeighbor(adjacency: Map<string, Set<string>>, from: string, to: string): void {
  if (!adjacency.has(from)) {
    adjacency.set(from, new Set());
  }
  adjacency.get(from)!.add(to);
}