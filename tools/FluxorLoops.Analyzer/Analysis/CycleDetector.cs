using FluxorLoops.Analyzer.Model;

namespace FluxorLoops.Analyzer.Analysis;

internal static class CycleDetector
{
    public static List<CycleReport> DetectEffectCycles(IReadOnlyList<GraphEdge> edges, IReadOnlyList<GraphNode> nodes)
    {
        var dispatchEdges = edges
            .Where(edge => edge.Kind == EdgeKind.EffectDispatches || edge.Kind == EdgeKind.EffectListensFor)
            .ToList();

        var adjacency = new Dictionary<string, List<(string To, EdgeKind Kind)>>(StringComparer.Ordinal);
        foreach (var edge in dispatchEdges)
        {
            if (!adjacency.TryGetValue(edge.FromId, out var list))
            {
                list = [];
                adjacency[edge.FromId] = list;
            }

            list.Add((edge.ToId, edge.Kind));
        }

        var cycles = new List<CycleReport>();
        var visiting = new HashSet<string>(StringComparer.Ordinal);
        var visited = new HashSet<string>(StringComparer.Ordinal);
        var stack = new List<string>();

        foreach (var nodeId in adjacency.Keys)
        {
            if (!visited.Contains(nodeId))
            {
                Dfs(nodeId, adjacency, visiting, visited, stack, cycles);
            }
        }

        return cycles;
    }

    private static void Dfs(
        string nodeId,
        Dictionary<string, List<(string To, EdgeKind Kind)>> adjacency,
        HashSet<string> visiting,
        HashSet<string> visited,
        List<string> stack,
        List<CycleReport> cycles)
    {
        visiting.Add(nodeId);
        stack.Add(nodeId);

        if (adjacency.TryGetValue(nodeId, out var neighbors))
        {
            foreach (var (to, _) in neighbors)
            {
                if (visiting.Contains(to))
                {
                    var cycleStart = stack.IndexOf(to);
                    if (cycleStart >= 0)
                    {
                        var cycleNodes = stack.Skip(cycleStart).Append(to).ToList();
                        cycles.Add(new CycleReport(
                            cycleNodes,
                            cycleNodes.Select(id => id).ToList()));
                    }

                    continue;
                }

                if (!visited.Contains(to))
                {
                    Dfs(to, adjacency, visiting, visited, stack, cycles);
                }
            }
        }

        stack.RemoveAt(stack.Count - 1);
        visiting.Remove(nodeId);
        visited.Add(nodeId);
    }
}