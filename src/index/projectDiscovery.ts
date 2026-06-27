import * as path from 'node:path';

export interface ProjectOption {
  id: string;
  label: string;
}

export function projectLabelFromPath(projectPath: string): string {
  return path.basename(projectPath, '.csproj');
}

export function listProjectsFromPaths(projectPaths: string[]): ProjectOption[] {
  const seen = new Set<string>();
  const options: ProjectOption[] = [];

  for (const projectPath of projectPaths.sort((a, b) => a.localeCompare(b))) {
    const normalized = path.normalize(projectPath);
    if (seen.has(normalized.toLowerCase())) {
      continue;
    }
    seen.add(normalized.toLowerCase());
    options.push({
      id: normalized,
      label: projectLabelFromPath(normalized),
    });
  }

  return options;
}

export function listProjectsFromNodes(
  nodes: Array<{ projectPath?: string | null; filePath?: string }>,
): ProjectOption[] {
  const paths = nodes
    .map((node) => node.projectPath)
    .filter((value): value is string => Boolean(value?.trim()));
  return listProjectsFromPaths(paths);
}

export function isTestProjectPath(projectPath: string): boolean {
  const base = path.basename(projectPath).toLowerCase();
  return (
    base.endsWith('.tests.csproj') ||
    base.endsWith('.test.csproj') ||
    base.endsWith('.unittests.csproj')
  );
}

export function discoverProjectsUnderScope(
  csprojPaths: string[],
  scopeRoot: string,
): ProjectOption[] {
  const normalizedScope = path.normalize(scopeRoot).toLowerCase();
  const inScope = csprojPaths.filter((projectPath) => {
    if (isTestProjectPath(projectPath)) {
      return false;
    }
    const dir = path.normalize(path.dirname(projectPath)).toLowerCase();
    return dir === normalizedScope || dir.startsWith(`${normalizedScope}${path.sep}`);
  });

  return listProjectsFromPaths(inScope);
}