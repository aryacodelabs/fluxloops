using FluxorLoops.Analyzer.Model;
using FluxorLoops.Analyzer.Utilities;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.MSBuild;

namespace FluxorLoops.Analyzer.Scanning;

public sealed class FluxorGraphScanner
{
    public async Task<GraphResult> ScanAsync(ScanPayload payload)
    {
        var context = new GraphBuildContext();
        var scanRoots = ResolveScanRoots(payload);
        if (scanRoots.Count == 0)
        {
            var target = payload.ProjectPath ?? payload.SolutionPath ?? "(unknown)";
            context.Errors.Add(new ScanErrorDto
            {
                Code = "PROJ_LOAD_FAILED",
                Message = $"Solution or project path not found: {target}",
                Fatal = true,
            });
            return GraphBuilder.Build(context);
        }

        var changedFiles = payload.ChangedFiles?
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Select(Path.GetFullPath)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var msBuildOpened = false;
        if (payload.UseMsBuild)
        {
            msBuildOpened = await TryScanWithMsBuildAsync(payload, changedFiles, context);
            if (msBuildOpened && context.Nodes.Count == 0)
            {
                context.Warnings.Add(new AnalysisWarning(
                    "MSBUILD_EMPTY_GRAPH",
                    "MSBuild loaded projects but produced no Fluxor nodes; using filesystem fallback",
                    payload.ProjectPath ?? payload.SolutionPath ?? string.Empty,
                    1));
                msBuildOpened = false;
            }
        }

        foreach (var root in scanRoots)
        {
            await ScanDirectoryAsync(root, payload, changedFiles, context, includeCSharp: !msBuildOpened);
        }

        return GraphBuilder.Build(context);
    }

    private static List<string> ResolveScanRoots(ScanPayload payload)
    {
        var roots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var projectPath = NormalizeExistingPath(payload.ProjectPath);
        var solutionPath = NormalizeExistingPath(payload.SolutionPath);

        if (projectPath is not null)
        {
            roots.Add(Path.GetDirectoryName(projectPath)!);
            return roots.ToList();
        }

        if (solutionPath is not null)
        {
            roots.Add(Path.GetDirectoryName(solutionPath)!);
        }

        return roots.ToList();
    }

