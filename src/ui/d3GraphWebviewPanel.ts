import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import type { FluxGraph } from '../types';
import { parseNavigateMessage } from './navigateMessage';

export type GraphViewMode = 'reducer' | 'effects' | 'components' | 'all';

export class D3GraphWebviewPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private lastView: GraphViewMode = 'reducer';

  constructor(private readonly context: vscode.ExtensionContext) {}

  show(graph: FluxGraph, view: GraphViewMode = 'reducer'): void {
    if (!this.isEnabled()) {
      void vscode.window.showInformationMessage('FluxLoops: webview is disabled (fluxLoops.enableWebview).');
      return;
    }

    if (graph.nodes.length === 0) {
      void vscode.window.showInformationMessage('FluxLoops: no Fluxor nodes found. Run Map Fluxor Graph first.');
      return;
    }

    this.lastView = view;
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'fluxLoops.graph',
        'Fluxor Dependency Graph',
        column,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
        },
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });

      this.panel.webview.onDidReceiveMessage((message: unknown) => {
        void this.handleMessage(message);
      });
    }

    this.panel.title = 'Fluxor Dependency Graph';
    this.panel.webview.html = this.getHtml(this.panel.webview);
    this.panel.reveal(column);
    void this.postGraph(graph, view);
  }

  refresh(graph: FluxGraph): void {
    if (!this.panel) {
      return;
    }

    void this.postGraph(graph, this.lastView);
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }

  private isEnabled(): boolean {
    return vscode.workspace.getConfiguration('fluxLoops').get<boolean>('enableWebview', true);
  }

  private async postGraph(graph: FluxGraph, view: GraphViewMode): Promise<void> {
    await this.panel?.webview.postMessage({
      type: 'update',
      data: {
        nodes: graph.nodes,
        edges: graph.edges,
        cycles: graph.cycles,
        view,
        projects: graph.projects ?? [],
        activeProjectPath: graph.activeProjectPath ?? null,
        scanMode: graph.scanMode ?? 'solution',
      },
    });
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (message && typeof message === 'object' && (message as { type?: string }).type === 'setView') {
      const view = (message as { view?: GraphViewMode }).view ?? 'reducer';
      this.lastView = view;
      return;
    }

    const navigate = parseNavigateMessage(message);
    if (!navigate) {
      return;
    }

    try {
      const uri = vscode.Uri.file(navigate.filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);
      const line = Math.max(0, navigate.line - 1);
      const position = new vscode.Position(line, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    } catch {
      void vscode.window.showErrorMessage('FluxLoops: could not open file location.');
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview');
    const styles = webview.asWebviewUri(vscode.Uri.joinPath(media, 'styles.css'));
    const graphJs = webview.asWebviewUri(vscode.Uri.joinPath(media, 'graph.js'));
    const d3Js = webview.asWebviewUri(vscode.Uri.joinPath(media, 'd3.min.js'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource};" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styles}" />
  <title>Fluxor Graph</title>
</head>
<body>
  <div id="toolbar">
    <div id="viewTabs" role="tablist">
      <button type="button" id="tabGraph" class="view-tab active" data-panel="graph">Graph</button>
      <button type="button" id="tabTable" class="view-tab" data-panel="table">Table</button>
    </div>
    <label>Project
      <select id="projectSelect">
        <option value="">All projects</option>
      </select>
    </label>
    <label>Feature
      <select id="featureSelect">
        <option value="">All features</option>
      </select>
    </label>
    <label>View
      <select id="viewSelect" title="Graph: when a feature is selected, all connectors in that feature are shown. Table: always uses this view filter.">
        <option value="reducer">Action → Reducer → State</option>
        <option value="effects">Action → Effect Cascades</option>
        <option value="components">Component → State</option>
        <option value="all">All edges</option>
      </select>
    </label>
    <input id="search" type="search" placeholder="Search nodes..." />
    <span id="stats"></span>
  </div>
  <div id="graphPanel" class="content-panel">
    <svg id="graph"></svg>
  </div>
  <div id="tablePanel" class="content-panel hidden">
    <div class="table-wrap">
      <table id="dependencyTable">
        <thead>
          <tr>
            <th>Project</th>
            <th>Feature</th>
            <th>From kind</th>
            <th>From name</th>
            <th>Relationship</th>
            <th>To kind</th>
            <th>To name</th>
            <th>File</th>
          </tr>
          <tr class="filter-row">
            <th><input class="col-filter" data-col="project" type="search" placeholder="Filter..." /></th>
            <th><input class="col-filter" data-col="feature" type="search" placeholder="Filter..." /></th>
            <th><input class="col-filter" data-col="fromKind" type="search" placeholder="Filter..." /></th>
            <th><input class="col-filter" data-col="fromName" type="search" placeholder="Filter..." /></th>
            <th><input class="col-filter" data-col="relationship" type="search" placeholder="Filter..." /></th>
            <th><input class="col-filter" data-col="toKind" type="search" placeholder="Filter..." /></th>
            <th><input class="col-filter" data-col="toName" type="search" placeholder="Filter..." /></th>
            <th><input class="col-filter" data-col="filePath" type="search" placeholder="Filter..." /></th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
    <p id="tableStats"></p>
  </div>
  <script nonce="${nonce}" src="${d3Js}"></script>
  <script nonce="${nonce}" src="${graphJs}"></script>
</body>
</html>`;
  }
}