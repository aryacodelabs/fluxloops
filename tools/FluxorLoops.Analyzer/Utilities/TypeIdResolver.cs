using FluxorLoops.Analyzer.Model;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace FluxorLoops.Analyzer.Utilities;

internal static class TypeIdResolver
{
    public static string ResolveStateId(
        ITypeSymbol? typeSymbol,
        TypeSyntax? typeSyntax,
        GraphBuildContext context)
    {
        if (typeSymbol is not null && typeSymbol.SpecialType != SpecialType.System_Void)
        {
            return SymbolHelpers.StateId(typeSymbol);
        }

        var typeName = typeSyntax is not null ? SyntaxHelpers.GetTypeName(typeSyntax) : string.Empty;
        return ResolveBySimpleName(NodeKind.State, typeName, context)
            ?? SyntaxHelpers.BuildTypeId(NodeKind.State, typeName);
    }

    public static string ResolveActionId(
        ITypeSymbol? typeSymbol,
        TypeSyntax? typeSyntax,
        string? fallbackName,
        GraphBuildContext context)
    {
        if (typeSymbol is not null && typeSymbol.SpecialType != SpecialType.System_Void)
        {
            return SymbolHelpers.ActionId(typeSymbol);
        }

        var typeName = typeSyntax is not null
            ? SyntaxHelpers.GetTypeName(typeSyntax)
            : fallbackName ?? string.Empty;

        return ResolveBySimpleName(NodeKind.Action, typeName, context)
            ?? SyntaxHelpers.BuildTypeId(NodeKind.Action, typeName);
    }

    private static string? ResolveBySimpleName(NodeKind kind, string typeName, GraphBuildContext context)
    {
        if (string.IsNullOrWhiteSpace(typeName))
        {
            return null;
        }

        var simpleName = SimpleTypeName(typeName);
        GraphNode? best = null;

        foreach (var node in context.Nodes)
        {
            if (node.Kind != kind)
            {
                continue;
            }

            if (!SimpleTypeName(node.DisplayName).Equals(simpleName, StringComparison.Ordinal) &&
                !node.DisplayName.EndsWith($".{simpleName}", StringComparison.Ordinal) &&
                !node.Id.EndsWith($".{simpleName}", StringComparison.Ordinal) &&
                !node.Id.EndsWith($"::{simpleName}", StringComparison.Ordinal))
            {
                continue;
            }

            if (best is null || node.Id.Length > best.Id.Length)
            {
                best = node;
            }
        }

        return best?.Id;
    }

    private static string SimpleTypeName(string value)
    {
        var name = value;
        var backtick = name.IndexOf('`', StringComparison.Ordinal);
        if (backtick >= 0)
        {
            name = name[..backtick];
        }

        var lastDot = name.LastIndexOf('.');
        return lastDot >= 0 ? name[(lastDot + 1)..] : name;
    }
}