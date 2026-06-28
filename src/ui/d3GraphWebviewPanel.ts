import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import type { FluxGraph } from '../types';
import { parseExportGraphPngMessage, parseExportTableMessage } from './exportMessages';
import { buildDependencyWorkbook } from './exportTable';
import type { ExportRow } from '../webview/dependencyTable';
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

    if (message && typeof message === 'object' && (message as { type?: string }).type === 'exportEmpty') {
      const target = (message as { target?: string }).target;
      const label = target === 'table' ? 'dependencies' : 'graph nodes';
      void vscode.window.showWarningMessage(`FluxLoops: no ${label} to export. Adjust filters or run a scan first.`);
      return;
    }

    if (message && typeof message === 'object' && (message as { type?: string }).type === 'exportError') {
      void vscode.window.showErrorMessage('FluxLoops: could not export graph image.');
      return;
    }

    const exportTable = parseExportTableMessage(message);
    if (exportTable) {
      await this.saveDependencyTable(exportTable.rows, exportTable.suggestedFilename);
      return;
    }

    const exportGraph = parseExportGraphPngMessage(message);
    if (exportGraph) {
      await this.saveGraphPng(exportGraph.pngBase64, exportGraph.suggestedFilename);
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

  private async saveDependencyTable(rows: ExportRow[], suggestedFilename: string): Promise<void> {
    if (rows.length === 0) {
      void vscode.window.showWarningMessage('FluxLoops: no dependencies to export. Adjust filters or run a scan first.');
      return;
    }

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(suggestedFilename),
      filters: { Excel: ['xlsx'] },
      saveLabel: 'Export',
    });
    if (!uri) {
      return;
    }

    try {
      const buffer = await buildDependencyWorkbook(rows);
      await vscode.workspace.fs.writeFile(uri, buffer);
      void vscode.window.showInformationMessage(`FluxLoops: exported ${rows.length} dependencies to ${uri.fsPath}`);
    } catch {
      void vscode.window.showErrorMessage('FluxLoops: could not write Excel file.');
    }
  }

  private async saveGraphPng(pngBase64: string, suggestedFilename: string): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(suggestedFilename),
      filters: { 'PNG Images': ['png'] },
      saveLabel: 'Export',
    });
    if (!uri) {
      return;
    }

    try {
      const buffer = Buffer.from(pngBase64, 'base64');
      await vscode.workspace.fs.writeFile(uri, buffer);
      void vscode.window.showInformationMessage(`FluxLoops: exported graph to ${uri.fsPath}`);
    } catch {
      void vscode.window.showErrorMessage('FluxLoops: could not write PNG file.');
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
    <div id="viewTabs" role="tablist" aria-label="View mode">
      <button type="button" id="tabGraph" class="view-tab icon-tab active" data-panel="graph" role="tab" aria-selected="true" aria-label="Graph" title="Graph">
        <svg class="tab-icon" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="3.5" cy="12.5" r="1.75" fill="currentColor"></circle>
          <circle cx="12.5" cy="12.5" r="1.75" fill="currentColor"></circle>
          <circle cx="8" cy="3.5" r="1.75" fill="currentColor"></circle>
          <path d="M4.8 11.1 L7.2 5.1 M11.2 11.1 L8.8 5.1" stroke="currentColor" stroke-width="1.2" fill="none"></path>
        </svg>
      </button>
      <button type="button" id="tabTable" class="view-tab icon-tab" data-panel="table" role="tab" aria-selected="false" aria-label="Table" title="Table">
        <svg class="tab-icon" viewBox="0 0 16 16" aria-hidden="true">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M0 1h16v14H0V1zm1 1v12h14V2H1zm1 1h5v3H2V3zm6 0h5v3H8V3zM2 7h5v3H2V7zm6 0h5v3H8V7zm-6 4h5v3H2v-3zm6 0h5v3H8v-3z" fill="currentColor"></path>
        </svg>
      </button>
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
    <button type="button" id="exportGraphBtn" class="export-btn" title="Export current graph view as PNG">Export PNG</button>
    <button type="button" id="exportTableBtn" class="export-btn hidden" title="Export filtered table to Excel">Export Excel</button>
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