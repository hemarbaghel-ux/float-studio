import { v4 as uuidv4 } from 'uuid';
import { AgentRunner } from './agent/agentRunner';
import { ProposalService } from './agent/proposalService';
import { verifyFirebaseIdToken } from './authMiddleware';
import { requireAuth } from './authMiddleware';
import { asyncRoute } from './asyncRoute';
import { adminDb, hasAdminCredentials, isPermissionDeniedError, markAdminCredentialsUnavailable } from './adminFirebase';
import { projectProcessManager } from './execution/processManager';
import { cleanupAgentGitWorktree, cleanupStaleAgentWorktrees, createAgentGitWorktree, getAgentWorktreeStatus, type AgentWorktreeSession } from './agent/agentGitWorktree';
import {
  appendAgentEvent,
  claimQueuedAgentTask,
  deleteAgentTaskWorkspace,
  getAgentTaskWorkspace,
  failInterruptedAgentTask,
  getAgentTaskResult,
  heartbeatAgentTask,
  listAgentEvents,
  listAgentTasks,
  listAgentTaskResults,
  listQueuedAgentTasks,
  listRunningAgentTasks,
  releaseAgentProjectLease,
  readAgentTask,
  saveAgentTask,
  completeAgentTask,
  saveAgentTaskWorkspace,
  updateAgentTask,
} from './agentPersistence';
import { approveAgentTaskPullRequest, createAgentTaskPullRequest, mergeAgentTaskPullRequest, publishAgentTaskBranch, refreshAgentTaskPullRequest } from './github/gitRouter';

// Sensitive patterns to exclude from any agent file context
const SENSITIVE_PATTERNS = [
  /(^|\/)\.env($|\..*)/i,
  /(^|\/)(node_modules|vendor|\.git|dist|build|coverage|target|\.next|\.cache|\.venv|venv|\.ssh|\.aws)(\/|$)/i,
  /(^|\/)(?:secrets?|credentials?|service-account)(?:\.[^/]+)?(\/|$)/i,
  /(^|\/)(\.npmrc|\.pypirc|\.netrc)(\/|$)/i,
  /\.(pem|key|p12|pfx|keystore|crt|cer)$/i,
  /(^|\/)(id_rsa|id_ed25519)(?:$|\.)/i,
  /(^|\/)\.DS_Store$/i
];
const BACKGROUND_AGENT_TIMEOUT_MS = 15 * 60 * 1000;
const agentTaskCreationTimes = new Map<string, number[]>();

function allowAgentTaskCreation(userId: string): boolean {
  const now = Date.now();
  const recent = (agentTaskCreationTimes.get(userId) || []).filter(timestamp => now - timestamp < 60_000);
  if (recent.length >= 5) return false;
  recent.push(now);
  agentTaskCreationTimes.delete(userId);
  if (!agentTaskCreationTimes.has(userId) && agentTaskCreationTimes.size >= 10_000) {
    const oldest = agentTaskCreationTimes.keys().next().value;
    if (oldest) agentTaskCreationTimes.delete(oldest);
  }
  agentTaskCreationTimes.set(userId, recent);
  return true;
}

