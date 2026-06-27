using FluxorLoops.Analyzer.Model;

namespace FluxorLoops.Analyzer.Analysis;

internal static class FeatureClusterAssignment
{
    public static void Assign(GraphBuildContext context)
    {
        var nodeById = context.Nodes.ToDictionary(node => node.Id, StringComparer.Ordinal);
        var featureByNodeId = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var node in context.Nodes)
        {
            if (!string.IsNullOrWhiteSpace(node.FeatureStateId))
            {
                featureByNodeId[node.Id] = node.FeatureStateId!;
            }
            else if (node.Kind == NodeKind.State)
            {
                featureByNodeId[node.Id] = node.Id;
            }
        }

        var changed = true;
        var guard = 0;
        while (changed && guard++ < context.Nodes.Count + context.Edges.Count + 1)
        {
            changed = false;
            foreach (var edge in context.Edges)
            {
                if (TryTransfer(featureByNodeId, edge.FromId, edge.ToId))
                {
                    changed = true;
                }

                if (TryTransfer(featureByNodeId, edge.ToId, edge.FromId))
                {
                    changed = true;
                }
            }
        }

        for (var i = 0; i < context.Nodes.Count; i++)
        {
            var node = context.Nodes[i];
            if (featureByNodeId.TryGetValue(node.Id, out var featureId) &&
                node.FeatureStateId != featureId)
            {
                context.Nodes[i] = node with { FeatureStateId = featureId };
            }
        }
    }

    private static bool TryTransfer(Dictionary<string, string> featureByNodeId, string fromId, string toId)
    {
        if (!featureByNodeId.TryGetValue(fromId, out var featureId))
        {
            return false;
        }

        // Never overwrite an existing assignment — shared actions can link multiple
        // features and flipping assignments each pass caused an infinite loop.
        if (featureByNodeId.ContainsKey(toId))
        {
            return false;
        }

        featureByNodeId[toId] = featureId;
        return true;
    }
}