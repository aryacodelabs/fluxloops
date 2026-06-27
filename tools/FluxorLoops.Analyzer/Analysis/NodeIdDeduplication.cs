using FluxorLoops.Analyzer.Model;

namespace FluxorLoops.Analyzer.Analysis;

internal static class NodeIdDeduplication
{
    public static void Deduplicate(GraphBuildContext context)
    {
        var aliases = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var kind in new[] { NodeKind.State, NodeKind.Action })
        {
            var groups = context.Nodes
                .Where(node => node.Kind == kind)
                .GroupBy(node => GroupKey(node), StringComparer.OrdinalIgnoreCase);

            foreach (var group in groups)
            {
                var nodes = group.ToArray();
                if (nodes.Length <= 1)
                {
                    continue;
                }

                var canonical = SelectCanonical(nodes);
                foreach (var node in nodes)
                {
                    if (!node.Id.Equals(canonical.Id, StringComparison.Ordinal))
                    {
                        aliases[node.Id] = canonical.Id;
                    }
                }
            }
        }

        if (aliases.Count == 0)
        {
            return;
        }

        context.Nodes.RemoveAll(node => aliases.ContainsKey(node.Id));

        for (var i = 0; i < context.Nodes.Count; i++)
        {
            var node = context.Nodes[i];
            if (node.FeatureStateId is not null &&
                aliases.TryGetValue(node.FeatureStateId, out var mappedFeature))
            {
                context.Nodes[i] = node with { FeatureStateId = mappedFeature };
            }
        }

        var remappedEdges = context.Edges
            .Select(edge => edge with
            {
                FromId = aliases.GetValueOrDefault(edge.FromId, edge.FromId),
                ToId = aliases.GetValueOrDefault(edge.ToId, edge.ToId),
            })
            .ToArray();

        context.ReplaceEdges(remappedEdges);
    }

    private static string GroupKey(GraphNode node)
    {
        var simpleName = SimpleTypeName(node.DisplayName);
        var project = node.ProjectPath ?? string.Empty;
        return $"{node.Kind}|{project}|{simpleName}";
    }

    private static string SimpleTypeName(string displayName)
    {
        var name = displayName;
        var backtick = name.IndexOf('`', StringComparison.Ordinal);
        if (backtick >= 0)
        {
            name = name[..backtick];
        }

        var lastDot = name.LastIndexOf('.');
        return lastDot >= 0 ? name[(lastDot + 1)..] : name;
    }

    private static GraphNode SelectCanonical(IReadOnlyList<GraphNode> nodes)
    {
        return nodes
            .OrderByDescending(IdSpecificity)
            .ThenByDescending(node => node.Id.Length)
            .ThenBy(node => node.FilePath, StringComparer.OrdinalIgnoreCase)
            .First();
    }

    private static int IdSpecificity(GraphNode node)
    {
        var separator = node.Id.IndexOf(':');
        var key = separator >= 0 ? node.Id[(separator + 1)..] : node.Id;
        return key.Count(character => character == '.');
    }
}