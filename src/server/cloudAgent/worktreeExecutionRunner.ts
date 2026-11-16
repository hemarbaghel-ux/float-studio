/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import { validateSafeWorkspacePath } from '../../shared/contracts/workspace';

export interface WorktreeRunnerOptions {
  readonly repoRoot: string;
  readonly worktreesRoot?: string;
}

export interface EphemeralWorktree {
  readonly worktreeId: string;
  readonly branchName: string;
  readonly worktreePath: string;
  readonly createdAt: number;
}

export interface WorktreeCommitResult {
  readonly branchName: string;
  readonly commitSha: string;
  readonly filesChanged: number;
}

export class WorktreeExecutionRunner {
  private readonly repoRoot: string;
  private readonly worktreesRoot: string;

  constructor(options: WorktreeRunnerOptions) {
    this.repoRoot = path.resolve(options.repoRoot);
    this.worktreesRoot = path.resolve(
      options.worktreesRoot || path.join(os.tmpdir(), 'float_ephemeral_worktrees')
    );
    if (!fs.existsSync(this.worktreesRoot)) {
      fs.mkdirSync(this.worktreesRoot, { recursive: true });
    }
  }

  private runGit(args: string[], cwd?: string): string {
    const targetCwd = cwd || this.repoRoot;
    const res = cp.spawnSync('git', args, {
      cwd: targetCwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30_000,
      windowsHide: true,
    });

    if (res.error) {
      throw new Error(`Git execution failed: ${res.error.message}`);
    }
    if (res.status !== 0) {
      throw new Error(`Git command 'git ${args.join(' ')}' failed with code ${res.status}: ${res.stderr || res.stdout}`);
    }
    return (res.stdout || '').trim();
  }

  /**
   * Spawns an ephemeral git worktree branched off the specified baseRef (defaults to HEAD).
   * This provides physical filesystem isolation for parallel cloud agents.
   */
  public async createWorktree(params: {
    runId: string;
    subtaskId?: string;
    baseRef?: string;
  }): Promise<EphemeralWorktree> {
    const randomSuffix = crypto.randomBytes(3).toString('hex');
    const branchName = `float-agent/${params.runId}${params.subtaskId ? `-${params.subtaskId}` : ''}-${randomSuffix}`;
    const worktreeId = `wt_${params.runId}_${randomSuffix}`;
    const worktreePath = path.join(this.worktreesRoot, worktreeId);

    // Ensure clean target path
    if (fs.existsSync(worktreePath)) {
      fs.rmSync(worktreePath, { recursive: true, force: true });
    }

    const baseRef = params.baseRef || 'HEAD';
    this.runGit(['worktree', 'add', '-b', branchName, worktreePath, baseRef]);

    return {
      worktreeId,
      branchName,
      worktreePath,
      createdAt: Date.now(),
    };
  }

  /**
   * Captures the git diff in the ephemeral worktree against the base branch.
   */
  public getDiff(worktreePath: string): string {
    if (!fs.existsSync(worktreePath)) {
      throw new Error(`Worktree directory does not exist: ${worktreePath}`);
    }
    return this.runGit(['diff', 'HEAD'], worktreePath);
  }

  /**
   * Commits all changes in the ephemeral worktree to its dedicated agent branch.
   */
  public commitChanges(worktreePath: string, message: string): WorktreeCommitResult {
    if (!fs.existsSync(worktreePath)) {
      throw new Error(`Worktree directory does not exist: ${worktreePath}`);
    }

    this.runGit(['add', '-A'], worktreePath);
    const status = this.runGit(['status', '--porcelain'], worktreePath);
    if (!status) {
      const currentSha = this.runGit(['rev-parse', 'HEAD'], worktreePath);
      const branch = this.runGit(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);
      return {
        branchName: branch,
        commitSha: currentSha,
        filesChanged: 0,
      };
    }

    const filesChanged = status.split('\n').filter(Boolean).length;
    this.runGit(['commit', '-m', message], worktreePath);
    const commitSha = this.runGit(['rev-parse', 'HEAD'], worktreePath);
    const branchName = this.runGit(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);

    return {
      branchName,
      commitSha,
      filesChanged,
    };
  }

  /**
   * Destroys and cleans up an ephemeral worktree, releasing file handles and git locks.
   */
  public async removeWorktree(worktree: EphemeralWorktree, deleteBranch: boolean = false): Promise<void> {
    try {
      if (fs.existsSync(worktree.worktreePath)) {
        this.runGit(['worktree', 'remove', '--force', worktree.worktreePath]);
      }
    } catch (err: any) {
      // Force remove directory if git worktree remove encounters a lock or already deleted entry
      try {
        fs.rmSync(worktree.worktreePath, { recursive: true, force: true });
        this.runGit(['worktree', 'prune']);
      } catch {}
    }

    if (deleteBranch && worktree.branchName) {
      try {
        this.runGit(['branch', '-D', worktree.branchName]);
      } catch {}
    }
  }

  /**
   * Guaranteed safe execution wrapper: creates worktree, executes agent task callback,
   * commits changes, and cleans up the worktree even on uncaught errors.
   */
  public async executeIsolatedTask<T>(
    params: { runId: string; subtaskId?: string; commitMessage?: string; baseRef?: string },
    taskFn: (worktree: EphemeralWorktree) => Promise<T>
  ): Promise<{ result: T; commitResult: WorktreeCommitResult; worktree: EphemeralWorktree }> {
    const worktree = await this.createWorktree(params);
    try {
      const result = await taskFn(worktree);
      const commitMessage = params.commitMessage || `feat(agent): cloud agent execution for run ${params.runId}`;
      const commitResult = this.commitChanges(worktree.worktreePath, commitMessage);
      return { result, commitResult, worktree };
    } finally {
      // Clean up physical worktree directory but keep the committed branch for review/PR
      await this.removeWorktree(worktree, false);
    }
  }
}
