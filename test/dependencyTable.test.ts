import { describe, expect, it } from 'vitest';
import {
  buildDependencyRows,
  filterDependencyRows,
  EMPTY_COLUMN_FILTERS,
} from '../src/webview/dependencyTable';

describe('dependencyTable', () => {
  const nodes = [
    { id: 'state:Counter', kind: 'state', displayName: 'CounterState', featureStateId: 'state:Counter', projectPath: 'a.csproj', filePath: 'a.cs', line: 1 },
    { id: 'action:Inc', kind: 'action', displayName: 'IncrementAction', featureStateId: 'state:Counter', projectPath: 'a.csproj', filePath: 'a.cs', line: 2 },
    { id: 'reducer:Reduce', kind: 'reducer', displayName: 'ReduceInc', featureStateId: 'state:Counter', projectPath: 'a.csproj', filePath: 'a.cs', line: 3 },
    { id: 'state:Other', kind: 'state', displayName: 'OtherState', featureStateId: 'state:Other', projectPath: 'b.csproj', filePath: 'b.cs', line: 1 },
    { id: 'action:Other', kind: 'action', displayName: 'OtherAction', featureStateId: 'state:Other', projectPath: 'b.csproj', filePath: 'b.cs', line: 2 },
  ];

  const edges = [
    { fromId: 'action:Inc', toId: 'reducer:Reduce', kind: 'reducesTo' },
    { fromId: 'reducer:Reduce', toId: 'state:Counter', kind: 'reducesTo' },
    { fromId: 'action:Other', toId: 'state:Other', kind: 'componentDispatches' },
  ];

  const featureOptions = [
    { id: 'state:Counter', label: 'CounterState' },
    { id: 'state:Other', label: 'OtherState' },
  ];

  it('builds readable dependency rows', () => {
    const rows = buildDependencyRows(nodes, edges, featureOptions, [
      { id: 'a.csproj', label: 'SampleApp' },
      { id: 'b.csproj', label: 'Other' },
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      feature: 'CounterState',
      fromName: 'IncrementAction',
      relationship: 'reduces to',
      toName: 'ReduceInc',
    });
  });

  it('filters rows by feature column', () => {
    const rows = buildDependencyRows(nodes, edges, featureOptions, [
      { id: 'a.csproj', label: 'SampleApp' },
      { id: 'b.csproj', label: 'Other' },
    ]);
    const filtered = filterDependencyRows(rows, { ...EMPTY_COLUMN_FILTERS, feature: 'Other' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].feature).toBe('OtherState');
  });

  it('combines multiple column filters', () => {
    const rows = buildDependencyRows(nodes, edges, featureOptions, [
      { id: 'a.csproj', label: 'SampleApp' },
      { id: 'b.csproj', label: 'Other' },
    ]);
    const filtered = filterDependencyRows(rows, {
      ...EMPTY_COLUMN_FILTERS,
      feature: 'Counter',
      fromKind: 'reducer',
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].fromName).toBe('ReduceInc');
  });
});