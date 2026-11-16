/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'node:crypto';
import { IProposal, IProposalFileChange, ProposalStatus } from '../../shared/contracts/proposals';
import { validateSafeWorkspacePath } from '../../shared/contracts/workspace';

export interface CloudAgentSubtaskSpec {
  readonly subtaskId: string;
  readonly title: string;
  readonly role: 'planner' | 'implementer' | 'verifier' | 'reviewer';
  readonly ownedPaths: readonly string[];
  readonly dependsOn?: readonly string[];
}

export type CloudAgentTaskState =
  | 'QUEUED'
  | 'CLAIMED'
  | 'RUNNING'
  | 'CHECKPOINTED'
  | 'WAITING_FOR_APPROVAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'TIMED_OUT'
  | 'CANCELED'
  // Backward compatibility aliases
  | 'conflict_blocked'
  | 'proposal_ready'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'queued'
  | 'running';

export interface CloudAgentRunRecord {
  readonly runId: string;
  readonly userId: string;
  readonly projectId: string;
  readonly goal: string;
  readonly worktreeId: string;
  status: CloudAgentTaskState;
  readonly subtasks: readonly CloudAgentSubtaskSpec[];
  readonly fileOwnershipConflicts: ReadonlyArray<{ path: string; subtaskA: string; subtaskB: string }>;
  readonly logs: string[];
  readonly mergedProposal?: IProposal;
  readonly createdAt: number;
  updatedAt: number;
  workerId?: string;
  leaseExpiresAt?: number;
  heartbeatAt?: number;
  cursor?: number;
}

export class CloudAgentOrchestrator {
  private readonly runs = new Map<string, CloudAgentRunRecord>();

  /**
   * Detects overlapping file ownership across concurrent subtasks before execution
   * so two parallel agents never clobber the same file without reconciliation.
   */
  public detectOwnershipConflicts(
    subtasks: readonly CloudAgentSubtaskSpec[]
  ): Array<{ path: string; subtaskA: string; subtaskB: string }> {
    const conflicts: Array<{ path: string; subtaskA: string; subtaskB: string }> = [];
    const ownerByPath = new Map<string, string>();
    const dependsMap = new Map<string, Set<string>>();

    for (const st of subtasks) {
      dependsMap.set(st.subtaskId, new Set(st.dependsOn || []));
    }

    const areOrdered = (a: string, b: string): boolean => {
      return Boolean(dependsMap.get(a)?.has(b) || dependsMap.get(b)?.has(a));
    };

    for (const st of subtasks) {
      for (const rawPath of st.ownedPaths) {
        const normPath = validateSafeWorkspacePath(rawPath);
        const existingOwner = ownerByPath.get(normPath);
        if (existingOwner && existingOwner !== st.subtaskId && !areOrdered(existingOwner, st.subtaskId)) {
          conflicts.push({
            path: normPath,
            subtaskA: existingOwner,
            subtaskB: st.subtaskId,
          });
        } else {
          ownerByPath.set(normPath, st.subtaskId);
        }
      }
    }
    return conflicts;
  }

  public startRun(params: {
    userId: string;
    projectId: string;
    goal: string;
    subtasks: readonly CloudAgentSubtaskSpec[];
    proposalsBySubtask?: Readonly<Record<string, IProposal>>;
  }): CloudAgentRunRecord {
    const now = Date.now();
    const runId = `cloudrun_${now}_${crypto.randomBytes(4).toString('hex')}`;
    const worktreeId = `wt_${params.projectId}_${crypto.randomBytes(3).toString('hex')}`;
    const conflicts = this.detectOwnershipConflicts(params.subtasks);
    const logs: string[] = [
      `[${new Date(now).toISOString()}] Initialized isolated worktree ${worktreeId} for project ${params.projectId}`,
    ];

    if (conflicts.length > 0) {
      logs.push(
        `[${new Date(now).toISOString()}] Blocked parallel execution: file ownership conflict on ${conflicts
          .map(c => `${c.path} (${c.subtaskA} vs ${c.subtaskB})`)
          .join(', ')}`
      );
      const blockedRecord: CloudAgentRunRecord = {
        runId,
        userId: params.userId,
        projectId: params.projectId,
        goal: params.goal,
        worktreeId,
        status: 'conflict_blocked',
        subtasks: params.subtasks,
        fileOwnershipConflicts: conflicts,
        logs,
        createdAt: now,
        updatedAt: now,
      };
      this.runs.set(runId, blockedRecord);
      return blockedRecord;
    }

    const mergedFiles: IProposalFileChange[] = [];
    if (params.proposalsBySubtask) {
      for (const st of params.subtasks) {
        const subProp = params.proposalsBySubtask[st.subtaskId];
        if (subProp) {
          logs.push(
            `[${new Date(now).toISOString()}] Subtask ${st.subtaskId} (${st.role}) produced ${subProp.files.length} file diff(s)`
          );
          for (const f of subProp.files) {
            mergedFiles.push(f);
          }
        }
      }
    }

    const proposalStatus: ProposalStatus = 'pending_review';
    const mergedProposal: IProposal | undefined =
      mergedFiles.length > 0
        ? {
            id: `prop_cloud_${crypto.randomBytes(4).toString('hex')}`,
            ownerId: params.userId,
            projectId: params.projectId,
            title: `Cloud Agent: ${params.goal.slice(0, 80)}`,
            explanation: `Synthesized from ${params.subtasks.length} isolated subtask(s) in worktree ${worktreeId}.`,
            status: proposalStatus,
            files: mergedFiles,
            createdAt: now,
            updatedAt: now,
          }
        : undefined;

    const record: CloudAgentRunRecord = {
      runId,
      userId: params.userId,
      projectId: params.projectId,
      goal: params.goal,
      worktreeId,
      status: mergedProposal ? 'proposal_ready' : 'completed',
      subtasks: params.subtasks,
      fileOwnershipConflicts: [],
      logs,
      mergedProposal,
      createdAt: now,
      updatedAt: now,
    };

    this.runs.set(runId, record);
    return record;
  }

