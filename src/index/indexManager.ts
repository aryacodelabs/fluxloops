import * as path from 'node:path';
import * as vscode from 'vscode';
import type { FluxGraph } from '../types';
import type { RoslynHostManager } from '../roslyn/roslynHostManager';
import { discoverWorkspaceFiles, getWorkspaceRoots } from './workspaceDiscovery';
import { resolveConfiguredPath, resolveScopeRoot } from './scopeResolution';
import { resolveScanTargets } from './scanTargets';
import {
  discoverProjectsUnderScope,
  listProjectsFromNodes,
  projectLabelFromPath,
} from './projectDiscovery';

const DEBOUNCE_MS = 300;

const EMPTY_GRAPH: FluxGraph = {
  nodes: [],
  edges: [],
  warnings: [],
  cycles: [],
  errors: [],
  scannedAt: '',
};

export interface IndexManagerOptions {
  log?: (message: string) => void;
  onScopeMissing?: () => void;
  roslynHostManager: RoslynHostManager;
}

type DiscoveredFiles = Awaited<ReturnType<typeof discoverWorkspaceFiles>>;

export class IndexManager implements vscode.Disposable {
  private graph: FluxGraph = { ...EMPTY_GRAPH };
  private incrementalDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly pendingChangedFiles = new Set<string>();
  private readonly onIndexChangedEmitter = new vscode.EventEmitter<FluxGraph>();
  private scopeRoot?: string;
  private discoveredFiles: DiscoveredFiles = [];
  private scanTargets: { solutionPath?: string; projectPath?: string } = {};
  private knownProjects: { id: string; label: string }[] = [];
  private activeProjectPath: string | null = null;
  private scanMode: 'solution' | 'project' = 'solution';
  private scopeMissingNotified = false;
  private scanInFlight: Promise<FluxGraph> | undefined;

  readonly onIndexChanged = this.onIndexChangedEmitter.event;

  constructor(private readonly options: IndexManagerOptions) {}

  async initialize(): Promise<void> {
    await this.resolveScope();
    if (!this.scopeRoot) {
      this.notifyScopeMissing();
    }
  }

  getGraph(): FluxGraph {
    return this.graph;
  }

  getScopeRoot(): string | undefined {
    return this.scopeRoot;
  }

  getActiveProjectPath(): string | null {
    return this.activeProjectPath;
  }

  async fullScan(): Promise<FluxGraph> {
    if (!this.scopeRoot) {
      await this.resolveScope();
      if (!this.scopeRoot) {
        this.notifyScopeMissing();
        return this.graph;
      }
    }

    this.scanMode = 'solution';
    this.activeProjectPath = null;
    this.scanTargets = this.resolveSolutionScanTargets(this.discoveredFiles);
    return this.runScan();
  }

  async scanProject(csprojPath: string): Promise<FluxGraph> {
    const normalized = path.normalize(csprojPath);
    if (!normalized.toLowerCase().endsWith('.csproj')) {
      throw new Error('FluxLoops: expected a .csproj file path.');
    }

    if (!this.scopeRoot) {
      await this.resolveScope();
    }

    this.scanMode = 'project';
    this.activeProjectPath = path.resolve(normalized);
    this.scanTargets = { projectPath: this.activeProjectPath };
    this.options.log?.(`FluxLoops project scan: ${projectLabelFromPath(this.activeProjectPath)}`);
    return this.runScan();
  }

  scheduleIncrementalScan(document: vscode.TextDocument): void {
    if (!this.getConfig().scanOnSave) {
      return;
    }

    if (!['csharp', 'aspnetcorerazor'].includes(document.languageId)) {
      return;
    }

    if (!this.isInScope(document.uri.fsPath)) {
      return;
    }

    if (this.scanMode === 'project' && this.activeProjectPath) {
      const projectDir = path.dirname(this.activeProjectPath).toLowerCase();
      const file = path.normalize(document.uri.fsPath).toLowerCase();
      if (!file.startsWith(`${projectDir}${path.sep}`)) {
        return;
      }
    }

    this.pendingChangedFiles.add(path.normalize(document.uri.fsPath));

    if (this.incrementalDebounceTimer) {
      clearTimeout(this.incrementalDebounceTimer);
    }

    this.incrementalDebounceTimer = setTimeout(() => {
      this.incrementalDebounceTimer = undefined;
      const changedFiles = [...this.pendingChangedFiles];
      this.pendingChangedFiles.clear();
      void this.incrementalScan(changedFiles);
    }, DEBOUNCE_MS);
  }

  async incrementalScan(changedFiles: string[]): Promise<void> {
    if (!this.scopeRoot || changedFiles.length === 0) {
      return;
    }

    const inScopeFiles = changedFiles.filter((filePath) => this.isInScope(filePath));
    if (inScopeFiles.length === 0) {
      return;
    }

    if (this.graph.nodes.length === 0) {
      this.options.log?.('FluxLoops incremental scan skipped: no cached graph, running full scan');
      if (this.scanMode === 'project' && this.activeProjectPath) {
        await this.scanProject(this.activeProjectPath);
      } else {
        await this.fullScan();
      }
      return;
    }

    this.options.log?.(`FluxLoops incremental scan: ${inScopeFiles.join(', ')}`);
    await this.runScan(inScopeFiles);
  }

