/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canonical Agent Tool Registry Contracts (Phase 2 & Phase 5)
 *
 * Establishes a unified tool interface, parameter schema validation, execution boundaries,
 * and explicit approval gates for both server-side agent loops and native desktop composer agents.
 */

import crypto from 'node:crypto';
import { IWorkspaceService } from './workspace';

export interface ToolApprovalPayload {
  readonly toolName: string;
  readonly paramsHash: string;
  readonly userId: string;
  readonly projectId: string;
  readonly nonce: string;
  readonly expiresAt: number;
}

export function computeToolParamsHash(args: any): string {
  const normalize = (val: any): any => {
    if (val === null || typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map(normalize);
    const sorted: Record<string, any> = {};
    for (const key of Object.keys(val).sort()) {
      sorted[key] = normalize(val[key]);
    }
    return sorted;
  };
  const json = JSON.stringify(normalize(args ?? {}));
  return crypto.createHash('sha256').update(json).digest('hex');
}

const DEFAULT_APPROVAL_SECRET = process.env.FLOAT_APPROVAL_SECRET || 'float-tool-approval-secret-key-2026';
const consumedApprovalTokens = new Map<string, number>();

export function clearConsumedApprovalTokensForTests(): void {
  consumedApprovalTokens.clear();
}

export function createToolApprovalToken(
  params: {
    toolName: string;
    paramsHash: string;
    userId: string;
    projectId: string;
    expiresInMs?: number;
    nonce?: string;
  },
  secret: string = DEFAULT_APPROVAL_SECRET
): string {
  const nonce = params.nonce || crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + (params.expiresInMs ?? 5 * 60 * 1000); // 5 min default
  const payload: ToolApprovalPayload = {
    toolName: params.toolName,
    paramsHash: params.paramsHash,
    userId: params.userId,
    projectId: params.projectId,
    nonce,
    expiresAt,
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payloadBase64).digest('base64url');
  return `${payloadBase64}.${signature}`;
}

export function verifyAndConsumeToolApprovalToken(
  token: string,
  expected: {
    toolName: string;
    paramsHash: string;
    userId: string;
    projectId: string;
  },
  secret: string = DEFAULT_APPROVAL_SECRET
): { valid: boolean; error?: string } {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Missing or malformed approval token.' };
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Invalid approval token format.' };
  }
  const [payloadBase64, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadBase64).digest('base64url');
  if (signature !== expectedSig) {
    return { valid: false, error: 'Invalid approval token signature.' };
  }

  let payload: ToolApprovalPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, error: 'Unparseable approval token payload.' };
  }

  const now = Date.now();
  if (payload.expiresAt < now) {
    return { valid: false, error: 'Approval token has expired.' };
  }

  if (payload.toolName !== expected.toolName) {
    return { valid: false, error: `Token tool "${payload.toolName}" does not match requested "${expected.toolName}".` };
  }
  if (payload.paramsHash !== expected.paramsHash) {
    return { valid: false, error: 'Token parameters hash does not match execution arguments.' };
  }
  if (payload.userId !== expected.userId) {
    return { valid: false, error: 'Token userId does not match execution context.' };
  }
  if (payload.projectId !== expected.projectId) {
    return { valid: false, error: 'Token projectId does not match execution context.' };
  }

  // Prevent replay attacks (single-use)
  const tokenKey = `${payload.nonce}:${payload.expiresAt}`;
  if (consumedApprovalTokens.has(tokenKey)) {
    return { valid: false, error: 'Approval token has already been consumed (replay attack detected).' };
  }

  // Mark token consumed
  consumedApprovalTokens.set(tokenKey, payload.expiresAt);

  // Periodic cleanup of expired tokens
  if (consumedApprovalTokens.size > 1000) {
    for (const [key, exp] of consumedApprovalTokens.entries()) {
      if (exp < now) consumedApprovalTokens.delete(key);
    }
  }

  return { valid: true };
}

export interface ToolExecutionContext {
  readonly workspace: IWorkspaceService;
  readonly userId: string;
  readonly projectId: string;
  readonly signal?: AbortSignal;
  readonly maxReadBytes?: number;
  readonly allowedCommands?: readonly string[];
  readonly mode?: 'ask' | 'plan' | 'agent' | 'debug';
  readonly approvalToken?: string;
  readonly approvalSecret?: string;
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
  inspect_symbol: {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'Name of the function, class, or symbol to inspect' },
      path: { type: 'string', description: 'Optional relative path to restrict symbol search' },
    },
    required: ['symbol'],
  },
  retrieve_context: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Task or question to retrieve relevant codebase context for' },
      maxChars: { type: 'number', description: 'Maximum total character budget for retrieved snippets' },
    },
    required: ['query'],
  },
  inspect_diagnostics: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of relative file paths to inspect for syntax and compiler diagnostics',
      },
    },
    required: [],
  },
  inspect_git: {
    type: 'object',
    properties: {
      includeDiff: { type: 'boolean', description: 'Whether to include unified diff of uncommitted changes' },
    },
    required: [],
  },
  request_approval: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'Privileged action requiring explicit human approval' },
      reason: { type: 'string', description: 'Justification for requesting approval' },
      target: { type: 'string', description: 'Target file, command, or branch' },
    },
    required: ['action', 'reason'],
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

export const READ_ONLY_CANONICAL_TOOLS = new Set<string>([
  'list_dir',
  'read_file',
  'search_codebase',
  'inspect_symbol',
  'retrieve_context',
  'inspect_diagnostics',
  'inspect_git',
]);

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

    if ((context.mode === 'ask' || context.mode === 'plan') && !READ_ONLY_CANONICAL_TOOLS.has(name)) {
      return {
        toolName: name,
        success: false,
        error: `Tool "${name}" is not permitted in read-only "${context.mode}" mode.`,
        durationMs: Date.now() - start,
        timestamp: start,
      };
    }

    if (tool.requiresApproval && name !== 'request_approval') {
      if (!context.approvalToken) {
        return {
          toolName: name,
          success: false,
          requiresApproval: true,
          approvalReason: `Tool "${name}" requires explicit user approval before execution.`,
          error: `Tool "${name}" requires explicit user approval. Provide a valid single-use approvalToken.`,
          durationMs: Date.now() - start,
          timestamp: start,
        };
      }

      const paramsHash = computeToolParamsHash(args);
      const verification = verifyAndConsumeToolApprovalToken(
        context.approvalToken,
        {
          toolName: name,
          paramsHash,
          userId: context.userId,
          projectId: context.projectId,
        },
        context.approvalSecret
      );

      if (!verification.valid) {
        return {
          toolName: name,
          success: false,
          requiresApproval: true,
          error: `Approval token verification failed: ${verification.error}`,
          durationMs: Date.now() - start,
          timestamp: start,
        };
      }
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
