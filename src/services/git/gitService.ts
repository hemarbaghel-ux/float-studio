/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { scanChangesForSecrets, SecretLeakMatch } from './secretScanner';
import { generateUnifiedDiff, computeDiffStats, DiffStats } from '../../shared/contracts/proposals';

export interface GitFileStatus {
  readonly path: string;
  readonly status: 'added' | 'modified' | 'deleted' | 'untracked';
  readonly diffStats?: DiffStats;
}

export interface GitRepoStatus {
  readonly branch: string;
  readonly defaultBranch: string;
  readonly clean: boolean;
  readonly changes: readonly GitFileStatus[];
  readonly ahead: number;
  readonly behind: number;
}

export interface CreateCommitOptions {
  readonly message: string;
  readonly files: Map<string, string>; // staged path -> content
  readonly authorName?: string;
  readonly authorEmail?: string;
  readonly bypassSecretScan?: boolean;
}

export interface CommitResult {
  readonly sha: string;
  readonly message: string;
  readonly timestamp: number;
  readonly filesCommitted: readonly string[];
}

export interface CreatePullRequestOptions {
  readonly title: string;
  readonly body: string;
  readonly head: string;
  readonly base: string;
  readonly draft?: boolean;
}

export interface PullRequestResult {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: 'open' | 'closed' | 'merged';
  readonly draft: boolean;
}

export class SecretLeakError extends Error {
  constructor(public readonly leaks: readonly SecretLeakMatch[]) {
    super(`Pre-commit secret scan failed: detected ${leaks.length} credential leak(s).`);
    this.name = 'SecretLeakError';
  }
}

/**
 * Generates a conventional commit message from a unified diff patch.
 */
export function generateCommitMessageFromDiff(diff: string, defaultMessage = 'feat: update project files'): string {
  if (!diff || diff.trim().length === 0) return defaultMessage;

  const lines = diff.split('\n');
  const addedFiles: string[] = [];
  const modifiedFiles: string[] = [];
  const deletedFiles: string[] = [];

  for (const line of lines) {
    if (line.startsWith('+++ b/')) {
      const filePath = line.slice(6).trim();
      modifiedFiles.push(filePath);
    }
  }

  const primaryFile = modifiedFiles[0] || '';
  const baseName = primaryFile.split('/').pop() || '';

  if (diff.includes('test') || primaryFile.includes('test')) {
    return `test: update test assertions in ${baseName || 'project'}`;
  }
  if (diff.includes('fix') || diff.includes('error') || diff.includes('bug')) {
    return `fix: resolve issue in ${baseName || 'components'}`;
  }
  if (modifiedFiles.length === 1 && baseName) {
    return `feat: update ${baseName}`;
  }
  if (modifiedFiles.length > 1) {
    return `feat: update ${modifiedFiles.length} files across project`;
  }

  return defaultMessage;
}

/**
 * Local / In-Memory Git Service implementation with pre-commit secret scanning.
 */
export class LocalGitService {
  private currentBranch = 'main';
  private branches = new Set<string>(['main']);
  private commitHistory: CommitResult[] = [];
  private baseSnapshots = new Map<string, string>(); // path -> content

  constructor(initialFiles: Map<string, string> = new Map()) {
    for (const [p, c] of initialFiles.entries()) {
      this.baseSnapshots.set(p, c);
    }
  }

  getStatus(workingFiles: Map<string, string>): GitRepoStatus {
    const changes: GitFileStatus[] = [];

    // Check modified and deleted
    for (const [path, baseContent] of this.baseSnapshots.entries()) {
      if (!workingFiles.has(path)) {
        changes.push({
          path,
          status: 'deleted',
          diffStats: computeDiffStats(baseContent, ''),
        });
      } else {
        const currentContent = workingFiles.get(path)!;
        if (currentContent !== baseContent) {
          changes.push({
            path,
            status: 'modified',
            diffStats: computeDiffStats(baseContent, currentContent),
          });
        }
      }
    }

    // Check added
    for (const [path, currentContent] of workingFiles.entries()) {
      if (!this.baseSnapshots.has(path)) {
        changes.push({
          path,
          status: 'added',
          diffStats: computeDiffStats('', currentContent),
        });
      }
    }

    return {
      branch: this.currentBranch,
      defaultBranch: 'main',
      clean: changes.length === 0,
      changes,
      ahead: this.commitHistory.length,
      behind: 0,
    };
  }

  getDiff(path: string, workingFiles: Map<string, string>): string {
    const base = this.baseSnapshots.get(path) || '';
    const current = workingFiles.get(path) || '';
    return generateUnifiedDiff(path, base, current);
  }

  createCommit(options: CreateCommitOptions): CommitResult {
    const message = options.message.trim();
    if (!message) {
      throw new Error('Commit message cannot be empty.');
    }

    // Pre-commit secret scanning
    if (!options.bypassSecretScan) {
      const leaks = scanChangesForSecrets(options.files);
      if (leaks.length > 0) {
        throw new SecretLeakError(leaks);
      }
    }

    const filesCommitted: string[] = [];
    for (const [path, content] of options.files.entries()) {
      this.baseSnapshots.set(path, content);
      filesCommitted.push(path);
    }

    const sha = Math.random().toString(16).substring(2, 10) + Math.random().toString(16).substring(2, 10);
    const result: CommitResult = {
      sha,
      message,
      timestamp: Date.now(),
      filesCommitted,
    };

    this.commitHistory.unshift(result);
    return result;
  }

  createBranch(name: string): void {
    const cleanName = name.trim();
    if (!cleanName || cleanName.includes('..') || cleanName.includes(' ')) {
      throw new Error(`Invalid branch name: "${name}"`);
    }
    if (this.branches.has(cleanName)) {
      throw new Error(`Branch "${cleanName}" already exists.`);
    }
    this.branches.add(cleanName);
    this.currentBranch = cleanName;
  }

  switchBranch(name: string): void {
    const cleanName = name.trim();
    if (!this.branches.has(cleanName)) {
      throw new Error(`Branch "${cleanName}" not found.`);
    }
    this.currentBranch = cleanName;
  }

  listBranches(): string[] {
    return Array.from(this.branches);
  }

  getCommitHistory(): readonly CommitResult[] {
    return this.commitHistory;
  }
}
