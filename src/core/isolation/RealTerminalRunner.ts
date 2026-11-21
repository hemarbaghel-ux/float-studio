/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'node:child_process';
import path from 'node:path';

export interface TerminalExecutionOutcome {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly failureDetected: boolean;
}

export class RealTerminalRunner {
  constructor(private readonly defaultCwd: string = process.cwd()) {}

  /**
   * Executes a command in a real terminal shell (powershell/cmd on Windows, sh/bash on POSIX),
   * watching stdout/stderr continuously so the agent harness can detect failures.
   */
  public async executeCommand(
    command: string,
    cwd?: string,
    timeoutMs: number = 30_000
  ): Promise<TerminalExecutionOutcome> {
    const startTime = Date.now();
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'powershell.exe' : '/bin/bash';
    const args = isWindows ? ['-NoProfile', '-Command', command] : ['-c', command];

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const child = spawn(shell, args, {
        cwd: cwd || this.defaultCwd,
        env: { ...process.env, FLOAT_TERMINAL_PROFILE: 'real' }
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const exitCode = timedOut ? -1 : (code ?? 0);
        const failureDetected = exitCode !== 0 || stderr.toLowerCase().includes('error:') || stderr.toLowerCase().includes('failed');

        resolve({
          exitCode,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          durationMs: Date.now() - startTime,
          failureDetected
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          exitCode: 1,
          stdout: '',
          stderr: err.message,
          durationMs: Date.now() - startTime,
          failureDetected: true
        });
      });
    });
  }
}
