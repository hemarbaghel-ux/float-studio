import { FileNode } from '../../types';

export type CommandExecutionOutcome =
  | 'sandbox_passed'
  | 'sandbox_failed'
  | 'syntax_validation_only'
  | 'command_unavailable'
  | 'requires_approval';

export interface SandboxExecutionPayload {
  ownerId: string;
  projectId: string;
  command: string;
  files: Array<{ path: string; content?: string }>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface SandboxExecutionResult {
  status: 'succeeded' | 'failed' | 'timed_out' | 'cancelled';
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface ToolExecutionContext {
  userId: string;
  projectId: string;
  projectName: string;
  /** Present only for persisted background tasks that own an isolated Git worktree. */
  agentTaskId?: string;
  virtualFiles: Map<string, { path: string; name?: string; content?: string; type: string }>;
  /**
   * Immutable baseline snapshot captured before the first staged edit in an agent session.
   * Maps safePath -> original file entry (or `null` if the file did not exist in the baseline).
   */
  baselineFiles?: Map<string, { path: string; name?: string; content?: string; type: string } | null>;
  /** Optional execution policy mode ('readonly' | 'ask' | 'allowlist' | 'full_sandbox'). */
  executionPolicy?: 'readonly' | 'ask' | 'allowlist' | 'full_sandbox';
  /** When true, commands require explicit user approval before running. */
  requireCommandApproval?: boolean;
  /** Explicit test/runtime flag to authorize sandboxed execution when configured. */
  enableSandboxExecution?: boolean;
  /** Optional isolated sandbox executor override (defaults to projectProcessManager.execute). */
  sandboxExecutor?: (request: SandboxExecutionPayload) => Promise<SandboxExecutionResult>;
  signal?: AbortSignal;
}

export interface ToolResult {
  success: boolean;
  output?: any;
  error?: string;
  truncated?: boolean;
}

export interface ToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
  };
  permissionRequired: 'read' | 'write';
  timeoutMs?: number;
  maxOutputChars?: number;
  handler: (args: Record<string, any>, context: ToolExecutionContext) => Promise<ToolResult>;
}

export type AgentProgressAction = 
  | 'Searching'
  | 'Reading'
  | 'Editing'
  | 'Running command'
  | 'Exploring'
  | 'Inspecting'
  | 'Generating proposal'
  | 'Planning'
  | 'Thinking'
  | 'Synthesizing';

export interface AgentProgressEvent {
  type: 
    | 'task_started'
    | 'planning'
    | 'thinking'
    | 'tool_started'
    | 'tool_completed'
    | 'tool_failed'
    | 'review_ready'
    | 'completed'
    | 'cancelled'
    | 'failed';
  action?: AgentProgressAction;
  message: string;
  tool?: string;
  args?: Record<string, any>;
  outputSummary?: string;
}
