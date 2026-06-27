# Fluxor Dependency Map — Extension Concept Notes

> Working name TBD (candidate: **FluxLoops** — keeps the "Loops" suffix convention from the DevL∞ps brand family: DevL∞ps, LinkLoops, DI-Loops).

## Goal

A VS Code (and later Rider) extension that visualizes the dependency graph of a Fluxor implementation in a Blazor application — making the implicit wiring between Actions, Reducers, Effects, State, and Components visible and navigable.

## Decisions So Far

- **Primary graph for v1:** All four views, toggleable (not just one fixed graph).
- **IDE rollout order:** VS Code first, Rider later.

## The Four Graph Views

1. **Action → Reducer → State**
   - Which `[ReducerMethod]` handles which Action type, and which State it mutates.
   - Cheapest to extract — reducer method signature `(TState, TAction) → TState` gives both edges directly from the syntax tree, no method body parsing needed.

2. **Action → Effect Cascades**
   - Which `Effect<TAction>` / `[EffectMethod]` listens for an Action, and what Actions it dispatches in response.
   - Reveals cascades and potential cycles — often the most valuable view since this is where bugs/loops hide.
   - Hardest to extract — requires scanning effect method bodies for `dispatcher.Dispatch(new X(...))` calls via Roslyn's `InvocationExpressionSyntax`. Dynamic/conditional dispatches that can't be statically resolved should be flagged as "dynamic dispatch — best-effort" rather than silently dropped.

3. **Component → State Subscriptions**
   - Which components use `@inject IState<TState>` and `IDispatcher`.
   - Requires Razor-aware scanning (regex over `.razor` files for `@inject IState<` / `@inject IDispatcher`, plus `Dispatcher.Dispatch(` calls inside `@code` blocks), since Roslyn doesn't parse Razor directly.

4. **Feature/State Module Map**
   - Cross-feature coupling: where one feature's Effect reacts to another feature's Action.
   - Often where Fluxor apps get architecturally tangled — useful as an overlay/insight rather than a standalone primary view.

## Unified Graph Model

Rather than maintaining four separate graphs, build one graph with typed nodes/edges and filter at render time:

```csharp
enum NodeKind { State, Action, Reducer, Effect, Component }
enum EdgeKind { ReducesTo, EffectListensFor, EffectDispatches, ComponentSubscribesTo, ComponentDispatches }

record GraphNode(string Id, NodeKind Kind, string DisplayName, string FilePath, int Line);
record GraphEdge(string FromId, string ToId, EdgeKind Kind);
```

View toggles map to edge-kind filters:
- **Action→Reducer→State** → `ReducesTo` edges
- **Action→Effect cascades** → `EffectListensFor` + `EffectDispatches` edges (detect and flag cycles explicitly — strong bug signal)
- **Component→State** → `ComponentSubscribesTo` + `ComponentDispatches` edges

## Proposed Architecture

```
FluxorLoops/
├── FluxorLoops.Analyzer/      ← C# class library, Roslyn-based, IDE-agnostic
│   ├── Discovery/             (find FeatureState, ReducerMethod, Effect classes)
│   ├── EdgeExtraction/        (Action→Reducer, Action→Effect, Effect→Dispatch, Component→State)
│   ├── Model/                 (GraphNode, GraphEdge, NodeKind enum)
│   └── GraphBuilder.cs        (assembles unified graph + per-view filters)
├── FluxorLoops.Cli/           ← thin CLI wrapper: scans a workspace, emits JSON graph
└── vscode-extension/
    ├── src/extension.ts       (spawns/calls analyzer, owns webview)
    └── webview/                (graph renderer — possibly reuse LinkLoops' viz layer if generic enough)
```

Keeping the analyzer as a standalone library + CLI (not baked directly into the VS Code extension host) is what makes "Rider later" cheap. The IntelliJ/Rider plugin can shell out to the same CLI or reference the same library, avoiding duplicated analysis logic — only the per-IDE UI layer needs to be rebuilt.

## Discovery Approach (Roslyn)

