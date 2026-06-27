using System.Text.RegularExpressions;
using FluxorLoops.Analyzer.Model;
using FluxorLoops.Analyzer.Utilities;

namespace FluxorLoops.Analyzer.Scanning;

internal static partial class ComponentFileScanner
{
    [GeneratedRegex(@"@inject\s+IState<([^>]+)>", RegexOptions.IgnoreCase)]
    private static partial Regex RazorInjectStatePattern();

    [GeneratedRegex(@"@inject\s+IDispatcher(?:\s+\w+)?", RegexOptions.IgnoreCase)]
    private static partial Regex RazorInjectDispatcherPattern();

    [GeneratedRegex(@"\[Inject\][^\n]*\bIState<([^>]+)>", RegexOptions.IgnoreCase)]
    private static partial Regex CodeInjectStatePattern();

    [GeneratedRegex(@"\[Inject\][^\n]*\bIDispatcher\b", RegexOptions.IgnoreCase)]
    private static partial Regex CodeInjectDispatcherPattern();

    [GeneratedRegex(@"Dispatcher\.Dispatch\s*\(\s*new\s+([\w.]+)", RegexOptions.IgnoreCase)]
    private static partial Regex DispatchPattern();

    public static void ScanFile(string filePath, string content, GraphBuildContext context, IReadOnlyDictionary<string, string> knownTypeNames)
    {
        if (!IsComponentFile(filePath))
        {
            return;
        }

        var componentId = SymbolHelpers.ComponentId(filePath);
        var displayName = Path.GetFileNameWithoutExtension(filePath);
        var firstLine = GetFirstMeaningfulLine(content);

        context.AddNode(new GraphNode(
            componentId,
            NodeKind.Component,
            displayName,
            filePath,
            firstLine));

        ScanStateSubscriptions(content, filePath, componentId, context, knownTypeNames);
        ScanDispatches(content, filePath, componentId, context, knownTypeNames);
    }

    private static bool IsComponentFile(string filePath) =>
        filePath.EndsWith(".razor", StringComparison.OrdinalIgnoreCase) ||
        filePath.EndsWith(".razor.cs", StringComparison.OrdinalIgnoreCase);

    private static void ScanStateSubscriptions(
        string content,
        string filePath,
        string componentId,
        GraphBuildContext context,
        IReadOnlyDictionary<string, string> knownStateNames)
    {
        foreach (var match in RazorInjectStatePattern().Matches(content).Cast<Match>()
                     .Concat(CodeInjectStatePattern().Matches(content).Cast<Match>()))
        {
            var stateTypeName = match.Groups[1].Value.Trim();
            var stateId = ResolveStateId(stateTypeName, knownStateNames);
            if (stateId is null)
            {
                context.Warnings.Add(new AnalysisWarning(
                    "FLUXOR_UNKNOWN_STATE",
                    $"Component references unknown state type '{stateTypeName}'",
                    filePath,
                    GetLineNumber(content, match.Index)));
                continue;
            }

            context.AddEdge(new GraphEdge(componentId, stateId, EdgeKind.ComponentSubscribesTo));
        }
    }

    private static void ScanDispatches(
        string content,
        string filePath,
        string componentId,
        GraphBuildContext context,
        IReadOnlyDictionary<string, string> knownTypeNames)
    {
        if (!RazorInjectDispatcherPattern().IsMatch(content) &&
            !CodeInjectDispatcherPattern().IsMatch(content))
        {
            return;
        }

        foreach (Match match in DispatchPattern().Matches(content))
        {
            var actionName = match.Groups[1].Value.Trim();
            var actionId = ResolveTypeId(actionName, knownTypeNames)
                ?? SymbolHelpers.NodeId(NodeKind.Action, $"global::{actionName}");
            context.AddNode(new GraphNode(
                actionId,
                NodeKind.Action,
                actionName,
                filePath,
                GetLineNumber(content, match.Index)));

            context.AddEdge(new GraphEdge(componentId, actionId, EdgeKind.ComponentDispatches));
        }
    }

    private static string? ResolveStateId(string stateTypeName, IReadOnlyDictionary<string, string> knownTypeNames) =>
        ResolveTypeId(stateTypeName, knownTypeNames);

    private static string? ResolveTypeId(string typeName, IReadOnlyDictionary<string, string> knownTypeNames)
    {
        if (knownTypeNames.TryGetValue(typeName, out var exact))
        {
            return exact;
        }

        foreach (var (shortName, typeId) in knownTypeNames)
        {
            if (shortName.EndsWith($".{typeName}", StringComparison.Ordinal) ||
                shortName.Equals(typeName, StringComparison.Ordinal))
            {
                return typeId;
            }
        }

        return null;
    }

    private static int GetLineNumber(string content, int index)
    {
        var line = 1;
        for (var i = 0; i < index && i < content.Length; i++)
        {
            if (content[i] == '\n')
            {
                line++;
            }
        }

        return line;
    }

    private static int GetFirstMeaningfulLine(string content)
    {
        var index = content.IndexOf('\n');
        return index < 0 ? 1 : 2;
    }
}