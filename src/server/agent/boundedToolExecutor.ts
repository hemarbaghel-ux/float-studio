/**
 * FLOAT AI - Authoritative Bounded Agent Tool Executor (Phase 6)
 *
 * Implements BOUNDED AUTONOMOUS AGENT MODE:
 * - AI may inspect authorized project files and search project context.
 * - AI may request approved, sandboxed verification commands.
 * - AI code changes must be structured proposals and remain unapplied until explicit user approval.
 * - Enforces project-scoped authorization, iteration and time limits, cancellation, and auditability.
 * - Never allows model output to bypass server-side permissions.
 */

import { ExecutionPolicyManager, PolicyDecision, ToolExecutionRequest } from '../policy/executionPolicy';
import { verifyProjectOwnership } from '../projectOwnership';
import { loadProjectFileTreeAdmin } from '../projectContent';
import { ProposalService } from '../proposals/proposalService';
import { isSensitivePath, isPathTraversal, normalizeWorkspacePath, isBinaryFile } from '../../services/indexing/fileFilter';
import type { FileNode } from '../../types';
import type { DiffStats, ProposalChange } from '../../types/proposal';

export type BoundedToolName = 'list_project_files' | 'read_project_file' | 'search_codebase' | 'propose_changes';

export interface BoundedToolCall {
  toolName: BoundedToolName;
  args: Record<string, any>;
}

export interface BoundedToolContext {
  userId: string;
  projectId: string;
  files?: FileNode[];
  virtualFiles?: Map<string, { content?: string }>;
  signal?: AbortSignal;
}

export interface ToolExecutionOutcome {
  toolName: string;
  success: boolean;
  requiresHumanApproval?: boolean;
  approvalReason?: string;
  data?: any;
  error?: string;
  durationMs: number;
  timestamp: number;
}

export interface AgentExecutionTrace {
  taskId: string;
  projectId: string;
  userId: string;
  iterations: number;
  maxIterations: number;
  status: 'completed' | 'max_iterations_exceeded' | 'timeout' | 'cancelled' | 'error';
  outcomes: ToolExecutionOutcome[];
  proposalsGenerated: string[];
  startTime: number;
  endTime: number;
  error?: string;
}

const MAX_FILE_READ_CHARS = 50000;
const MAX_SEARCH_RESULTS = 25;
const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_TIMEOUT_MS = 30000;

export class BoundedToolExecutor {
  /**
   * Flattens a FileNode tree into relative workspace paths and contents
   */
  static flattenFileNodes(nodes: FileNode[], prefix = ''): Array<{ path: string; content?: string }> {
    const result: Array<{ path: string; content?: string }> = [];
    for (const node of nodes) {
      const currentPath = prefix ? `${prefix}/${node.name}` : node.name;
      if (node.type === 'file') {
        result.push({ path: currentPath, content: node.content });
      } else if (node.type === 'folder' && Array.isArray(node.children)) {
        result.push(...this.flattenFileNodes(node.children, currentPath));
      }
    }
    return result;
  }

