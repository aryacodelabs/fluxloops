import { describe, expect, it } from 'vitest';
import { filterByProject, listProjectOptions, resolveProjectLabel } from '../src/webview/projectFilter';

describe('projectFilter', () => {
  const nodes = [
    { id: 'state:A', kind: 'state', displayName: 'A', projectPath: 'C:/app/Client/Client.csproj', filePath: 'C:/app/Client/A.cs' },
    { id: 'state:B', kind: 'state', displayName: 'B', projectPath: 'C:/app/Server/Server.csproj', filePath: 'C:/app/Server/B.cs' },
    {
      id: 'state:C',
      kind: 'state',
      displayName: 'C',
      filePath: 'C:/app/Client/Features/C.cs',
    },
  ];

  const edges = [
    { fromId: 'state:A', toId: 'state:B', kind: 'reducesTo' },
  ];

  const projects = [
    { id: 'C:/app/Client/Client.csproj', label: 'Client' },
    { id: 'C:/app/Server/Server.csproj', label: 'Server' },
  ];

  it('lists unique project options', () => {
    const options = listProjectOptions(nodes);
    expect(options).toHaveLength(2);
    expect(options.map((option) => option.label)).toEqual(['Client', 'Server']);
  });

  it('filters nodes and internal edges to one project', () => {
    const result = filterByProject(nodes, edges, 'C:/app/Client/Client.csproj');
    expect(result.nodes.map((node) => node.id)).toEqual(['state:A', 'state:C']);
    expect(result.edges).toHaveLength(0);
  });

  it('infers project labels from file paths when projectPath is missing', () => {
    expect(resolveProjectLabel(nodes[2], projects)).toBe('Client');
  });
});