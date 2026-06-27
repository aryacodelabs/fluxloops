using FluxorLoops.Analyzer.Model;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace FluxorLoops.Analyzer.Utilities;

internal static class SyntaxHelpers
{
    public static bool HasAttributeSyntax(SyntaxList<AttributeListSyntax> attributeLists, string attributeName)
    {
        foreach (var attributeList in attributeLists)
        {
            foreach (var attribute in attributeList.Attributes)
            {
                var name = attribute.Name.ToString();
                if (name.Equals(attributeName, StringComparison.Ordinal) ||
                    name.EndsWith($".{attributeName}", StringComparison.Ordinal) ||
                    name.Equals($"{attributeName}Attribute", StringComparison.Ordinal) ||
                    name.EndsWith($".{attributeName}Attribute", StringComparison.Ordinal))
                {
                    return true;
                }
            }
        }

        return false;
    }

    public static string GetTypeName(TypeSyntax? typeSyntax)
    {
        if (typeSyntax is null)
        {
            return string.Empty;
        }

        return typeSyntax.ToString().Trim();
    }

    public static string BuildTypeId(NodeKind kind, string typeName) =>
        SymbolHelpers.NodeId(kind, $"global::{typeName}");
}