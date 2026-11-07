/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { sanitizeProposalPath } from '../proposals/floatProposalValidator.js';

export const DEFAULT_FLOAT_COMPOSER_SANDBOX_IMAGE = 'node:22-bookworm-slim';

export interface IFloatDockerSandboxOptions {
  workspaceRoot: string;
  dependenciesDirectory?: string;
  command: string;
  cwd?: string;
  image?: string;
  containerName: string;
}

export function buildFloatDockerSandboxArgs(options: IFloatDockerSandboxOptions): string[] {
  if (!options.command || typeof options.command !== 'string' || options.command.length > 32768) {
    throw new Error('A non-empty command of at most 32 KiB is required.');
  }

  const image = options.image || DEFAULT_FLOAT_COMPOSER_SANDBOX_IMAGE;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/@-]{0,254}$/.test(image)) {
    throw new Error('Invalid FLOAT Composer sandbox image reference.');
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(options.containerName)) {
    throw new Error('Invalid FLOAT Composer sandbox container name.');
  }

  const workspaceRoot = fs.realpathSync(options.workspaceRoot);
  if (!fs.statSync(workspaceRoot).isDirectory()) {
    throw new Error('FLOAT Composer sandbox workspace must be a directory.');
  }

  const relativeCwd = !options.cwd || options.cwd === '.' ? '' : sanitizeProposalPath(options.cwd);
  const requestedCwd = path.resolve(workspaceRoot, relativeCwd);
  const cwdRealPath = fs.realpathSync(requestedCwd);
  const relativeRealCwd = path.relative(workspaceRoot, cwdRealPath);
  if (relativeRealCwd === '..' ||
      relativeRealCwd.startsWith('..' + path.sep) ||
      path.isAbsolute(relativeRealCwd)) {
    throw new Error('FLOAT Composer sandbox working directory escapes its workspace.');
  }

  const toMountSource = (source: string): string => {
    const normalized = process.platform === 'win32' ? source.replace(/\\/g, '/') : source;
    if (normalized.includes(',')) {
      throw new Error('Workspace paths containing commas are not supported by Docker mount syntax.');
    }
    return normalized;
  };

  const containerCwd = relativeRealCwd
    ? '/workspace/' + relativeRealCwd.split(path.sep).join('/')
    : '/workspace';

  const args = [
    'run',
    '--rm',
    '--pull=missing',
    '--name', options.containerName,
    '--network=none',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--pids-limit=128',
    '--memory=1g',
    '--memory-swap=1g',
    '--cpus=1',
    '--read-only',
    '--stop-timeout=1',
    '--tmpfs=/tmp:rw,nosuid,nodev,size=128m',
    '--mount', 'type=bind,source=' + toMountSource(workspaceRoot) + ',target=/workspace',
    '--workdir', containerCwd,
    '--env=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    '--env=HOME=/tmp',
    '--env=TMPDIR=/tmp',
    '--env=CI=true',
    '--env=npm_config_cache=/tmp/npm-cache'
  ];

  if (options.dependenciesDirectory && fs.existsSync(options.dependenciesDirectory)) {
    const dependencyStat = fs.lstatSync(options.dependenciesDirectory);
    if (dependencyStat.isSymbolicLink() || !dependencyStat.isDirectory()) {
      throw new Error('FLOAT Composer dependencies must be a real directory, not a symlink.');
    }
    const dependenciesRealPath = fs.realpathSync(options.dependenciesDirectory);
    args.push('--mount', 'type=bind,source=' + toMountSource(dependenciesRealPath) + ',target=/workspace/node_modules,readonly');
  }

  args.push(image, 'sh', '-lc', options.command);
  return args;
}

export interface IFloatDockerCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Runs toolchain commands in a resource-limited, network-disabled Docker
 * container. If Docker is unavailable or the image cannot start, execution
 * fails closed. There is intentionally no host-shell fallback.
 */
export class FloatDockerSandboxRunner {
  private _activeChild: ChildProcess | null = null;
  private _activeContainerName: string | null = null;
  private static _sequence = 0;

  constructor(
    private readonly _workspaceRoot: string,
    private readonly _dependenciesDirectory?: string,
    private readonly _defaultTimeoutMs: number = 45000
  ) {}

  public async run(
    command: string,
    options: { cwd?: string; timeoutMs?: number } = {}
  ): Promise<IFloatDockerCommandResult> {
    const start = Date.now();
    const containerName = 'float-composer-' + process.pid + '-' + Date.now() + '-' + (++FloatDockerSandboxRunner._sequence);
    let args: string[];

    try {
      args = buildFloatDockerSandboxArgs({
        workspaceRoot: this._workspaceRoot,
        dependenciesDirectory: this._dependenciesDirectory,
        command,
        cwd: options.cwd || '.',
        image: process.env.FLOAT_COMPOSER_SANDBOX_IMAGE || DEFAULT_FLOAT_COMPOSER_SANDBOX_IMAGE,
        containerName
      });
    } catch (error) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: '[SANDBOX CONFIGURATION ERROR] ' + (error instanceof Error ? error.message : String(error)),
        durationMs: Date.now() - start
      };
    }

    const timeoutMs = Math.max(1000, options.timeoutMs ?? this._defaultTimeoutMs);
    return await new Promise<IFloatDockerCommandResult>(resolve => {
      const child = execFile('docker', args, {
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true
      }, (error, stdout, stderr) => {
        const finish = async () => {
          if (error && (error.code === 'ETIMEDOUT' || error.killed)) {
            await this._stopContainer(containerName);
          }

          if (this._activeContainerName === containerName) {
            this._activeContainerName = null;
            this._activeChild = null;
          }

          const errorCode = error?.code;
          const exitCode = !error ? 0 :
            typeof errorCode === 'number' ? errorCode :
            errorCode === 'ETIMEDOUT' ? 124 :
            errorCode === 'ENOENT' ? 127 : 1;
          let errorText = stderr ? stderr.toString() : '';
          if (errorCode === 'ENOENT') {
            errorText = 'Docker CLI was not found. Install and start Docker Desktop or Docker Engine. FLOAT did not fall back to host command execution.';
          } else if (!errorText && error) {
            errorText = error.message;
          }

          resolve({
            exitCode,
            stdout: stdout ? stdout.toString() : '',
            stderr: errorText,
            durationMs: Date.now() - start
          });
        };
        void finish();
      });

      this._activeChild = child;
      this._activeContainerName = containerName;
    });
  }

  public abort(): void {
    const containerName = this._activeContainerName;
    if (this._activeChild) {
      try {
        this._activeChild.kill('SIGTERM');
      } catch {
        // Best-effort process cancellation; Docker stop below is authoritative.
      }
    }
    if (containerName) {
      void this._stopContainer(containerName);
    }
  }

  private async _stopContainer(containerName: string): Promise<void> {
    await new Promise<void>(resolve => {
      execFile('docker', ['stop', '--time', '1', containerName], {
        timeout: 5000,
        windowsHide: true
      }, () => resolve());
    });
  }
}
