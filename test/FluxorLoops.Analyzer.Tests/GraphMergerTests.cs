using FluxorLoops.Analyzer;
using FluxorLoops.Analyzer.Model;

namespace FluxorLoops.Analyzer.Tests;

public class GraphMergerTests
{
    [Fact]
    public void Merge_replaces_nodes_from_changed_file_and_keeps_other_features()
    {
        var baseGraph = new GraphResult
        {
            Nodes =
            [
                new GraphNode("state:Counter", NodeKind.State, "CounterState", @"C:\app\Counter.cs", 1, "state:Counter"),
                new GraphNode("action:Inc", NodeKind.Action, "IncrementAction", @"C:\app\Counter.cs", 2, "state:Counter"),
                new GraphNode("state:Other", NodeKind.State, "OtherState", @"C:\app\Other.cs", 1, "state:Other"),
            ],
            Edges =
            [
                new GraphEdge("action:Inc", "state:Counter", EdgeKind.ReducesTo),
                new GraphEdge("action:Inc", "state:Other", EdgeKind.EffectDispatches),
            ],
        };

        var delta = new GraphResult
        {
            Nodes =
            [
                new GraphNode("state:Counter", NodeKind.State, "CounterState", @"C:\app\Counter.cs", 1, "state:Counter"),
                new GraphNode("action:New", NodeKind.Action, "NewAction", @"C:\app\Counter.cs", 5),
            ],
            Edges =
            [
                new GraphEdge("action:New", "state:Counter", EdgeKind.ReducesTo),
            ],
        };

        var changedFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            Path.GetFullPath(@"C:\app\Counter.cs"),
        };

        var merged = GraphMerger.Merge(baseGraph, delta, changedFiles);

        Assert.Equal(3, merged.Nodes.Count);
        Assert.Contains(merged.Nodes, node => node.Id == "state:Other");
        Assert.Contains(merged.Nodes, node => node.Id == "action:New");
        Assert.DoesNotContain(merged.Nodes, node => node.Id == "action:Inc");
        Assert.Contains(merged.Edges, edge => edge.FromId == "action:New");
        Assert.DoesNotContain(merged.Edges, edge => edge.FromId == "action:Inc");
        Assert.Equal("state:Counter", merged.Nodes.Single(node => node.Id == "action:New").FeatureStateId);
    }
}