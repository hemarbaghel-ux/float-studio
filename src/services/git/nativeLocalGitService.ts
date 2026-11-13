/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scanFileForSecrets, SecretLeakMatch } from './secretScanner';
import { SecretLeakError, CommitResult } from './gitService';
import { validateSafeWorkspacePath } from '../../shared/contracts/workspace';

export interface NativeGitStatusEntry {
  readonly path: string;
  readonly indexStatus: string;
  readonly worktreeStatus: string;
  readonly staged: boolean;
  readonly conflict: boolean;
}

export interface NativeGitStatus {
  readonly branch: string;
  readonly clean: boolean;
  readonly entries: readonly NativeGitStatusEntry[];
  readonly conflicts: readonly string[];
}

const PROTECTED_BRANCHES = new Set(['main', 'master', 'production', 'release']);

function runGit(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = stderr?.trim() || err.message;
        reject(new Error(`git ${args[0]} failed: ${msg}`));
      } else {
        resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
      }
    });
  });
}

/**
 * Real Native Local Git Service (Stage 5)
 *
 * Executes actual `git` CLI operations against a local filesystem repository.
 * Enforces path validation, pre-commit secret scanning, conflict detection,
 * and protected-branch push guards.
 */
export class NativeLocalGitService {
  constructor(private readonly repoRoot: string) {}

  async isGitRepository(): Promise<boolean> {
    try {
      const { stdout } = await runGit(this.repoRoot, ['rev-parse', '--is-inside-work-tree']);
      return stdout.trim() === 'true';
    } catch {
      return false;
    }
  }

  async init(initialBranch = 'main'): Promise<void> {
    await runGit(this.repoRoot, ['init', '-b', initialBranch]);
  }

  async getStatus(): Promise<NativeGitStatus> {
    const branchRes = await runGit(this.repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => ({ stdout: 'HEAD', stderr: '' }));
    const branch = branchRes.stdout.trim() || 'HEAD';
    const { stdout } = await runGit(this.repoRoot, ['status', '--porcelain=v1']);
    const entries: NativeGitStatusEntry[] = [];
    const conflicts: string[] = [];

    for (const rawLine of stdout.split(/\r?\n/)) {
      if (!rawLine || rawLine.length < 4) continue;
      const x = rawLine[0];
      const y = rawLine[1];
      const filePath = rawLine.slice(3).trim();
      const isConflict = x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D');
      if (isConflict) conflicts.push(filePath);
      entries.push({
        path: filePath,
        indexStatus: x,
        worktreeStatus: y,
        staged: x !== ' ' && x !== '?',
        conflict: isConflict,
      });
    }

    return {
      branch,
      clean: entries.length === 0,
      entries,
      conflicts,
    };
  }

  async getDiff(options: { staged?: boolean; filePath?: string } = {}): Promise<string> {
    const args = ['diff'];
    if (options.staged) args.push('--staged');
    if (options.filePath) {
      const safePath = validateSafeWorkspacePath(options.filePath);
      args.push('--', safePath);
    }
    const { stdout } = await runGit(this.repoRoot, args);
    return stdout;
  }

  async stageFiles(paths: readonly string[]): Promise<void> {
    if (paths.length === 0) return;
    const safePaths = paths.map(p => validateSafeWorkspacePath(p));
    await runGit(this.repoRoot, ['add', '--', ...safePaths]);
  }

  async unstageFiles(paths: readonly string[]): Promise<void> {
    if (paths.length === 0) return;
    const safePaths = paths.map(p => validateSafeWorkspacePath(p));
    try {
      await runGit(this.repoRoot, ['restore', '--staged', '--', ...safePaths]);
    } catch {
      await runGit(this.repoRoot, ['reset', 'HEAD', '--', ...safePaths]);
    }
  }

  async createBranch(branchName: string, checkout = true): Promise<void> {
    const clean = branchName.trim();
    if (!clean || clean.includes('..') || /\s/.test(clean)) {
      throw new Error(`Invalid Git branch name: "${branchName}"`);
    }
    if (checkout) {
      await runGit(this.repoRoot, ['checkout', '-b', clean]);
    } else {
      await runGit(this.repoRoot, ['branch', clean]);
    }
  }

  async switchBranch(branchName: string): Promise<void> {
    const clean = branchName.trim();
    if (!clean || clean.includes('..') || /\s/.test(clean)) {
      throw new Error(`Invalid Git branch name: "${branchName}"`);
    }
    await runGit(this.repoRoot, ['checkout', clean]);
  }

  async listBranches(): Promise<{ current: string; branches: string[] }> {
    const { stdout } = await runGit(this.repoRoot, ['branch', '--list']);
    let current = 'main';
    const branches: string[] = [];
    for (const line of stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('* ')) {
        const name = trimmed.slice(2).trim();
        current = name;
        branches.push(name);
      } else {
        branches.push(trimmed);
      }
    }
    return { current, branches };
  }

  async commitStaged(options: {
    message: string;
    authorName?: string;
    authorEmail?: string;
    allowProtectedBranch?: boolean;
  }): Promise<CommitResult> {
    const msg = options.message.trim();
    if (!msg) throw new Error('Commit message cannot be empty.');

    const status = await this.getStatus();
    if (status.conflicts.length > 0) {
      throw new Error(`Cannot commit while merge conflicts exist in: ${status.conflicts.join(', ')}`);
    }

    const stagedEntries = status.entries.filter(e => e.staged);
    if (stagedEntries.length === 0) {
      throw new Error('No staged changes to commit.');
    }

    // Pre-commit secret scan across all staged files
    const leaks: SecretLeakMatch[] = [];
    for (const entry of stagedEntries) {
      if (entry.indexStatus === 'D') continue;
      const fullPath = path.join(this.repoRoot, entry.path);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const content = fs.readFileSync(fullPath, 'utf8');
        leaks.push(...scanFileForSecrets(entry.path, content));
      }
    }
    if (leaks.length > 0) {
      throw new SecretLeakError(leaks);
    }

    const args: string[] = [];
    if (options.authorName) args.push('-c', `user.name=${options.authorName}`);
    if (options.authorEmail) args.push('-c', `user.email=${options.authorEmail}`);
    args.push('commit', '-m', msg);

    await runGit(this.repoRoot, args);
    const { stdout: shaOut } = await runGit(this.repoRoot, ['rev-parse', '--short', 'HEAD']);

    return {
      sha: shaOut.trim(),
      message: msg,
      timestamp: Date.now(),
      filesCommitted: stagedEntries.map(e => e.path),
    };
  }

  validateRemotePushTarget(branchName: string, explicitUserApproval = false): void {
    if (!explicitUserApproval) {
      throw new Error('Remote Git push requires explicit human approval.');
    }
    if (PROTECTED_BRANCHES.has(branchName.trim().toLowerCase())) {
      throw new Error(`Direct push to protected branch "${branchName}" is blocked. Push to a feature branch and open a Pull Request.`);
    }
  }
}
