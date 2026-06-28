import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildDependencyWorkbook } from '../src/ui/exportTable';

describe('exportTable', () => {
  it('writes workbook headers, rows, and autofilter', async () => {
    const buffer = await buildDependencyWorkbook([
      {
        project: 'SampleApp',
        feature: 'CounterState',
        fromKind: 'action',
        fromName: 'IncrementAction',
        relationship: 'reduces to',
        toKind: 'reducer',
        toName: 'ReduceInc',
        filePath: 'Features/Counter/CounterActions.cs',
      },
    ]);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Dependencies');
    expect(sheet).toBeDefined();
    expect(sheet?.getRow(1).getCell(1).value).toBe('Project');
    expect(sheet?.getRow(1).font?.bold).toBe(true);
    expect(sheet?.getRow(2).getCell(4).value).toBe('IncrementAction');
    expect(sheet?.autoFilter).toBe('A1:H2');
  });
});