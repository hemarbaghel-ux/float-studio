/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'crypto';
import express, { Router } from 'express';
import { requireAuth } from '../authMiddleware';
import { verifyProjectOwnership } from '../projectOwnership';
import { ModelRouter } from '../providers/router';
import {
  ComposerAgent,
  ComposerExecutionResult,
  ComposerMode,
  ComposerProgressEvent,
} from '../../services/composer/composerAgent';
import { createStandardToolRegistry } from '../../services/composer/canonicalTools';
import { WorkspaceCheckpointManager } from '../../services/composer/checkpointManager';
import { applyProposal, rejectProposal, rollbackProposal } from '../../services/composer/proposalApplier';
import {
  IFileEntry,
  IFileStat,
  IWorkspaceCapabilities,
  IWorkspaceService,
  ListFilesOptions,
  validateSafeWorkspacePath,
} from '../../shared/contracts/workspace';
import { IProposal } from '../../shared/contracts/proposals';
import { WorkspaceIndex } from '../../services/indexing/workspaceIndex';
import { RulesService } from '../rules/rulesService';
import { SkillsService } from '../skills/skillsService';
import { LocalFileSystemWorkspaceService } from '../../services/indexing/localWorkspaceService';

export class VirtualProjectWorkspaceService implements IWorkspaceService {
  private readonly files = new Map<string, string>();
  public readonly index = new WorkspaceIndex();

  constructor(
    private readonly projectId: string,
    initialFiles: Array<{ path?: string; name?: string; content?: string }> = []
  ) {
    for (const f of initialFiles) {
      const rawPath = (f.path || f.name || '').trim().replace(/^\/+/, '');
      if (!rawPath) continue;
      try {
        const safe = validateSafeWorkspacePath(rawPath);
        const content = typeof f.content === 'string' ? f.content : '';
        this.files.set(safe, content);
      } catch {
        // Skip invalid/sensitive paths
      }
    }
    this.rebuildIndex();
  }

  private rebuildIndex(): void {
    const entries = Array.from(this.files.entries()).map(([p, content]) => ({
      id: p,
      name: p.split('/').pop() || p,
      path: p,
      type: 'file' as const,
      content,
    }));
    this.index.indexProject(entries);
  }

  getRootUri(): string {
    return `float-workspace://${this.projectId}`;
  }

  getCapabilities(): IWorkspaceCapabilities {
    return {
      isLocalDisk: false,
      canWrite: true,
      canExecuteCommands: false,
      canWatchFiles: false,
    };
  }

  async listFiles(options?: ListFilesOptions): Promise<readonly IFileEntry[]> {
    const maxFiles = options?.maxFiles ?? 500;
    const entries: IFileEntry[] = [];
    for (const [p, content] of this.files.entries()) {
      entries.push({
        path: p,
        name: p.split('/').pop() || p,
        type: 'file',
        size: Buffer.byteLength(content, 'utf8'),
        lastModified: Date.now(),
      });
      if (entries.length >= maxFiles) break;
    }
    return entries;
  }

  async readFile(path: string): Promise<string> {
    const safe = validateSafeWorkspacePath(path);
    if (!this.files.has(safe)) {
      throw new Error(`File not found in workspace: "${safe}"`);
    }
    return this.files.get(safe)!;
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (path.startsWith('.float/checkpoints/')) {
      this.files.set(path, content);
      return;
    }
    const safe = validateSafeWorkspacePath(path);
    this.files.set(safe, content);
    this.index.updateFile(safe, content);
  }

  async deleteFile(path: string): Promise<void> {
    const safe = validateSafeWorkspacePath(path);
    this.files.delete(safe);
    this.index.removeFile(safe);
  }

  async fileExists(path: string): Promise<boolean> {
    if (path.startsWith('.float/checkpoints/')) {
      return this.files.has(path);
    }
    const safe = validateSafeWorkspacePath(path);
    return this.files.has(safe);
  }

  async stat(path: string): Promise<IFileStat> {
    const safe = validateSafeWorkspacePath(path);
    const content = this.files.get(safe);
    if (content === undefined) {
      throw new Error(`File not found: "${safe}"`);
    }
    return {
      size: Buffer.byteLength(content, 'utf8'),
      lastModified: Date.now(),
      isFile: true,
      isDirectory: false,
    };
  }

  exportFiles(): Array<{ path: string; content: string }> {
    return Array.from(this.files.entries())
      .filter(([p]) => !p.startsWith('.float/'))
      .map(([path, content]) => ({ path, content }));
  }
}