  /**
   * Executes a single authorized bounded tool call with strict boundary and policy checks
   */
  static async executeTool(
    call: BoundedToolCall,
    ctx: BoundedToolContext
  ): Promise<ToolExecutionOutcome> {
    const startTime = Date.now();
    const { toolName, args } = call;

    // 1. Cancellation check
    if (ctx.signal?.aborted) {
      return {
        toolName,
        success: false,
        error: 'Operation aborted by user.',
        durationMs: Date.now() - startTime,
        timestamp: startTime
      };
    }

    // 2. Project Ownership & Tenant Boundary Authorization
    if (!ctx.userId || !ctx.projectId) {
      return {
        toolName,
        success: false,
        error: 'Authentication and valid projectId are required.',
        durationMs: Date.now() - startTime,
        timestamp: startTime
      };
    }

    const ownership = await verifyProjectOwnership(ctx.projectId, ctx.userId, {
      allowMissing: false
    });
    if (!ownership.allowed) {
      return {
        toolName,
        success: false,
        error: ownership.error || 'Project access forbidden.',
        durationMs: Date.now() - startTime,
        timestamp: startTime
      };
    }

    // 3. Execution Policy Check
    const category: ToolExecutionRequest['category'] =
      toolName === 'propose_changes' ? 'write' : 'read';

    const policyDecision: PolicyDecision = ExecutionPolicyManager.evaluate({
      toolName,
      category,
      args,
      userId: ctx.userId,
      projectId: ctx.projectId
    });

    if (policyDecision.requiresHumanApproval) {
      return {
        toolName,
        success: false,
        requiresHumanApproval: true,
        approvalReason: policyDecision.reason,
        durationMs: Date.now() - startTime,
        timestamp: startTime
      };
    }

    if (!policyDecision.permitted) {
      return {
        toolName,
        success: false,
        error: policyDecision.reason || `Execution of tool "${toolName}" is forbidden by policy.`,
        durationMs: Date.now() - startTime,
        timestamp: startTime
      };
    }

    // 4. Resolve Project Files (from memory context or Firestore)
    let flattenedFiles: Array<{ path: string; content?: string }> = [];
    if (ctx.files && ctx.files.length > 0) {
      flattenedFiles = this.flattenFileNodes(ctx.files);
    } else if (ownership.projectData) {
      const tree = await loadProjectFileTreeAdmin(ctx.projectId, ownership.projectData);
      flattenedFiles = this.flattenFileNodes(tree);
    }

    // 5. Execute Tool Handlers
    try {
      switch (toolName) {
        case 'list_project_files': {
          const files = flattenedFiles
            .filter(f => !isSensitivePath(f.path))
            .map(f => ({
              path: f.path,
              size: (f.content || '').length
            }));

          return {
            toolName,
            success: true,
            data: { files, total: files.length },
            durationMs: Date.now() - startTime,
            timestamp: startTime
          };
        }

        case 'read_project_file': {
          const rawPath = String(args?.path || args?.filePath || '').trim();
          if (!rawPath) {
            return {
              toolName,
              success: false,
              error: 'File path argument is required.',
              durationMs: Date.now() - startTime,
              timestamp: startTime
            };
          }

          if (isPathTraversal(rawPath)) {
            return {
              toolName,
              success: false,
              error: 'Path traversal (../) is strictly forbidden.',
              durationMs: Date.now() - startTime,
              timestamp: startTime
            };
          }

          const norm = normalizeWorkspacePath(rawPath);
          if (isSensitivePath(norm)) {
            return {
              toolName,
              success: false,
              error: `Access to sensitive credential or key path "${norm}" is forbidden.`,
              durationMs: Date.now() - startTime,
              timestamp: startTime
            };
          }

          const file = flattenedFiles.find(f => normalizeWorkspacePath(f.path) === norm);
          if (!file) {
            return {
              toolName,
              success: false,
              error: `File not found: "${norm}"`,
              durationMs: Date.now() - startTime,
              timestamp: startTime
            };
          }

          let content = file.content || '';
          let truncated = false;
          if (content.length > MAX_FILE_READ_CHARS) {
            content = content.slice(0, MAX_FILE_READ_CHARS);
            truncated = true;
          }

          return {
            toolName,
            success: true,
            data: {
              path: norm,
              content,
              truncated,
              totalLength: (file.content || '').length
            },
            durationMs: Date.now() - startTime,
            timestamp: startTime
          };
        }

        case 'search_codebase': {
          const query = String(args?.query || '').trim();
          if (!query) {
            return {
              toolName,
              success: true,
              data: { matches: [], total: 0 },
              durationMs: Date.now() - startTime,
              timestamp: startTime
            };
          }

          const lowerQuery = query.toLowerCase();
          const matches: Array<{ path: string; line: number; preview: string }> = [];

          for (const file of flattenedFiles) {
            if (isSensitivePath(file.path) || isBinaryFile(file.path, file.content)) {
              continue;
            }

            const lines = (file.content || '').split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(lowerQuery)) {
                matches.push({
                  path: file.path,
                  line: i + 1,
                  preview: lines[i].trim().slice(0, 200)
                });
                if (matches.length >= MAX_SEARCH_RESULTS) break;
              }
            }
            if (matches.length >= MAX_SEARCH_RESULTS) break;
          }

          return {
            toolName,
            success: true,
            data: { matches, total: matches.length, truncated: matches.length >= MAX_SEARCH_RESULTS },
            durationMs: Date.now() - startTime,
            timestamp: startTime
          };
        }

        case 'propose_changes': {
          // Bounded Autonomous Agent Mode principle: Never silently mutates files.
          // Changes are packaged into an explicit reviewable proposal.
          const description = String(args?.description || 'AI Proposed Changes').trim();
          const rawChanges = Array.isArray(args?.changes) ? args.changes : [];

          if (rawChanges.length === 0) {
            return {
              toolName,
              success: false,
              error: 'Proposal requires at least one file change.',
              durationMs: Date.now() - startTime,
              timestamp: startTime
            };
          }

          // Build virtual files map from current flattened files
          const virtualFilesMap = new Map<string, { content?: string }>();
          for (const f of flattenedFiles) {
            virtualFilesMap.set(normalizeWorkspacePath(f.path), { content: f.content || '' });
          }

          const proposalResult = ProposalService.createProposal({
            ownerId: ctx.userId,
            projectId: ctx.projectId,
            description,
            rawChanges,
            virtualFiles: virtualFilesMap
          });

          if (proposalResult.error || !proposalResult.proposal) {
            return {
              toolName,
              success: false,
              error: proposalResult.error || 'Failed to create proposal.',
              durationMs: Date.now() - startTime,
              timestamp: startTime
            };
          }

          const p = proposalResult.proposal;
          const totalAdditions = p.changes.reduce((sum, c) => sum + (c.diffStats?.additions || 0), 0);
          const totalDeletions = p.changes.reduce((sum, c) => sum + (c.diffStats?.deletions || 0), 0);
          const diffStats: DiffStats = { additions: totalAdditions, deletions: totalDeletions };

          return {
            toolName,
            success: true,
            data: {
              proposalId: p.id,
              status: p.status, // always 'pending_review'
              description: p.description,
              affectedFiles: p.affectedFiles,
              diffStats,
              changes: p.changes.map(c => ({
                path: c.path,
                operation: c.operation,
                diffStats: c.diffStats
              })),
              message: 'Proposal created successfully. Changes remain unapplied pending explicit user review.'
            },
            durationMs: Date.now() - startTime,
            timestamp: startTime
          };
        }

        default:
          return {
            toolName,
            success: false,
            error: `Unsupported bounded tool: "${toolName}".`,
            durationMs: Date.now() - startTime,
            timestamp: startTime
          };
      }
    } catch (err: any) {
      return {
        toolName,
        success: false,
        error: err.message || 'Tool execution encountered an internal error.',
        durationMs: Date.now() - startTime,
        timestamp: startTime
      };
    }
  }

  /**
   * Runs a bounded agent loop with strict iteration limit, timeout, cancellation, and audit trace.
   */
  static async runBoundedAgentLoop(
    calls: BoundedToolCall[],
    ctx: BoundedToolContext,
    options: {
      maxIterations?: number;
      timeoutMs?: number;
      taskId?: string;
    } = {}
  ): Promise<AgentExecutionTrace> {
    const startTime = Date.now();
    const maxIterations = options.maxIterations || DEFAULT_MAX_ITERATIONS;
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const taskId = options.taskId || `task-${Date.now()}`;

    const outcomes: ToolExecutionOutcome[] = [];
    const proposalsGenerated: string[] = [];

    const trace: AgentExecutionTrace = {
      taskId,
      projectId: ctx.projectId,
      userId: ctx.userId,
      iterations: 0,
      maxIterations,
      status: 'completed',
      outcomes,
      proposalsGenerated,
      startTime,
      endTime: startTime
    };

    for (const call of calls) {
      // 1. Iteration limit enforcement
      if (trace.iterations >= maxIterations) {
        trace.status = 'max_iterations_exceeded';
        trace.error = `Task exceeded maximum permitted iteration budget (${maxIterations} steps).`;
        break;
      }

      // 2. Timeout enforcement
      if (Date.now() - startTime > timeoutMs) {
        trace.status = 'timeout';
        trace.error = `Task exceeded maximum runtime duration (${timeoutMs}ms).`;
        break;
      }

      // 3. User cancellation check
      if (ctx.signal?.aborted) {
        trace.status = 'cancelled';
        trace.error = 'Task was cancelled by the user.';
        break;
      }

      trace.iterations++;
      const outcome = await this.executeTool(call, ctx);
      outcomes.push(outcome);

      if (outcome.toolName === 'propose_changes' && outcome.success && outcome.data?.proposalId) {
        proposalsGenerated.push(outcome.data.proposalId);
      }

      // If a tool requested human approval or failed, halt the automatic loop
      if (outcome.requiresHumanApproval) {
        break;
      }
    }

    trace.endTime = Date.now();
    return trace;
  }
}