    private static string? NormalizeExistingPath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return null;
        }

        var fullPath = Path.GetFullPath(path);
        return File.Exists(fullPath) ? fullPath : null;
    }

    private static async Task<bool> TryScanWithMsBuildAsync(
        ScanPayload payload,
        HashSet<string>? changedFiles,
        GraphBuildContext context)
    {
        try
        {
            return await ConsoleInputIsolation.RunWithoutConsoleInputAsync(async () =>
            {
                using var workspace = MSBuildWorkspace.Create();
                Solution? solution = null;

                var solutionPath = NormalizeExistingPath(payload.SolutionPath);
                var projectPath = NormalizeExistingPath(payload.ProjectPath);

                if (solutionPath is not null)
                {
                    solution = await workspace.OpenSolutionAsync(solutionPath);
                }
                else if (projectPath is not null)
                {
                    var project = await workspace.OpenProjectAsync(projectPath);
                    solution = project.Solution;
                }

                if (solution is null)
                {
                    return false;
                }

                var documentsScanned = 0;

                foreach (var diagnostic in workspace.Diagnostics)
                {
                    if (diagnostic.Kind == WorkspaceDiagnosticKind.Failure)
                    {
                        context.Errors.Add(new ScanErrorDto
                        {
                            Code = "PROJ_LOAD_FAILED",
                            Message = diagnostic.Message,
                            Fatal = false,
                        });
                    }
                }

                var targetProjectPath = projectPath;

                foreach (var project in solution.Projects)
                {
                    var projectFilePath = project.FilePath is not null
                        ? Path.GetFullPath(project.FilePath)
                        : null;

                    if (targetProjectPath is not null &&
                        !string.Equals(projectFilePath, targetProjectPath, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    if (payload.ExcludeTestProjects && IsTestProjectPath(project.FilePath ?? project.Name))
                    {
                        continue;
                    }

                    context.CurrentProjectPath = projectFilePath;

                    foreach (var document in project.Documents)
                    {
                        if (changedFiles is { Count: > 0 })
                        {
                            var docPath = document.FilePath;
                            if (docPath is null || !changedFiles.Contains(Path.GetFullPath(docPath)))
                            {
                                continue;
                            }
                        }

                        if (payload.ExcludeTestProjects && document.FilePath is not null &&
                            IsTestProjectPath(document.FilePath))
                        {
                            continue;
                        }

                        FluxorCSharpScanner.ScanDocument(document, context);
                        documentsScanned++;
                    }
                }

                context.CurrentProjectPath = null;
                return documentsScanned > 0;
            });
        }
        catch (Exception ex)
        {
            context.Errors.Add(new ScanErrorDto
            {
                Code = "MSBUILD_SCAN_FAILED",
                Message = ex.Message,
                Fatal = false,
            });
            context.CurrentProjectPath = null;
            return false;
        }
    }

    private static async Task ScanDirectoryAsync(
        string directory,
        ScanPayload payload,
        HashSet<string>? changedFiles,
        GraphBuildContext context,
        bool includeCSharp)
    {
        if (!Directory.Exists(directory))
        {
            return;
        }

        if (includeCSharp)
        {
            foreach (var filePath in Directory.EnumerateFiles(directory, "*.cs", SearchOption.AllDirectories))
            {
                if (ShouldSkipPath(filePath, payload))
                {
                    continue;
                }

                if (changedFiles is { Count: > 0 } && !changedFiles.Contains(Path.GetFullPath(filePath)))
                {
                    continue;
                }

                context.CurrentProjectPath = ProjectPathResolver.FindOwningProject(filePath);
                await ScanCSharpFileAsync(filePath, context);
            }
        }

        var knownTypeNames = BuildKnownTypeNameMap(context, payload);

        foreach (var filePath in Directory.EnumerateFiles(directory, "*.*", SearchOption.AllDirectories))
        {
            if (!filePath.EndsWith(".razor", StringComparison.OrdinalIgnoreCase) &&
                !filePath.EndsWith(".razor.cs", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (ShouldSkipPath(filePath, payload))
            {
                continue;
            }

            if (changedFiles is { Count: > 0 } && !changedFiles.Contains(Path.GetFullPath(filePath)))
            {
                continue;
            }

            if (!string.IsNullOrWhiteSpace(payload.ProjectPath) && File.Exists(payload.ProjectPath))
            {
                var projectDir = Path.GetDirectoryName(Path.GetFullPath(payload.ProjectPath))!;
                if (!IsUnderDir(filePath, projectDir))
                {
                    continue;
                }
            }

            try
            {
                context.CurrentProjectPath = ProjectPathResolver.FindOwningProject(filePath);
                var content = await File.ReadAllTextAsync(filePath);
                ComponentFileScanner.ScanFile(filePath, content, context, knownTypeNames);
            }
            catch (Exception ex)
            {
                context.Warnings.Add(new AnalysisWarning(
                    "FLUXOR_COMPONENT_SCAN_FAILED",
                    ex.Message,
                    filePath,
                    1));
            }
        }

        context.CurrentProjectPath = null;
    }

    private static async Task ScanCSharpFileAsync(string filePath, GraphBuildContext context)
    {
        var content = await File.ReadAllTextAsync(filePath);
        var tree = CSharpSyntaxTree.ParseText(content, path: filePath);
        var root = await tree.GetRootAsync();
        // Syntax-only scan: creating a per-file compilation is accurate but far too slow on
        // large Blazor projects; Fluxor attributes are detected from syntax trees directly.
        FluxorCSharpScanner.ScanSyntaxRoot(root, semanticModel: null, context);
    }

    private static bool ShouldSkipPath(string filePath, ScanPayload payload)
    {
        if (payload.ExcludeTestProjects && IsTestProjectPath(filePath))
        {
            return true;
        }

        return filePath.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase) ||
               filePath.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsTestProjectPath(string path)
    {
        var fileName = Path.GetFileName(path);
        if (fileName.EndsWith(".Tests.csproj", StringComparison.OrdinalIgnoreCase) ||
            fileName.EndsWith(".Test.csproj", StringComparison.OrdinalIgnoreCase) ||
            fileName.EndsWith(".UnitTests.csproj", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var segments = path.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return segments.Any(segment =>
            segment.EndsWith(".Tests", StringComparison.OrdinalIgnoreCase) ||
            segment.EndsWith(".Test", StringComparison.OrdinalIgnoreCase) ||
            segment.EndsWith(".UnitTests", StringComparison.OrdinalIgnoreCase) ||
            segment.EndsWith(".UnitTest", StringComparison.OrdinalIgnoreCase) ||
            segment.EndsWith("Tests", StringComparison.OrdinalIgnoreCase) && segment.Length > 5 ||
            segment.EndsWith("UnitTests", StringComparison.OrdinalIgnoreCase));
    }

    private static Dictionary<string, string> BuildKnownTypeNameMap(GraphBuildContext context, ScanPayload payload)
    {
        var map = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var node in context.Nodes.Concat(payload.SeedStateNodes ?? []))
        {
            if (node.Kind is not (NodeKind.State or NodeKind.Action))
            {
                continue;
            }

            if (!map.ContainsKey(node.DisplayName))
            {
                map[node.DisplayName] = node.Id;
            }

            var simpleName = node.DisplayName.Split('.').LastOrDefault() ?? node.DisplayName;
            if (!map.ContainsKey(simpleName))
            {
                map[simpleName] = node.Id;
            }
        }

        return map;
    }

    private static bool IsUnderDir(string filePath, string dirPath)
    {
        var normalizedFile = Path.GetFullPath(filePath).Replace('\\', '/').ToLowerInvariant();
        var normalizedDir = Path.GetFullPath(dirPath).Replace('\\', '/').ToLowerInvariant().TrimEnd('/');
        return normalizedFile.StartsWith($"{normalizedDir}/", StringComparison.Ordinal) ||
               string.Equals(normalizedFile, normalizedDir, StringComparison.Ordinal);
    }
}