function flattenProjectFiles(raw: unknown): Array<{ path: string; name: string; content: string; type: string }> {
  let tree: any;
  try { tree = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { throw new Error('The saved project file tree is invalid JSON.'); }
  if (!Array.isArray(tree)) throw new Error('The saved project does not contain a valid file tree.');
  const result: Array<{ path: string; name: string; content: string; type: string }> = [];
  const visit = (nodes: any[], prefix = '') => {
    for (const node of nodes) {
      if (!node || typeof node.name !== 'string' || !node.name || node.name.includes('/') || node.name.includes('\\')) continue;
      const filePath = prefix ? `${prefix}/${node.name}` : node.name;
      if (node.type === 'folder') visit(Array.isArray(node.children) ? node.children : [], filePath);
      else if (node.type === 'file' && typeof node.content === 'string') result.push({ path: filePath, name: node.name, content: node.content, type: 'file' });
    }
  };
  visit(tree);
  return result;
}

/**
 * 1. File Path Normalization & Sanitization
 */
export function normalizeAndSanitizePath(rawPath: string): { safePath: string; error?: string } {
  if (!rawPath || typeof rawPath !== 'string') {
    return { safePath: '', error: 'File path must be a non-empty string.' };
  }

  // Normalize slashes and trim
  let normalized = rawPath.trim().replace(/\\/g, '/');

  // Reject absolute system drives or Unix root system directories
  if (
    /^[a-zA-Z]:/i.test(normalized) || 
    normalized.startsWith('/etc') || 
    normalized.startsWith('/var') || 
    normalized.startsWith('/usr') ||
    normalized.startsWith('/bin') ||
    normalized.startsWith('/sbin') ||
    normalized.startsWith('/root') ||
    normalized.startsWith('/proc') ||
    normalized.startsWith('/sys')
  ) {
    return { safePath: '', error: 'Absolute system paths are strictly forbidden.' };
  }

  // Strip leading and trailing slashes
  normalized = normalized.replace(/^\/+/, '').replace(/\/+$/, '');

  // Check for null byte injection or control characters
  if (normalized.includes('\0') || /[\x00-\x1f\x7f]/.test(normalized)) {
    return { safePath: '', error: 'File path contains invalid control characters.' };
  }

  // Reject path traversal
  if (
    normalized.includes('../') || 
    normalized.includes('/..') || 
    normalized === '..' || 
    normalized.startsWith('../')
  ) {
    return { safePath: '', error: 'Path traversal (../) is strictly forbidden.' };
  }
  if (normalized.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    return { safePath: '', error: 'Path contains an invalid or traversing segment.' };
  }

  // Reject bare root folders
  if (['etc', 'var', 'usr', 'bin', 'sbin', 'root', 'proc', 'sys'].some(d => normalized === d || normalized.startsWith(`${d}/`))) {
    return { safePath: '', error: 'Access to system directories is strictly forbidden.' };
  }

  // Reject sensitive credential and build artifact patterns
  if (SENSITIVE_PATTERNS.some(p => p.test(normalized))) {
    return { safePath: '', error: `Access to sensitive path "${normalized}" is forbidden.` };
  }

  return { safePath: normalized };
}

/**
 * Validates and normalizes an entire array of file nodes
 */
export function validateAndNormalizeFileNodes(files: any[]): { 
  safeFiles: any[]; 
  rejectedCount: number; 
  errors: string[];
} {
  const safeFiles: any[] = [];
  const errors: string[] = [];
  let rejectedCount = 0;

  if (!Array.isArray(files)) {
    return { safeFiles, rejectedCount: 0, errors };
  }

  for (const file of files) {
    if (!file || typeof file !== 'object') {
      rejectedCount++;
      continue;
    }

    const { safePath, error } = normalizeAndSanitizePath(file.path || '');
    if (error) {
      rejectedCount++;
      errors.push(error);
      continue;
    }

    const content = typeof file.content === 'string' ? file.content : '';
    if (Buffer.byteLength(content, 'utf8') > 500 * 1024) {
      rejectedCount++;
      errors.push(`File "${safePath}" exceeds the 500 KB agent context limit and was excluded.`);
      continue;
    }

    safeFiles.push({
      ...file,
      path: safePath,
      name: file.name || safePath.split('/').pop() || safePath,
      content,
      type: file.type || 'file'
    });
  }

  return { safeFiles, rejectedCount, errors };
}

/**
 * 2. Tool Permissions & Agent Role Capabilities
 */
export type ToolPermissionLevel = 'read' | 'propose' | 'admin';

export interface AgentRoleConfig {
  id: string;
  name: string;
  allowedTools: string[];
  permissionLevel: ToolPermissionLevel;
  canProposeChanges: boolean;
}

export const AGENT_ROLES: Record<string, AgentRoleConfig> = {
  'main-agent': {
    id: 'main-agent',
    name: 'Main Orchestrator Agent',
    allowedTools: ['list_project_files', 'read_project_file', 'search_project', 'get_project_context', 'propose_changes'],
    permissionLevel: 'propose',
    canProposeChanges: true
  },
  'ui-agent': {
    id: 'ui-agent',
    name: 'UI / Frontend Specialist',
    allowedTools: ['list_project_files', 'read_project_file', 'search_project', 'get_project_context', 'propose_changes'],
    permissionLevel: 'propose',
    canProposeChanges: true
  },
  'backend-agent': {
    id: 'backend-agent',
    name: 'Backend / API Specialist',
    allowedTools: ['list_project_files', 'read_project_file', 'search_project', 'get_project_context', 'propose_changes'],
    permissionLevel: 'propose',
    canProposeChanges: true
  },
  'reviewer-agent': {
    id: 'reviewer-agent',
    name: 'Code Reviewer Agent',
    allowedTools: ['list_project_files', 'read_project_file', 'search_project', 'get_project_context'],
    permissionLevel: 'read',
    canProposeChanges: false // Read-only! Cannot propose changes
  },
  'debugger-agent': {
    id: 'debugger-agent',
    name: 'Diagnostics & Debugging Agent',
    allowedTools: ['list_project_files', 'read_project_file', 'search_project', 'get_project_context', 'propose_changes'],
    permissionLevel: 'propose',
    canProposeChanges: true
  }
};

// Prohibited tools across all agents without exception
const PROHIBITED_DIRECT_MODIFICATION_TOOLS = [
  'write_file',
  'write_project_file',
  'edit_file',
  'modify_file',
  'delete_file',
  'delete_project_file',
  'create_file',
  'save_file',
  'apply_changes',
  'overwrite_file'
];

const PROHIBITED_EXECUTION_TOOLS = [
  'run_command',
  'execute_command',
  'exec',
  'shell',
  'bash',
  'terminal',
  'sh'
];

/**
 * Validates tool permissions for an agent before execution
 */
export function validateToolPermission(agentId: string, toolName: string): { allowed: boolean; error?: string } {
  const normTool = String(toolName || '').toLowerCase().trim();

  // 1. Direct file modifications strictly prohibited
  if (PROHIBITED_DIRECT_MODIFICATION_TOOLS.includes(normTool)) {
    return {
      allowed: false,
      error: `Direct file modification tool "${normTool}" is strictly prohibited. FLOAT AI enforces a review-first workflow: use "propose_changes" instead.`
    };
  }

  // 2. Direct command execution strictly prohibited
  if (PROHIBITED_EXECUTION_TOOLS.includes(normTool)) {
    return {
      allowed: false,
      error: `Command execution tool "${normTool}" is strictly prohibited in agent loop workflows.`
    };
  }

  const role = AGENT_ROLES[agentId] || AGENT_ROLES['main-agent'];

  // 3. Propose changes permission check
  if (normTool === 'propose_changes' && !role.canProposeChanges) {
    return {
      allowed: false,
      error: `Tool permission denied: Agent "${agentId}" (${role.name}) has read-only permission and cannot propose code changes.`
    };
  }

  // 4. Allowed tools check
  if (!role.allowedTools.includes(normTool)) {
    return {
      allowed: false,
      error: `Tool permission denied: Agent "${agentId}" is not authorized to execute tool "${normTool}". Allowed tools: ${role.allowedTools.join(', ')}`
    };
  }

  return { allowed: true };
}

/**
 * 3. Project Access Validation
 */
export async function validateProjectAccess(
  userId: string, 
  projectId: string
): Promise<{ authorized: boolean; error?: string }> {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return { authorized: false, error: 'User authentication identifier is required.' };
  }

  if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
    return { authorized: false, error: 'Project identifier is required.' };
  }

  // Validate projectId identifier format (alphanumeric, dashes, underscores)
  const sanitizedId = projectId.trim();
  if (!/^[a-zA-Z0-9_\-\.]{1,128}$/.test(sanitizedId) || sanitizedId.includes('..')) {
    return { authorized: false, error: `Invalid project identifier "${projectId}".` };
  }

  if (!hasAdminCredentials()) {
    return { authorized: false, error: 'Could not verify project ownership in Firestore because Firebase Admin credentials are not configured.' };
  }

  // Background work requires an actual persisted project and authoritative ownership.
  try {
    const snap = await adminDb.collection('projects').doc(sanitizedId).get();
    if (!snap.exists) return { authorized: false, error: 'Save the project to your account before starting a background agent.' };
    if (snap.get('ownerId') !== userId) return { authorized: false, error: `Unauthorized: Project "${sanitizedId}" is not owned by this account.` };
  } catch {
    return { authorized: false, error: 'Could not verify project ownership in Firestore. Background task creation is unavailable.' };
  }
  return { authorized: true };
}

/**
 * 4. Agent Orchestrator Class
 */
export class AgentOrchestrator {
  private tasks = new Map<string, any>();
  private events = new Map<string, any[]>();
  private projectOwners = new Map<string, string>(); // projectId -> userId
  private readonly workerId = uuidv4();
  private workerHeartbeats = new Map<string, ReturnType<typeof setInterval>>();
  private activeControllers = new Map<string, AbortController>();
  private startingWorkers = 0;

