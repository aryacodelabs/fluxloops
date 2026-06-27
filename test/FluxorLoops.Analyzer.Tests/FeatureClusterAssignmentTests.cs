using FluxorLoops.Analyzer;
using FluxorLoops.Analyzer.Model;

namespace FluxorLoops.Analyzer.Tests;

public class FeatureClusterAssignmentTests
{
    [Fact]
    public void Build_propagates_feature_state_id_across_reducer_chain()
    {
        var context = new GraphBuildContext();
        context.AddNode(new GraphNode("state:Counter", NodeKind.State, "CounterState", "a.cs", 1));
        context.AddNode(new GraphNode("action:Inc", NodeKind.Action, "IncrementAction", "a.cs", 2));
        context.AddNode(new GraphNode("reducer:Reduce", NodeKind.Reducer, "ReduceInc", "a.cs", 3));
        context.AddNode(new GraphNode("state:Other", NodeKind.State, "OtherState", "b.cs", 1));
        context.AddNode(new GraphNode("action:Other", NodeKind.Action, "OtherAction", "b.cs", 2));

        context.AddEdge(new GraphEdge("action:Inc", "reducer:Reduce", EdgeKind.ReducesTo));
        context.AddEdge(new GraphEdge("reducer:Reduce", "state:Counter", EdgeKind.ReducesTo));
        context.AddEdge(new GraphEdge("action:Other", "state:Other", EdgeKind.ComponentDispatches));

        var result = GraphBuilder.Build(context);

        Assert.Equal("state:Counter", FeatureOf(result, "state:Counter"));
        Assert.Equal("state:Counter", FeatureOf(result, "action:Inc"));
        Assert.Equal("state:Counter", FeatureOf(result, "reducer:Reduce"));
        Assert.Equal("state:Other", FeatureOf(result, "state:Other"));
        Assert.Equal("state:Other", FeatureOf(result, "action:Other"));
    }

    [Fact]
    public void Build_propagates_feature_state_id_through_effect_cascade()
    {
        var context = new GraphBuildContext();
        context.AddNode(new GraphNode("state:Counter", NodeKind.State, "CounterState", "a.cs", 1));
        context.AddNode(new GraphNode("action:Inc", NodeKind.Action, "IncrementAction", "a.cs", 2));
        context.AddNode(new GraphNode("effect:Fx", NodeKind.Effect, "CounterEffects", "a.cs", 10));
        context.AddNode(new GraphNode("action:Disp", NodeKind.Action, "DispatchedAction", "a.cs", 3));

        context.AddEdge(new GraphEdge("action:Inc", "state:Counter", EdgeKind.ReducesTo));
        context.AddEdge(new GraphEdge("effect:Fx", "action:Inc", EdgeKind.EffectListensFor));
        context.AddEdge(new GraphEdge("effect:Fx", "action:Disp", EdgeKind.EffectDispatches));

        var result = GraphBuilder.Build(context);

        Assert.Equal("state:Counter", FeatureOf(result, "effect:Fx"));
        Assert.Equal("state:Counter", FeatureOf(result, "action:Inc"));
        Assert.Equal("state:Counter", FeatureOf(result, "action:Disp"));
    }

    [Fact]
    public void Build_does_not_loop_when_shared_action_links_two_features()
    {
        var context = new GraphBuildContext();
        context.AddNode(new GraphNode("state:A", NodeKind.State, "StateA", "a.cs", 1));
        context.AddNode(new GraphNode("state:B", NodeKind.State, "StateB", "b.cs", 1));
        context.AddNode(new GraphNode("action:Shared", NodeKind.Action, "SharedAction", "c.cs", 1));
        context.AddNode(new GraphNode("reducer:A", NodeKind.Reducer, "ReduceA", "a.cs", 2));
        context.AddNode(new GraphNode("reducer:B", NodeKind.Reducer, "ReduceB", "b.cs", 2));

        context.AddEdge(new GraphEdge("action:Shared", "reducer:A", EdgeKind.ReducesTo));
        context.AddEdge(new GraphEdge("reducer:A", "state:A", EdgeKind.ReducesTo));
        context.AddEdge(new GraphEdge("action:Shared", "reducer:B", EdgeKind.ReducesTo));
        context.AddEdge(new GraphEdge("reducer:B", "state:B", EdgeKind.ReducesTo));

        var result = GraphBuilder.Build(context);

        Assert.Equal(5, result.Nodes.Count);
        Assert.NotNull(FeatureOf(result, "action:Shared"));
        Assert.Contains(FeatureOf(result, "action:Shared"), new[] { "state:A", "state:B" });
    }

    [Fact]
    public void Build_leaves_unconnected_nodes_without_feature()
    {
        var context = new GraphBuildContext();
        context.AddNode(new GraphNode("action:Orphan", NodeKind.Action, "OrphanAction", "a.cs", 1));

        var result = GraphBuilder.Build(context);

        Assert.Null(FeatureOf(result, "action:Orphan"));
    }

    private static string? FeatureOf(GraphResult result, string nodeId) =>
        result.Nodes.Single(node => node.Id == nodeId).FeatureStateId;
}