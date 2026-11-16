/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'crypto';
import path from 'node:path';
import express, { Request, Response, Router } from 'express';
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
import { defaultToolApprovalService } from './toolApprovalService';
import { registerBridgedMCPTool } from '../../services/composer/mcpToolBridge';
import { MCPService } from '../mcp/mcpService';
import { WorkspaceCheckpointManager } from '../../services/composer/checkpointManager';
import { applyProposal, rejectProposal, rollbackProposal } from '../../services/composer/proposalApplier';
import {
  IWorkspaceService,
  ListFilesOptions,
  WorkspaceCapabilities,
  WorkspaceFile,
  WorkspaceFileChangeEvent,
  WorkspaceFileStat,
  validateSafeWorkspacePath,
} from '../../shared/contracts/workspace';
import { IProposal } from '../../shared/contracts/proposals';
import { WorkspaceIndex } from '../../services/indexing/workspaceIndex';
import { RulesService } from '../rules/rulesService';
import { SkillsService } from '../skills/skillsService';
import { LocalFileSystemWorkspaceService } from '../../services/indexing/localWorkspaceService';

const DEFAULT_VIRTUAL_MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

interface VirtualFileRecord {
  content: string;
  mtime: number;
}

export class VirtualProjectWorkspaceService implements IWorkspaceService {
  private readonly files = new Map<string, VirtualFileRecord>();
  private readonly listeners = new Set<(event: WorkspaceFileChangeEvent) => void>();
  public readonly index: WorkspaceIndex;

  constructor(
    private readonly projectId: string,
    initialFiles: Array<{ path?: string; name?: string; content?: string }> = []
  ) {
    this.index = new WorkspaceIndex(projectId);
    const now = Date.now();
    for (const f of initialFiles) {
      const rawPath = (f.path || f.name || '').trim().replace(/^\/+/, '');
      if (!rawPath) continue;
      try {
        const safe = this.resolvePath(rawPath);
        const content = typeof f.content === 'string' ? f.content : '';
        this.files.set(safe, { content, mtime: now });
      } catch {
        // Skip invalid or sensitive paths during initial load
      }
    }
    this.rebuildIndex();
  }

  private rebuildIndex(): void {
    const entries = Array.from(this.files.entries()).map(([p, record]) => ({
      id: p,
      name: p.split('/').pop() || p,
      path: p,
      type: 'file' as const,
      content: record.content,
    }));
    this.index.indexProject(entries);
  }

