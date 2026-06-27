import { describe, expect, it } from 'vitest';
import { filterByFeatureCluster, listFeatureOptions } from '../src/webview/featureFocus';

describe('featureFocus', () => {
  const nodes = [
    { id: 'state:CounterState', kind: 'state', displayName: 'CounterState', featureStateId: 'state:CounterState' },
    { id: 'action:Increment', kind: 'action', displayName: 'IncrementCounterAction', featureStateId: 'state:CounterState' },
    { id: 'reducer:Reduce', kind: 'reducer', displayName: 'ReduceIncrement', featureStateId: 'state:CounterState' },
    { id: 'state:OtherState', kind: 'state', displayName: 'OtherState', featureStateId: 'state:OtherState' },
    { id: 'action:Other', kind: 'action', displayName: 'OtherAction', featureStateId: 'state:OtherState' },
  ];

  const edges = [
    { fromId: 'action:Increment', toId: 'reducer:Reduce', kind: 'reducesTo' },
    { fromId: 'reducer:Reduce', toId: 'state:CounterState', kind: 'reducesTo' },
    { fromId: 'action:Other', toId: 'state:OtherState', kind: 'componentDispatches' },
  ];

  it('lists state nodes as feature options', () => {
    const options = listFeatureOptions(nodes);
    expect(options).toHaveLength(2);
    expect(options[0].label).toBe('CounterState');
  });

  it('disambiguates duplicate state names with project labels', () => {
    const multiProjectNodes = [
      {
        id: 'state:Client::FormState',
        kind: 'state',
        displayName: 'FormState',
        projectPath: 'C:/app/Client/Client.csproj',
      },
      {
        id: 'state:Server::FormState',
        kind: 'state',
        displayName: 'FormState',
        projectPath: 'C:/app/Server/Server.csproj',
      },
    ];

    const projects = [
      { id: 'C:/app/Client/Client.csproj', label: 'Client' },
      { id: 'C:/app/Server/Server.csproj', label: 'Server' },
    ];
    const options = listFeatureOptions(multiProjectNodes, null, projects);
    expect(options).toEqual([
      { id: 'state:Client::FormState', label: 'FormState (Client)' },
      { id: 'state:Server::FormState', label: 'FormState (Server)' },
    ]);
  });

  it('scopes feature options to the selected project', () => {
    const multiProjectNodes = [
      {
        id: 'state:Client::FormState',
        kind: 'state',
        displayName: 'FormState',
        projectPath: 'C:/app/Client/Client.csproj',
      },
      {
        id: 'state:Server::FormState',
        kind: 'state',
        displayName: 'FormState',
        projectPath: 'C:/app/Server/Server.csproj',
      },
    ];

    const projects = [
      { id: 'C:/app/Client/Client.csproj', label: 'Client' },
      { id: 'C:/app/Server/Server.csproj', label: 'Server' },
    ];
    const options = listFeatureOptions(multiProjectNodes, 'C:/app/Client/Client.csproj', projects);
    expect(options).toEqual([{ id: 'state:Client::FormState', label: 'FormState' }]);
  });

  it('filters graph to selected feature cluster', () => {
    const result = filterByFeatureCluster(nodes, edges, 'state:CounterState');
    expect(result.nodes.map((n) => n.id)).toEqual([
      'state:CounterState',
      'action:Increment',
      'reducer:Reduce',
    ]);
    expect(result.edges).toHaveLength(2);
  });

  it('does not include every node tagged with the same featureStateId without graph reachability', () => {
    const taggedNodes = [
      {
        id: 'state:CounterState',
        kind: 'state',
        displayName: 'CounterState',
        featureStateId: 'state:CounterState',
      },
      {
        id: 'action:Increment',
        kind: 'action',
        displayName: 'IncrementAction',
        featureStateId: 'state:CounterState',
      },
      {
        id: 'action:Detached',
        kind: 'action',
        displayName: 'DetachedAction',
        featureStateId: 'state:CounterState',
      },
    ];

    const taggedEdges = [{ fromId: 'action:Increment', toId: 'state:CounterState', kind: 'reducesTo' }];
    const result = filterByFeatureCluster(taggedNodes, taggedEdges, 'state:CounterState');
    expect(result.nodes.map((node) => node.id)).toEqual(['state:CounterState', 'action:Increment']);
  });

  it('does not bleed feature clusters across projects with shared action ids', () => {
    const multiProjectNodes = [
      {
        id: 'state:Client::FormState',
        kind: 'state',
        displayName: 'FormState',
        featureStateId: 'state:Client::FormState',
        projectPath: 'C:/app/Client/Client.csproj',
      },
      {
        id: 'action:global::SaveAction',
        kind: 'action',
        displayName: 'SaveAction',
        featureStateId: 'state:Client::FormState',
        projectPath: 'C:/app/Client/Client.csproj',
      },
      {
        id: 'state:Server::FormState',
        kind: 'state',
        displayName: 'FormState',
        featureStateId: 'state:Server::FormState',
        projectPath: 'C:/app/Server/Server.csproj',
      },
      {
        id: 'action:global::SaveActionServer',
        kind: 'action',
        displayName: 'SaveAction',
        featureStateId: 'state:Server::FormState',
        projectPath: 'C:/app/Server/Server.csproj',
      },
    ];

    const multiEdges = [
      { fromId: 'action:global::SaveAction', toId: 'state:Client::FormState', kind: 'reducesTo' },
      { fromId: 'action:global::SaveActionServer', toId: 'state:Server::FormState', kind: 'reducesTo' },
    ];

    const result = filterByFeatureCluster(multiProjectNodes, multiEdges, 'state:Client::FormState');
    expect(result.nodes.map((node) => node.id)).toEqual([
      'state:Client::FormState',
      'action:global::SaveAction',
    ]);
  });

  it('does not traverse into another feature state in the same project', () => {
    const nodesInProject = [
      {
        id: 'state:CounterState',
        kind: 'state',
        displayName: 'CounterState',
        projectPath: 'C:/app/Client.csproj',
      },
      {
        id: 'action:Shared',
        kind: 'action',
        displayName: 'SharedAction',
        projectPath: 'C:/app/Client.csproj',
      },
      {
        id: 'state:OtherState',
        kind: 'state',
        displayName: 'OtherState',
        projectPath: 'C:/app/Client.csproj',
      },
    ];

    const edgesInProject = [
      { fromId: 'action:Shared', toId: 'state:CounterState', kind: 'reducesTo' },
      { fromId: 'action:Shared', toId: 'state:OtherState', kind: 'reducesTo' },
    ];

    const result = filterByFeatureCluster(nodesInProject, edgesInProject, 'state:CounterState');
    expect(result.nodes.map((node) => node.id)).toEqual(['state:CounterState', 'action:Shared']);
  });

  it('returns full graph when feature is null', () => {
    const result = filterByFeatureCluster(nodes, edges, null);
    expect(result.nodes).toHaveLength(5);
    expect(result.edges).toHaveLength(3);
  });

  it('dedupes feature options that share the same label', () => {
    const duplicateNodes = [
      {
        id: 'state:global::DisplayLogicModelsStore',
        kind: 'state',
        displayName: 'DisplayLogicModelsStore',
        projectPath: 'C:/app/Forms.csproj',
      },
      {
        id: 'state:global::Ziji.Components.Forms.Store.DisplayLogicModelsStore',
        kind: 'state',
        displayName: 'DisplayLogicModelsStore',
        projectPath: 'C:/app/Forms.csproj',
      },
    ];

    const options = listFeatureOptions(duplicateNodes, null, [{ id: 'C:/app/Forms.csproj', label: 'Forms' }]);
    expect(options).toEqual([
      {
        id: 'state:global::Ziji.Components.Forms.Store.DisplayLogicModelsStore',
        label: 'DisplayLogicModelsStore (Forms)',
      },
    ]);
  });

  it('does not include reducers for other features reached through a shared action', () => {
    const sharedActionNodes = [
      {
        id: 'state:DisplayLogicModelsStore',
        kind: 'state',
        displayName: 'DisplayLogicModelsStore',
        projectPath: 'C:/app/Forms.csproj',
      },
      {
        id: 'state:SimQuestionsStore',
        kind: 'state',
        displayName: 'SimQuestionsStore',
        projectPath: 'C:/app/Forms.csproj',
      },
      {
        id: 'action:AddVisibilityLogicAction',
        kind: 'action',
        displayName: 'AddVisibilityLogicAction',
        projectPath: 'C:/app/Forms.csproj',
      },
      {
        id: 'reducer:DisplayLogicModels',
        kind: 'reducer',
        displayName: 'ReduceAddVisibilityLogicAction',
        featureStateId: 'state:DisplayLogicModelsStore',
        projectPath: 'C:/app/Forms.csproj',
      },
      {
        id: 'reducer:SimQuestions',
        kind: 'reducer',
        displayName: 'ReduceAddVisibilityLogicAction',
        featureStateId: 'state:SimQuestionsStore',
        projectPath: 'C:/app/Forms.csproj',
      },
    ];

    const sharedActionEdges = [
      { fromId: 'action:AddVisibilityLogicAction', toId: 'reducer:DisplayLogicModels', kind: 'reducesTo' },
      { fromId: 'reducer:DisplayLogicModels', toId: 'state:DisplayLogicModelsStore', kind: 'reducesTo' },
      { fromId: 'action:AddVisibilityLogicAction', toId: 'reducer:SimQuestions', kind: 'reducesTo' },
      { fromId: 'reducer:SimQuestions', toId: 'state:SimQuestionsStore', kind: 'reducesTo' },
    ];

    const result = filterByFeatureCluster(sharedActionNodes, sharedActionEdges, 'state:DisplayLogicModelsStore');
    expect(result.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        'state:DisplayLogicModelsStore',
        'reducer:DisplayLogicModels',
        'action:AddVisibilityLogicAction',
      ]),
    );
    expect(result.nodes).toHaveLength(3);
  });
});