| Element | Attribute/Pattern | Extraction difficulty |
|---|---|---|
| State | `[FeatureState]` classes | Easy — attribute match |
| Reducer | `[ReducerMethod]` methods | Easy — generic params on signature give both edges |
| Effect listen | `Effect<TAction>` / `[EffectMethod]`, `HandleAsync(TAction, IDispatcher)` | Easy — generic param |
| Effect dispatch | `dispatcher.Dispatch(new X(...))` inside effect body | Hard — needs body walking via `InvocationExpressionSyntax`; flag unresolved/dynamic dispatches |
| Component subscription | `@inject IState<T>`, `@inject IDispatcher` in `.razor` | Medium — Roslyn doesn't parse Razor; use regex or extend existing Razor scanner (possibly shared with LinkLoops) |

## Visualization Layer (D3.js)

D3 is a strong fit here — this is a node-link graph with hierarchy and cycles, not really a "chart," which is D3's home turf rather than something like Chart.js.

**Why it fits**
- `d3-force` gives a force-directed layout out of the box — nodes repel, edges act as springs, clusters naturally separate by feature/module.
- No built-in "graph" primitive opinion — full control to compose SVG per `NodeKind` (e.g. diamonds for Actions, rounded rects for State, hexagons for Effects) and per `EdgeKind` (solid for `ReducesTo`, dashed for `EffectDispatches`).
- Runs fine inside a VS Code webview — plain JS/SVG, no conflicts with the VS Code API.

**Integration with the architecture**

```
webview/
├── index.html
├── graph.js          ← D3 force simulation + render
└── styles.css
```

The extension host (`extension.ts`) calls `FluxorLoops.Cli`, gets back the JSON graph (`GraphNode[]`/`GraphEdge[]`), and posts it into the webview via `webview.postMessage(...)`. D3 consumes that JSON almost directly via `d3.forceSimulation(nodes).force("link", d3.forceLink(edges)...)` — the only adapter needed is renaming `FromId`/`ToId` to `source`/`target` (or supplying a custom `id` accessor) since D3's link force expects those keys.

**Interaction features mapped to D3**
- **View toggles (the 4 graph modes):** filter the `edges` array by `EdgeKind` and re-run `simulation.force("link", ...)`; D3 handles re-layout with a transition.
- **Cycle highlighting:** once cycles are detected in `EffectDispatches` edges, color those edges/nodes distinctly via data-driven `.attr("stroke", d => ...)`.
- **Click node → open file:** D3 click handler posts a message back to the extension host with `FilePath`/`Line`; extension host calls `vscode.window.showTextDocument` — standard webview round-trip pattern.
- **Zoom/pan:** `d3.zoom()` attaches directly to the SVG.
- **Search/highlight:** filter and dim non-matching nodes by opacity.

**Caution: large graphs**

Force simulations get visually noisy and slow past a few hundred nodes. For large Blazor apps with many features/actions/reducers/effects, consider:
- Per-feature subgraph views (filter to one `[FeatureState]` cluster at a time), or
- A hybrid: D3 force layout for the focused view, plus a simpler list/tree sidebar for navigation at scale.

Defer this decision until real graph sizes are seen from the analyzer.

## Visualization Layer (D3.js)

D3 is a strong fit — this is fundamentally a node-link graph with hierarchy and cycles, not a "chart," which is D3's home turf.

**Why it fits**

- `d3-force` provides force-directed layout out of the box (nodes repel, edges act as springs) — tends to naturally cluster by feature/module without manual positioning.
- No imposed "graph" primitive (unlike Chart.js) — full control to compose SVG per node/edge: shape-by-`NodeKind` (e.g. diamonds for Actions, rounded rects for State, hexagons for Effects), styling by `EdgeKind` (solid for `ReducesTo`, dashed for `EffectDispatches` cycle-risk edges), and custom click/hover behavior.
- Runs fine inside a VS Code webview — plain JS/SVG, no conflicts with the VS Code API.

**Fit with the architecture**

```
vscode-extension/
├── src/extension.ts       (calls FluxorLoops.Cli, posts JSON graph into webview)
└── webview/
    ├── index.html
    ├── graph.js          ← D3 force simulation + render
    └── styles.css
```

The `GraphNode[]`/`GraphEdge[]` JSON from the analyzer maps almost directly to D3's input format — `d3.forceSimulation(nodes).force("link", d3.forceLink(edges)...)`. D3's link force expects `source`/`target`; serialize `FromId`/`ToId` consistently or use an `id` accessor to bridge the C# model.

