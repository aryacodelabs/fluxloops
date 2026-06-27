namespace FluxorLoops.Analyzer.Protocol;

public sealed class RoslynRequest
{
    public int ProtocolVersion { get; set; }
    public string Id { get; set; } = string.Empty;
    public string Cmd { get; set; } = string.Empty;
    public System.Text.Json.JsonElement Payload { get; set; }
}

public sealed class RoslynResponse
{
    public int ProtocolVersion { get; set; } = 1;
    public string Id { get; set; } = string.Empty;
    public bool Ok { get; set; }
    public object? Payload { get; set; }
    public RoslynErrorDto? Error { get; set; }
}

public sealed class RoslynErrorDto
{
    public string Code { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? FilePath { get; set; }
    public bool Fatal { get; set; }
}

public sealed class PingResult
{
    public string HostVersion { get; set; } = string.Empty;
    public string RoslynVersion { get; set; } = string.Empty;
    public string Rid { get; set; } = string.Empty;
}