  private emitChange(type: WorkspaceFileChangeEvent['type'], filePath: string, timestamp: number): void {
    const event: WorkspaceFileChangeEvent = {
      type,
      path: filePath,
      timestamp,
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Isolate individual listener errors
      }
    }
  }

  getRootUri(): string {
    return `float-workspace://${this.projectId}`;
  }

  resolvePath(relativePath: string): string {
    return validateSafeWorkspacePath(relativePath);
  }

  getCapabilities(): WorkspaceCapabilities {
    return {
      canWatch: true,
      canWrite: true,
      isLocalDisk: false,
      maxFileSize: DEFAULT_VIRTUAL_MAX_FILE_SIZE,
    };
  }

  async listFiles(options?: ListFilesOptions): Promise<WorkspaceFile[]> {
    const maxFiles = options?.maxFiles ?? 500;
    const includePatterns = options?.includePatterns;
    const excludePatterns = options?.excludePatterns;
    const entries: WorkspaceFile[] = [];

    for (const [p, record] of this.files.entries()) {
      if (excludePatterns && excludePatterns.some(rx => rx.test(p))) {
        continue;
      }
      if (includePatterns && includePatterns.length > 0 && !includePatterns.some(rx => rx.test(p))) {
        continue;
      }

      entries.push({
        path: p,
        name: p.split('/').pop() || p,
        type: 'file',
        size: Buffer.byteLength(record.content, 'utf8'),
        mtime: record.mtime,
        content: record.content,
      });
      if (entries.length >= maxFiles) break;
    }
    return entries;
  }

  async readFile(relativePath: string): Promise<string> {
    const safe = this.resolvePath(relativePath);
    const record = this.files.get(safe);
    if (!record) {
      throw new Error(`File not found in workspace: "${safe}"`);
    }
    return record.content;
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const safe = this.resolvePath(relativePath);
    const byteLength = Buffer.byteLength(content, 'utf8');
    if (byteLength > DEFAULT_VIRTUAL_MAX_FILE_SIZE) {
      throw new Error(`File "${safe}" (${byteLength} bytes) exceeds maxFileSize (${DEFAULT_VIRTUAL_MAX_FILE_SIZE} bytes).`);
    }
    const existed = this.files.has(safe);
    const now = Date.now();
    this.files.set(safe, { content, mtime: now });
    this.index.updateFile(safe, content);
    this.emitChange(existed ? 'modified' : 'created', safe, now);
  }

  async deleteFile(relativePath: string): Promise<void> {
    const safe = this.resolvePath(relativePath);
    const existed = this.files.delete(safe);
    this.index.removeFile(safe);
    if (existed) {
      this.emitChange('deleted', safe, Date.now());
    }
  }

  async fileExists(relativePath: string): Promise<boolean> {
    const safe = this.resolvePath(relativePath);
    return this.files.has(safe);
  }

  async stat(relativePath: string): Promise<WorkspaceFileStat> {
    const safe = this.resolvePath(relativePath);
    const record = this.files.get(safe);
    if (!record) {
      throw new Error(`File not found: "${safe}"`);
    }
    return {
      size: Buffer.byteLength(record.content, 'utf8'),
      mtime: record.mtime,
      isFile: true,
      isDirectory: false,
    };
  }

  watch(listener: (event: WorkspaceFileChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  exportFiles(): Array<{ path: string; content: string }> {
    return Array.from(this.files.entries())
      .filter(([p]) => !p.startsWith('.float/'))
      .map(([path, record]) => ({ path, content: record.content }));
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

interface AuthenticatedComposerRequest extends Request {
  user?: {
    uid: string;
    email?: string;
  };
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
  router.post('/run', requireAuth, express.json({ limit: '24mb' }), async (req: AuthenticatedComposerRequest, res: Response) => {
    const projectId = String(req.params.projectId || '');
    const userId = String(req.user?.uid || '');
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
    } = (req.body || {}) as Record<string, unknown>;

    const taskText = String(task || prompt || '').trim();
    if (!taskText) {
      return res.status(400).json({ error: 'Task description is required.' });
    }

    const validModes: ComposerMode[] = ['ask', 'plan', 'agent', 'debug'];
    const modeStr = String(mode) as ComposerMode;
    const effectiveMode: ComposerMode = validModes.includes(modeStr) ? modeStr : 'agent';
    const selectedModel = typeof model === 'string' && model.trim() ? model.trim() : 'gpt-6.1-sol';

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

    // Resolve workspace (local filesystem ONLY in authenticated desktop dev mode when explicitly requested)
    let workspace: IWorkspaceService;
    let desktopExecutionAdapter: import('../../shared/contracts/tools').ICommandExecutionAdapter | undefined;
    if (typeof localWorkspacePath === 'string' && localWorkspacePath.trim()) {
      if (process.env.FLOAT_DESKTOP_DEV !== '1') {
        return res.status(403).json({
          error: 'Arbitrary localWorkspacePath is forbidden in hosted environment. Projects must use server-managed project storage.',
          code: 'FORBIDDEN_LOCAL_WORKSPACE_PATH',
        });
      }
      const localWs = new LocalFileSystemWorkspaceService(localWorkspacePath.trim());
      await localWs.initializeIndex();
      workspace = localWs;
      const validatedRoot = path.resolve(localWorkspacePath.trim());
      desktopExecutionAdapter = {
        async runCommand(command: string, options?: { cwd?: string; timeoutMs?: number; signal?: AbortSignal }) {
          const { exec } = await import('node:child_process');
          return new Promise((resolve) => {
            const proc = exec(command, { cwd: validatedRoot, timeout: options?.timeoutMs }, (error, stdout, stderr) => {
              if (options?.signal?.aborted) {
                resolve({ exitCode: 130, stdout: '', stderr: 'Command execution cancelled via AbortSignal' });
              } else {
                resolve({
                  exitCode: typeof error?.code === 'number' ? error.code : (error ? 1 : 0),
                  stdout: stdout?.toString() || '',
                  stderr: stderr?.toString() || (error ? error.message : ''),
                });
              }
            });
            if (options?.signal) {
              options.signal.addEventListener('abort', () => {
                proc.kill();
                resolve({ exitCode: 130, stdout: '', stderr: 'Command execution cancelled via AbortSignal' });
              });
            }
          });
        }
      };
    } else {
      let initialFiles: Array<{ path?: string; name?: string; content?: string }> = Array.isArray(files)
        ? (files as Array<{ path?: string; name?: string; content?: string }>)
        : [];
      if (initialFiles.length === 0 && ownership.projectData) {
        try {
          const { loadProjectFileTreeAdmin } = await import('../projectContent');
          const tree = await loadProjectFileTreeAdmin(projectId, ownership.projectData as Record<string, unknown>);
          const flatten = (nodes: any[], prefix = ''): Array<{ path: string; content: string }> => {
            const out: Array<{ path: string; content: string }> = [];
            for (const n of nodes) {
              const currentPath = prefix ? `${prefix}/${n.name}` : n.name;
              if (n.type === 'file') {
                out.push({ path: currentPath, content: n.content || '' });
              } else if (n.type === 'folder' && Array.isArray(n.children)) {
                out.push(...flatten(n.children, currentPath));
              }
            }
            return out;
          };
          initialFiles = flatten(tree);
        } catch {
          try {
            const parsed = typeof ownership.projectData.files === 'string'
              ? JSON.parse(ownership.projectData.files)
              : ownership.projectData.files;
            if (Array.isArray(parsed)) {
              initialFiles = parsed as Array<{ path?: string; name?: string; content?: string }>;
            }
          } catch {}
        }
      }
      workspace = new VirtualProjectWorkspaceService(projectId, initialFiles);
    }

    const checkpointManager = new WorkspaceCheckpointManager(workspace);
    const toolRegistry = createStandardToolRegistry();

    // Register active bridged MCP tools into Composer's canonical registry
    try {
      const activeServers = MCPService.listServers(true, userId, projectId).filter(s => s.enabled);
      for (const srv of activeServers) {
        const tools = MCPService.getDiscoveredTools(srv.id, userId, projectId).filter(t => t.isAllowed);
        for (const t of tools) {
          try {
            registerBridgedMCPTool(toolRegistry, {
              server: srv,
              tool: t,
              invokeHandler: async (sId, tName, tArgs) => {
                return await MCPService.executeTool(sId, tName, tArgs, { userId, projectId, userApproved: true });
              }
            });
          } catch {
            // Already registered or schema error
          }
        }
      }
    } catch (mcpErr) {
      console.warn('[Composer] MCP tool registration skipped:', mcpErr);
    }

    const ruleFiles: Array<{ path: string; content: string }> = Array.isArray(files)
      ? (files as Array<{ path?: string; name?: string; content?: string }>).map(f => ({
          path: String(f.path || f.name || ''),
          content: typeof f.content === 'string' ? f.content : '',
        }))
      : [];

    const effectiveRules = RulesService.getEffectiveRules({
      userId,
      projectId,
      files: ruleFiles,
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
      modelId: selectedModel,
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

    const isSse = stream === true || Boolean(req.headers.accept?.includes('text/event-stream'));
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
      modelId: selectedModel,
      maxIterations: typeof maxIterations === 'number' ? maxIterations : undefined,
      timeoutMs: typeof timeoutMs === 'number' ? timeoutMs : undefined,
      maxTokens: typeof maxTokens === 'number' ? maxTokens : undefined,
      signal: abortController.signal,
      allowedCommands: Array.isArray(allowedCommands) ? allowedCommands.map(String) : undefined,
      autoApplyApprovedProposal: Boolean(autoApplyApprovedProposal),
      verificationCommand: typeof verificationCommand === 'string' ? verificationCommand : undefined,
      repairOnVerificationFailure: repairOnVerificationFailure !== false,
      activeRulesInstruction: activeRulesInstruction || undefined,
      executionAdapter: desktopExecutionAdapter,
      userApiKeys: (req as any).userApiKeys,
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
            modelId: selectedModel,
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
      modelId: selectedModel,
      events: storedTask.events,
      result: execResult,
      proposal: storedTask.proposal,
      checkpointId: storedTask.checkpointId,
      activeRules: storedTask.activeRules,
      activeSkills: storedTask.activeSkills,
    });
  });

  // 2. Get Composer Task Status & Event Stream History (Reconnect / Refresh Resilience)
  router.get('/tasks/:taskId', requireAuth, async (req: AuthenticatedComposerRequest, res: Response) => {
    const projectId = String(req.params.projectId || '');
    const taskId = String(req.params.taskId || '');
    const userId = String(req.user?.uid || '');

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
  router.post('/tasks/:taskId/cancel', requireAuth, async (req: AuthenticatedComposerRequest, res: Response) => {
    const projectId = String(req.params.projectId || '');
    const taskId = String(req.params.taskId || '');
    const userId = String(req.user?.uid || '');

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
  router.post('/proposals/:proposalId/apply', requireAuth, express.json({ limit: '12mb' }), async (req: AuthenticatedComposerRequest, res: Response) => {
    const projectId = String(req.params.projectId || '');
    const proposalId = String(req.params.proposalId || '');
    const userId = String(req.user?.uid || '');
    const { approvedPaths, force = false } = (req.body || {}) as { approvedPaths?: unknown; force?: unknown };

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
      approvedPaths: Array.isArray(approvedPaths) ? approvedPaths.map(String) : undefined,
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
  router.post('/proposals/:proposalId/reject', requireAuth, express.json(), async (req: AuthenticatedComposerRequest, res: Response) => {
    const projectId = String(req.params.projectId || '');
    const proposalId = String(req.params.proposalId || '');
    const userId = String(req.user?.uid || '');
    const { rejectedPaths } = (req.body || {}) as { rejectedPaths?: unknown };

    const entry = proposalsById.get(proposalId);
    if (!entry || entry.projectId !== projectId) {
      return res.status(404).json({ error: `Composer proposal "${proposalId}" not found.` });
    }
    if (entry.ownerId !== userId) {
      return res.status(403).json({ error: 'Permission denied for this Composer proposal.' });
    }

    const updatedProposal = rejectProposal({
      proposal: entry.proposal,
      rejectedPaths: Array.isArray(rejectedPaths) ? rejectedPaths.map(String) : undefined,
    });
    entry.proposal = updatedProposal;

    return res.json({
      success: true,
      proposal: updatedProposal,
    });
  });

  // 6. Rollback Workspace to Pre-Apply Checkpoint
  router.post('/checkpoints/:checkpointId/rollback', requireAuth, async (req: AuthenticatedComposerRequest, res: Response) => {
    const projectId = String(req.params.projectId || '');
    const checkpointId = String(req.params.checkpointId || '');
    const userId = String(req.user?.uid || '');

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

  // 7. Request human approval for privileged operation (Phase 1.1 Task 3)
  router.post('/approvals/request', requireAuth, express.json(), async (req: AuthenticatedComposerRequest, res: Response) => {
    const projectId = String(req.params.projectId || '');
    const userId = String(req.user?.uid || '');
    const ownership = await verifyProjectOwnership(projectId, userId, { allowMissing: true });
    if (!ownership.allowed) {
      return res.status(ownership.status || 403).json({ error: ownership.error || 'Unauthorized' });
    }

    const { actionId, toolName, params, reason, target, ttlMs } = req.body || {};
    if (!toolName) {
      return res.status(400).json({ error: 'toolName is required.' });
    }

    const pending = defaultToolApprovalService.registerRequest({
      actionId,
      toolName: String(toolName),
      params: params || {},
      userId,
      projectId,
      reason: reason ? String(reason) : undefined,
      target: target ? String(target) : undefined,
      ttlMs: typeof ttlMs === 'number' ? ttlMs : undefined,
    });

    return res.status(201).json({
      success: true,
      request: pending,
    });
  });

  // 8. Explicit User Confirmation / Rejection of Approval Request (Phase 1.1 Task 3)
  router.post('/approvals/confirm', requireAuth, express.json(), async (req: AuthenticatedComposerRequest, res: Response) => {
    const projectId = String(req.params.projectId || '');
    const userId = String(req.user?.uid || '');
    const ownership = await verifyProjectOwnership(projectId, userId, { allowMissing: true });
    if (!ownership.allowed) {
      return res.status(ownership.status || 403).json({ error: ownership.error || 'Unauthorized' });
    }

    const { actionId, approved } = req.body || {};
    if (!actionId || typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'actionId and approved (boolean) are required.' });
    }

    const outcome = defaultToolApprovalService.confirmRequest(String(actionId), approved, userId, projectId);
    if (!outcome.success) {
      return res.status(400).json({ error: outcome.error });
    }

    return res.json({
      success: true,
      actionId,
      approved: outcome.approved,
      approvalToken: outcome.approvalToken,
    });
  });

  // 9. Inspect Approval Request State
  router.get('/approvals/:actionId', requireAuth, async (req: AuthenticatedComposerRequest, res: Response) => {
    const projectId = String(req.params.projectId || '');
    const userId = String(req.user?.uid || '');
    const actionId = String(req.params.actionId || '');

    const ownership = await verifyProjectOwnership(projectId, userId, { allowMissing: true });
    if (!ownership.allowed) {
      return res.status(ownership.status || 403).json({ error: ownership.error || 'Unauthorized' });
    }

    const request = defaultToolApprovalService.getRequest(actionId);
    if (!request || request.projectId !== projectId) {
      return res.status(404).json({ error: `Approval request "${actionId}" not found.` });
    }

    return res.json({ success: true, request });
  });

  // 10. Execute Privileged Canonical Tool with Approval Token (Phase 1.1 Task 3)
  router.post('/tools/execute', requireAuth, express.json({ limit: '10mb' }), async (req: AuthenticatedComposerRequest, res: Response) => {
    const projectId = String(req.params.projectId || '');
    const userId = String(req.user?.uid || '');
    const ownership = await verifyProjectOwnership(projectId, userId, { allowMissing: true });
    if (!ownership.allowed) {
      return res.status(ownership.status || 403).json({ error: ownership.error || 'Unauthorized' });
    }

    const { actionId, toolName, params, approvalToken } = req.body || {};
    if (!toolName) {
      return res.status(400).json({ error: 'toolName is required.' });
    }

    const toolRegistry = createStandardToolRegistry();
    const tool = toolRegistry.get(String(toolName));
    if (!tool) {
      return res.status(404).json({ error: `Tool "${toolName}" is not registered in CanonicalToolRegistry.` });
    }

    // If tool requires approval, verify the approval token
    if (tool.requiresApproval && toolName !== 'request_approval') {
      if (!approvalToken) {
        return res.status(403).json({
          error: `Tool "${toolName}" requires explicit user approval. Provide a valid approvalToken.`,
          requiresApproval: true,
        });
      }

      const verification = await defaultToolApprovalService.verifyAndConsume(
        String(approvalToken),
        {
          actionId: actionId ? String(actionId) : undefined,
          toolName: String(toolName),
          params: params || {},
          userId,
          projectId,
        }
      );

      if (!verification.valid) {
        return res.status(403).json({
          error: `Approval token verification failed: ${verification.error}`,
          requiresApproval: true,
        });
      }
    }

    // Resolve workspace for tool execution
    const workspace = new VirtualProjectWorkspaceService(projectId);
    const result = await toolRegistry.execute(String(toolName), params || {}, {
      workspace,
      userId,
      projectId,
      actionId: actionId ? String(actionId) : undefined,
      approvalToken: approvalToken ? String(approvalToken) : undefined,
    });

    return res.json(result);
  });

  return router;
}
