import { serializeExportRows, type ExportRow } from '../webview/dependencyTable';

export interface ExportTableMessage {
  type: 'exportTable';
  rows: ExportRow[];
  suggestedFilename: string;
}

export interface ExportGraphPngMessage {
  type: 'exportGraphPng';
  pngBase64: string;
  suggestedFilename: string;
}

export function parseExportTableMessage(message: unknown): ExportTableMessage | undefined {
  if (!message || typeof message !== 'object') {
    return undefined;
  }

  const candidate = message as Partial<ExportTableMessage>;
  if (candidate.type !== 'exportTable' || !Array.isArray(candidate.rows)) {
    return undefined;
  }

  const rows = serializeExportRows(candidate.rows);
  if (!rows) {
    return undefined;
  }

  const suggestedFilename =
    typeof candidate.suggestedFilename === 'string' && candidate.suggestedFilename.trim()
      ? candidate.suggestedFilename.trim()
      : 'fluxloops-dependencies-all.xlsx';

  return { type: 'exportTable', rows, suggestedFilename };
}

export function parseExportGraphPngMessage(message: unknown): ExportGraphPngMessage | undefined {
  if (!message || typeof message !== 'object') {
    return undefined;
  }

  const candidate = message as Partial<ExportGraphPngMessage>;
  if (candidate.type !== 'exportGraphPng' || typeof candidate.pngBase64 !== 'string') {
    return undefined;
  }

  if (!candidate.pngBase64.trim()) {
    return undefined;
  }

  const suggestedFilename =
    typeof candidate.suggestedFilename === 'string' && candidate.suggestedFilename.trim()
      ? candidate.suggestedFilename.trim()
      : 'fluxloops-graph-all.png';

  return {
    type: 'exportGraphPng',
    pngBase64: candidate.pngBase64,
    suggestedFilename,
  };
}