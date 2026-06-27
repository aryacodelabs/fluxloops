using FluxorLoops.Analyzer.Model;
using FluxorLoops.Analyzer.Scanning;

namespace FluxorLoops.Analyzer.Tests;

public class IncrementalScanTests
{
    [Fact]
    public async Task Scan_with_changed_files_only_includes_matching_file_nodes()
    {
        var projectPath = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory,
            "..", "..", "..", "..", "fixtures", "SampleFluxorApp", "SampleFluxorApp.csproj"));

        var counterStatePath = Path.GetFullPath(Path.Combine(
            Path.GetDirectoryName(projectPath)!,
            "CounterState.cs"));

        var scanner = new FluxorGraphScanner();
        var result = await scanner.ScanAsync(new ScanPayload
        {
            ProjectPath = projectPath,
            ExcludeTestProjects = true,
            ChangedFiles = [counterStatePath],
        });

        Assert.All(result.Nodes, node => Assert.Equal(counterStatePath, Path.GetFullPath(node.FilePath)));
        Assert.Contains(result.Nodes, node => node.DisplayName == "CounterState");
        Assert.DoesNotContain(result.Nodes, node => node.Kind == NodeKind.Component);
    }
}