using FluxorLoops.Analyzer.Model;

namespace FluxorLoops.Analyzer;

public static class GraphMerger
{
    public static GraphResult Merge(GraphResult baseGraph, GraphResult delta, IReadOnlySet<string> changedFiles)
    {
        var context = new GraphBuildContext();
        var changedPaths = changedFiles
            .Select(NormalizePath)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var removedNodeIds = baseGraph.Nodes
            .Where(node => changedPaths.Contains(NormalizePath(node.FilePath)))
            .Select(node => node.Id)
            .ToHashSet(StringComparer.Ordinal);

        foreach (var node in baseGraph.Nodes)
        {
            if (!removedNodeIds.Contains(node.Id))
            {
                context.AddNode(node);
            }
        }

        foreach (var node in delta.Nodes)
        {
            context.AddNode(node);
        }

        foreach (var edge in baseGraph.Edges)
        {
            if (!removedNodeIds.Contains(edge.FromId) && !removedNodeIds.Contains(edge.ToId))
            {
                context.AddEdge(edge);
            }
        }

        foreach (var edge in delta.Edges)
        {
            context.AddEdge(edge);
        }

        foreach (var warning in baseGraph.Warnings)
        {
            if (!changedPaths.Contains(NormalizePath(warning.FilePath)))
            {
                context.Warnings.Add(warning);
            }
        }

        context.Warnings.AddRange(delta.Warnings);
        context.Errors.AddRange(delta.Errors);

        return GraphBuilder.Build(context);
    }

    private static string NormalizePath(string path) => Path.GetFullPath(path);
}