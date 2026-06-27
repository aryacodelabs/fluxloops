namespace FluxorLoops.Analyzer.Model;

public enum NodeKind
{
    State,
    Action,
    Reducer,
    Effect,
    Component,
}

public enum EdgeKind
{
    ReducesTo,
    EffectListensFor,
    EffectDispatches,
    ComponentSubscribesTo,
    ComponentDispatches,
}

public sealed record GraphNode(
    string Id,
    NodeKind Kind,
    string DisplayName,
    string FilePath,
    int Line,
    string? FeatureStateId = null,
    string? ProjectPath = null);

public sealed record GraphEdge(string FromId, string ToId, EdgeKind Kind, bool IsDynamic = false);

public sealed record AnalysisWarning(
    string Code,
    string Message,
    string FilePath,
    int Line);

public sealed record CycleReport(
    IReadOnlyList<string> NodeIds,
    IReadOnlyList<string> EdgeDescriptions);

public sealed record GraphResult
{
    public List<GraphNode> Nodes { get; init; } = [];
    public List<GraphEdge> Edges { get; init; } = [];
    public List<AnalysisWarning> Warnings { get; init; } = [];
    public List<CycleReport> Cycles { get; init; } = [];
    public List<ScanErrorDto> Errors { get; init; } = [];
}

public sealed record ScanErrorDto
{
    public string Code { get; init; } = string.Empty;
    public string Message { get; init; } = string.Empty;
    public string? FilePath { get; init; }
    public bool Fatal { get; init; }
}

public sealed record ScanPayload
{
    public string? SolutionPath { get; init; }
    public string? ProjectPath { get; init; }
    public string[]? ChangedFiles { get; init; }
    public GraphNode[]? SeedStateNodes { get; init; }
    public bool ExcludeTestProjects { get; init; } = true;
    public bool UseMsBuild { get; init; }
}