using FluxorLoops.Analyzer.Model;
using FluxorLoops.Analyzer.Utilities;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace FluxorLoops.Analyzer.Scanning;

internal static class FluxorCSharpScanner
{
    public static void ScanDocument(Document document, GraphBuildContext context)
    {
        if (document.FilePath is null || !document.FilePath.EndsWith(".cs", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var root = document.GetSyntaxRootAsync().GetAwaiter().GetResult();
        var semanticModel = document.GetSemanticModelAsync().GetAwaiter().GetResult();
        if (root is null)
        {
            return;
        }

        ScanSyntaxRoot(root, semanticModel, context);
    }

    public static void ScanSyntaxRoot(SyntaxNode root, SemanticModel? semanticModel, GraphBuildContext context)
    {
        foreach (var typeSyntax in root.DescendantNodes().OfType<TypeDeclarationSyntax>())
        {
            var typeSymbol = semanticModel?.GetDeclaredSymbol(typeSyntax) as INamedTypeSymbol;
            var hasFeatureState = typeSymbol is not null && SymbolHelpers.HasAttribute(typeSymbol, "FeatureState")
                || SyntaxHelpers.HasAttributeSyntax(typeSyntax.AttributeLists, "FeatureState");

            if (hasFeatureState)
            {
                AddStateNode(typeSymbol, typeSyntax, context);
            }

            ScanReducers(typeSyntax, semanticModel, context);
            ScanEffects(typeSymbol, typeSyntax, semanticModel, context);
        }
    }

    private static void AddStateNode(INamedTypeSymbol? typeSymbol, TypeDeclarationSyntax typeSyntax, GraphBuildContext context)
    {
        var stateId = typeSymbol is not null
            ? SymbolHelpers.StateId(typeSymbol)
            : SyntaxHelpers.BuildTypeId(NodeKind.State, typeSyntax.Identifier.Text);

        context.AddNode(new GraphNode(
            stateId,
            NodeKind.State,
            typeSymbol?.Name ?? typeSyntax.Identifier.Text,
            typeSyntax.SyntaxTree.FilePath,
            SymbolHelpers.GetLineNumber(typeSyntax),
            stateId));
    }

    private static void ScanReducers(
        TypeDeclarationSyntax typeSyntax,
        SemanticModel? semanticModel,
        GraphBuildContext context)
    {
        foreach (var methodSyntax in typeSyntax.Members.OfType<MethodDeclarationSyntax>())
        {
            var methodSymbol = semanticModel?.GetDeclaredSymbol(methodSyntax) as IMethodSymbol;
            var hasReducer = methodSymbol is not null && SymbolHelpers.HasAttribute(methodSymbol, "ReducerMethod")
                || SyntaxHelpers.HasAttributeSyntax(methodSyntax.AttributeLists, "ReducerMethod");

            if (!hasReducer || methodSyntax.ParameterList.Parameters.Count < 2)
            {
                continue;
            }

            var stateParam = methodSyntax.ParameterList.Parameters[0];
            var actionParam = methodSyntax.ParameterList.Parameters[1];

            var stateType = methodSymbol?.Parameters[0].Type is { SpecialType: not SpecialType.System_Void }
                ? methodSymbol.Parameters[0].Type
                : null;
            var actionType = methodSymbol?.Parameters[1].Type is { SpecialType: not SpecialType.System_Void }
                ? methodSymbol.Parameters[1].Type
                : null;

            var stateId = TypeIdResolver.ResolveStateId(stateType, stateParam.Type, context);
            var actionId = TypeIdResolver.ResolveActionId(actionType, actionParam.Type, null, context);

            var reducerId = methodSymbol is not null
                ? SymbolHelpers.ReducerId(methodSymbol)
                : SymbolHelpers.NodeId(NodeKind.Reducer, $"{typeSyntax.Identifier.Text}.{methodSyntax.Identifier.Text}");

            context.AddNode(new GraphNode(
                actionId,
                NodeKind.Action,
                actionParam.Type?.ToString() ?? actionParam.Identifier.Text,
                methodSyntax.SyntaxTree.FilePath,
                SymbolHelpers.GetLineNumber(methodSyntax)));

            context.AddNode(new GraphNode(
                reducerId,
                NodeKind.Reducer,
                methodSyntax.Identifier.Text,
                methodSyntax.SyntaxTree.FilePath,
                SymbolHelpers.GetLineNumber(methodSyntax),
                stateId));

            context.AddEdge(new GraphEdge(actionId, reducerId, EdgeKind.ReducesTo));
            context.AddEdge(new GraphEdge(reducerId, stateId, EdgeKind.ReducesTo));
        }
    }

    private static void ScanEffects(
        INamedTypeSymbol? typeSymbol,
        TypeDeclarationSyntax typeSyntax,
        SemanticModel? semanticModel,
        GraphBuildContext context)
    {
        var effectActionType = typeSymbol is not null ? TryGetEffectBaseActionType(typeSymbol) : null;
        var effectId = typeSymbol is not null
            ? SymbolHelpers.EffectId(typeSymbol)
            : SymbolHelpers.NodeId(NodeKind.Effect, typeSyntax.Identifier.Text);
        var hasEffect = effectActionType is not null;

        foreach (var methodSyntax in typeSyntax.Members.OfType<MethodDeclarationSyntax>())
        {
            var methodSymbol = semanticModel?.GetDeclaredSymbol(methodSyntax) as IMethodSymbol;
            ITypeSymbol? listenActionType = null;
            string? listenActionName = null;

            if (methodSymbol is not null && SymbolHelpers.HasAttribute(methodSymbol, "EffectMethod"))
            {
                listenActionType = TryGetEffectMethodActionType(methodSymbol);
                hasEffect = true;
            }
            else if (SyntaxHelpers.HasAttributeSyntax(methodSyntax.AttributeLists, "EffectMethod"))
            {
                listenActionName = GetFirstNonDispatcherParameterName(methodSyntax);
                hasEffect = true;
            }
            else if (methodSymbol?.Name is "HandleAsync" or "Handle" && effectActionType is not null)
            {
                listenActionType = effectActionType;
                hasEffect = true;
            }

            if (listenActionType is null && listenActionName is null)
            {
                continue;
            }

            context.AddNode(new GraphNode(
                effectId,
                NodeKind.Effect,
                typeSymbol?.Name ?? typeSyntax.Identifier.Text,
                typeSyntax.SyntaxTree.FilePath,
                SymbolHelpers.GetLineNumber(typeSyntax)));

            var actionId = TypeIdResolver.ResolveActionId(
                listenActionType,
                null,
                listenActionName,
                context);

            context.AddNode(new GraphNode(
                actionId,
                NodeKind.Action,
                listenActionType?.Name ?? listenActionName!,
                methodSyntax.SyntaxTree.FilePath,
                SymbolHelpers.GetLineNumber(methodSyntax)));

            context.AddEdge(new GraphEdge(actionId, effectId, EdgeKind.EffectListensFor));

            if (semanticModel is not null)
            {
                DispatchExtractor.ExtractFromMethod(methodSyntax, semanticModel, effectId, context);
            }
            else
            {
                DispatchExtractor.ExtractFromSyntax(methodSyntax, effectId, context);
            }
        }

        if (hasEffect && !context.Nodes.Any(node => node.Id == effectId))
        {
            context.AddNode(new GraphNode(
                effectId,
                NodeKind.Effect,
                typeSymbol?.Name ?? typeSyntax.Identifier.Text,
                typeSyntax.SyntaxTree.FilePath,
                SymbolHelpers.GetLineNumber(typeSyntax)));
        }
    }

    private static string? GetFirstNonDispatcherParameterName(MethodDeclarationSyntax methodSyntax)
    {
        foreach (var parameter in methodSyntax.ParameterList.Parameters)
        {
            var typeName = SyntaxHelpers.GetTypeName(parameter.Type);
            if (typeName.Equals("IDispatcher", StringComparison.Ordinal))
            {
                continue;
            }

            return typeName;
        }

        return null;
    }

    private static ITypeSymbol? TryGetEffectBaseActionType(INamedTypeSymbol typeSymbol)
    {
        var baseType = typeSymbol.BaseType;
        while (baseType is not null)
        {
            if (baseType.Name.StartsWith("Effect", StringComparison.Ordinal) &&
                baseType.TypeArguments.Length == 1)
            {
                return baseType.TypeArguments[0];
            }

            baseType = baseType.BaseType;
        }

        return null;
    }

    private static ITypeSymbol? TryGetEffectMethodActionType(IMethodSymbol methodSymbol)
    {
        foreach (var parameter in methodSymbol.Parameters)
        {
            if (parameter.Type.Name is "IDispatcher" or "IStateAction")
            {
                continue;
            }

            if (parameter.Type.SpecialType != SpecialType.System_Void)
            {
                return parameter.Type;
            }
        }

        return null;
    }
}