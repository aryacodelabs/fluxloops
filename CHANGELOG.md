# Changelog

All notable changes to **FluxLoops .NET** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-27

### Added

- Initial VS Code extension for Fluxor dependency graph visualization
- Roslyn-based analyzer with persistent `--serve` host for fast rescans
- Interactive D3 force-directed graph with zoom, pan, and click-to-source navigation
- Dependency table view with per-column filtering
- Four graph view modes: Reducer chain, Effect cascades, Component subscriptions, All edges
- Feature focus filter for `[FeatureState]` clusters
- Project filter for multi-project solutions
- Node search and status bar summary (nodes, edges, cycle count)
- Explorer context menu: **Generate Fluxor Graph** on `.csproj` files
- Commands: Map Fluxor Graph, Show Fluxor Graph, Refresh Fluxor Index
- Incremental scan on save for C# and Razor files
- Effect cycle detection in the analyzer
- Configuration for scan scope, timeouts, test-project exclusion, and webview toggle
- TypeScript and .NET unit test suites

### Fixed

- Infinite loop in feature cluster assignment when shared actions link multiple features (caused multi-minute hangs and empty graphs on large apps)
- Duplicate feature dropdown and dependency table rows from colliding node IDs
- Scan path resolution when workspace scope lacked a discovered `.sln`
- MSBuild stdin deadlock in the Roslyn host (one-shot and serve modes)
- Misleading "no Fluxor nodes found" message when scans failed or timed out
- Slow scans by defaulting to fast syntax-based filesystem analysis instead of cold MSBuild

### Changed

- Extension no longer runs a full solution scan automatically on startup; scan runs on user command or save
- Improved scan error messages with target path details

[0.1.0]: https://github.com/aryacodelabs/fluxloops/releases/tag/v0.1.0