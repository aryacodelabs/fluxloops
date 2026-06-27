import * as vscode from 'vscode';
import type { FluxGraph } from '../types';

export class FluxStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

  constructor() {
    this.item.command = 'fluxLoops.showGraph';
    this.item.tooltip = 'FluxLoops: Show Fluxor Graph';
  }

  update(graph: FluxGraph): void {
    if (graph.nodes.length === 0) {
      this.item.text = '$(type-hierarchy) FluxLoops: no graph';
      this.item.show();
      return;
    }

    const cycleCount = graph.cycles.length;
    const cycleSuffix = cycleCount > 0 ? ` · $(warning) ${cycleCount} cycles` : '';
    this.item.text = `$(type-hierarchy) FluxLoops: ${graph.nodes.length} nodes · ${graph.edges.length} edges${cycleSuffix}`;
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}