**Interaction mapping**

| Feature | D3 mechanism |
|---|---|
| Toggle the 4 graph views | Filter `edges` by `EdgeKind`, re-run `simulation.force("link", ...)` with transition |
| Cycle highlighting (`EffectDispatches` cycles) | Data-driven `.attr("stroke", d => ...)` once cycles are detected server-side |
| Click node → open file | Click handler posts `FilePath`/`Line` back to extension host → `vscode.window.showTextDocument` (standard webview round-trip) |
| Zoom/pan | `d3.zoom()` attached directly to the SVG |
| Search/highlight | Filter + dim non-matching nodes via opacity |

**Scaling caution**

Force simulations get visually noisy and slow past a few hundred nodes. For large Blazor apps with many features/actions/reducers/effects, consider:
- Per-feature subgraph views (filter to one `[FeatureState]` cluster at a time), or
- A hybrid: D3 force layout for the focused view + a simpler list/tree sidebar for navigation at scale.

Decide once real graph sizes from the analyzer are known, rather than upfront.

## Visualization Layer (D3.js)

D3 is a strong fit for this — the graph is a node-link structure with hierarchy and cycles, not a "chart," which is D3's home turf.

**Why it fits**
- `d3-force` provides force-directed layout out of the box (nodes repel, edges act as springs), naturally clustering by feature/module without manual positioning.
- No imposed "graph" primitive — nodes/edges are composed from SVG primitives directly, giving full control over node shape by `NodeKind` (e.g. diamonds for Actions, rounded rects for State, hexagons for Effects) and edge styling by `EdgeKind` (solid for `ReducesTo`, dashed for `EffectDispatches`).
- Runs fine inside a VS Code webview — plain JS/SVG in a sandboxed context, no conflicts with VS Code APIs.

**Integration with the architecture**
```
vscode-extension/
└── webview/
    ├── index.html
    ├── graph.js          ← D3 force simulation + render
    └── styles.css
```
The extension host calls `FluxorLoops.Cli`, gets the JSON graph (`GraphNode[]`/`GraphEdge[]`), and posts it into the webview via `webview.postMessage(...)`. D3 consumes that JSON with minimal adaptation — `d3.forceSimulation(nodes).force("link", d3.forceLink(edges)...)` — noting D3's link force expects `source`/`target` keys, so `FromId`/`ToId` need a rename step or a custom `id` accessor.

**Interaction features**
- **View toggles (4 graph modes):** filter the `edges` array by `EdgeKind` and re-run `simulation.force("link", ...)`; D3 handles re-layout with a transition.
- **Cycle highlighting:** once cycles are detected in `EffectDispatches` edges, color those edges/nodes distinctly via data-driven `.attr("stroke", d => ...)`.
- **Click node → open file:** D3 click handler posts `FilePath`/`Line` back to the extension host, which calls `vscode.window.showTextDocument` (standard webview round-trip pattern).
- **Zoom/pan:** `d3.zoom()` attaches directly to the SVG.
- **Search/highlight:** dim non-matching nodes by opacity on filter — standard D3 pattern.

**Caution: large graphs**
Force simulations get visually noisy and slow past a few hundred nodes. For large Blazor apps with many features, consider either:
- per-feature subgraph views (filter to one `[FeatureState]` cluster at a time), or
- a hybrid: D3 force layout for the focused view, plus a simpler list/tree sidebar for navigation at scale.

Defer this decision until real graph sizes are seen from the analyzer.

## Open Items / Future Spec Work

- Lock extension name and branding (wordmark concept deferred — to revisit later, following the LinkLoops/DI-Loops process).
- Decide whether Feature/State module coupling (view #4) ships in v1 or as a later overlay.
- Decide on graph rendering library/approach for the VS Code webview (evaluate reuse from LinkLoops).
- Scope Rider/IntelliJ plugin approach once VS Code version and analyzer are validated (Kotlin + IntelliJ Platform SDK, calling into shared CLI/analyzer).
- Full requirements markdown (in the style of the DI-Loops spec) — deferred until name/branding is settled.
