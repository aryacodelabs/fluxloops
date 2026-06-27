import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ScanTargets {
  solutionPath?: string;
  projectPath?: string;
}

export function resolveScanTargets(scopeRoot: string, discoveredSlns: string[]): ScanTargets {
  const normalizedScope = path.normalize(scopeRoot);

  const slnInScope = discoveredSlns
    .filter((sln) => isUnderDir(sln, normalizedScope))
    .sort((a, b) => a.localeCompare(b));

  const slnCandidates = slnInScope.length > 0 ? slnInScope : findSlnsInDirectory(normalizedScope);

  if (slnCandidates.length > 0) {
    return { solutionPath: path.resolve(slnCandidates[0]) };
  }

  const csproj = findFirstCsproj(normalizedScope);
  if (csproj) {
    return { projectPath: path.resolve(csproj) };
  }

  if (fs.existsSync(path.join(normalizedScope, 'Program.cs'))) {
    const guessed = findFirstCsproj(normalizedScope);
    if (guessed) {
      return { projectPath: guessed };
    }
  }

  return { projectPath: path.resolve(normalizedScope, `${path.basename(normalizedScope)}.csproj`) };
}

function findSlnsInDirectory(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sln'))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function findFirstCsproj(dir: string): string | undefined {
  if (!fs.existsSync(dir)) {
    return undefined;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.csproj')) {
      return path.join(dir, entry.name);
    }
  }

  return undefined;
}

function isUnderDir(filePath: string, dirPath: string): boolean {
  const normalizedFile = path.normalize(filePath).replace(/\\/g, '/').toLowerCase();
  const normalizedDir = path.normalize(dirPath).replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
  return normalizedFile.startsWith(`${normalizedDir}/`) || normalizedFile === normalizedDir;
}