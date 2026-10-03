import { FileNode } from '../../types';

export interface ToolExecutionContext {
  userId: string;
  projectId: string;
  projectName: string;
  virtualFiles: Map<string, { path: string; name?: string; content?: string; type: string }>;
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