  async resolveScope(): Promise<string | undefined> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this.scopeRoot = undefined;
      return undefined;
    }

    const workspaceRoots = getWorkspaceRoots(folders);
    const discovered = await discoverWorkspaceFiles(folders);
    const projectPathConfig = this.getConfig().projectPath.trim();
    const configured = projectPathConfig
      ? resolveConfiguredPath(projectPathConfig, workspaceRoots)
      : undefined;

    const result = resolveScopeRoot({
      projectPathConfig: configured,
      workspaceRoots,
      discoveredFiles: discovered,
      scanEntireSolution: this.getConfig().scanEntireSolution,
    });

    if (!result) {
      this.scopeRoot = undefined;
      return undefined;
    }

    this.scopeRoot = result.scopeRoot;
    this.discoveredFiles = discovered;
    this.scopeMissingNotified = false;
    this.knownProjects = discoverProjectsUnderScope(
      discovered.filter((file) => file.kind === 'csproj').map((file) => file.absolutePath),
      this.scopeRoot,
    );
    this.scanTargets = this.resolveSolutionScanTargets(discovered);
    this.options.log?.(`FluxLoops scope: ${result.scopeRoot} (${result.source})`);
    return this.scopeRoot;
  }

  dispose(): void {
    if (this.incrementalDebounceTimer) {
      clearTimeout(this.incrementalDebounceTimer);
      this.incrementalDebounceTimer = undefined;
    }
    this.pendingChangedFiles.clear();
    this.onIndexChangedEmitter.dispose();
  }

  private async runScan(changedFiles?: string[]): Promise<FluxGraph> {
    if (this.scanInFlight) {
      return this.scanInFlight;
    }

    this.scanInFlight = this.runScanInternal(changedFiles).finally(() => {
      this.scanInFlight = undefined;
    });
    return this.scanInFlight;
  }

  private async runScanInternal(changedFiles?: string[]): Promise<FluxGraph> {
    const client = await this.options.roslynHostManager.getClient();
    if (!client) {
      this.graph = {
        ...EMPTY_GRAPH,
        errors: [{ code: 'HOST_MISSING', message: 'Roslyn host not found. Run npm run build:roslyn.', fatal: true }],
        scannedAt: new Date().toISOString(),
        scopeRoot: this.scopeRoot,
      };
      this.onIndexChangedEmitter.fire(this.graph);
      return this.graph;
    }

    try {
      const targets = normalizeScanTargets(this.scanTargets);
      this.options.log?.(
        `FluxLoops scanning: ${targets.solutionPath ?? targets.projectPath ?? '(no target)'}`,
      );

      const result = await client.scan({
        ...targets,
        changedFiles,
        excludeTestProjects: this.getConfig().excludeTestProjects,
      }, {
        timeoutMs: this.getConfig().scanTimeoutMs,
      });

      const projects =
        this.knownProjects.length > 0
          ? this.knownProjects
          : listProjectsFromNodes(result.nodes);

      this.graph = {
        ...result,
        scannedAt: new Date().toISOString(),
        scopeRoot: this.scopeRoot,
        projects,
        activeProjectPath: this.activeProjectPath,
        scanMode: this.scanMode,
      };
      this.options.log?.(
        `FluxLoops scan complete: ${result.nodes.length} nodes, ${result.edges.length} edges`,
      );
      this.onIndexChangedEmitter.fire(this.graph);
      return this.graph;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.log?.(`Scan failed: ${message}`);
      this.graph = {
        ...EMPTY_GRAPH,
        errors: [{ code: 'SCAN_FAILED', message, fatal: false }],
        scannedAt: new Date().toISOString(),
        scopeRoot: this.scopeRoot,
      };
      this.onIndexChangedEmitter.fire(this.graph);
      return this.graph;
    }
  }

  private getConfig() {
    const config = vscode.workspace.getConfiguration('fluxLoops');
    return {
      scanOnSave: config.get<boolean>('scanOnSave', true),
      projectPath: config.get<string>('projectPath', ''),
      scanEntireSolution: config.get<boolean>('scanEntireSolution', true),
      excludeTestProjects: config.get<boolean>('excludeTestProjects', true),
      scanTimeoutMs: Math.max(60_000, config.get<number>('scanTimeoutSeconds', 600) * 1000),
    };
  }

  private notifyScopeMissing(): void {
    if (this.scopeMissingNotified) {
      return;
    }
    this.scopeMissingNotified = true;
    this.options.onScopeMissing?.();
  }

  private resolveSolutionScanTargets(
    discovered?: DiscoveredFiles,
  ): { solutionPath?: string; projectPath?: string } {
    if (!this.scopeRoot) {
      return {};
    }

    const slnPaths = (discovered ?? this.discoveredFiles)
      .filter((file) => file.kind === 'sln')
      .map((file) => file.absolutePath);

    return normalizeScanTargets(resolveScanTargets(this.scopeRoot, slnPaths));
  }

  private isInScope(filePath: string): boolean {
    if (!this.scopeRoot) {
      return false;
    }

    const normalizedFile = path.normalize(filePath).toLowerCase();
    const normalizedScope = path.normalize(this.scopeRoot).toLowerCase();
    return (
      normalizedFile === normalizedScope ||
      normalizedFile.startsWith(`${normalizedScope}${path.sep}`)
    );
  }
}

function normalizeScanTargets(targets: { solutionPath?: string; projectPath?: string }): {
  solutionPath?: string;
  projectPath?: string;
} {
  return {
    solutionPath: targets.solutionPath ? path.resolve(targets.solutionPath) : undefined,
    projectPath: targets.projectPath ? path.resolve(targets.projectPath) : undefined,
  };
}