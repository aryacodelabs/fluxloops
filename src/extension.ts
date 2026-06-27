import * as vscode from 'vscode';
import { IndexManager } from './index/indexManager';
import { RoslynHostManager } from './roslyn/roslynHostManager';
import { D3GraphWebviewPanel } from './ui/d3GraphWebviewPanel';
import { FluxStatusBar } from './ui/statusBar';

const OUTPUT_CHANNEL_NAME = 'FluxLoops';

let outputChannel: vscode.OutputChannel | undefined;
let indexManager: IndexManager | undefined;
let graphPanel: D3GraphWebviewPanel | undefined;
let statusBar: FluxStatusBar | undefined;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  context.subscriptions.push(outputChannel);

  const log = (message: string): void => {
    outputChannel?.appendLine(message);
  };
  log('FluxLoops activated');

  const roslynHostManager = new RoslynHostManager(context, log);
  context.subscriptions.push({ dispose: () => void roslynHostManager.dispose() });

  indexManager = new IndexManager({
    log,
    roslynHostManager,
    onScopeMissing: () => {
      void vscode.window.showWarningMessage(
        'FluxLoops: no .NET project scope found. Set fluxLoops.projectPath in settings.',
      );
    },
  });
  context.subscriptions.push(indexManager);

  graphPanel = new D3GraphWebviewPanel(context);
  context.subscriptions.push(graphPanel);

  statusBar = new FluxStatusBar();
  context.subscriptions.push(statusBar);

  indexManager.onIndexChanged((graph) => {
    statusBar?.update(graph);
    graphPanel?.refresh(graph);
  });

  void indexManager.resolveScope();

  context.subscriptions.push(
    vscode.commands.registerCommand('fluxLoops.map', async () => {
      if (!indexManager) {
        return;
      }
      const graph = await indexManager.fullScan();
      showScanSummary(graph);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('fluxLoops.mapProject', async (resource?: vscode.Uri) => {
      if (!indexManager || !graphPanel) {
        return;
      }

      const target = resolveCsprojUri(resource);
      if (!target) {
        void vscode.window.showWarningMessage('FluxLoops: right-click a .csproj file to generate its graph.');
        return;
      }

      try {
        const graph = await indexManager.scanProject(target.fsPath);
        showScanSummary(graph, projectLabelFromPath(target.fsPath));
        graphPanel.show(graph);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(message);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('fluxLoops.refresh', async () => {
      if (!indexManager) {
        return;
      }
      await indexManager.resolveScope();
      const graph = await indexManager.fullScan();
      showScanSummary(graph);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('fluxLoops.showGraph', async () => {
      if (!indexManager || !graphPanel) {
        return;
      }
      const graph = indexManager.getGraph();
      if (graph.nodes.length === 0) {
        const refreshed = await indexManager.fullScan();
        graphPanel.show(refreshed);
        return;
      }
      graphPanel.show(graph);
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      void indexManager?.scheduleIncrementalScan(document);
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('fluxLoops.projectPath') || event.affectsConfiguration('fluxLoops.scanEntireSolution')) {
        void indexManager?.resolveScope().then(() => indexManager?.fullScan());
      }
    }),
  );
}

export function deactivate(): void {
  outputChannel?.dispose();
}

function resolveCsprojUri(resource?: vscode.Uri): vscode.Uri | undefined {
  if (resource?.fsPath.toLowerCase().endsWith('.csproj')) {
    return resource;
  }

  const active = vscode.window.activeTextEditor?.document.uri;
  if (active?.fsPath.toLowerCase().endsWith('.csproj')) {
    return active;
  }

  return undefined;
}

function projectLabelFromPath(projectPath: string): string {
  const base = projectPath.split(/[/\\]/).pop() ?? projectPath;
  return base.endsWith('.csproj') ? base.slice(0, -'.csproj'.length) : base;
}

function showScanSummary(graph: import('./types').FluxGraph, projectLabel?: string): void {
  const fatal = graph.errors.find((error) => error.fatal);
  if (fatal) {
    void vscode.window.showErrorMessage(`FluxLoops: ${fatal.message}`);
    return;
  }

  const scanFailed = graph.errors.find((error) => error.code === 'SCAN_FAILED');
  if (scanFailed) {
    void vscode.window.showErrorMessage(`FluxLoops: ${scanFailed.message}`);
    return;
  }

  if (graph.nodes.length === 0) {
    const warning = graph.warnings[0]?.message;
    const suffix = warning ? ` (${warning})` : '';
    void vscode.window.showWarningMessage(
      `FluxLoops: scan completed but no Fluxor nodes were found.${suffix}`,
    );
    return;
  }

  const cycleSuffix = graph.cycles.length > 0 ? ` · ${graph.cycles.length} effect cycle(s)` : '';
  const scopeSuffix = projectLabel ? ` (${projectLabel})` : '';
  void vscode.window.showInformationMessage(
    `FluxLoops: ${graph.nodes.length} nodes, ${graph.edges.length} edges${scopeSuffix}${cycleSuffix}`,
  );
}