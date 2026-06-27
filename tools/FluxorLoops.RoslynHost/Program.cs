using System.Text.Json;
using System.Text.Json.Serialization;
using FluxorLoops.Analyzer.Model;
using FluxorLoops.Analyzer.Protocol;
using FluxorLoops.Analyzer.Scanning;
using FluxorLoops.RoslynHost;
using Microsoft.Build.Locator;

MSBuildLocator.RegisterDefaults();

var jsonOptions = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
};

if (await TryRunOneShotAsync(args, jsonOptions))
{
    return;
}

var scanner = new FluxorGraphScanner();
var scanSession = new ScanSession();
await using var transport = new NdjsonTransport(Console.In, Console.Out, jsonOptions);

while (true)
{
    var request = await transport.ReadRequestAsync();
    if (request is null)
    {
        break;
    }

    var response = await HandleRequestAsync(request, scanner, scanSession);
    await transport.WriteResponseAsync(response);

    if (request.Cmd == "shutdown")
    {
        break;
    }
}

static async Task<bool> TryRunOneShotAsync(string[] args, JsonSerializerOptions jsonOptions)
{
    if (args.Length == 0)
    {
        return false;
    }

    if (args.Contains("--ping"))
    {
        var ping = new PingResult
        {
            HostVersion = "0.1.0",
            RoslynVersion = typeof(Microsoft.CodeAnalysis.CSharp.CSharpCompilation).Assembly.GetName().Version?.ToString() ?? "unknown",
            Rid = System.Runtime.InteropServices.RuntimeInformation.RuntimeIdentifier,
        };

        await Console.Out.WriteLineAsync(JsonSerializer.Serialize(ping, jsonOptions));
        Environment.Exit(0);
    }

    if (args.Contains("--scan"))
    {
        var exitCode = await RunOneShotScanAsync(args, jsonOptions);
        Environment.Exit(exitCode);
    }

    if (args.Contains("--serve"))
    {
        await RunServeLoopAsync(jsonOptions);
        Environment.Exit(0);
    }

    return false;
}

static async Task RunServeLoopAsync(JsonSerializerOptions jsonOptions)
{
    var scanner = new FluxorGraphScanner();
    var session = new ScanSession();

    while (true)
    {
        var line = await Console.In.ReadLineAsync();
        if (line is null || line.Equals("shutdown", StringComparison.OrdinalIgnoreCase))
        {
            break;
        }

        if (string.IsNullOrWhiteSpace(line))
        {
            continue;
        }

        try
        {
            var payloadJson = await File.ReadAllTextAsync(line);
            var payload = JsonSerializer.Deserialize<ScanPayload>(payloadJson, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true,
            });

            if (payload is null ||
                (string.IsNullOrWhiteSpace(payload.SolutionPath) && string.IsNullOrWhiteSpace(payload.ProjectPath)))
            {
                await WriteServeErrorAsync(jsonOptions, "INVALID_PAYLOAD", "scan requires solutionPath or projectPath");
                continue;
            }

            var started = System.Diagnostics.Stopwatch.StartNew();
            var result = await session.ScanAsync(scanner, payload);
            started.Stop();

            await Console.Error.WriteLineAsync(
                $"[FluxLoops] scan complete: {result.Nodes.Count} nodes, {result.Edges.Count} edges, {started.Elapsed.TotalSeconds:0.0}s");

            await Console.Out.WriteLineAsync(JsonSerializer.Serialize(result, jsonOptions));
            await Console.Out.FlushAsync();
        }
        catch (Exception ex)
        {
            await WriteServeErrorAsync(jsonOptions, "HOST_ERROR", ex.Message);
        }
    }
}

static async Task WriteServeErrorAsync(JsonSerializerOptions jsonOptions, string code, string message)
{
    var result = new GraphResult
    {
        Errors =
        [
            new ScanErrorDto
            {
                Code = code,
                Message = message,
                Fatal = true,
            },
        ],
    };

    await Console.Out.WriteLineAsync(JsonSerializer.Serialize(result, jsonOptions));
    await Console.Out.FlushAsync();
}

