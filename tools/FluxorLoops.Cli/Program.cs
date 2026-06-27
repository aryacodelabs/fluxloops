using System.Text.Json;
using System.Text.Json.Serialization;
using FluxorLoops.Analyzer.Model;
using FluxorLoops.Analyzer.Scanning;
using Microsoft.Build.Locator;

MSBuildLocator.RegisterDefaults();

if (args.Length == 0 || args[0] is not "scan")
{
    Console.Error.WriteLine("Usage: FluxorLoops.Cli scan --project <path.csproj> | --solution <path.sln>");
    return 1;
}

string? projectPath = null;
string? solutionPath = null;
var excludeTests = true;

for (var i = 1; i < args.Length; i++)
{
    switch (args[i])
    {
        case "--project" when i + 1 < args.Length:
            projectPath = args[++i];
            break;
        case "--solution" when i + 1 < args.Length:
            solutionPath = args[++i];
            break;
        case "--include-tests":
            excludeTests = false;
            break;
    }
}

if (projectPath is null && solutionPath is null)
{
    Console.Error.WriteLine("Provide --project or --solution");
    return 1;
}

var scanner = new FluxorGraphScanner();
var result = await scanner.ScanAsync(new ScanPayload
{
    ProjectPath = projectPath,
    SolutionPath = solutionPath,
    ExcludeTestProjects = excludeTests,
});

var jsonOptions = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    WriteIndented = true,
    Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
};

Console.WriteLine(JsonSerializer.Serialize(result, jsonOptions));
return result.Errors.Any(error => error.Fatal) ? 1 : 0;