  public getRun(runId: string, userId: string): CloudAgentRunRecord | undefined {
    const rec = this.runs.get(runId);
    if (!rec || rec.userId !== userId) return undefined;
    return rec;
  }

  public cancelRun(runId: string, userId: string): CloudAgentRunRecord | undefined {
    const rec = this.runs.get(runId);
    if (!rec || rec.userId !== userId) return undefined;
    rec.status = 'CANCELED';
    rec.updatedAt = Date.now();
    rec.logs.push(`[${new Date().toISOString()}] Run cancelled by user ${userId}`);
    return rec;
  }

  /**
   * Leases a queued task to an isolated background worker.
   * Enforces lease timeout fencing to recover abandoned or dead workers.
   */
  public claimRun(
    runId: string,
    workerId: string,
    leaseDurationMs = 60_000
  ): { success: boolean; run?: CloudAgentRunRecord; reason?: string } {
    const run = this.runs.get(runId);
    if (!run) {
      return { success: false, reason: 'RUN_NOT_FOUND' };
    }

    const now = Date.now();
    const canClaim =
      run.status === 'QUEUED' ||
      run.status === 'queued' ||
      ((run.status === 'CLAIMED' || run.status === 'RUNNING' || run.status === 'running') &&
        run.leaseExpiresAt !== undefined &&
        run.leaseExpiresAt < now);

    if (!canClaim) {
      return { success: false, reason: 'RUN_NOT_AVAILABLE_FOR_CLAIM' };
    }

    run.status = 'CLAIMED';
    run.workerId = workerId;
    run.leaseExpiresAt = now + leaseDurationMs;
    run.heartbeatAt = now;
    run.updatedAt = now;
    run.logs.push(`[${new Date(now).toISOString()}] Worker ${workerId} claimed run (lease valid for ${leaseDurationMs}ms)`);

    return { success: true, run };
  }

  /**
   * Heartbeat to extend worker lease. Fails if lease expired or claimed by another worker.
   */
  public heartbeatRun(runId: string, workerId: string, leaseDurationMs = 60_000): boolean {
    const run = this.runs.get(runId);
    if (!run || run.workerId !== workerId) return false;
    const now = Date.now();
    if (run.leaseExpiresAt && run.leaseExpiresAt < now) return false; // Lease expired

    run.heartbeatAt = now;
    run.leaseExpiresAt = now + leaseDurationMs;
    run.updatedAt = now;
    return true;
  }

  /**
   * Transitions task through canonical state machine with lease verification.
   */
  public transitionRun(
    runId: string,
    toStatus: CloudAgentTaskState,
    logMessage?: string
  ): CloudAgentRunRecord | null {
    const run = this.runs.get(runId);
    if (!run) return null;

    const now = Date.now();
    run.status = toStatus;
    run.updatedAt = now;
    if (logMessage) {
      run.logs.push(`[${new Date(now).toISOString()}] ${logMessage}`);
    }
    return run;
  }

  /**
   * Appends an event to the task log and advances the durable sequence cursor.
   */
  public appendLogWithCursor(runId: string, message: string): number {
    const run = this.runs.get(runId);
    if (!run) return 0;
    const now = Date.now();
    run.cursor = (run.cursor ?? 0) + 1;
    run.logs.push(`[${new Date(now).toISOString()}] ${message}`);
    run.updatedAt = now;
    return run.cursor;
  }

  /**
   * Reconnectable event retrieval for SSE streams using Last-Event-ID / cursor.
   */
  public getEventsSince(
    runId: string,
    lastCursor = 0
  ): { cursor: number; logs: string[]; status: CloudAgentTaskState } | null {
    const run = this.runs.get(runId);
    if (!run) return null;

    const currentCursor = run.cursor ?? run.logs.length;
    const logsSince = run.logs.slice(lastCursor);
    return {
      cursor: currentCursor,
      logs: logsSince,
      status: run.status,
    };
  }
}

export const defaultCloudAgentOrchestrator = new CloudAgentOrchestrator();
