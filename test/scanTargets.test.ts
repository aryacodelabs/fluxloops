import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveScanTargets } from '../src/index/scanTargets';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('resolveScanTargets', () => {
  it('falls back to solution files in the scope directory', () => {
    const scope = fs.mkdtempSync(path.join(os.tmpdir(), 'fluxloops-scope-'));
    tempDirs.push(scope);
    const solutionPath = path.join(scope, 'Sample.sln');
    fs.writeFileSync(solutionPath, '');

    const targets = resolveScanTargets(scope, []);
    expect(targets.solutionPath).toBe(path.resolve(solutionPath));
  });
});