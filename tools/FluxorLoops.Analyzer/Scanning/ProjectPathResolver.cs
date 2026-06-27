namespace FluxorLoops.Analyzer.Scanning;

internal static class ProjectPathResolver
{
    public static string? FindOwningProject(string filePath)
    {
        var current = Path.GetDirectoryName(Path.GetFullPath(filePath));
        while (!string.IsNullOrWhiteSpace(current))
        {
            var projects = Directory.GetFiles(current, "*.csproj");
            if (projects.Length == 1)
            {
                return Path.GetFullPath(projects[0]);
            }

            if (projects.Length > 1)
            {
                return Path.GetFullPath(
                    projects.OrderBy(path => path.Length).First());
            }

            current = Path.GetDirectoryName(current);
        }

        return null;
    }
}