export interface StoredComposerTask {
  readonly taskId: string;
  readonly idempotencyKey?: string;
  readonly ownerId: string;
  readonly projectId: string;
  readonly task: string;
  readonly mode: ComposerMode;
  readonly modelId: string;
  status: 'running' | 'completed' | 'plan_ready' | 'proposal_ready' | 'verified' | 'cancelled' | 'budget_exceeded' | 'error';
  readonly createdAt: number;
  updatedAt: number;
  readonly events: ComposerProgressEvent[];
  readonly activeRules: string[];
  readonly activeSkills: string[];
  result?: ComposerExecutionResult;
  proposal?: IProposal;
  checkpointId?: string;
  workspace: IWorkspaceService;
  checkpointManager: WorkspaceCheckpointManager;
  abortController: AbortController;
}

const tasksById = new Map<string, StoredComposerTask>();
const taskByIdempotencyKey = new Map<string, string>();
const proposalsById = new Map<string, { proposal: IProposal; taskId: string; ownerId: string; projectId: string }>();
const checkpointsById = new Map<string, { checkpointId: string; taskId: string; ownerId: string; projectId: string }>();

export function clearComposerTaskStoreForTests(): void {
  tasksById.clear();
  taskByIdempotencyKey.clear();
  proposalsById.clear();
  checkpointsById.clear();
}

