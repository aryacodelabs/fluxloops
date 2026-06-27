import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { RoslynScanRequest, RoslynScanResult } from '../types';
import { hasFatalScanErrors, parseGraphResult, parsePingResult } from './protocol';

const PING_TIMEOUT_MS = 5_000;
const DEFAULT_SCAN_TIMEOUT_MS = 600_000;

export interface RoslynHostClientOptions {
  hostPath: string;
  expectedHostVersion?: string;
  log?: (message: string) => void;
}

interface PendingResponse {
  resolve: (line: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class RoslynHostClient {
  private healthy = false;
  private serveProcess: ChildProcessWithoutNullStreams | undefined;
  private serveReader: ReadlineInterface | undefined;
  private readonly pendingResponses: PendingResponse[] = [];
  private serveStarting: Promise<void> | undefined;

  constructor(private readonly options: RoslynHostClientOptions) {}

  async ping(): Promise<boolean> {
    try {
      const stdout = await this.runOneShot(['--ping'], PING_TIMEOUT_MS);
      const parsed = JSON.parse(stdout) as Record<string, unknown>;
      const ping = parsePingResult(parsed);
      if (!ping) {
        this.healthy = false;
        return false;
      }

      if (this.options.expectedHostVersion && ping.hostVersion !== this.options.expectedHostVersion) {
        this.options.log?.(
          `Roslyn host version mismatch: expected ${this.options.expectedHostVersion}, got ${ping.hostVersion}`,
        );
        this.healthy = false;
        return false;
      }

      this.healthy = true;
      return true;
    } catch (error) {
      this.options.log?.(`Roslyn ping failed: ${error instanceof Error ? error.message : String(error)}`);
      this.healthy = false;
      return false;
    }
  }

  async scan(
    request: RoslynScanRequest,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<RoslynScanResult> {
    const signal = options?.signal;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS;

    if (signal?.aborted) {
      throw new Error('Scan aborted');
    }

    const payloadFile = path.join(os.tmpdir(), `fluxloops-scan-${Date.now()}.json`);
    fs.writeFileSync(payloadFile, JSON.stringify({
      solutionPath: request.solutionPath,
      projectPath: request.projectPath,
      changedFiles: request.changedFiles,
      excludeTestProjects: request.excludeTestProjects ?? true,
      useMsBuild: request.useMsBuild ?? false,
    }), 'utf8');

    try {
      await this.ensureServeProcess();
      const stdout = await this.requestServeScan(payloadFile, timeoutMs, signal);
      const parsed = JSON.parse(stdout) as Record<string, unknown>;
      const result = parseGraphResult(parsed);
      if (!result) {
        throw new Error('Roslyn scan returned an invalid payload');
      }

      this.options.log?.(
        `Roslyn scan result: ${result.nodes.length} nodes, ${result.edges.length} edges, ${result.warnings.length} warnings`,
      );

      if (hasFatalScanErrors(result.errors)) {
        throw new Error(result.errors.find((e) => e.fatal)?.message ?? 'Roslyn scan failed fatally');
      }

      this.healthy = true;
      return result;
    } finally {
      try {
        fs.unlinkSync(payloadFile);
      } catch {
        // Best-effort cleanup.
      }
    }
  }

  async shutdown(): Promise<void> {
    if (!this.serveProcess?.stdin.writable) {
      this.killServeProcess();
      return;
    }

    try {
      this.serveProcess.stdin.write('shutdown\n');
    } catch {
      // Host may already be gone.
    } finally {
      this.killServeProcess();
    }
  }

  dispose(): void {
    this.killServeProcess();
  }

  private async ensureServeProcess(): Promise<void> {
    if (this.serveProcess && !this.serveProcess.killed) {
      return;
    }

    if (!this.serveStarting) {
      this.serveStarting = this.spawnServeProcess();
    }

    try {
      await this.serveStarting;
    } finally {
      this.serveStarting = undefined;
    }
  }

  private async spawnServeProcess(): Promise<void> {
    this.killServeProcess();

    const process = spawn(this.options.hostPath, ['--serve'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const reader = createInterface({ input: process.stdout });
    reader.on('line', (line) => {
      const pending = this.pendingResponses.shift();
      if (!pending) {
        return;
      }

      clearTimeout(pending.timer);
      pending.resolve(line);
    });

    process.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8').trim();
      if (text) {
        this.options.log?.(`[RoslynHost] ${text}`);
      }
    });

    process.on('exit', (code) => {
      this.options.log?.(`Roslyn serve host exited with code ${code ?? 'unknown'}`);
      this.rejectAllPending(new Error('Roslyn serve host process exited'));
      this.serveProcess = undefined;
      this.serveReader = undefined;
      this.healthy = false;
    });

    this.serveProcess = process;
    this.serveReader = reader;
    this.healthy = true;
    this.options.log?.('Roslyn serve host started');
  }

  private requestServeScan(
    payloadFile: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<string> {
    if (!this.serveProcess?.stdin.writable) {
      throw new Error('Roslyn serve host stdin is not writable');
    }

    return new Promise((resolve, reject) => {
      const pending: PendingResponse = {
        resolve: (line) => {
          if (signal) {
            signal.removeEventListener('abort', onAbort);
          }
          resolve(line);
        },
        reject: (error) => {
          if (signal) {
            signal.removeEventListener('abort', onAbort);
          }
          reject(error);
        },
        timer: setTimeout(() => {
          const index = this.pendingResponses.indexOf(pending);
          if (index >= 0) {
            this.pendingResponses.splice(index, 1);
          }
          this.options.log?.(`Roslyn scan timed out after ${timeoutMs}ms — restarting serve host`);
          this.killServeProcess();
          pending.reject(new Error(`Roslyn scan timed out after ${timeoutMs}ms`));
        }, timeoutMs),
      };

      const onAbort = (): void => {
        const index = this.pendingResponses.indexOf(pending);
        if (index >= 0) {
          this.pendingResponses.splice(index, 1);
        }
        clearTimeout(pending.timer);
        this.killServeProcess();
        pending.reject(new Error('Scan aborted'));
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      this.pendingResponses.push(pending);
      this.serveProcess!.stdin.write(`${payloadFile}\n`);
    });
  }

  private runOneShot(args: string[], timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.options.hostPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8').trim();
        stderr += text;
        if (text) {
          this.options.log?.(`[RoslynHost] ${text}`);
        }
      });

      const timer = setTimeout(() => {
        killProcess(proc);
        reject(new Error(`Roslyn ${args[0]} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(stderr || `Roslyn host exited with code ${code ?? 'unknown'}`));
          return;
        }

        resolve(stdout.trim());
      });
    });
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingResponses.splice(0)) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }

  private killServeProcess(): void {
    this.rejectAllPending(new Error('Roslyn serve host process killed'));
    this.serveReader?.close();
    this.serveReader = undefined;

    if (this.serveProcess && !this.serveProcess.killed) {
      this.serveProcess.kill();
    }

    this.serveProcess = undefined;
    this.healthy = false;
  }
}

function killProcess(proc: ChildProcessWithoutNullStreams): void {
  if (!proc.killed) {
    proc.kill();
  }
}