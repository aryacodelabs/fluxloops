using FluxorLoops.Analyzer.Model;
using FluxorLoops.Analyzer.Utilities;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace FluxorLoops.Analyzer.Scanning;

internal static class DispatchExtractor
{
    public static void ExtractFromMethod(
        MethodDeclarationSyntax methodSyntax,
        SemanticModel semanticModel,
        string effectId,
        GraphBuildContext context)
    {
        var methodSymbol = semanticModel.GetDeclaredSymbol(methodSyntax);
        if (methodSymbol is null)
        {
            return;
        }

        foreach (var invocation in methodSyntax.DescendantNodes().OfType<InvocationExpressionSyntax>())
        {
            if (!IsDispatchInvocation(invocation, semanticModel))
            {
                continue;
            }

            var line = SymbolHelpers.GetLineNumber(invocation);
            var filePath = methodSyntax.SyntaxTree.FilePath;

            if (invocation.ArgumentList.Arguments.Count == 0)
            {
                context.Warnings.Add(new AnalysisWarning(
                    "FLUXOR_DYNAMIC_DISPATCH",
                    "dispatcher.Dispatch() call with no arguments — best-effort only",
                    filePath,
                    line));
                continue;
            }

            var argument = invocation.ArgumentList.Arguments[0].Expression;
            var actionType = TryResolveDispatchedActionType(argument, semanticModel);
            if (actionType is null)
            {
                context.Warnings.Add(new AnalysisWarning(
                    "FLUXOR_DYNAMIC_DISPATCH",
                    $"Dynamic dispatch at line {line} — could not statically resolve action type",
                    filePath,
                    line));
                continue;
            }

            EnsureActionNode(actionType, argument, context);
            context.AddEdge(new GraphEdge(effectId, SymbolHelpers.ActionId(actionType), EdgeKind.EffectDispatches));
        }
    }

    private static bool IsDispatchInvocation(InvocationExpressionSyntax invocation, SemanticModel semanticModel)
    {
        if (invocation.Expression is MemberAccessExpressionSyntax memberAccess)
        {
            var name = memberAccess.Name.Identifier.Text;
            if (name.Equals("Dispatch", StringComparison.Ordinal) ||
                name.Equals("DispatchAsync", StringComparison.Ordinal))
            {
                return true;
            }
        }

        if (invocation.Expression is IdentifierNameSyntax identifier &&
            identifier.Identifier.Text.Equals("Dispatch", StringComparison.Ordinal))
        {
            return true;
        }

        var symbol = semanticModel.GetSymbolInfo(invocation).Symbol;
        return symbol is IMethodSymbol method &&
               method.Name is "Dispatch" or "DispatchAsync";
    }

    private static ITypeSymbol? TryResolveDispatchedActionType(ExpressionSyntax expression, SemanticModel semanticModel)
    {
        if (expression is ObjectCreationExpressionSyntax objectCreation)
        {
            var typeInfo = semanticModel.GetTypeInfo(objectCreation);
            return typeInfo.Type;
        }

        if (expression is ImplicitObjectCreationExpressionSyntax implicitCreation)
        {
            var typeInfo = semanticModel.GetTypeInfo(implicitCreation);
            return typeInfo.Type;
        }

        var symbolInfo = semanticModel.GetSymbolInfo(expression);
        if (symbolInfo.Symbol is IFieldSymbol fieldSymbol)
        {
            return fieldSymbol.Type;
        }

        if (symbolInfo.Symbol is ILocalSymbol localSymbol)
        {
            return localSymbol.Type;
        }

        if (symbolInfo.Symbol is IParameterSymbol parameterSymbol)
        {
            return parameterSymbol.Type;
        }

        return semanticModel.GetTypeInfo(expression).Type;
    }

    public static void ExtractFromSyntax(MethodDeclarationSyntax methodSyntax, string effectId, GraphBuildContext context)
    {
        foreach (var invocation in methodSyntax.DescendantNodes().OfType<InvocationExpressionSyntax>())
        {
            if (!IsDispatchInvocationSyntax(invocation))
            {
                continue;
            }

            if (invocation.ArgumentList.Arguments.Count == 0)
            {
                continue;
            }

            var argument = invocation.ArgumentList.Arguments[0].Expression;
            if (argument is not ObjectCreationExpressionSyntax objectCreation)
            {
                context.Warnings.Add(new AnalysisWarning(
                    "FLUXOR_DYNAMIC_DISPATCH",
                    "Dynamic dispatch — could not statically resolve action type",
                    methodSyntax.SyntaxTree.FilePath,
                    SymbolHelpers.GetLineNumber(invocation)));
                continue;
            }

            var actionName = objectCreation.Type.ToString();
            var actionId = SyntaxHelpers.BuildTypeId(NodeKind.Action, actionName);
            context.AddNode(new GraphNode(
                actionId,
                NodeKind.Action,
                actionName,
                methodSyntax.SyntaxTree.FilePath,
                SymbolHelpers.GetLineNumber(objectCreation)));

            context.AddEdge(new GraphEdge(effectId, actionId, EdgeKind.EffectDispatches));
        }
    }

    private static bool IsDispatchInvocationSyntax(InvocationExpressionSyntax invocation)
    {
        if (invocation.Expression is MemberAccessExpressionSyntax memberAccess)
        {
            return memberAccess.Name.Identifier.Text is "Dispatch" or "DispatchAsync";
        }

        return invocation.Expression is IdentifierNameSyntax identifier &&
               identifier.Identifier.Text is "Dispatch" or "DispatchAsync";
    }

    private static void EnsureActionNode(ITypeSymbol actionType, SyntaxNode source, GraphBuildContext context)
    {
        context.AddNode(new GraphNode(
            SymbolHelpers.ActionId(actionType),
            NodeKind.Action,
            SymbolHelpers.GetDisplayName(actionType),
            source.SyntaxTree.FilePath,
            SymbolHelpers.GetLineNumber(source)));
    }
}