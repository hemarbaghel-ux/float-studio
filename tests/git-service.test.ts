/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { NativeLocalGitService } from '../src/services/git/nativeLocalGitService';

describe('Native Local Git Service (SCM & Branch Management)', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const gitService = new NativeLocalGitService(repoRoot);

  it('detects that the project is an active git repository', async () => {
    const isRepo = await gitService.isGitRepository();
    expect(isRepo).toBe(true);
  });

  it('retrieves current git status and reports active branch', async () => {
    const status = await gitService.getStatus();
    expect(status).toBeDefined();
    expect(typeof status.branch).toBe('string');
    expect(status.branch.length).toBeGreaterThan(0);
    expect(Array.isArray(status.entries)).toBe(true);
  });

  it('lists branches and identifies current active branch', async () => {
    const branches = await gitService.listBranches();
    expect(branches).toBeDefined();
    expect(typeof branches.current).toBe('string');
    expect(branches.branches.length).toBeGreaterThan(0);
    expect(branches.branches).toContain(branches.current);
  });

  it('blocks push to protected branch without explicit human approval', () => {
    expect(() => gitService.validateRemotePushTarget('main', false)).toThrow(/human approval/i);
    expect(() => gitService.validateRemotePushTarget('main', true)).toThrow(/protected branch "main" is blocked/i);
  });
});
