using FluxorLoops.Analyzer;
using FluxorLoops.Analyzer.Model;

namespace FluxorLoops.Analyzer.Tests;

public class NodeIdDeduplicationTests
{
    [Fact]
    public void Collapses_duplicate_state_and_action_ids_within_a_project()
    {
        var context = new GraphBuildContext
        {
            CurrentProjectPath = "C:/app/Forms.csproj",
        };

        context.AddNode(new GraphNode(
            "state:global::DisplayLogicModelsStore",
            NodeKind.State,
            "DisplayLogicModelsStore",
            "C:/app/Store.cs",
            1,
            "state:global::DisplayLogicModelsStore",
            "C:/app/Forms.csproj"));

        context.AddNode(new GraphNode(
            "state:global::Ziji.Components.Forms.Store.DisplayLogicModelsStore",
            NodeKind.State,
            "DisplayLogicModelsStore",
            "C:/app/QuestionBoardStore.cs",
            10,
            "state:global::Ziji.Components.Forms.Store.DisplayLogicModelsStore",
            "C:/app/Forms.csproj"));

        context.AddNode(new GraphNode(
            "action:global::AddVisibilityLogicAction",
            NodeKind.Action,
            "AddVisibilityLogicAction",
            "C:/app/Effects.cs",
            5,
            ProjectPath: "C:/app/Forms.csproj"));

        context.AddNode(new GraphNode(
            "action:global::Ziji.Components.Forms.Actions.AddVisibilityLogicAction",
            NodeKind.Action,
            "AddVisibilityLogicAction",
            "C:/app/Reducers.cs",
            8,
            ProjectPath: "C:/app/Forms.csproj"));

        context.AddNode(new GraphNode(
            "reducer:global::DisplayLogicModelsReducers.ReduceAdd",
            NodeKind.Reducer,
            "ReduceAddVisibilityLogicAction",
            "C:/app/Reducers.cs",
            8,
            "state:global::DisplayLogicModelsStore",
            "C:/app/Forms.csproj"));

        context.AddEdge(new GraphEdge(
            "action:global::AddVisibilityLogicAction",
            "reducer:global::DisplayLogicModelsReducers.ReduceAdd",
            EdgeKind.ReducesTo));

        context.AddEdge(new GraphEdge(
            "action:global::Ziji.Components.Forms.Actions.AddVisibilityLogicAction",
            "reducer:global::DisplayLogicModelsReducers.ReduceAdd",
            EdgeKind.ReducesTo));

        var result = GraphBuilder.Build(context);

        Assert.Equal(3, result.Nodes.Count);
        Assert.Single(result.Nodes.Where(node => node.Kind == NodeKind.State));
        Assert.Single(result.Nodes.Where(node => node.Kind == NodeKind.Action));
        Assert.Equal(
            "state:global::Ziji.Components.Forms.Store.DisplayLogicModelsStore",
            result.Nodes.Single(node => node.Kind == NodeKind.State).Id);
        Assert.Equal(
            "action:global::Ziji.Components.Forms.Actions.AddVisibilityLogicAction",
            result.Nodes.Single(node => node.Kind == NodeKind.Action).Id);
        Assert.Single(result.Edges);
    }
}