import { describe, expect, it } from 'vitest';
import {
  defaultDependenciesFilename,
  defaultGraphPngFilename,
  formatExportDate,
  sanitizeFilenameSegment,
} from '../src/ui/exportFilename';

describe('exportFilename', () => {
  it('sanitizes unsafe filename segments', () => {
    expect(sanitizeFilenameSegment('My Project: Forms')).toBe('My-Project-Forms');
    expect(sanitizeFilenameSegment('   ')).toBe('all');
  });

  it('formats export dates as yyyy-MM-dd', () => {
    expect(formatExportDate(new Date(2026, 5, 28))).toBe('2026-06-28');
  });

  it('builds dependency and graph filenames', () => {
    const date = new Date(2026, 5, 28);
    expect(defaultDependenciesFilename('Ziji.Forms', date)).toBe('fluxloops-dependencies-Ziji.Forms-2026-06-28.xlsx');
    expect(defaultDependenciesFilename(null, date)).toBe('fluxloops-dependencies-all-2026-06-28.xlsx');
    expect(defaultGraphPngFilename('CounterState', date)).toBe('fluxloops-graph-CounterState-2026-06-28.png');
  });
});