/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import { runShell, ShellFs, isShellCommand } from '../src/features/float/sandbox';

describe('Addendum A.2 — Browser Preview Worker Boundary Verifications', () => {
  const createMockFs = (initialFiles: Record<string, string> = {}): ShellFs => {
    const files = { ...initialFiles };
    return {
      files: () => files,
      write: (p: string, c: string) => { files[p] = c; },
      remove: (p: string) => { delete files[p]; },
    };
  };

  it('rejects native package manager install commands with clear redirection to host terminal', async () => {
    const fs = createMockFs();

    const installCommands = [
      'npm i lodash',
      'npm install express',
      'npm ci',
      'yarn add react',
      'pnpm add zod',
    ];

    for (const cmd of installCommands) {
      const res = await runShell(cmd, fs);
      expect(res.code).toBe(1);
      expect(res.output).toContain('Package installation is unavailable in the browser worker');
      expect(res.output).toContain('isolated project terminal');
    }
  });

  it('honestly reports unrecognized system binaries in help output without pretending to be a root shell', async () => {
    const fs = createMockFs();
    const res = await runShell('sudo apt-get install python3', fs);

    expect(res.code).toBe(127);
    expect(res.output).toContain('command not found');
    expect(res.output).toContain('FLOAT browser preview worker');
    expect(res.output).toContain('virtual in-memory interpreter');
  });

  it('executes safe in-memory file operations within virtual workspace', async () => {
    const fs = createMockFs({
      'index.js': 'console.log("hello preview");',
      'src/util.js': 'export const x = 1;',
    });

    const pwdRes = await runShell('pwd', fs);
    expect(pwdRes.code).toBe(0);
    expect(pwdRes.output).toBe('/workspace');

    const lsRes = await runShell('ls', fs);
    expect(lsRes.code).toBe(0);
    expect(lsRes.output).toContain('index.js');
    expect(lsRes.output).toContain('src/');

    const catRes = await runShell('cat index.js', fs);
    expect(catRes.code).toBe(0);
    expect(catRes.output).toContain('hello preview');
  });

  it('identifies shell commands versus non-shell commands reliably', () => {
    expect(isShellCommand('ls')).toBe(true);
    expect(isShellCommand('cat file.txt')).toBe(true);
    expect(isShellCommand('pwd && ls')).toBe(true);
    expect(isShellCommand('python script.py')).toBe(false);
  });
});