export function createComposerRouter(modelRouter: ModelRouter): Router {
  const router = Router({ mergeParams: true });

  // 1. Run Composer Agent (Ask, Plan, Agent, Debug) with SSE progress events & idempotency
  router.post('/run', requireAuth, express.json({ limit: '24mb' }), async (req: any, res: any) => {
    const { projectId } = req.params;
    const userId = req.user.uid;
    const {
      task,
      prompt,
      mode = 'agent',
      model = 'gpt-6.1-sol',
      idempotencyKey,
      files = [],
      localWorkspacePath,
      maxIterations,
      timeoutMs,
      maxTokens,
      allowedCommands,
      autoApplyApprovedProposal = false,
      verificationCommand,
      repairOnVerificationFailure = true,
      stream = false,
    } = req.body || {};

    const taskText = String(task || prompt || '').trim();
    if (!taskText) {
      return res.status(400).json({ error: 'Task description is required.' });
    }

    const validModes: ComposerMode[] = ['ask', 'plan', 'agent', 'debug'];
    const effectiveMode: ComposerMode = validModes.includes(mode) ? mode : 'agent';

    const ownership = await verifyProjectOwnership(projectId, userId, { allowMissing: true });
    if (!ownership.allowed) {
      return res.status(ownership.status).json({ error: ownership.error });
    }

    // Check idempotency key for duplicate submissions
    if (typeof idempotencyKey === 'string' && idempotencyKey.trim()) {
      const scopedKey = `${userId}:${projectId}:${idempotencyKey.trim()}`;
      const existingTaskId = taskByIdempotencyKey.get(scopedKey);
      if (existingTaskId) {
        const existingTask = tasksById.get(existingTaskId);
        if (existingTask && existingTask.ownerId === userId && existingTask.projectId === projectId) {
          return res.json({
            taskId: existingTask.taskId,
            idempotentReplay: true,
            status: existingTask.status,
            mode: existingTask.mode,
            modelId: existingTask.modelId,
            events: existingTask.events,
            result: existingTask.result,
            proposal: existingTask.proposal,
            checkpointId: existingTask.checkpointId,
            activeRules: existingTask.activeRules,
            activeSkills: existingTask.activeSkills,
          });
        }
      }
    }

    // Resolve workspace (local filesystem in desktop/test when explicitly provided and exists, else virtual project workspace)
    let workspace: IWorkspaceService;
    if (typeof localWorkspacePath === 'string' && localWorkspacePath.trim()) {
      const localWs = new LocalFileSystemWorkspaceService(localWorkspacePath.trim());
      await localWs.initializeIndex();
      workspace = localWs;
    } else {
      let initialFiles: Array<{ path?: string; name?: string; content?: string }> = Array.isArray(files) ? files : [];
      if (initialFiles.length === 0 && ownership.projectData?.files) {
        try {
          const parsed = typeof ownership.projectData.files === 'string'
            ? JSON.parse(ownership.projectData.files)
            : ownership.projectData.files;
          if (Array.isArray(parsed)) initialFiles = parsed;
        } catch {}
      }
      workspace = new VirtualProjectWorkspaceService(projectId, initialFiles);
    }

    const checkpointManager = new WorkspaceCheckpointManager(workspace);
    const toolRegistry = createStandardToolRegistry();

    // Resolve active Rules and Skills for this request
    const effectiveRules = RulesService.getEffectiveRules({
      userId,
      projectId,
      files: Array.isArray(files) ? files : [],
    });
    const effectiveSkills = await SkillsService.selectRelevantSkillsDurable(taskText, 2, userId, projectId);
    const rulesPrompt = RulesService.formatRulesPrompt(effectiveRules);
    const skillsPrompt = SkillsService.formatSkillsPrompt(effectiveSkills);
    const activeRulesInstruction = [rulesPrompt, skillsPrompt].filter(Boolean).join('\n\n');

    const taskId = `task_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const abortController = new AbortController();

    const storedTask: StoredComposerTask = {
      taskId,
      idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey.trim() : undefined,
      ownerId: userId,
      projectId,
      task: taskText,
      mode: effectiveMode,
      modelId: model,
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      events: [],
      activeRules: effectiveRules.map(r => r.name),
      activeSkills: effectiveSkills.map(s => s.name),
      workspace,
      checkpointManager,
      abortController,
    };

    tasksById.set(taskId, storedTask);
    if (storedTask.idempotencyKey) {
      taskByIdempotencyKey.set(`${userId}:${projectId}:${storedTask.idempotencyKey}`, taskId);
    }

    const isSse = stream === true || req.headers.accept?.includes('text/event-stream');
    if (isSse) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      res.on('close', () => {
        if (!res.writableEnded && storedTask.status === 'running') {
          abortController.abort();
        }
      });
    }

    const agent = new ComposerAgent(modelRouter, toolRegistry, workspace, checkpointManager);

    const execResult = await agent.run({
      task: taskText,
      userId,
      projectId,
      taskId,
      mode: effectiveMode,
      modelId: model,
      maxIterations,
      timeoutMs,
      maxTokens,
      signal: abortController.signal,
      allowedCommands,
      autoApplyApprovedProposal,
      verificationCommand,
      repairOnVerificationFailure,
      activeRulesInstruction: activeRulesInstruction || undefined,
      onProgress: (event: ComposerProgressEvent) => {
        storedTask.events.push(event);
        storedTask.updatedAt = Date.now();
        if (isSse && !res.writableEnded) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      },
    });

    storedTask.status = execResult.status;
    storedTask.result = execResult;
    storedTask.proposal = execResult.repairProposal || execResult.proposal;
    storedTask.checkpointId = execResult.checkpointId;
    storedTask.updatedAt = Date.now();

    if (storedTask.proposal) {
      proposalsById.set(storedTask.proposal.id, {
        proposal: storedTask.proposal,
        taskId,
        ownerId: userId,
        projectId,
      });
    }
    if (storedTask.checkpointId) {
      checkpointsById.set(storedTask.checkpointId, {
        checkpointId: storedTask.checkpointId,
        taskId,
        ownerId: userId,
        projectId,
      });
    }

    if (isSse) {
      if (!res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({
            type: 'done',
            taskId,
            status: execResult.status,
            mode: effectiveMode,
            modelId: model,
            proposal: storedTask.proposal,
            checkpointId: storedTask.checkpointId,
            activeRules: storedTask.activeRules,
            activeSkills: storedTask.activeSkills,
            text: execResult.finalResponse || '',
          })}\n\n`
        );
        res.end();
      }
      return;
    }

    return res.json({
      taskId,
      status: execResult.status,
      mode: effectiveMode,
      modelId: model,
      events: storedTask.events,
      result: execResult,
      proposal: storedTask.proposal,
      checkpointId: storedTask.checkpointId,
      activeRules: storedTask.activeRules,
      activeSkills: storedTask.activeSkills,
    });
  });

  // 2. Get Composer Task Status & Event Stream History (Reconnect / Refresh Resilience)
  router.get('/tasks/:taskId', requireAuth, async (req: any, res: any) => {
    const { projectId, taskId } = req.params;
    const userId = req.user.uid;

    const ownership = await verifyProjectOwnership(projectId, userId, { allowMissing: true });
    if (!ownership.allowed) {
      return res.status(ownership.status).json({ error: ownership.error });
    }

    const storedTask = tasksById.get(taskId);
    if (!storedTask || storedTask.projectId !== projectId) {
      return res.status(404).json({ error: `Composer task "${taskId}" not found.` });
    }
    if (storedTask.ownerId !== userId) {
      return res.status(403).json({ error: 'Permission denied for this Composer task.' });
    }

    return res.json({
      taskId: storedTask.taskId,
      status: storedTask.status,
      mode: storedTask.mode,
      modelId: storedTask.modelId,
      createdAt: storedTask.createdAt,
      updatedAt: storedTask.updatedAt,
      events: storedTask.events,
      result: storedTask.result,
      proposal: storedTask.proposal,
      checkpointId: storedTask.checkpointId,
      activeRules: storedTask.activeRules,
      activeSkills: storedTask.activeSkills,
    });
  });

  // 3. Cancel In-Flight Composer Task
  router.post('/tasks/:taskId/cancel', requireAuth, async (req: any, res: any) => {
    const { projectId, taskId } = req.params;
    const userId = req.user.uid;

    const storedTask = tasksById.get(taskId);
    if (!storedTask || storedTask.projectId !== projectId) {
      return res.status(404).json({ error: `Composer task "${taskId}" not found.` });
    }
    if (storedTask.ownerId !== userId) {
      return res.status(403).json({ error: 'Permission denied for this Composer task.' });
    }

    storedTask.abortController.abort();
    storedTask.status = 'cancelled';
    storedTask.updatedAt = Date.now();
    return res.json({ cancelled: true, taskId, status: storedTask.status });
  });

  // 4. Apply Proposal with Automatic Pre-Apply Checkpoint & Conflict Detection
  router.post('/proposals/:proposalId/apply', requireAuth, express.json({ limit: '12mb' }), async (req: any, res: any) => {
    const { projectId, proposalId } = req.params;
    const userId = req.user.uid;
    const { approvedPaths, force = false } = req.body || {};

    const entry = proposalsById.get(proposalId);
    if (!entry || entry.projectId !== projectId) {
      return res.status(404).json({ error: `Composer proposal "${proposalId}" not found.` });
    }
    if (entry.ownerId !== userId) {
      return res.status(403).json({ error: 'Permission denied for this Composer proposal.' });
    }

    const storedTask = tasksById.get(entry.taskId);
    if (!storedTask) {
      return res.status(404).json({ error: 'Parent Composer task workspace is no longer available.' });
    }

    const applyResult = await applyProposal({
      proposal: entry.proposal,
      approvedPaths: Array.isArray(approvedPaths) ? approvedPaths : undefined,
      workspace: storedTask.workspace,
      checkpointManager: storedTask.checkpointManager,
      force: Boolean(force),
    });

    if (!applyResult.success) {
      return res.status(applyResult.status === 'stale' ? 409 : 400).json(applyResult);
    }

    if (applyResult.checkpointId) {
      storedTask.checkpointId = applyResult.checkpointId;
      checkpointsById.set(applyResult.checkpointId, {
        checkpointId: applyResult.checkpointId,
        taskId: storedTask.taskId,
        ownerId: userId,
        projectId,
      });
    }

    const updatedFiles =
      storedTask.workspace instanceof VirtualProjectWorkspaceService
        ? storedTask.workspace.exportFiles()
        : undefined;

    return res.json({
      ...applyResult,
      updatedWorkspaceFiles: updatedFiles,
    });
  });

  // 5. Reject Proposal Without Mutating Workspace
  router.post('/proposals/:proposalId/reject', requireAuth, express.json(), async (req: any, res: any) => {
    const { projectId, proposalId } = req.params;
    const userId = req.user.uid;
    const { rejectedPaths } = req.body || {};

    const entry = proposalsById.get(proposalId);
    if (!entry || entry.projectId !== projectId) {
      return res.status(404).json({ error: `Composer proposal "${proposalId}" not found.` });
    }
    if (entry.ownerId !== userId) {
      return res.status(403).json({ error: 'Permission denied for this Composer proposal.' });
    }

    const updatedProposal = rejectProposal({
      proposal: entry.proposal,
      rejectedPaths: Array.isArray(rejectedPaths) ? rejectedPaths : undefined,
    });
    entry.proposal = updatedProposal;

    return res.json({
      success: true,
      proposal: updatedProposal,
    });
  });

  // 6. Rollback Workspace to Pre-Apply Checkpoint
  router.post('/checkpoints/:checkpointId/rollback', requireAuth, async (req: any, res: any) => {
    const { projectId, checkpointId } = req.params;
    const userId = req.user.uid;

    const entry = checkpointsById.get(checkpointId);
    if (!entry || entry.projectId !== projectId) {
      return res.status(404).json({ error: `Checkpoint "${checkpointId}" not found.` });
    }
    if (entry.ownerId !== userId) {
      return res.status(403).json({ error: 'Permission denied for this checkpoint.' });
    }

    const storedTask = tasksById.get(entry.taskId);
    if (!storedTask) {
      return res.status(404).json({ error: 'Parent Composer task workspace is no longer available.' });
    }

    const restoreResult = await rollbackProposal({
      checkpointId,
      checkpointManager: storedTask.checkpointManager,
    });

    if (!restoreResult.success) {
      return res.status(400).json(restoreResult);
    }

    const restoredFiles =
      storedTask.workspace instanceof VirtualProjectWorkspaceService
        ? storedTask.workspace.exportFiles()
        : undefined;

    return res.json({
      ...restoreResult,
      restoredWorkspaceFiles: restoredFiles,
    });
  });

  return router;
}
