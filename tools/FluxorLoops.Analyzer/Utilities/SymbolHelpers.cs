using FluxorLoops.Analyzer.Model;
using Microsoft.CodeAnalysis;

namespace FluxorLoops.Analyzer.Utilities;

internal static class SymbolHelpers
{
    public static string GetDisplayName(ISymbol symbol) =>
        symbol.Name;

    public static string GetFqName(ITypeSymbol? type)
    {
        if (type is null || type.SpecialType == SpecialType.System_Void)
        {
            return string.Empty;
        }

        return type.ToDisplayString(SymbolDisplayFormat.FullyQualifiedFormat);
    }

    public static string GetFqName(ISymbol symbol) =>
        symbol.ToDisplayString(SymbolDisplayFormat.FullyQualifiedFormat);

    public static bool HasAttribute(ISymbol symbol, string attributeName)
    {
        foreach (var attribute in symbol.GetAttributes())
        {
            var className = attribute.AttributeClass?.Name;
            if (className is null)
            {
                continue;
            }

            if (className.Equals(attributeName, StringComparison.Ordinal) ||
                className.Equals($"{attributeName}Attribute", StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }

    public static int GetLineNumber(SyntaxNode node) =>
        node.SyntaxTree.GetLineSpan(node.Span).StartLinePosition.Line + 1;

    public static string NodeId(NodeKind kind, string key) => $"{kind.ToString().ToLowerInvariant()}:{key}";

    public static string ActionId(ITypeSymbol type) => NodeId(NodeKind.Action, GetFqName(type));

    public static string StateId(ITypeSymbol type) => NodeId(NodeKind.State, GetFqName(type));

    public static string ReducerId(IMethodSymbol method) =>
        NodeId(NodeKind.Reducer, $"{GetFqName(method.ContainingType)}.{method.Name}");

    public static string EffectId(INamedTypeSymbol type) => NodeId(NodeKind.Effect, GetFqName(type));

    public static string ComponentId(string filePath) =>
        NodeId(NodeKind.Component, filePath.Replace('\\', '/').ToLowerInvariant());
}