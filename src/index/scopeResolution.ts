import * as fs from 'node:fs';
import * as path from 'node:path';

export type DiscoveredFileKind = 'sln' | 'csproj' | 'hostEntry';

export interface DiscoveredFile {
  absolutePath: string;
  relativePath: string;
  workspaceRoot: string;
  kind: DiscoveredFileKind;
  depth: number;
}

export interface ScopeResolutionInput {
  projectPathConfig?: string;
  workspaceRoots: string[];
  discoveredFiles: DiscoveredFile[];
  scanEntireSolution?: boolean;
}

export type ScopeSource = 'config' | 'sln' | 'startupProject' | 'hostEntry' | 'csproj';

export interface ScopeResolutionResult {
  scopeRoot: string;
  source: ScopeSource;
}

const HOST_ENTRY_FILES = new Set(['program.cs', 'startup.cs']);

export function resolveScopeRoot(input: ScopeResolutionInput): ScopeResolutionResult | undefined {
  const normalizedRoots = input.workspaceRoots.map(normalizeDir).filter(Boolean);

  if (input.projectPathConfig?.trim()) {
    const configured = resolveConfiguredPath(input.projectPathConfig.trim(), normalizedRoots);
    if (configured) {
      return { scopeRoot: configured, source: 'config' };
    }
  }

  const slnCandidates = input.discoveredFiles
    .filter((f) => f.kind === 'sln')
    .map((f) => ({ dir: path.dirname(f.absolutePath), sortKey: normalizeDir(f.absolutePath) }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  if (slnCandidates.length > 0) {
    if (input.scanEntireSolution) {
      return { scopeRoot: slnCandidates[0].dir, source: 'sln' };
    }

    const startupProject = resolveStartupProjectDir(slnCandidates[0].dir, input.discoveredFiles);
    if (startupProject) {
      return { scopeRoot: startupProject, source: 'startupProject' };
    }

    return { scopeRoot: slnCandidates[0].dir, source: 'sln' };
  }

  const hostCandidates = input.discoveredFiles
    .filter((f) => f.kind === 'hostEntry')
    .sort((a, b) => {
      if (a.depth !== b.depth) {
        return a.depth - b.depth;
      }
      return normalizeDir(a.absolutePath).localeCompare(normalizeDir(b.absolutePath));
    });

  if (hostCandidates.length > 0) {
    return { scopeRoot: path.dirname(hostCandidates[0].absolutePath), source: 'hostEntry' };
  }

  const csprojCandidates = input.discoveredFiles
    .filter((f) => f.kind === 'csproj')
    .map((f) => ({ dir: path.dirname(f.absolutePath), sortKey: normalizeDir(f.absolutePath) }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  if (csprojCandidates.length > 0) {
    return { scopeRoot: csprojCandidates[0].dir, source: 'csproj' };
  }

  return undefined;
}

export function resolveConfiguredPath(projectPathConfig: string, workspaceRoots: string[]): string | undefined {
  if (path.isAbsolute(projectPathConfig)) {
    return normalizeDir(projectPathConfig);
  }

  for (const root of workspaceRoots) {
    const candidate = path.join(root, projectPathConfig);
    if (fs.existsSync(candidate)) {
      return normalizeDir(candidate);
    }
  }

  return undefined;
}

export function classifyDiscoveredFile(absolutePath: string, workspaceRoot: string): DiscoveredFile | undefined {
  const normalized = normalizeDir(absolutePath);
  const root = normalizeDir(workspaceRoot);
  const base = path.basename(normalized).toLowerCase();
  const relativePath = path.relative(root, normalized);

  if (base.endsWith('.sln')) {
    return makeDiscovered(normalized, relativePath, root, 'sln', depthOf(relativePath));
  }

  if (base.endsWith('.csproj')) {
    return makeDiscovered(normalized, relativePath, root, 'csproj', depthOf(relativePath));
  }

  if (HOST_ENTRY_FILES.has(base)) {
    return makeDiscovered(normalized, relativePath, root, 'hostEntry', depthOf(relativePath));
  }

  return undefined;
}

function makeDiscovered(
  absolutePath: string,
  relativePath: string,
  workspaceRoot: string,
  kind: DiscoveredFileKind,
  depth: number,
): DiscoveredFile {
  return { absolutePath, relativePath, workspaceRoot, kind, depth };
}

function depthOf(relativePath: string): number {
  const normalized = relativePath.replace(/\\/g, '/');
  if (!normalized || normalized === '.') {
    return 0;
  }
  return normalized.split('/').filter(Boolean).length - 1;
}

function normalizeDir(dirPath: string): string {
  return path.normalize(dirPath);
}

function resolveStartupProjectDir(solutionDir: string, discoveredFiles: DiscoveredFile[]): string | undefined {
  const normalizedSolution = normalizeDir(solutionDir);
  const hostEntries = discoveredFiles
    .filter((file) => file.kind === 'hostEntry')
    .filter((file) => isUnderDir(file.absolutePath, normalizedSolution))
    .map((file) => ({ file, projectDir: path.dirname(file.absolutePath) }))
    .filter(({ projectDir }) => !isAuxiliaryProjectDir(projectDir));

  if (hostEntries.length === 0) {
    return undefined;
  }

  hostEntries.sort((a, b) => {
    if (a.file.depth !== b.file.depth) {
      return a.file.depth - b.file.depth;
    }
    return normalizeDir(a.file.absolutePath).localeCompare(normalizeDir(b.file.absolutePath));
  });

  return hostEntries[0].projectDir;
}

function isAuxiliaryProjectDir(projectDir: string): boolean {
  const name = path.basename(projectDir).toLowerCase();
  return (
    name.includes('demo') ||
    name.includes('unittest') ||
    name.includes('sample') ||
    name.endsWith('.tests') ||
    name.endsWith('tests') ||
    name.endsWith('.test')
  );
}

function isUnderDir(filePath: string, dirPath: string): boolean {
  const normalizedFile = normalizeDir(filePath).replace(/\\/g, '/').toLowerCase();
  const normalizedDir = normalizeDir(dirPath).replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
  return normalizedFile.startsWith(`${normalizedDir}/`) || normalizedFile === normalizedDir;
}