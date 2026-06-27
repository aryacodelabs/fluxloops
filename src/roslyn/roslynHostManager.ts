import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { RoslynHostClient } from './roslynHostClient';

const HOST_EXE_NAME = process.platform === 'win32' ? 'RoslynHost.exe' : 'RoslynHost';

export class RoslynHostManager implements vscode.Disposable {
  private client: RoslynHostClient | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log?: (message: string) => void,
  ) {}

  async getClient(): Promise<RoslynHostClient | undefined> {
    const hostPath = await this.resolveHostPath();
    if (!hostPath) {
      return undefined;
    }

    if (!this.client) {
      this.client = new RoslynHostClient({
        hostPath,
        expectedHostVersion: '0.1.0',
        log: this.log,
      });
    }

    return this.client;
  }

  async dispose(): Promise<void> {
    if (this.client) {
      await this.client.shutdown();
      this.client = undefined;
    }
  }

  private async resolveHostPath(): Promise<string | undefined> {
    const configured = vscode.workspace.getConfiguration('fluxLoops').get<string>('roslynHostPath', '').trim();

    if (configured) {
      const resolved = path.isAbsolute(configured)
        ? configured
        : path.join(this.context.extensionPath, configured);
      if (fs.existsSync(resolved)) {
        return resolved;
      }
      this.log?.(`Configured roslynHostPath does not exist: ${resolved}`);
    }

    const devCandidates = [
      path.join(this.context.extensionPath, 'tools', 'FluxorLoops.RoslynHost', 'bin', 'Release', 'net8.0', HOST_EXE_NAME),
      path.join(this.context.extensionPath, 'tools', 'FluxorLoops.RoslynHost', 'bin', 'Debug', 'net8.0', HOST_EXE_NAME),
    ];

    for (const candidate of devCandidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    this.log?.('Roslyn host not found. Run npm run build:roslyn or set fluxLoops.roslynHostPath.');
    return undefined;
  }
}