/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'node:crypto';
import { WorktreeIsolationEngine } from '../isolation/WorktreeIsolationEngine';

export interface TaskSlice {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly assignedWorkerId?: string;
  readonly status: 'pending' | 'in_progress' | 'completed' | 'failed';
  readonly writeup?: string;
  readonly subSlices?: readonly TaskSlice[];
}

export interface WorkerReport {
  readonly workerId: string;
  readonly sliceId: string;
  readonly worktreePath: string;
  readonly summary: string;
  readonly filesChanged: readonly string[];
  readonly testsPassed: boolean;
}

export interface RootProjectGoal {
  readonly goalId: string;
  readonly title: string;
  readonly description: string;
  readonly slices: TaskSlice[];
  readonly status: 'planning' | 'executing' | 'review' | 'completed';
  readonly sharedMemory: Record<string, string>;
}

/**
 * Root Planner Coordinator (Hierarchical Multi-Agent Architecture)
 *
 * Implements Cursor's self-driving codebases architecture:
 * - The Root Planner owns the goal and does NOT write code.
 * - Recursively decomposes tasks into sub-planners and slices.
 * - Workers execute on their own isolated copies (worktree or VM).
 * - Workers do not talk to each other; they report structured write-ups to the Root Planner.
 * - Prevents the flat "everyone does everything" failure mode.
 */
export class RootPlannerCoordinator {
  private activeGoals = new Map<string, RootProjectGoal>();

  constructor(private readonly worktrees: WorktreeIsolationEngine = new WorktreeIsolationEngine()) {}

  /**
   * Initializes a high-level project goal. The Root Planner only coordinates.
   */
  public planGoal(title: string, description: string, initialSlices: Array<{ title: string; description: string }>): RootProjectGoal {
    const goalId = `goal_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const slices: TaskSlice[] = initialSlices.map(s => ({
      id: `slice_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      title: s.title,
      description: s.description,
      status: 'pending'
    }));

    const goal: RootProjectGoal = {
      goalId,
      title,
      description,
      slices,
      status: 'planning',
      sharedMemory: {
        architectureVision: description,
        createdAt: new Date().toISOString()
      }
    };

    this.activeGoals.set(goalId, goal);
    return goal;
  }

  /**
   * Recursively spawns a sub-planner for a slice.
   */
  public decomposeSlice(goalId: string, sliceId: string, subTasks: Array<{ title: string; description: string }>): boolean {
    const goal = this.activeGoals.get(goalId);
    if (!goal) return false;

    const slice = goal.slices.find(s => s.id === sliceId);
    if (!slice) return false;

    const subSlices: TaskSlice[] = subTasks.map(t => ({
      id: `slice_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      title: t.title,
      description: t.description,
      status: 'pending'
    }));

    (slice as any).subSlices = subSlices;
    return true;
  }

  /**
   * Assigns an isolated worktree to a worker for a slice.
   */
  public async dispatchWorker(goalId: string, sliceId: string): Promise<{ workerId: string; worktreePath: string }> {
    const goal = this.activeGoals.get(goalId);
    if (!goal) throw new Error(`GOAL_NOT_FOUND: Goal "${goalId}" does not exist.`);

    const slice = goal.slices.find(s => s.id === sliceId);
    if (!slice) throw new Error(`SLICE_NOT_FOUND: Slice "${sliceId}" not found in goal.`);

    const workerId = `worker_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const worktree = await this.worktrees.provisionWorktree(slice.title);

    (slice as any).assignedWorkerId = workerId;
    (slice as any).status = 'in_progress';

    return { workerId, worktreePath: worktree.worktreePath };
  }

  /**
   * Ingests a structured report from a worker upon slice conclusion.
   */
  public ingestWorkerReport(goalId: string, report: WorkerReport): boolean {
    const goal = this.activeGoals.get(goalId);
    if (!goal) return false;

    const slice = goal.slices.find(s => s.id === report.sliceId);
    if (!slice) return false;

    (slice as any).status = report.testsPassed ? 'completed' : 'failed';
    (slice as any).writeup = report.summary;

    goal.sharedMemory[`slice_result_${report.sliceId}`] = report.summary;

    const allDone = goal.slices.every(s => s.status === 'completed');
    if (allDone) {
      (goal as any).status = 'completed';
    }

    return true;
  }

  public getGoal(goalId: string): RootProjectGoal | undefined {
    return this.activeGoals.get(goalId);
  }
}
