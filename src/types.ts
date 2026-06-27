export type NodeKind = 'state' | 'action' | 'reducer' | 'effect' | 'component';

export type EdgeKind =
  | 'reducesTo'
  | 'effectListensFor'
  | 'effectDispatches'
  | 'componentSubscribesTo'
  | 'componentDispatches';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  displayName: string;
  filePath: string;
  line: number;
  featureStateId?: string | null;
  projectPath?: string | null;
}

export interface ProjectOption {
  id: string;
  label: string;
}

export interface GraphEdge {
  fromId: string;
  toId: string;
  kind: EdgeKind;
  isDynamic?: boolean;
}

export interface AnalysisWarning {
  code: string;
  message: string;
  filePath: string;
  line: number;
}

export interface CycleReport {
  nodeIds: string[];
  edgeDescriptions: string[];
}

export interface FluxGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  warnings: AnalysisWarning[];
  cycles: CycleReport[];
  errors: ScanError[];
  scannedAt: string;
  scopeRoot?: string;
  projects?: ProjectOption[];
  activeProjectPath?: string | null;
  scanMode?: 'solution' | 'project';
}

export interface ScanError {
  code: string;
  message: string;
  filePath?: string | null;
  fatal?: boolean;
}

export interface RoslynScanRequest {
  solutionPath?: string;
  projectPath?: string;
  changedFiles?: string[];
  excludeTestProjects?: boolean;
  useMsBuild?: boolean;
}

export interface RoslynScanResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  warnings: AnalysisWarning[];
  cycles: CycleReport[];
  errors: ScanError[];
}