/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import cp from 'node:child_process';
import { WorktreeExecutionRunner } from '../src/server/cloudAgent/worktreeExecutionRunner';

describe('WorktreeExecutionRunner (Ephemeral Git Worktrees)', () => {
  let tempRepoDir: string;
  let tempWorktreesDir: string;
  let runner: WorktreeExecutionRunner;

  beforeAll(() => {
    // Create an isolated real git repo in tmpdir
    tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'float_test_repo_'));
    tempWorktreesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'float_test_wts_'));

    // Initialize git repo
    cp.execSync('git init -b main', { cwd: tempRepoDir, stdio: 'pipe' });
    cp.execSync('git config user.name "Float Test"', { cwd: tempRepoDir, stdio: 'pipe' });
    cp.execSync('git config user.email "test@float.local"', { cwd: tempRepoDir, stdio: 'pipe' });

    // Initial commit
    fs.writeFileSync(path.join(tempRepoDir, 'README.md'), '# Initial Repo\n', 'utf8');
    cp.execSync('git add README.md', { cwd: tempRepoDir, stdio: 'pipe' });
    cp.execSync('git commit -m "initial commit"', { cwd: tempRepoDir, stdio: 'pipe' });

    runner = new WorktreeExecutionRunner({
      repoRoot: tempRepoDir,
      worktreesRoot: tempWorktreesDir,
    });
  });

  afterAll(() => {
    try {
      fs.rmSync(tempRepoDir, { recursive: true, force: true });
      fs.rmSync(tempWorktreesDir, { recursive: true, force: true });
    } catch {}
  });

  it('creates an ephemeral git worktree branched from main', async () => {
    const worktree = await runner.createWorktree({
      runId: 'run_test_01',
      subtaskId: 'sub_a',
    });

    expect(fs.existsSync(worktree.worktreePath)).toBe(true);
    expect(worktree.branchName).toContain('float-agent/run_test_01-sub_a');
    expect(fs.existsSync(path.join(worktree.worktreePath, 'README.md'))).toBe(true);

    // Verify it is on the new branch
    const branch = cp
      .execSync('git rev-parse --abbrev-ref HEAD', { cwd: worktree.worktreePath, encoding: 'utf8' })
      .trim();
    expect(branch).toBe(worktree.branchName);

    // Cleanup
    await runner.removeWorktree(worktree, true);
    expect(fs.existsSync(worktree.worktreePath)).toBe(false);
  });

  it('executes isolated task, commits changes, and removes worktree safely', async () => {
    const execution = await runner.executeIsolatedTask(
      {
        runId: 'run_test_02',
        commitMessage: 'feat(cloud-agent): implement isolated feature',
      },
      async (worktree) => {
        // Create a new file in the isolated worktree
        const newFilePath = path.join(worktree.worktreePath, 'feature.ts');
        fs.writeFileSync(newFilePath, 'export const greeting = "hello world";\n', 'utf8');

        // Check diff
        const diff = runner.getDiff(worktree.worktreePath);
        expect(diff).toBeDefined();

        return { success: true, createdFile: 'feature.ts' };
      }
    );

    expect(execution.result.success).toBe(true);
    expect(execution.commitResult.filesChanged).toBe(1);
    expect(execution.commitResult.commitSha).toMatch(/^[a-f0-9]{40}$/);

    // The worktree directory should be removed
    expect(fs.existsSync(execution.worktree.worktreePath)).toBe(false);

    // But the committed branch exists in the main repo!
    const log = cp
      .execSync(`git log -1 --oneline ${execution.commitResult.branchName}`, {
        cwd: tempRepoDir,
        encoding: 'utf8',
      })
      .trim();
    expect(log).toContain('feat(cloud-agent): implement isolated feature');
  });
});
