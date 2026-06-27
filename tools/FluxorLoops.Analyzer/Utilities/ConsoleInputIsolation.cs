namespace FluxorLoops.Analyzer.Utilities;

internal static class ConsoleInputIsolation
{
    public static async Task<T> RunWithoutConsoleInputAsync<T>(Func<Task<T>> action)
    {
        var original = Console.In;
        try
        {
            Console.SetIn(TextReader.Null);
            return await action();
        }
        finally
        {
            Console.SetIn(original);
        }
    }
}