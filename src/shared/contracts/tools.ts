/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canonical Agent Tool Registry Contracts (Phase 2)
 *
 * Establishes a unified tool interface, parameter schema validation, execution boundaries,
 * and explicit approval gates for both server-side agent loops and native desktop composer agents.
 */

import { IWorkspaceService } from './workspace';

export interface ToolExecutionContext {
  readonly workspace: IWorkspaceService;
  readonly userId: string;
  readonly projectId: string;
  readonly signal?: AbortSignal;
  readonly maxReadBytes?: number;
  readonly allowedCommands?: readonly string[];
}

export interface ToolExecutionResult {
  readonly toolName: string;
  readonly success: boolean;
  readonly data?: any;
  readonly error?: string;
  readonly requiresApproval?: boolean;
  readonly approvalReason?: string;
  readonly durationMs: number;
  readonly timestamp: number;
}

export interface IToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parametersSchema: Record<string, any>;
  readonly requiresApproval: boolean;
  execute(args: any, context: ToolExecutionContext): Promise<ToolExecutionResult>;
}

export interface IToolRegistry {
  register(tool: IToolDefinition): void;
  get(name: string): IToolDefinition | undefined;
  list(): readonly IToolDefinition[];
  execute(name: string, args: any, context: ToolExecutionContext): Promise<ToolExecutionResult>;
}

/**
 * Standard Tool Parameter Schemas for Canonical Agent Tools
 */
export const CANONICAL_TOOL_SCHEMAS = {
  list_dir: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative folder path inside workspace' },
      recursive: { type: 'boolean', description: 'Whether to list subfolders recursively' },
      maxFiles: { type: 'number', description: 'Maximum number of files to return' },
    },
    required: [],
  },
  read_file: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path of the workspace file to read' },
      maxLines: { type: 'number', description: 'Optional maximum line count to read' },
    },
    required: ['path'],
  },
  search_codebase: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language or symbol search query' },
      limit: { type: 'number', description: 'Maximum search results (1-25)' },
    },
    required: ['query'],
  },
  propose_changes: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Concise summary of the planned modification' },
      explanation: { type: 'string', description: 'Architectural rationale for the edits' },
      changes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative workspace file path' },
            content: { type: 'string', description: 'Proposed complete file content' },
            isDeletion: { type: 'boolean', description: 'Whether this file is marked for deletion' },
          },
          required: ['path'],
        },
      },
    },
    required: ['title', 'changes'],
  },
  run_command: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Approved verification or test command to run' },
      timeoutMs: { type: 'number', description: 'Command execution timeout in milliseconds' },
    },
    required: ['command'],
  },
} as const;

/**
 * Canonical Tool Registry Implementation
 */
export class CanonicalToolRegistry implements IToolRegistry {
  private readonly tools: Map<string, IToolDefinition> = new Map();

  register(tool: IToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool with name "${tool.name}" is already registered in CanonicalToolRegistry.`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): IToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): readonly IToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async execute(name: string, args: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const tool = this.get(name);
    const start = Date.now();

    if (!tool) {
      return {
        toolName: name,
        success: false,
        error: `Tool "${name}" is not registered in the CanonicalToolRegistry.`,
        durationMs: Date.now() - start,
        timestamp: start,
      };
    }

    if (context.signal?.aborted) {
      return {
        toolName: name,
        success: false,
        error: 'Execution cancelled via AbortSignal.',
        durationMs: Date.now() - start,
        timestamp: start,
      };
    }

    try {
      return await tool.execute(args || {}, context);
    } catch (err: any) {
      return {
        toolName: name,
        success: false,
        error: err?.message || String(err),
        durationMs: Date.now() - start,
        timestamp: start,
      };
    }
  }
}
