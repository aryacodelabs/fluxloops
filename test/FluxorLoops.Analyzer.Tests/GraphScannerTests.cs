using FluxorLoops.Analyzer.Model;
using FluxorLoops.Analyzer.Scanning;

namespace FluxorLoops.Analyzer.Tests;

public class GraphScannerTests
{
    [Fact]
    public async Task Scan_fixture_project_finds_reducer_and_effect_edges()
    {
        var projectPath = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory,
            "..", "..", "..", "..", "fixtures", "SampleFluxorApp", "SampleFluxorApp.csproj"));

        var scanner = new FluxorGraphScanner();
        var result = await scanner.ScanAsync(new ScanPayload
        {
            ProjectPath = projectPath,
            ExcludeTestProjects = true,
        });

        Assert.Empty(result.Errors.Where(error => error.Fatal));

        Assert.Contains(result.Nodes, node => node.Kind == NodeKind.State && node.DisplayName == "CounterState");
        Assert.Contains(result.Nodes, node => node.Kind == NodeKind.Action && node.DisplayName == "IncrementCounterAction");
        Assert.Contains(result.Nodes, node => node.Kind == NodeKind.Reducer);
        Assert.Contains(result.Nodes, node => node.Kind == NodeKind.Effect && node.DisplayName == "CounterEffects");

        Assert.Contains(result.Edges, edge =>
            edge.Kind == EdgeKind.ReducesTo &&
            result.Nodes.Any(node => node.Id == edge.FromId && node.Kind == NodeKind.Action));

        Assert.Contains(result.Edges, edge => edge.Kind == EdgeKind.EffectListensFor);
        Assert.Contains(result.Edges, edge => edge.Kind == EdgeKind.EffectDispatches);

        var counterState = result.Nodes.Single(node =>
            node.Kind == NodeKind.State && node.DisplayName == "CounterState");
        Assert.Equal(counterState.Id, counterState.FeatureStateId);

        var counterFeatureNames = new[]
        {
            "IncrementCounterAction",
            "ResetCounterAction",
            "CounterEffects",
            "ReduceIncrement",
            "ReduceReset",
        };

        foreach (var displayName in counterFeatureNames)
        {
            Assert.Contains(result.Nodes, node =>
                node.DisplayName == displayName && node.FeatureStateId == counterState.Id);
        }
    }
}