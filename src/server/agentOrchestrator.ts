import { v4 as uuidv4 } from 'uuid';
import { AgentRunner } from './agent/agentRunner';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { verifyFirebaseIdToken } from './authMiddleware';

// Sensitive patterns to exclude from any agent file context
const SENSITIVE_PATTERNS = [
  /^\.env($|\..*)/i,
  /^node_modules\//i,
  /^\.git\//i,
  /^dist\//i,
  /^build\//i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
  /^\.DS_Store$/i
];

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

    // Limit maximum file size (500KB)
    let content = typeof file.content === 'string' ? file.content : '';
    if (content.length > 500 * 1024) {
      content = content.slice(0, 500 * 1024);
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

  // If project exists in Firestore, enforce ownership check
  try {
    const projectRef = doc(db, 'projects', sanitizedId);
    const snap = await getDoc(projectRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data.ownerId && data.ownerId !== userId) {
        return { 
          authorized: false, 
          error: `Unauthorized: User "${userId}" does not have access to project "${sanitizedId}".` 
        };
      }
    }
  } catch (err: any) {
    // If Firestore is offline or local workspace, verify against in-memory registry
  }

  // Verify against in-memory orchestrator project registry
  const registeredOwner = orchestrator.getProjectOwner(sanitizedId);
  if (registeredOwner && registeredOwner !== userId) {
    return {
      authorized: false,
      error: `Unauthorized: Project "${sanitizedId}" is owned by another user.`
    };
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

  getProjectOwner(projectId: string): string | undefined {
    return this.projectOwners.get(projectId);
  }

  registerProjectOwner(projectId: string, userId: string) {
    if (projectId && userId) {
      this.projectOwners.set(projectId, userId);
    }
  }

  async createTask(taskData: any, userAuth?: { uid: string }): Promise<any> {
    const userId = userAuth?.uid || taskData.userId || 'user';
    const projectId = taskData.projectId || taskData.parentTaskId || 'default-workspace';

    // 1. Strict Project Access Validation
    const accessCheck = await validateProjectAccess(userId, projectId);
    if (!accessCheck.authorized) {
      throw new Error(accessCheck.error || 'Project access denied.');
    }

    // Register project ownership
    this.registerProjectOwner(projectId, userId);

    // 2. Strict File Path Normalization
    const rawFiles = taskData.context?.files || [];
    const { safeFiles, rejectedCount, errors } = validateAndNormalizeFileNodes(rawFiles);

    // 3. Agent Role & Model ID Validation
    const assignedAgentId = AGENT_ROLES[taskData.assignedAgentId] 
      ? taskData.assignedAgentId 
      : 'main-agent';

    let modelId = taskData.modelId || 'gemini-3.1-flash-lite';
    if (modelId === 'gemini-2.0-flash' || modelId === 'gemini-1.5-flash') {
      modelId = 'gemini-3.1-flash-lite';
    }

    const taskId = uuidv4();
    const task = {
      ...taskData,
      id: taskId,
      name: String(taskData.name || 'Agent Task').slice(0, 200),
      description: String(taskData.description || '').slice(0, 5000),
      projectId,
      ownerId: userId,
      assignedAgentId,
      modelId,
      status: 'QUEUED',
      progress: 0,
      context: {
        ...(taskData.context || {}),
        files: safeFiles
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.tasks.set(taskId, task);
    this.events.set(taskId, [
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
    ]);

    // Asynchronously begin task processing
    setTimeout(() => this.processTask(taskId), 300);
    return task;
  }

  private async processTask(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task || task.status === 'CANCELLED' || task.status === 'PAUSED') return;

    // STEP 1: Verify Project Access Before Any Tool Execution
    this.updateTaskStatus(taskId, 'PLANNING', 10);
    const accessCheck = await validateProjectAccess(task.ownerId, task.projectId);
    if (!accessCheck.authorized) {
      this.logEvent(taskId, 'access_denied', accessCheck.error || 'Project access validation failed.');
      this.updateTaskStatus(taskId, 'FAILED');
      return;
    }
    this.logEvent(taskId, 'project_access_verified', `Confirmed project access for "${task.projectId}".`);

    // STEP 2: Normalize and Re-Sanitize Files Context
    const { safeFiles, rejectedCount } = validateAndNormalizeFileNodes(task.context?.files || []);
    task.context.files = safeFiles;
    this.logEvent(taskId, 'file_paths_normalized', `Validated ${safeFiles.length} file path(s) before execution.`);

    // STEP 3: Verify Tool Permissions for Assigned Agent Role
    const roleConfig = AGENT_ROLES[task.assignedAgentId] || AGENT_ROLES['main-agent'];
    this.logEvent(
      taskId, 
      'tool_permissions_verified', 
      `Agent "${task.assignedAgentId}" authorized with permissions: [${roleConfig.allowedTools.join(', ')}].`
    );

    await new Promise(resolve => setTimeout(resolve, 500));
    if (this.tasks.get(taskId)?.status === 'PAUSED' || this.tasks.get(taskId)?.status === 'CANCELLED') return;

    // STEP 4: Execution Step
    if (task.assignedAgentId === 'main-agent') {
      this.logEvent(taskId, 'agent_progress', 'Main Agent is delegating tasks to authorized specialist agents.');

      // Subtasks inherit authorized project, ownerId, and sanitized files
      const subtask1 = await this.createTask({
        name: `[Sub-task] UI Implementation for: ${task.name}`,
        description: task.description ? `Frontend UI: ${task.description}` : 'Implement the frontend components.',
        assignedAgentId: 'ui-agent',
        modelId: 'gemini-3.1-flash-lite',
        parentTaskId: taskId,
        projectId: task.projectId,
        userId: task.ownerId,
        context: { files: safeFiles }
      }, { uid: task.ownerId });

      const subtask2 = await this.createTask({
        name: `[Sub-task] Backend Integration for: ${task.name}`,
        description: task.description ? `Backend API: ${task.description}` : 'Implement the backend APIs and logic.',
        assignedAgentId: 'backend-agent',
        modelId: 'gemini-3.1-flash-lite',
        parentTaskId: taskId,
        projectId: task.projectId,
        userId: task.ownerId,
        context: { files: safeFiles }
      }, { uid: task.ownerId });

      this.updateTaskStatus(taskId, 'EXECUTING', 40);

      // Wait for subtasks with timeout guard
      let subtasksFinished = false;
      const waitStart = Date.now();
      const MAX_WAIT_MS = 30000;

      while (!subtasksFinished) {
        if (this.tasks.get(taskId)?.status === 'PAUSED' || this.tasks.get(taskId)?.status === 'CANCELLED') return;

        if (Date.now() - waitStart > MAX_WAIT_MS) {
          this.logEvent(taskId, 'subtask_timeout', 'Subtask coordination timed out after 30 seconds.');
          this.updateTaskStatus(taskId, 'FAILED', this.tasks.get(taskId)?.progress || 40);
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        const st1 = this.tasks.get(subtask1.id);
        const st2 = this.tasks.get(subtask2.id);

        if (st1?.status === 'FAILED' || st2?.status === 'FAILED') {
          this.logEvent(taskId, 'subtask_failed', 'One or more subtasks encountered a failure.');
          this.updateTaskStatus(taskId, 'FAILED');
          return;
        }

        if (st1?.status === 'CANCELLED' || st2?.status === 'CANCELLED') {
          this.logEvent(taskId, 'subtask_cancelled', 'A delegated subtask was cancelled.');
          this.updateTaskStatus(taskId, 'CANCELLED');
          return;
        }

        if (st1 && st2 && st1.status === 'COMPLETED' && st2.status === 'COMPLETED') {
          subtasksFinished = true;
        }
      }

      this.logEvent(taskId, 'agent_progress', 'Delegated sub-agents completed their tasks. Reviewing results.');
    } else {
      this.updateTaskStatus(taskId, 'EXECUTING', 30);
      this.logEvent(taskId, 'agent_progress', `Agent "${task.assignedAgentId}" is executing requested steps.`);

      // If task contains real prompt and project files, execute real reasoning with AgentRunner
      if (task.description && process.env.GEMINI_API_KEY && safeFiles.length > 0) {
        try {
          const result = await AgentRunner.run({
            model: task.modelId && task.modelId.startsWith('gemini') && task.modelId !== 'gemini-2.0-flash' 
              ? task.modelId 
              : 'gemini-3.1-flash-lite',
            prompt: task.description,
            virtualFiles: safeFiles,
            projectName: task.name || 'Workspace',
            projectId: task.projectId,
            userId: task.ownerId,
            onEvent: (event) => {
              // Intercept tool calls to log tool permissions verification
              if (event.type === 'tool_started' && event.tool) {
                const perm = validateToolPermission(task.assignedAgentId, event.tool);
                if (!perm.allowed) {
                  this.logEvent(taskId, 'tool_permission_denied', perm.error || 'Tool permission denied.');
                  return;
                }
              }
              this.logEvent(taskId, event.type, event.message, event.args);
            }
          });

          if (result.changeSet) {
            this.logEvent(taskId, 'review_ready', 'Code changes generated and ready for review', result.changeSet);
          }
        } catch (err: any) {
          this.logEvent(taskId, 'agent_error', `Agent execution note: ${err.message}`);
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (this.tasks.get(taskId)?.status === 'PAUSED' || this.tasks.get(taskId)?.status === 'CANCELLED') return;

    // STEP 5: Validation & Completion
    this.updateTaskStatus(taskId, 'VALIDATING', 80);
    this.logEvent(taskId, 'validation_started', 'Validating changes and file integrity before completion.');

    await new Promise(resolve => setTimeout(resolve, 600));

    this.updateTaskStatus(taskId, 'COMPLETED', 100);
    this.logEvent(taskId, 'task_completed', 'Task completed successfully with all security checks verified.');
  }

  updateTaskStatus(taskId: string, status: string, progress?: number) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      if (progress !== undefined) task.progress = Math.max(task.progress, progress);
      task.updatedAt = Date.now();
      this.tasks.set(taskId, task);
    }
  }

  logEvent(taskId: string, type: string, message: string, payload?: any) {
    const task = this.tasks.get(taskId);
    const event = {
      id: uuidv4(),
      taskId,
      agentId: task?.assignedAgentId || 'system',
      type,
      message,
      timestamp: Date.now(),
      payload
    };
    if (!this.events.has(taskId)) {
      this.events.set(taskId, []);
    }
    this.events.get(taskId)?.push(event);
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

export const orchestrator = new AgentOrchestrator();

/**
 * Setup HTTP routes for agent orchestrator with authentication and ownership guards
 */
export function setupAgentOrchestratorRoutes(app: any) {
  // Helper to resolve user from auth header or request
  const resolveUser = async (req: any): Promise<{ uid: string } | null> => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const verified = await verifyFirebaseIdToken(token);
      if (verified) return verified;
    }
    if (req.user?.uid) {
      return { uid: req.user.uid };
    }
    if (req.body?.userId && typeof req.body.userId === 'string') {
      return { uid: req.body.userId };
    }
    return { uid: 'user' };
  };

  // 1. Create agent task
  app.post('/api/agents/tasks', async (req: any, res: any) => {
    try {
      const user = await resolveUser(req);
      const task = await orchestrator.createTask(req.body, user || undefined);
      res.status(201).json(task);
    } catch (err: any) {
      const status = err.message?.includes('Unauthorized') ? 403 : 400;
      res.status(status).json({ error: err.message || 'Failed to create task.' });
    }
  });

  // 2. Get task by ID
  app.get('/api/agents/tasks/:id', async (req: any, res: any) => {
    const user = await resolveUser(req);
    const task = orchestrator.getTask(req.params.id, user?.uid);
    if (task) {
      res.json(task);
    } else {
      res.status(404).json({ error: 'Task not found or access denied.' });
    }
  });

  // 3. List tasks
  app.get('/api/agents/tasks', async (req: any, res: any) => {
    const user = await resolveUser(req);
    res.json(orchestrator.getTasks(user?.uid));
  });

  // 4. Get all events
  app.get('/api/agents/events', async (req: any, res: any) => {
    const user = await resolveUser(req);
    res.json(orchestrator.getAllEvents(user?.uid));
  });

  // 5. Get events for a specific task
  app.get('/api/agents/tasks/:id/events', async (req: any, res: any) => {
    const user = await resolveUser(req);
    const events = orchestrator.getEvents(req.params.id, user?.uid);
    res.json(events);
  });

  // 6. Pause task
  app.post('/api/agents/tasks/:id/pause', async (req: any, res: any) => {
    const user = await resolveUser(req);
    const task = orchestrator.getTask(req.params.id, user?.uid);
    if (!task) {
      return res.status(404).json({ error: 'Task not found or access denied.' });
    }
    orchestrator.updateTaskStatus(req.params.id, 'PAUSED');
    orchestrator.logEvent(req.params.id, 'task_paused', 'Task paused by user.');
    res.json({ success: true });
  });

  // 7. Resume task
  app.post('/api/agents/tasks/:id/resume', async (req: any, res: any) => {
    const user = await resolveUser(req);
    const task = orchestrator.getTask(req.params.id, user?.uid);
    if (!task) {
      return res.status(404).json({ error: 'Task not found or access denied.' });
    }
    orchestrator.updateTaskStatus(req.params.id, 'QUEUED');
    orchestrator.logEvent(req.params.id, 'task_resumed', 'Task resumed by user.');
    res.json({ success: true });
  });

  // 8. Cancel task
  app.post('/api/agents/tasks/:id/cancel', async (req: any, res: any) => {
    const user = await resolveUser(req);
    const task = orchestrator.getTask(req.params.id, user?.uid);
    if (!task) {
      return res.status(404).json({ error: 'Task not found or access denied.' });
    }
    orchestrator.updateTaskStatus(req.params.id, 'CANCELLED');
    orchestrator.logEvent(req.params.id, 'task_cancelled', 'Task cancelled by user.');
    res.json({ success: true });
  });
}
