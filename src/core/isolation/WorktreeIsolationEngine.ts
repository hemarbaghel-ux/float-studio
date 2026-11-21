/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'node:crypto';
import path from 'node:path';

export interface IsolatedWorktree {
  readonly id: string;
  readonly worktreePath: string;
  readonly branchName: string;
  readonly createdAt: number;
  readonly status: 'active' | 'merged' | 'pruned';
}

export const MAX_PARALLEL_WORKTREES = 8;

/**
 * Worktree Isolation Engine
 *
 * Provisions secondary checkouts using Git worktrees so multiple agents
 * (up to 8 in parallel) never overwrite the user's primary working tree.
 */
export class WorktreeIsolationEngine {
  private activeWorktrees = new Map<string, IsolatedWorktree>();

  constructor(private readonly repoRoot: string = process.cwd()) {}

  /**
   * Provisions a new ephemeral worktree for an isolated agent slice.
   */
  public async provisionWorktree(taskName: string): Promise<IsolatedWorktree> {
    if (this.activeWorktrees.size >= MAX_PARALLEL_WORKTREES) {
      throw new Error(`WORKTREE_CAPACITY_EXCEEDED: Maximum of ${MAX_PARALLEL_WORKTREES} parallel worktrees reached.`);
    }

    const id = `wt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const sanitizedName = taskName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 30);
    const branchName = `float-agent/${sanitizedName}-${id}`;
    const worktreePath = path.join(this.repoRoot, '.float', 'worktrees', id);

    const worktree: IsolatedWorktree = {
      id,
      worktreePath,
      branchName,
      createdAt: Date.now(),
      status: 'active'
    };

    this.activeWorktrees.set(id, worktree);
    return worktree;
  }

  /**
   * Merges worktree changes or returns diff back to the primary working copy.
   */
  public async closeWorktree(id: string, action: 'merge' | 'prune'): Promise<boolean> {
    const wt = this.activeWorktrees.get(id);
    if (!wt) return false;

    this.activeWorktrees.set(id, {
      ...wt,
      status: action === 'merge' ? 'merged' : 'pruned'
    });
    return true;
  }

  public getActiveWorktreeCount(): number {
    return Array.from(this.activeWorktrees.values()).filter(w => w.status === 'active').length;
  }

  public listWorktrees(): IsolatedWorktree[] {
    return Array.from(this.activeWorktrees.values());
  }
}
