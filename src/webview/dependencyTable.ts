import type { FeatureOption } from './featureFocus';
import { resolveProjectLabel, type ProjectOption } from './projectFilter';

export interface TableNode {
  id: string;
  kind: string;
  displayName: string;
  filePath?: string;
  line?: number;
  featureStateId?: string | null;
  projectPath?: string | null;
}

export interface TableEdge {
  fromId: string;
  toId: string;
  kind: string;
}

export interface DependencyRow {
  project: string;
  feature: string;
  featureId: string;
  fromKind: string;
  fromName: string;
  relationship: string;
  toKind: string;
  toName: string;
  filePath: string;
  line: number;
  fromId: string;
  toId: string;
}

export interface ExportRow {
  project: string;
  feature: string;
  fromKind: string;
  fromName: string;
  relationship: string;
  toKind: string;
  toName: string;
  filePath: string;
}

export function toExportRow(row: DependencyRow): ExportRow {
  return {
    project: row.project,
    feature: row.feature,
    fromKind: row.fromKind,
    fromName: row.fromName,
    relationship: row.relationship,
    toKind: row.toKind,
    toName: row.toName,
    filePath: row.filePath,
  };
}

export function serializeExportRows(rows: unknown): ExportRow[] | undefined {
  if (!Array.isArray(rows)) {
    return undefined;
  }

  const serialized: ExportRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      return undefined;
    }

    const candidate = row as Partial<ExportRow>;
    if (
      typeof candidate.project !== 'string'
      || typeof candidate.feature !== 'string'
      || typeof candidate.fromKind !== 'string'
      || typeof candidate.fromName !== 'string'
      || typeof candidate.relationship !== 'string'
      || typeof candidate.toKind !== 'string'
      || typeof candidate.toName !== 'string'
      || typeof candidate.filePath !== 'string'
    ) {
      return undefined;
    }

    serialized.push({
      project: candidate.project,
      feature: candidate.feature,
      fromKind: candidate.fromKind,
      fromName: candidate.fromName,
      relationship: candidate.relationship,
      toKind: candidate.toKind,
      toName: candidate.toName,
      filePath: candidate.filePath,
    });
  }

  return serialized;
}

export interface ColumnFilters {
  project: string;
  feature: string;
  fromKind: string;
  fromName: string;
  relationship: string;
  toKind: string;
  toName: string;
  filePath: string;
}

export const EMPTY_COLUMN_FILTERS: ColumnFilters = {
  project: '',
  feature: '',
  fromKind: '',
  fromName: '',
  relationship: '',
  toKind: '',
  toName: '',
  filePath: '',
};

const EDGE_LABELS: Record<string, string> = {
  reducesTo: 'reduces to',
  effectListensFor: 'listens for',
  effectDispatches: 'dispatches',
  componentSubscribesTo: 'subscribes to',
  componentDispatches: 'dispatches',
};

export function buildDependencyRows(
  nodes: TableNode[],
  edges: TableEdge[],
  featureOptions: FeatureOption[],
  projects: ProjectOption[] = [],
): DependencyRow[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const featureLabelById = new Map(featureOptions.map((option) => [option.id, option.label]));

  const rows: DependencyRow[] = [];

  for (const edge of edges) {
    const from = nodeById.get(edge.fromId);
    const to = nodeById.get(edge.toId);
    if (!from || !to) {
      continue;
    }

    const featureId = resolveFeatureId(from, to);
    rows.push({
      project: resolveProjectLabel(from, projects) || resolveProjectLabel(to, projects),
      feature: featureLabelById.get(featureId) ?? featureId,
      featureId,
      fromKind: from.kind,
      fromName: from.displayName,
      relationship: EDGE_LABELS[edge.kind] ?? edge.kind,
      toKind: to.kind,
      toName: to.displayName,
      filePath: from.filePath ?? to.filePath ?? '',
      line: from.line ?? to.line ?? 1,
      fromId: from.id,
      toId: to.id,
    });
  }

  return dedupeDependencyRows(rows).sort((a, b) => {
    const feature = a.feature.localeCompare(b.feature);
    if (feature !== 0) {
      return feature;
    }
    const from = a.fromName.localeCompare(b.fromName);
    if (from !== 0) {
      return from;
    }
    return a.relationship.localeCompare(b.relationship);
  });
}

export function filterDependencyRows(rows: DependencyRow[], filters: ColumnFilters): DependencyRow[] {
  return rows.filter((row) => matchesColumnFilter(row.project, filters.project)
    && matchesColumnFilter(row.feature, filters.feature)
    && matchesColumnFilter(row.fromKind, filters.fromKind)
    && matchesColumnFilter(row.fromName, filters.fromName)
    && matchesColumnFilter(row.relationship, filters.relationship)
    && matchesColumnFilter(row.toKind, filters.toKind)
    && matchesColumnFilter(row.toName, filters.toName)
    && matchesColumnFilter(row.filePath, filters.filePath));
}

function dedupeDependencyRows(rows: DependencyRow[]): DependencyRow[] {
  const seen = new Set<string>();
  const unique: DependencyRow[] = [];

  for (const row of rows) {
    const key = `${row.fromId}|${row.toId}|${row.relationship}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(row);
  }

  return unique;
}

function resolveFeatureId(from: TableNode, to: TableNode): string {
  if (from.featureStateId) {
    return from.featureStateId;
  }
  if (to.featureStateId) {
    return to.featureStateId;
  }
  if (from.kind === 'state') {
    return from.id;
  }
  if (to.kind === 'state') {
    return to.id;
  }
  return '';
}

function matchesColumnFilter(value: string, filter: string): boolean {
  const term = filter.trim().toLowerCase();
  if (!term) {
    return true;
  }
  return value.toLowerCase().includes(term);
}