  getProjectOwner(projectId: string): string | undefined {
    return this.projectOwners.get(projectId);
  }

  registerProjectOwner(projectId: string, userId: string) {
    if (projectId && userId) {
      this.projectOwners.set(projectId, userId);
    }
  }

  async createTask(taskData: any, userAuth?: { uid: string }, retrySnapshot?: any[]): Promise<any> {
    const userId = userAuth?.uid;
    const projectId = typeof taskData.projectId === 'string' ? taskData.projectId : '';
    if (!userId) throw new Error('Authentication is required to start a background agent.');

    // 1. Strict Project Access Validation
    const accessCheck = await validateProjectAccess(userId, projectId);
    if (!accessCheck.authorized) {
      throw new Error(accessCheck.error || 'Project access denied.');
    }

    // Register project ownership
    this.registerProjectOwner(projectId, userId);

    if (!hasAdminCredentials()) throw new Error('Durable background agents require Firebase Admin credentials and Firestore access.');
    const projectSnapshot = await adminDb.collection('projects').doc(projectId).get();
    if (!projectSnapshot.exists || projectSnapshot.get('ownerId') !== userId) throw new Error('Unauthorized: Project ownership changed before the agent snapshot was created.');
    const projectData = projectSnapshot.data()!;
    // Client-supplied file contents are never treated as authoritative task context.
    const rawFiles = retrySnapshot || flattenProjectFiles(projectData.files).filter(file => !SENSITIVE_PATTERNS.some(pattern => pattern.test(file.path))).slice(0, 200);
    const validated = validateAndNormalizeFileNodes(rawFiles);
    let remainingBytes = 700 * 1024;
    const safeFiles = validated.safeFiles.filter((file) => {
      const size = Buffer.byteLength(file.content, 'utf8');
      if (size > remainingBytes) return false;
      remainingBytes -= size;
      return true;
    });
    const rejectedCount = validated.rejectedCount + (validated.safeFiles.length - safeFiles.length);
    const errors = validated.errors;
    if (!safeFiles.length) throw new Error('Save at least one supported text file in this project before starting an agent.');

    // 3. Agent Role & Model ID Validation
    const assignedAgentId = AGENT_ROLES[taskData.assignedAgentId] 
      ? taskData.assignedAgentId 
      : 'main-agent';

    let modelId = taskData.modelId || 'gemini-3.1-flash-lite';
    if (modelId === 'gemini-2.0-flash' || modelId === 'gemini-1.5-flash') {
      modelId = 'gemini-3.1-flash-lite';
    }
    if (typeof modelId !== 'string' || (!/^gemini-/.test(modelId) && modelId !== 'float-basic' && modelId !== 'auto')) {
      throw new Error('Background agents currently use the Gemini agent loop. Select a Gemini model or FLOAT Basic for this task.');
    }

    const taskId = uuidv4();
    const task = {
      name: String(taskData.name || 'Agent Task').slice(0, 200),
      description: String(taskData.description || '').slice(0, 5000),
      id: taskId,
      projectId,
      ownerId: userId,
      assignedAgentId,
      modelId,
      requestedChecks: Array.isArray(taskData.requestedChecks) ? [...new Set(taskData.requestedChecks.filter((check: unknown) => ['test', 'lint', 'typecheck', 'build'].includes(String(check))))].slice(0, 4) : [],
      status: 'QUEUED',
      progress: 0,
      context: {
        objectives: Array.isArray(taskData.context?.objectives) ? taskData.context.objectives.slice(0, 20) : [],
        workspaceSnapshotId: taskId,
        sourceProjectUpdatedAt: projectData.updatedAt?.toMillis?.() || Date.now(),
        sourceProjectName: String(projectData.name || 'Workspace').slice(0, 200),
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await saveAgentTaskWorkspace(taskId, userId, projectId, safeFiles);
    try { await saveAgentTask(task); }
    catch (error) {
      await deleteAgentTaskWorkspace(taskId, userId).catch(() => undefined);
      throw error;
    }

    this.tasks.set(taskId, task);
    const initialEvents = [
      {
        id: uuidv4(),
        taskId,
        agentId: assignedAgentId,
        type: 'task_started',
        message: `Task queued for agent ${assignedAgentId} in project "${projectId}".`,
        timestamp: Date.now()
      },
      {
        id: uuidv4(),
        taskId,
        agentId: assignedAgentId,
        type: 'project_access_verified',
        message: `Project access authorized for user "${userId}" on project "${projectId}".`,
        timestamp: Date.now()
      },
      {
        id: uuidv4(),
        taskId,
        agentId: assignedAgentId,
        type: 'file_paths_normalized',
        message: `Normalized ${safeFiles.length} file path(s)${rejectedCount > 0 ? ` (${rejectedCount} sensitive/invalid files excluded)` : ''}.`,
        payload: { safeFilesCount: safeFiles.length, rejectedCount, errors },
        timestamp: Date.now()
      }
    ].map((event) => ({ ...event, ownerId: userId }));
    this.events.set(taskId, initialEvents);
    await Promise.all(initialEvents.map((event) => appendAgentEvent(event)));

    void this.processTask(taskId).catch((error) => {
      console.error(`[AgentOrchestrator] Task ${taskId} could not start:`, error);
      const current = this.tasks.get(taskId);
      if (current && !['CANCELLED', 'PAUSED'].includes(current.status)) {
        current.error = 'Agent task failed to start. Review task events and retry.';
        void this.updateTaskStatus(taskId, 'FAILED');
        this.logEvent(taskId, 'agent_error', current.error);
      }
    });
    return task;
  }

  private async processTask(taskId: string) {
    if (this.activeControllers.size + this.startingWorkers >= 2) return;
    this.startingWorkers += 1;
    let task: any;
    try {
      const canClaim = await claimQueuedAgentTask(taskId, this.workerId);
      if (!canClaim) return;
      task = this.tasks.get(taskId) || await readAgentTask(taskId);
      if (!task || task.status === 'CANCELLED' || task.status === 'PAUSED') {
        if (task?.ownerId) await releaseAgentProjectLease(taskId, task.ownerId, this.workerId);
        return;
      }
    } finally { this.startingWorkers -= 1; }
    this.tasks.set(taskId, task);
    this.startWorkerHeartbeat(taskId);
    const controller = new AbortController();
    this.activeControllers.set(taskId, controller);
    let worktree: AgentWorktreeSession | null = null;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, BACKGROUND_AGENT_TIMEOUT_MS);
    timeout.unref?.();
    try {
      await this.updateTaskStatus(taskId, 'PLANNING', 5);
      const accessCheck = await validateProjectAccess(task.ownerId, task.projectId);
      if (!accessCheck.authorized) throw new Error(accessCheck.error || 'Project access validation failed.');
      const workspace = await getAgentTaskWorkspace(taskId, task.ownerId);
      if (!workspace) throw new Error('The task workspace snapshot is missing or no longer belongs to this account.');
      const { safeFiles, rejectedCount } = validateAndNormalizeFileNodes(workspace);
      if (!safeFiles.length) throw new Error('The isolated task workspace contains no supported text files.');
      this.logEvent(taskId, 'workspace_isolated', `Loaded ${safeFiles.length} files from the immutable task snapshot${rejectedCount ? `; ${rejectedCount} unsafe files were excluded` : ''}.`);
      worktree = await createAgentGitWorktree(taskId, task.ownerId, safeFiles, controller.signal);
      this.logEvent(taskId, 'git_worktree_created', `Created isolated Git branch ${worktree.branch} at ${worktree.baseCommit.slice(0, 12)}. Agent changes are confined to this task worktree.`, { branch: worktree.branch, baseCommit: worktree.baseCommit });
      const roleConfig = AGENT_ROLES[task.assignedAgentId] || AGENT_ROLES['main-agent'];
      this.logEvent(taskId, 'tool_permissions_verified', `Agent "${task.assignedAgentId}" has tools: ${roleConfig.allowedTools.join(', ')}.`);
      if (!task.description?.trim()) throw new Error('Add a task description before starting an agent task.');
      if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured on this deployment.');

      await this.updateTaskStatus(taskId, 'EXECUTING', 20);
      const run = AgentRunner.run({
        model: task.modelId || 'gemini-3.1-flash-lite', prompt: task.description,
        virtualFiles: safeFiles, projectName: task.context?.sourceProjectName || task.name,
        projectId: task.projectId, userId: task.ownerId, agentTaskId: task.id, signal: controller.signal,
        systemInstruction: `${roleConfig.name}. Return a reviewable FLOAT code proposal for requested code changes.`,
        onEvent: event => {
          if (event.type === 'tool_started' && event.tool) {
            const permission = validateToolPermission(task.assignedAgentId, event.tool);
            if (!permission.allowed) { this.logEvent(taskId, 'tool_permission_denied', permission.error || 'Tool permission denied.'); return; }
            const stage = ['search_project', 'search_codebase', 'read_project_file', 'read_file', 'list_project_files', 'list_files', 'get_project_context'].includes(event.tool) ? 'INSPECTING' : 'WAITING_FOR_TOOL';
            void this.updateTaskStatus(taskId, stage, 35);
          }
          if (event.type === 'tool_completed' || event.type === 'tool_failed') void this.updateTaskStatus(taskId, 'EXECUTING', 50);
          // Tool args may contain entire source files or inline credentials.
          // Persist only the bounded human-readable progress text, never raw args.
          this.logEvent(taskId, event.type, event.message.slice(0, 500));
        }
      });
      const result = await waitForAgentOrAbort(run, controller.signal);
      if (controller.signal.aborted) throw new Error(timedOut ? 'Agent exceeded the 15 minute task deadline.' : 'Agent task was interrupted.');
      if (result.status !== 'completed') throw new Error(result.error || 'Agent loop did not complete successfully.');

      const durableResult: Record<string, any> = {
        text: String(result.text || '').slice(0, 40_000),
        changeSet: result.changeSet || null,
        toolCallsCount: result.toolCallsCount,
        roundsCount: result.roundsCount,
      };
      const isolatedDiff = await getAgentWorktreeStatus(taskId, task.ownerId);
      durableResult.gitWorkspace = isolatedDiff;
      if (durableResult.changeSet) Object.assign(durableResult.changeSet, { agentBranch: isolatedDiff.branch, agentBaseCommit: isolatedDiff.baseCommit, agentDiff: isolatedDiff.diff });
      if (result.changeSet && task.requestedChecks?.length) {
        await this.updateTaskStatus(taskId, 'VALIDATING', 75);
        const checkResults = await this.runTaskChecks(task, safeFiles, result.changeSet, controller.signal);
        durableResult.validation = checkResults;
      }
      if (controller.signal.aborted) throw new Error(timedOut ? 'Agent exceeded the 15 minute task deadline.' : 'Agent task was interrupted.');
      await cleanupAgentGitWorktree(taskId, task.ownerId);
      worktree = null;
      this.logEvent(taskId, 'git_worktree_cleaned', 'Removed the task-private Git branch and worktree after saving its review diff.');
      const completed = await completeAgentTask(taskId, task.ownerId, this.workerId, durableResult);
      if (!completed) {
        const latest = await readAgentTask(taskId);
        if (latest) this.tasks.set(taskId, latest);
        throw new Error(`Agent task could not be completed because its durable state is ${latest?.status || 'unavailable'}.`);
      }
      task.result = durableResult;
      task.status = 'COMPLETED';
      task.progress = 100;
      task.updatedAt = Date.now();
      this.tasks.set(taskId, task);
      this.logEvent(taskId, result.changeSet ? 'review_ready' : 'agent_completed', result.changeSet ? 'Code proposal generated and validation results recorded for review.' : 'Agent completed with a response.', {
        description: result.changeSet?.description, changeCount: result.changeSet?.changes?.length || 0,
        validation: durableResult.validation?.map((check: any) => ({ type: check.type, status: check.status, exitCode: check.exitCode }))
      });
      this.logEvent(taskId, 'task_completed', 'Agent run completed. Review any proposed changes and actual check results before applying them.');
    } catch (error: any) {
      const durableCurrent = await readAgentTask(taskId).catch(() => null);
      if (durableCurrent) this.tasks.set(taskId, durableCurrent);
      const current = durableCurrent || this.tasks.get(taskId);
      if (['PAUSED', 'CANCELLED'].includes(current?.status)) {
        await ProposalService.rejectAgentTaskProposals(taskId, task.projectId, task.ownerId).catch(error => console.warn(`[AgentOrchestrator] Could not reject proposals from interrupted task ${taskId}:`, error));
        return;
      }
      task.error = timedOut ? 'Agent task exceeded the 15 minute deadline.' : error?.message || 'Agent execution failed.';
      this.logEvent(taskId, timedOut ? 'task_timeout' : 'agent_error', task.error);
      await this.updateTaskStatus(taskId, 'FAILED');
      await ProposalService.rejectAgentTaskProposals(taskId, task.projectId, task.ownerId).catch(cleanupError => console.warn(`[AgentOrchestrator] Could not reject incomplete task proposals for ${taskId}:`, cleanupError));
    } finally {
      clearTimeout(timeout);
      if (worktree) {
        try {
          await cleanupAgentGitWorktree(taskId, task?.ownerId);
          this.logEvent(taskId, 'git_worktree_cleaned', 'Removed the task-private Git worktree after saving its review diff.');
        } catch (cleanupError: any) {
          this.logEvent(taskId, 'git_worktree_cleanup_failed', cleanupError?.message || 'Task-private Git worktree cleanup failed.');
        }
      }
      if (task?.ownerId) await releaseAgentProjectLease(taskId, task.ownerId, this.workerId).catch(error => {
        console.error(`[AgentOrchestrator] Could not release project lease for task ${taskId}:`, error);
      });
      if (this.activeControllers.get(taskId) === controller) this.activeControllers.delete(taskId);
      this.stopWorkerHeartbeat(taskId);
      if (this.activeControllers.size < 2) setTimeout(() => { void this.recoverQueuedTasks(); }, 500).unref?.();
    }
  }

  private async recoverQueuedTasks() {
    if (this.activeControllers.size >= 2) return;
    const queued = await listQueuedAgentTasks();
    for (const task of queued) {
      if (this.activeControllers.size >= 2) break;
      this.tasks.set(task.id, task);
      void this.processTask(task.id).catch(error => console.error(`[AgentOrchestrator] Queued task ${task.id} failed:`, error));
    }
  }

  private async runTaskChecks(task: any, sourceFiles: any[], changeSet: any, signal: AbortSignal): Promise<any[]> {
    const fileMap = new Map(sourceFiles.map(file => [file.path, String(file.content || '')]));
    for (const change of changeSet.changes || []) {
      if (change.operation === 'delete') fileMap.delete(change.path);
      else fileMap.set(change.path, String(change.proposedContent || ''));
    }
    const files = [...fileMap].map(([path, content]) => ({ path, content }));
    let packageJson: any = {};
    try { packageJson = JSON.parse(files.find(file => file.path === 'package.json')?.content || '{}'); }
    catch { packageJson = {}; }
    const scripts = packageJson.scripts || {};
    const definitions: Record<string, { script?: string; command: string; timeoutMs: number }> = {
      test: { script: scripts.test, command: 'npm test', timeoutMs: 5 * 60_000 },
      lint: { script: scripts.lint, command: 'npm run lint', timeoutMs: 5 * 60_000 },
      typecheck: { script: scripts.typecheck || scripts['check-types'] || scripts.check || (files.some(file => file.path === 'tsconfig.json') ? 'tsconfig' : undefined), command: scripts.typecheck ? 'npm run typecheck' : scripts['check-types'] ? 'npm run check-types' : scripts.check ? 'npm run check' : 'npm exec --offline -- tsc --noEmit', timeoutMs: 5 * 60_000 },
      build: { script: scripts.build, command: 'npm run build', timeoutMs: 10 * 60_000 },
    };
    const results: any[] = [];
    for (const type of task.requestedChecks as string[]) {
      if (signal.aborted) break;
      const definition = definitions[type];
      if (!definition) continue;
      if (!definition.script && !(type === 'typecheck' && files.some(file => file.path === 'tsconfig.json'))) {
        results.push({ type, status: 'unsupported', exitCode: null, output: '', message: `No ${type} script is configured in the task workspace.` });
        this.logEvent(task.id, 'check_skipped', `The ${type} check did not run because the workspace does not configure it.`);
        continue;
      }
      if (!projectProcessManager.available) {
        results.push({ type, status: 'unsupported', exitCode: null, output: '', message: 'Isolated Docker execution is not configured; this command did not run.' });
        this.logEvent(task.id, 'check_unavailable', `The ${type} check did not run because isolated Docker execution is not configured.`);
        continue;
      }
      this.logEvent(task.id, 'check_started', `Running ${type} in an isolated, network-disabled project container.`, { command: definition.command });
      const result = await projectProcessManager.execute({ ownerId: task.ownerId, projectId: task.id, command: definition.command, files, timeoutMs: definition.timeoutMs, signal });
      results.push({ type, status: result.status, exitCode: result.exitCode, durationMs: result.durationMs, stdout: result.stdout.slice(0, 16_000), stderr: result.stderr.slice(0, 16_000), error: result.error });
      this.logEvent(task.id, 'check_completed', `${type} execution returned ${result.status} (exit code ${result.exitCode ?? 'unknown'}).`, { durationMs: result.durationMs });
    }
    return results;
  }

  async updateTaskStatus(taskId: string, status: string, progress?: number): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) {
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status) && task.status !== status) return;
      if (['PAUSED', 'CANCELLED'].includes(task.status) && !['PAUSED', 'CANCELLED'].includes(status)) return;
      task.status = status;
      if (progress !== undefined) task.progress = Math.max(task.progress, progress);
      task.updatedAt = Date.now();
      this.tasks.set(taskId, task);
      const patch: Record<string, unknown> = { status, workerId: this.workerId };
      if (progress !== undefined) patch.progress = task.progress;
      if (task.error) patch.error = task.error;
      const persisted = await updateAgentTask(taskId, patch).catch((error) => {
        console.error(`[AgentOrchestrator] Could not persist task ${taskId} status:`, error);
        return false;
      });
      if (!persisted) {
        const latest = await readAgentTask(taskId).catch(() => null);
        if (latest) this.tasks.set(taskId, latest);
      }
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) {
        this.stopWorkerHeartbeat(taskId);
      }
    }
  }

  logEvent(taskId: string, type: string, message: string, payload?: any) {
    const task = this.tasks.get(taskId);
    const event = {
      id: uuidv4(),
      taskId,
      agentId: task?.assignedAgentId || 'system',
      ...(task?.ownerId ? { ownerId: task.ownerId } : {}),
      type,
      message,
      timestamp: Date.now(),
      ...(payload !== undefined ? { payload } : {})
    };
    if (!this.events.has(taskId)) {
      this.events.set(taskId, []);
    }
    this.events.get(taskId)?.push(event);
    void appendAgentEvent(event).catch((error) => {
      console.error(`[AgentOrchestrator] Could not persist task event ${event.id}:`, error);
    });
  }

  private startWorkerHeartbeat(taskId: string) {
    this.stopWorkerHeartbeat(taskId);
    const timer = setInterval(async () => {
      try {
        const latest = await readAgentTask(taskId);
        if (!latest) return;
        if (['PAUSED', 'CANCELLED', 'QUEUED'].includes(latest.status) || latest.workerId !== this.workerId) {
          const current = this.tasks.get(taskId);
          if (current && ['PAUSED', 'CANCELLED'].includes(latest.status)) current.status = latest.status;
          this.activeControllers.get(taskId)?.abort();
          this.stopWorkerHeartbeat(taskId);
          return;
        }
        const heartbeat = await heartbeatAgentTask(taskId, this.workerId);
        if (!heartbeat.active) {
          const current = this.tasks.get(taskId);
          if (current && ['PAUSED', 'CANCELLED'].includes(heartbeat.status || '')) current.status = heartbeat.status;
          this.activeControllers.get(taskId)?.abort();
          this.stopWorkerHeartbeat(taskId);
        }
      } catch (error) {
        console.error(`[AgentOrchestrator] Heartbeat failed for task ${taskId}:`, error);
        this.logEvent(taskId, 'worker_lease_lost', 'The worker could not renew its project lease; stopping this task to prevent concurrent workspace work.');
        this.activeControllers.get(taskId)?.abort();
        this.stopWorkerHeartbeat(taskId);
      }
    }, 2_000);
    timer.unref?.();
    this.workerHeartbeats.set(taskId, timer);
  }

  private stopWorkerHeartbeat(taskId: string) {
    const timer = this.workerHeartbeats.get(taskId);
    if (timer) clearInterval(timer);
    this.workerHeartbeats.delete(taskId);
  }

  async setTaskStatusDurable(taskId: string, status: string) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('Task not found.');
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status) && task.status !== status) {
      throw new Error(`Task is already ${task.status.toLowerCase()} and cannot be changed.`);
    }
    if (status === 'PAUSED' && !['QUEUED', 'PLANNING', 'INSPECTING', 'WAITING_FOR_TOOL', 'EXECUTING', 'VALIDATING'].includes(task.status)) {
      throw new Error('Only queued or running tasks can be paused.');
    }
    if (status === 'QUEUED' && task.status !== 'PAUSED') {
      throw new Error('Only paused tasks can be resumed.');
    }
    task.status = status;
    task.updatedAt = Date.now();
    this.tasks.set(taskId, task);
    const persisted = await updateAgentTask(taskId, { status, progress: task.progress });
    if (!persisted) {
      const latest = await readAgentTask(taskId);
      if (latest) this.tasks.set(taskId, latest);
      throw new Error('Task state changed in another worker. Refresh and retry.');
    }
    if (status === 'PAUSED' || status === 'CANCELLED') this.activeControllers.get(taskId)?.abort();
    if (['COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED'].includes(status)) this.stopWorkerHeartbeat(taskId);
  }

  async getTaskDurable(taskId: string, userId: string) {
    if (!hasAdminCredentials()) {
      const task = this.tasks.get(taskId);
      if (!task || (task.ownerId && task.ownerId !== userId)) return null;
      return task;
    }
    try {
      const task = await readAgentTask(taskId);
      if (!task || task.ownerId !== userId) return null;
      task.result = await getAgentTaskResult(taskId, userId);
      this.tasks.set(taskId, task);
      return task;
    } catch (error: any) {
      if (isPermissionDeniedError(error)) {
        markAdminCredentialsUnavailable(error);
        const task = this.tasks.get(taskId);
        if (!task || (task.ownerId && task.ownerId !== userId)) return null;
        return task;
      }
      throw error;
    }
  }

  async getTasksDurable(userId: string) {
    if (!hasAdminCredentials()) {
      return Array.from(this.tasks.values())
        .filter((task) => !task.ownerId || task.ownerId === userId)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    try {
      const persisted = await listAgentTasks(userId);
      const results = await listAgentTaskResults(userId);
      for (const task of persisted) task.result = results[task.id] ?? null;
      for (const task of persisted) this.tasks.set(task.id, task);
      return persisted.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error: any) {
      if (isPermissionDeniedError(error)) {
        markAdminCredentialsUnavailable(error);
        return Array.from(this.tasks.values())
          .filter((task) => !task.ownerId || task.ownerId === userId)
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      }
      throw error;
    }
  }

  async getEventsDurable(userId: string, taskId?: string) {
    if (!hasAdminCredentials()) {
      if (taskId) {
        return this.events.get(taskId) || [];
      }
      return this.getAllEvents(userId);
    }
    try {
      const persisted = await listAgentEvents(userId, taskId);
      if (taskId) this.events.set(taskId, persisted);
      else {
        for (const event of persisted) {
          const list = this.events.get(event.taskId) || [];
          if (!list.some((item) => item.id === event.id)) list.push(event);
          this.events.set(event.taskId, list);
        }
      }
      return persisted;
    } catch (error: any) {
      if (isPermissionDeniedError(error)) {
        markAdminCredentialsUnavailable(error);
        if (taskId) return this.events.get(taskId) || [];
        return this.getAllEvents(userId);
      }
      throw error;
    }
  }

  async resumeTaskDurable(taskId: string) {
    await this.setTaskStatusDurable(taskId, 'QUEUED');
    this.logEvent(taskId, 'task_resumed', 'Task resumed by user.');
    setTimeout(() => {
      void this.processTask(taskId).catch((error) => {
        console.error(`[AgentOrchestrator] Resumed task ${taskId} failed:`, error);
        void this.updateTaskStatus(taskId, 'FAILED');
      });
    }, 0);
  }

  async retryTaskDurable(taskId: string, userId: string) {
    const task = await this.getTaskDurable(taskId, userId);
    if (!task) throw new Error('Task not found or access denied.');
    if (!['FAILED', 'CANCELLED'].includes(task.status)) throw new Error('Only failed or cancelled tasks can be retried.');
    const files = await getAgentTaskWorkspace(taskId, userId);
    if (!files) throw new Error('The original task workspace snapshot is no longer available.');
    return this.createTask({
      name: `${String(task.name).slice(0, 180)} (retry)`, description: task.description,
      assignedAgentId: task.assignedAgentId, modelId: task.modelId, projectId: task.projectId,
      requestedChecks: task.requestedChecks, context: task.context,
    }, { uid: userId }, files);
  }

  async recoverDurableTasks() {
    if (!hasAdminCredentials()) return;
    await cleanupStaleAgentWorktrees().catch(error => console.warn('[AgentOrchestrator] Stale task worktree cleanup failed:', error));
    const running = await listRunningAgentTasks();
    for (const task of running) {
      const failed = await failInterruptedAgentTask(task);
      if (!failed) continue;
      await releaseAgentProjectLease(task.id, task.ownerId, task.workerId || '').catch(error => console.warn(`[AgentOrchestrator] Recovered project lease cleanup failed for ${task.id}:`, error));
      await cleanupAgentGitWorktree(task.id, task.ownerId).catch(error => console.warn(`[AgentOrchestrator] Recovered Git worktree cleanup failed for ${task.id}:`, error));
      await ProposalService.rejectAgentTaskProposals(task.id, task.projectId, task.ownerId).catch(error => console.warn(`[AgentOrchestrator] Recovered proposal cleanup failed for ${task.id}:`, error));
      const taskError = { ...task, status: 'FAILED', error: 'This task was interrupted when its worker stopped. Resume or submit it again.' };
      this.tasks.set(task.id, taskError);
      this.logEvent(task.id, 'worker_interrupted', taskError.error);
      await this.updateTaskStatus(task.id, 'FAILED');
    }

    const queued = await listQueuedAgentTasks();
    for (const task of queued) {
      if (this.activeControllers.size >= 2) break;
      this.tasks.set(task.id, task);
      void this.processTask(task.id).catch((error) => {
        console.error(`[AgentOrchestrator] Could not recover queued task ${task.id}:`, error);
        void this.updateTaskStatus(task.id, 'FAILED');
      });
    }
  }

  getTask(taskId: string, userId?: string) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    if (userId && task.ownerId && task.ownerId !== userId) {
      return null; // Enforce authorization check
    }
    return task;
  }

  getTasks(userId?: string) {
    const all = Array.from(this.tasks.values());
    if (!userId) return all;
    return all.filter(t => !t.ownerId || t.ownerId === userId);
  }

  getEvents(taskId: string, userId?: string) {
    const task = this.tasks.get(taskId);
    if (userId && task && task.ownerId && task.ownerId !== userId) {
      return [];
    }
    return this.events.get(taskId) || [];
  }

  getAllEvents(userId?: string) {
    const all: any[] = [];
    for (const [taskId, taskEvents] of this.events.entries()) {
      const task = this.tasks.get(taskId);
      if (userId && task && task.ownerId && task.ownerId !== userId) {
        continue;
      }
      all.push(...taskEvents);
    }
    return all.sort((a, b) => a.timestamp - b.timestamp);
  }
}

function waitForAgentOrAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('Agent task interrupted.'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('Agent task interrupted.'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export const orchestrator = new AgentOrchestrator();

/**
 * Setup HTTP routes for agent orchestrator with authentication and ownership guards
 */
export function setupAgentOrchestratorRoutes(app: any) {
  // Helper to resolve user from auth header or request
  const resolveUser = async (req: any): Promise<{ uid: string } | null> => {
    if (req.user?.uid) return { uid: req.user.uid };
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const verified = await verifyFirebaseIdToken(token);
      if (verified) return verified;
    }
    return null;
  };

  app.use('/api/agents', requireAuth);

  if (hasAdminCredentials()) {
    let recoveryTimer: NodeJS.Timeout | undefined;
    const runRecovery = async () => {
      try {
        await orchestrator.recoverDurableTasks();
      } catch (error: any) {
        if (isPermissionDeniedError(error)) {
          markAdminCredentialsUnavailable(error);
          if (recoveryTimer) clearInterval(recoveryTimer);
          console.warn('[AgentOrchestrator] Firestore task persistence is unavailable (PERMISSION_DENIED); durable task recovery disabled.');
        } else {
          console.error('[AgentOrchestrator] Durable task recovery failed:', error);
        }
      }
    };
    void runRecovery();
    recoveryTimer = setInterval(() => {
      if (!hasAdminCredentials()) {
        if (recoveryTimer) clearInterval(recoveryTimer);
        return;
      }
      void runRecovery();
    }, 30_000);
    recoveryTimer.unref?.();
  } else {
    console.warn('[AgentOrchestrator] Firestore task persistence is unavailable; configure Application Default Credentials.');
  }

  // 1. Create agent task
  app.post('/api/agents/tasks', asyncRoute(async (req: any, res: any) => {
    try {
      const user = await resolveUser(req);
      if (user && !allowAgentTaskCreation(user.uid)) return res.status(429).json({ error: 'Background agent task creation limit reached. Try again in a minute.' });
      const task = await orchestrator.createTask(req.body, user || undefined);
      res.status(201).json(task);
    } catch (err: any) {
      const status = err.message?.includes('Unauthorized') ? 403 : /Firestore|credentials|verify project ownership/i.test(err.message || '') ? 503 : 400;
      res.status(status).json({ error: err.message || 'Failed to create task.' });
    }
  }));

  // 2. Get task by ID
  app.get('/api/agents/tasks/:id', asyncRoute(async (req: any, res: any) => {
    const user = await resolveUser(req);
    const task = user ? await orchestrator.getTaskDurable(req.params.id, user.uid) : null;
    if (task) {
      res.json(task);
    } else {
      res.status(404).json({ error: 'Task not found or access denied.' });
    }
  }));

  // 3. List tasks
  app.get('/api/agents/tasks', asyncRoute(async (req: any, res: any) => {
    const user = await resolveUser(req);
    res.json(user ? await orchestrator.getTasksDurable(user.uid) : []);
  }));

  // 4. Get all events
  app.get('/api/agents/events', asyncRoute(async (req: any, res: any) => {
    const user = await resolveUser(req);
    res.json(user ? await orchestrator.getEventsDurable(user.uid) : []);
  }));

  // 5. Get events for a specific task
  app.get('/api/agents/tasks/:id/events', asyncRoute(async (req: any, res: any) => {
    const user = await resolveUser(req);
    const task = user ? await orchestrator.getTaskDurable(req.params.id, user.uid) : null;
    if (!task) return res.status(404).json({ error: 'Task not found or access denied.' });
    const events = await orchestrator.getEventsDurable(user!.uid, req.params.id);
    res.json(events);
  }));

  // Authenticated task-scoped Firestore event stream. Last-Event-ID lets clients resume without polling.
  app.get('/api/agents/tasks/:id/events/stream', asyncRoute(async (req: any, res: any) => {
    const user = await resolveUser(req);
    const task = user ? await orchestrator.getTaskDurable(req.params.id, user.uid) : null;
    if (!task) return res.status(404).json({ error: 'Task not found or access denied.' });
    if (!hasAdminCredentials()) return res.status(503).json({ error: 'Agent event streaming requires Firebase Admin credentials.' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': FLOAT agent event stream connected\n\n');
    let cursor = parseAgentEventCursor(String(req.headers['last-event-id'] || ''));
    let firstSnapshot = true;
    const emit = (event: any) => {
      if (res.writableEnded || res.destroyed || event.ownerId !== user!.uid) return;
      const timestamp = Number(event.timestamp) || 0;
      const sequence = Number(event.sequence) || timestamp;
      if (cursor && (sequence < cursor.sequence || (sequence === cursor.sequence && String(event.id) <= cursor.eventId))) return;
      const sseId = `${sequence}:${event.id}`;
      if (!res.write(`id: ${sseId}\nevent: agent-event\ndata: ${JSON.stringify(event)}\n\n`)) {
        // Backpressure is bounded by disconnecting the slow client; the durable event log is replayable.
        res.destroy();
        return;
      }
      cursor = { sequence, eventId: String(event.id) };
    };
    const query = adminDb.collection('agentTaskEvents').where('taskId', '==', req.params.id);
    const unsubscribe = query.onSnapshot(snapshot => {
      const docs = firstSnapshot ? snapshot.docs.map(document => document.data()).sort((a: any, b: any) => Number(a.sequence || a.timestamp) - Number(b.sequence || b.timestamp) || String(a.id).localeCompare(String(b.id))).slice(-100) : snapshot.docChanges().filter(change => change.type === 'added').map(change => change.doc.data());
      firstSnapshot = false;
      docs.sort((a: any, b: any) => Number(a.sequence || a.timestamp) - Number(b.sequence || b.timestamp) || String(a.id).localeCompare(String(b.id))).forEach(emit);
    }, error => {
      console.error(`[AgentOrchestrator] Event stream failed for task ${req.params.id}:`, error);
      if (!res.destroyed) res.end();
    });
    const keepAlive = setInterval(() => { if (!res.destroyed) res.write(': keep-alive\n\n'); }, 20_000);
    keepAlive.unref?.();
    const close = () => { clearInterval(keepAlive); unsubscribe(); };
    res.on('close', close);
    req.on('aborted', close);
  }));

  // 6. Pause task
  app.post('/api/agents/tasks/:id/pause', asyncRoute(async (req: any, res: any) => {
    const user = await resolveUser(req);
    const task = user ? await orchestrator.getTaskDurable(req.params.id, user.uid) : null;
    if (!task) {
      return res.status(404).json({ error: 'Task not found or access denied.' });
    }
    try {
      await orchestrator.setTaskStatusDurable(req.params.id, 'PAUSED');
      orchestrator.logEvent(req.params.id, 'task_paused', 'Task paused by user.');
      res.json({ success: true });
    } catch (error: any) {
      res.status(409).json({ error: error.message || 'Task could not be paused.' });
    }
  }));

  // 7. Resume task
  app.post('/api/agents/tasks/:id/resume', asyncRoute(async (req: any, res: any) => {
    const user = await resolveUser(req);
    const task = user ? await orchestrator.getTaskDurable(req.params.id, user.uid) : null;
    if (!task) {
      return res.status(404).json({ error: 'Task not found or access denied.' });
    }
    try {
      await orchestrator.resumeTaskDurable(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(409).json({ error: error.message || 'Task could not be resumed.' });
    }
  }));

  app.post('/api/agents/tasks/:id/retry', asyncRoute(async (req: any, res: any) => {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in to retry this task.' });
    try {
      const task = await orchestrator.retryTaskDurable(req.params.id, user.uid);
      res.status(201).json(task);
    } catch (error: any) {
      res.status(error.message?.includes('not found or access denied') ? 404 : 409).json({ error: error.message || 'Task retry failed.' });
    }
  }));

  const runAgentGitHubAction = (action: (task: any, ownerId: string, body: any) => Promise<Record<string, unknown>>) => asyncRoute(async (req: any, res: any) => {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in to use GitHub with this agent task.' });
    const task = await orchestrator.getTaskDurable(req.params.id, user.uid);
    if (!task) return res.status(404).json({ error: 'Agent task not found or access denied.' });
    try {
      const result = await action(task, user.uid, req.body || {});
      res.json({ success: true, ...result });
    } catch (error: any) {
      const status = Number(error.status) || (/credentials|Firestore|integration storage/i.test(error.message || '') ? 503 : 500);
      res.status(status).json({ error: error.message || 'GitHub operation failed safely.', ...(error.details || {}) });
    }
  });

  // Use the project's linked repository and encrypted OAuth connection; task operations never move its current/default branch.
  app.post('/api/agents/tasks/:id/github/publish', runAgentGitHubAction((task, ownerId) => publishAgentTaskBranch(task, ownerId)));
  app.post('/api/agents/tasks/:id/github/pull-request', runAgentGitHubAction((task, ownerId) => createAgentTaskPullRequest(task, ownerId)));
  app.post('/api/agents/tasks/:id/github/approve', runAgentGitHubAction((task, ownerId) => approveAgentTaskPullRequest(task, ownerId)));
  app.post('/api/agents/tasks/:id/github/refresh', runAgentGitHubAction((task, ownerId) => refreshAgentTaskPullRequest(task, ownerId)));
  app.post('/api/agents/tasks/:id/github/merge', runAgentGitHubAction((task, ownerId, body) => mergeAgentTaskPullRequest(task, ownerId, body.confirmed === true)));

  // 8. Cancel task
  app.post('/api/agents/tasks/:id/cancel', asyncRoute(async (req: any, res: any) => {
    const user = await resolveUser(req);
    const task = user ? await orchestrator.getTaskDurable(req.params.id, user.uid) : null;
    if (!task) {
      return res.status(404).json({ error: 'Task not found or access denied.' });
    }
    try {
      await orchestrator.setTaskStatusDurable(req.params.id, 'CANCELLED');
      orchestrator.logEvent(req.params.id, 'task_cancelled', 'Task cancelled by user.');
      res.json({ success: true });
    } catch (error: any) {
      res.status(409).json({ error: error.message || 'Task could not be cancelled.' });
    }
  }));
}

function parseAgentEventCursor(value: string): { sequence: number; eventId: string } | null {
  const match = /^(\d+):(.+)$/.exec(value);
  return match ? { sequence: Number(match[1]), eventId: match[2] } : null;
}
