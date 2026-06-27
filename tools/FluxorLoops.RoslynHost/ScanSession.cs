using FluxorLoops.Analyzer;
using FluxorLoops.Analyzer.Model;
using FluxorLoops.Analyzer.Scanning;

namespace FluxorLoops.RoslynHost;

internal sealed class ScanSession
{
    private GraphResult? _cached;

    public async Task<GraphResult> ScanAsync(FluxorGraphScanner scanner, ScanPayload payload)
    {
        var changedFiles = payload.ChangedFiles?
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Select(Path.GetFullPath)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        if (changedFiles is null or { Count: 0 })
        {
            var full = await scanner.ScanAsync(payload);
            _cached = full;
            return full;
        }

        if (_cached is null || _cached.Nodes.Count == 0)
        {
            var full = await scanner.ScanAsync(payload with { ChangedFiles = null, SeedStateNodes = null });
            _cached = full;
            return full;
        }

        var partialPayload = payload with
        {
            SeedStateNodes = _cached.Nodes
                .Where(node => node.Kind == NodeKind.State)
                .ToArray(),
        };

        var partial = await scanner.ScanAsync(partialPayload);
        var merged = GraphMerger.Merge(_cached, partial, changedFiles);
        _cached = merged;
        return merged;
    }
}