import type { RoslynScanResult, ScanError } from '../types';

export const ROSLYN_PROTOCOL_VERSION = 1;

export type RoslynCommand = 'ping' | 'scan' | 'shutdown';

export interface RoslynRequest {
  protocolVersion: typeof ROSLYN_PROTOCOL_VERSION;
  id: string;
  cmd: RoslynCommand;
  payload: Record<string, unknown>;
}

export interface RoslynErrorDto {
  code: string;
  message: string;
  filePath?: string | null;
  fatal?: boolean;
}

export interface RoslynResponse {
  protocolVersion: typeof ROSLYN_PROTOCOL_VERSION;
  id: string;
  ok: boolean;
  payload?: Record<string, unknown>;
  error?: RoslynErrorDto;
}

export interface PingResultDto {
  hostVersion: string;
  roslynVersion: string;
  rid: string;
}

export function createRequest(
  id: string,
  cmd: RoslynCommand,
  payload: Record<string, unknown> = {},
): RoslynRequest {
  return { protocolVersion: ROSLYN_PROTOCOL_VERSION, id, cmd, payload };
}

export function serializeRequest(request: RoslynRequest): string {
  return `${JSON.stringify(request)}\n`;
}

export function parseResponseLine(line: string): RoslynResponse | undefined {
  const trimmed = line.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as RoslynResponse;
    if (parsed.protocolVersion !== ROSLYN_PROTOCOL_VERSION || typeof parsed.id !== 'string') {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export function parsePingResult(payload: Record<string, unknown> | undefined): PingResultDto | undefined {
  if (!payload || typeof payload.hostVersion !== 'string') {
    return undefined;
  }
  return {
    hostVersion: payload.hostVersion,
    roslynVersion: typeof payload.roslynVersion === 'string' ? payload.roslynVersion : 'unknown',
    rid: typeof payload.rid === 'string' ? payload.rid : 'unknown',
  };
}

export function parseGraphResult(payload: Record<string, unknown> | undefined): RoslynScanResult | undefined {
  if (!payload || !Array.isArray(payload.nodes) || !Array.isArray(payload.edges)) {
    return undefined;
  }

  return {
    nodes: payload.nodes as RoslynScanResult['nodes'],
    edges: payload.edges as RoslynScanResult['edges'],
    warnings: Array.isArray(payload.warnings) ? (payload.warnings as RoslynScanResult['warnings']) : [],
    cycles: Array.isArray(payload.cycles) ? (payload.cycles as RoslynScanResult['cycles']) : [],
    errors: Array.isArray(payload.errors) ? (payload.errors as ScanError[]) : [],
  };
}

export function hasFatalScanErrors(errors: ScanError[]): boolean {
  return errors.some((error) => error.fatal === true);
}