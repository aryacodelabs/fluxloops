using FluxorLoops.Analyzer.Analysis;
using FluxorLoops.Analyzer.Model;

// FeatureClusterAssignment mutates context.Nodes before result assembly.

namespace FluxorLoops.Analyzer;

public static class GraphBuilder
{
    public static GraphResult Build(GraphBuildContext context)
    {
        NodeIdDeduplication.Deduplicate(context);
        FeatureClusterAssignment.Assign(context);

        var result = new GraphResult
        {
            Nodes = context.Nodes,
            Edges = context.Edges,
            Warnings = context.Warnings,
            Errors = context.Errors,
        };

        result.Cycles.AddRange(CycleDetector.DetectEffectCycles(result.Edges, result.Nodes));
        return result;
    }
}

public sealed class GraphBuildContext
{
    private readonly HashSet<string> nodeIds = new(StringComparer.Ordinal);
    private readonly HashSet<(string FromId, string ToId, EdgeKind Kind)> edgeKeys = [];

    public List<GraphNode> Nodes { get; } = [];
    public List<GraphEdge> Edges { get; } = [];
    public List<AnalysisWarning> Warnings { get; } = [];
    public List<ScanErrorDto> Errors { get; } = [];
    public string? CurrentProjectPath { get; set; }

    public void AddNode(GraphNode node)
    {
        if (node.ProjectPath is null && !string.IsNullOrWhiteSpace(CurrentProjectPath))
        {
            node = node with { ProjectPath = CurrentProjectPath };
        }

        if (nodeIds.Add(node.Id))
        {
            Nodes.Add(node);
        }
    }

    public void AddEdge(GraphEdge edge)
    {
        var key = (edge.FromId, edge.ToId, edge.Kind);
        if (edgeKeys.Add(key))
        {
            Edges.Add(edge);
        }
    }

    public void ReplaceEdges(IEnumerable<GraphEdge> edges)
    {
        Edges.Clear();
        edgeKeys.Clear();
        foreach (var edge in edges)
        {
            AddEdge(edge);
        }
    }
}