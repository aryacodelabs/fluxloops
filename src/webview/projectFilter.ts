export interface ProjectNode {
  id: string;
  projectPath?: string | null;
  filePath?: string;
}

export interface ProjectEdge {
  fromId: string;
  toId: string;
}

export interface ProjectOption {
  id: string;
  label: string;
}

export function listProjectOptions(nodes: ProjectNode[]): ProjectOption[] {
  const byId = new Map<string, string>();

  for (const node of nodes) {
    if (!node.projectPath) {
      continue;
    }
    const normalized = normalizePath(node.projectPath);
    if (!byId.has(normalized)) {
      byId.set(normalized, projectLabel(normalized));
    }
  }

  return [...byId.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function filterByProject<T extends ProjectNode>(
  nodes: T[],
  edges: ProjectEdge[],
  projectPath: string | null,
  projects: ProjectOption[] = [],
): { nodes: T[]; edges: ProjectEdge[] } {
  if (!projectPath) {
    return { nodes, edges };
  }

  const normalizedProject = normalizePath(projectPath);
  const projectDir = dirname(normalizedProject).toLowerCase();

  const filteredNodes = nodes.filter((node) =>
    nodeBelongsToProject(node, normalizedProject, projectDir, projects),
  );
  const ids = new Set(filteredNodes.map((node) => node.id));
  const filteredEdges = edges.filter((edge) => ids.has(edge.fromId) && ids.has(edge.toId));

  return { nodes: filteredNodes, edges: filteredEdges };
}

function nodeBelongsToProject(
  node: ProjectNode,
  projectPath: string,
  projectDir: string,
  projects: ProjectOption[],
): boolean {
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

export function resolveProjectLabel(node: ProjectNode, projects: ProjectOption[] = []): string {
  const projectPath = resolveProjectPath(node, projects);
  return projectPath ? projectLabel(projectPath) : '';
}

export function resolveProjectPath(node: ProjectNode, projects: ProjectOption[] = []): string | null {
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

function projectLabel(projectPath: string): string {
  const base = basename(projectPath);
  return base.endsWith('.csproj') ? base.slice(0, -'.csproj'.length) : base;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function basename(value: string): string {
  const parts = normalizePath(value).split('/');
  return parts[parts.length - 1] ?? value;
}

function dirname(value: string): string {
  const parts = normalizePath(value).split('/');
  parts.pop();
  return parts.join('/');
}