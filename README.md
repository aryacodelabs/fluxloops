# FluxLoops .NET

Visualize **Fluxor** dependency graphs for Blazor and .NET applications — Actions, Reducers, Effects, State, and Components in one interactive map.

**Repository:** [github.com/aryacodelabs/fluxloops](https://github.com/aryacodelabs/fluxloops)

Built by [AryaCode Labs](https://github.com/aryacodelabs) as part of the DevL∞ps tool family (alongside LinkLoops, DI-Loops, and related analyzers).

## Features

### Graph analysis

- **Unified Fluxor graph** — States, Actions, Reducers, Effects, and Razor components in a single model
- **Four view modes**
  - Action → Reducer → State
  - Action → Effect cascades
  - Component → State subscriptions
  - All edges combined
- **Effect cycle detection** — Surfaces dispatch loops that can cause runtime issues
- **Shared-action awareness** — Handles actions reused across multiple feature states
- **Fast filesystem scanning** — Sub-second scans on typical Blazor projects (no cold MSBuild required)

### Interactive visualization

- **D3 force-directed graph** — Zoom, pan, drag nodes, and explore clusters
- **Dependency table** — Sortable/filterable rows with per-column search
- **Feature focus** — Filter the graph to one `[FeatureState]` cluster at a time
- **Project filter** — Scope results to a single `.csproj` in multi-project solutions
- **Node search** — Highlight matching nodes by name
- **Click to navigate** — Open the source file and line for any node

### VS Code integration

- **Generate Fluxor Graph** — Right-click any `.csproj` in the Explorer
- **Map Fluxor Graph** — Scan the workspace solution or configured scope
- **Refresh Fluxor Index** — Rebuild the graph on demand
- **Incremental scan on save** — Updates when C# or Razor files change
- **Status bar** — Live node/edge counts and cycle warnings
- **Output channel** — Detailed scan logs under **FluxLoops**

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `fluxLoops.scanOnSave` | `true` | Re-scan changed files on save |
| `fluxLoops.projectPath` | `""` | Limit scope to a folder, project, or solution |
| `fluxLoops.scanEntireSolution` | `true` | Scan full solution when a `.sln` is found |
| `fluxLoops.excludeTestProjects` | `true` | Skip test project folders |
| `fluxLoops.scanTimeoutSeconds` | `600` | Max seconds to wait for a scan |
| `fluxLoops.enableWebview` | `true` | Enable the D3 graph webview |
| `fluxLoops.roslynHostPath` | `""` | Override path to the Roslyn host binary |

## Requirements

- **VS Code** 1.85+
- **.NET 8 SDK** (for the bundled Roslyn analysis host)
- A **Fluxor** Blazor or .NET project with `[FeatureState]`, `[ReducerMethod]`, `[EffectMethod]`, and/or component `IState<T>` / `IDispatcher` usage

## Quick start

1. Open a workspace that contains a `.sln` or `.csproj` with Fluxor code.
2. Right-click a project (e.g. `MyApp.Components.csproj`) → **Generate Fluxor Graph**.
3. Use the **Feature** and **View** dropdowns to explore different slices of the graph.
4. Switch to the **Table** tab for a flat dependency list.
5. Click any node to jump to its source.

### Commands

| Command | Description |
|---------|-------------|
| `FluxLoops: Generate Fluxor Graph` | Scan the selected `.csproj` |
| `FluxLoops: Map Fluxor Graph` | Scan the workspace scope |
| `FluxLoops: Show Fluxor Graph` | Open the graph panel |
| `FluxLoops: Refresh Fluxor Index` | Force a full re-scan |

## Development

```bash
git clone https://github.com/aryacodelabs/fluxloops.git
cd fluxloops
npm install
npm run build
npm run build:roslyn
```

Press **F5** to launch the Extension Development Host.

```bash
npm test                              # TypeScript unit tests
dotnet test test/FluxorLoops.Analyzer.Tests   # Analyzer tests
```

## Architecture

```
fluxloops/
├── src/                    # VS Code extension (TypeScript)
├── media/webview/          # D3 graph UI
├── tools/
│   ├── FluxorLoops.Analyzer/   # Roslyn graph scanner
│   └── FluxorLoops.RoslynHost/ # Long-lived analysis host
└── test/                   # Fixtures and unit tests
```

## Rating, reviews & feature requests

If FluxLoops .NET helps you understand or debug Fluxor apps, please **leave a rating and review** on the [Visual Studio Marketplace](https://marketplace.visualstudio.com) — it helps other Blazor developers discover the extension and guides what we build next.

**Want a new feature?** [Open an issue](https://github.com/aryacodelabs/fluxloops/issues) on GitHub or reach out to AryaCode Labs with:

- What you're trying to understand in your Fluxor graph
- Screenshots or sample project structure (if possible)
- Whether you need graph, table, diagnostics, or IDE integration improvements

We actively prioritize requests from teams using Fluxor at scale on real Blazor codebases.

## Planned features (v0.2.0)

| Feature | Description |
|---------|-------------|
| **Export table to Excel** | Download the dependency table as `.xlsx` with the current project/feature/view filters applied; Excel **AutoFilter** on the header row |
| **Export graph to PNG** | Save the D3 dependency graph as a PNG image for docs, PRs, and wikis |

Detailed specs and acceptance criteria: [docs/planned-features.md](docs/planned-features.md)

## License

MIT — Copyright (c) AryaCode Labs