static async Task<int> RunOneShotScanAsync(string[] args, JsonSerializerOptions jsonOptions)
{
    ScanPayload? payload = null;
    string? payloadFile = null;
    var excludeTests = true;

    for (var i = 0; i < args.Length; i++)
    {
        switch (args[i])
        {
            case "--payload-file" when i + 1 < args.Length:
                payloadFile = args[++i];
                break;
            case "--project" when i + 1 < args.Length:
                payload ??= new ScanPayload();
                payload = payload with { ProjectPath = args[++i] };
                break;
            case "--solution" when i + 1 < args.Length:
                payload ??= new ScanPayload();
                payload = payload with { SolutionPath = args[++i] };
                break;
            case "--include-tests":
                excludeTests = false;
                break;
        }
    }

    if (payloadFile is not null)
    {
        var json = await File.ReadAllTextAsync(payloadFile);
        payload = JsonSerializer.Deserialize<ScanPayload>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
        });
    }

    if (payload is null)
    {
        await Console.Error.WriteLineAsync("One-shot scan requires --project, --solution, or --payload-file");
        return 1;
    }

    if (payloadFile is null)
    {
        payload = payload with { ExcludeTestProjects = excludeTests };
    }

    if (string.IsNullOrWhiteSpace(payload.SolutionPath) && string.IsNullOrWhiteSpace(payload.ProjectPath))
    {
        await Console.Error.WriteLineAsync("One-shot scan requires solutionPath or projectPath");
        return 1;
    }

    var scanner = new FluxorGraphScanner();
    var result = await scanner.ScanAsync(payload);
    await Console.Out.WriteLineAsync(JsonSerializer.Serialize(result, jsonOptions));
    return result.Errors.Any(error => error.Fatal) ? 1 : 0;
}

static async Task<RoslynResponse> HandleRequestAsync(RoslynRequest request, FluxorGraphScanner scanner, ScanSession scanSession)
{
    try
    {
        return request.Cmd switch
        {
            "ping" => CreateOk(request.Id, new PingResult
            {
                HostVersion = "0.1.0",
                RoslynVersion = typeof(Microsoft.CodeAnalysis.CSharp.CSharpCompilation).Assembly.GetName().Version?.ToString() ?? "unknown",
                Rid = System.Runtime.InteropServices.RuntimeInformation.RuntimeIdentifier,
            }),
            "scan" => await HandleScanAsync(request, scanner, scanSession),
            "shutdown" => CreateOk(request.Id, new Dictionary<string, object>()),
            _ => CreateError(request.Id, "UNKNOWN_CMD", $"Unknown command: {request.Cmd}", fatal: true),
        };
    }
    catch (Exception ex)
    {
        return CreateError(request.Id, "HOST_ERROR", ex.Message, fatal: true);
    }
}

static async Task<RoslynResponse> HandleScanAsync(RoslynRequest request, FluxorGraphScanner scanner, ScanSession scanSession)
{
    var payload = JsonSerializer.Deserialize<ScanPayload>(request.Payload.GetRawText(), new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true,
    });

    if (payload is null || (string.IsNullOrWhiteSpace(payload.SolutionPath) && string.IsNullOrWhiteSpace(payload.ProjectPath)))
    {
        return CreateError(request.Id, "INVALID_PAYLOAD", "scan requires solutionPath or projectPath", fatal: true);
    }

    var result = await scanSession.ScanAsync(scanner, payload);
    if (result.Errors.Any(error => error.Fatal))
    {
        return new RoslynResponse
        {
            ProtocolVersion = 1,
            Id = request.Id,
            Ok = false,
            Error = new RoslynErrorDto
            {
                Code = result.Errors.First(error => error.Fatal).Code,
                Message = result.Errors.First(error => error.Fatal).Message,
                Fatal = true,
            },
        };
    }

    return CreateOk(request.Id, result);
}

static RoslynResponse CreateOk(string id, object payload) => new()
{
    ProtocolVersion = 1,
    Id = id,
    Ok = true,
    Payload = payload,
};

static RoslynResponse CreateError(string id, string code, string message, bool fatal) => new()
{
    ProtocolVersion = 1,
    Id = id,
    Ok = false,
    Error = new RoslynErrorDto
    {
        Code = code,
        Message = message,
        Fatal = fatal,
    },
};