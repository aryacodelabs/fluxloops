import ExcelJS from 'exceljs';
import type { ExportRow } from '../webview/dependencyTable';

const EXPORT_HEADERS = [
  'Project',
  'Feature',
  'From kind',
  'From name',
  'Relationship',
  'To kind',
  'To name',
  'File',
] as const;

export async function buildDependencyWorkbook(rows: ExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Dependencies');

  sheet.addRow([...EXPORT_HEADERS]);
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };

  for (const row of rows) {
    sheet.addRow([
      row.project,
      row.feature,
      row.fromKind,
      row.fromName,
      row.relationship,
      row.toKind,
      row.toName,
      row.filePath,
    ]);
  }

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: rows.length + 1, column: EXPORT_HEADERS.length },
  };

  for (let columnIndex = 1; columnIndex <= EXPORT_HEADERS.length; columnIndex++) {
    const column = sheet.getColumn(columnIndex);
    let maxLength = EXPORT_HEADERS[columnIndex - 1].length;

    column.eachCell({ includeEmpty: false }, (cell) => {
      const value = cell.value == null ? '' : String(cell.value);
      maxLength = Math.max(maxLength, value.length);
    });

    column.width = Math.min(Math.max(maxLength + 2, 10), columnIndex === EXPORT_HEADERS.length ? 60 : 36);
    if (columnIndex === EXPORT_HEADERS.length) {
      column.alignment = { wrapText: true };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}