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
  readonly actionId: string;
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

/**
 * Minimum cryptographic entropy requirement for the HMAC approval signing secret:
 * 32 bytes (256 bits).
 */
export const MIN_APPROVAL_SECRET_BYTES = 32;
export const MAX_APPROVAL_VALIDITY_MS = 5 * 60 * 1000; // 5 minute maximum validity ceiling

/**
 * Retrieves and cryptographically validates the approval signing secret.
 * Fails closed if the secret is unavailable or has insufficient entropy (< 32 bytes).
 * Never falls back to a hardcoded string.
 *
 * Provisioning & Rotation Procedure (Phase 1.1 Task 1):
 * 1. Provisioning: Generate a high-entropy 256-bit secret using `openssl rand -hex 32` or
 *    Google Cloud Secret Manager / AWS Secrets Manager.
 * 2. Ingestion: Set the secret into the `FLOAT_APPROVAL_SECRET` environment variable or inject
 *    directly into ToolApprovalService.
 * 3. Never expose FLOAT_APPROVAL_SECRET to web clients, browser bundles, or untrusted code.
 * 4. Rotation:
 *    a. Generate new 256-bit secret S_new.
 *    b. Deploy S_new as `FLOAT_APPROVAL_SECRET`.
 *    c. Existing tokens signed with S_old expire within MAX_APPROVAL_VALIDITY_MS (5 minutes).
 *    d. After 5 minutes, S_old is fully obsolete with zero downtime.
 */
export function getApprovalSecret(injectedSecret?: string): string {
  const secret = injectedSecret || process.env.FLOAT_APPROVAL_SECRET;
  if (!secret || typeof secret !== 'string') {
    throw new Error('APPROVAL_SECRET_UNAVAILABLE: FLOAT_APPROVAL_SECRET is not configured. Failed closed for security.');
  }
  const byteLength = Buffer.byteLength(secret, 'utf8');
  if (byteLength < MIN_APPROVAL_SECRET_BYTES) {
    throw new Error(`APPROVAL_SECRET_INSUFFICIENT_ENTROPY: Approval secret must have at least ${MIN_APPROVAL_SECRET_BYTES} bytes of entropy (got ${byteLength}). Failed closed.`);
  }
  return secret;
}

/**
 * Interface for durable, atomic nonce storage preventing replay attacks (Phase 1.1 Task 2).
 */
export interface INonceStore {
  /**
   * Atomically records a nonce with a TTL. Returns true if successfully recorded (first use),
   * or false if the nonce was already consumed (replay detected).
   * Throws if the storage layer is offline or unreachable (fail-closed).
   */
  consumeNonce(nonce: string, ttlMs: number): Promise<boolean>;
  /**
   * Returns true if the storage layer is operational.
   */
  isAvailable(): Promise<boolean>;
  /**
   * Clears all stored nonces (intended for isolated unit tests).
   */
  clear(): Promise<void>;
}

/**
 * In-memory nonce store for isolated unit tests and single-node development.
 */
export class InMemoryNonceStore implements INonceStore {
  private readonly nonces = new Map<string, number>();
  private available = true;

  public setAvailable(available: boolean): void {
    this.available = available;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async consumeNonce(nonce: string, ttlMs: number): Promise<boolean> {
    if (!this.available) {
      throw new Error('NONCE_STORE_UNAVAILABLE: In-memory store is offline.');
    }
    const now = Date.now();
    const existingExp = this.nonces.get(nonce);
    if (existingExp !== undefined && existingExp > now) {
      return false; // Replay detected
    }
    this.nonces.set(nonce, now + ttlMs);

    // Periodic sweep
    if (this.nonces.size > 1000) {
      for (const [k, exp] of this.nonces.entries()) {
        if (exp <= now) this.nonces.delete(k);
      }
    }
    return true;
  }

  async clear(): Promise<void> {
    this.nonces.clear();
  }
}

export const defaultInMemoryNonceStore = new InMemoryNonceStore();

export function clearConsumedApprovalTokensForTests(): void {
  defaultInMemoryNonceStore.clear();
}

export function createToolApprovalToken(
  params: {
    actionId?: string;
    toolName: string;
    paramsHash: string;
    userId: string;
    projectId: string;
    expiresInMs?: number;
    nonce?: string;
  },
  secret?: string
): string {
  const signingSecret = getApprovalSecret(secret);
  const nonce = params.nonce || crypto.randomBytes(16).toString('hex');
  const actionId = params.actionId || `act_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  // Enforce 5-minute maximum validity ceiling
  const requestedValidity = typeof params.expiresInMs === 'number' ? params.expiresInMs : MAX_APPROVAL_VALIDITY_MS;
  const effectiveValidity = Math.min(requestedValidity, MAX_APPROVAL_VALIDITY_MS);
  const expiresAt = Date.now() + effectiveValidity;
  const payload: ToolApprovalPayload = {
    actionId,
    toolName: params.toolName,
    paramsHash: params.paramsHash,
    userId: params.userId,
    projectId: params.projectId,
    nonce,
    expiresAt,
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', signingSecret).update(payloadBase64).digest('base64url');
  return `${payloadBase64}.${signature}`;
}

export async function verifyAndConsumeToolApprovalToken(
  token: string,
  expected: {
    actionId?: string;
    toolName: string;
    paramsHash: string;
    userId: string;
    projectId: string;
  },
  secret?: string,
  nonceStore: INonceStore = defaultInMemoryNonceStore
): Promise<{ valid: boolean; error?: string }> {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Missing or malformed approval token.' };
  }

  let signingSecret: string;
  try {
    signingSecret = getApprovalSecret(secret);
  } catch (err: any) {
    return { valid: false, error: err.message || 'Approval secret is unavailable.' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Invalid approval token format.' };
  }
  const [payloadBase64, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', signingSecret).update(payloadBase64).digest('base64url');
  
  // Constant-time signature verification preventing timing side-channel attacks
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
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

  if (expected.actionId && payload.actionId !== expected.actionId) {
    return { valid: false, error: `Token actionId "${payload.actionId}" does not match requested "${expected.actionId}".` };
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

  // Prevent replay attacks via durable single-use atomic nonce store (Phase 1.1 Task 2)
  const remainingTtlMs = Math.max(payload.expiresAt - now, 1000);
  try {
    const consumed = await nonceStore.consumeNonce(payload.nonce, remainingTtlMs);
    if (!consumed) {
      return { valid: false, error: 'Approval token has already been consumed (replay attack detected).' };
    }
  } catch (err: any) {
    return { valid: false, error: `Distributed nonce store unavailable: ${err.message}. Failed closed.` };
  }

  return { valid: true };
}

export interface ICommandExecutionAdapter {
  runCommand(
    command: string,
    options?: { cwd?: string; timeoutMs?: number; signal?: AbortSignal }
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
}

export interface ToolExecutionContext {
  readonly workspace: IWorkspaceService;
  readonly userId: string;
  readonly projectId: string;
  readonly signal?: AbortSignal;
  readonly maxReadBytes?: number;
  readonly allowedCommands?: readonly string[];
  readonly mode?: 'ask' | 'plan' | 'agent' | 'debug';
  readonly actionId?: string;
  readonly approvalToken?: string;
  readonly approvalSecret?: string;
  readonly nonceStore?: INonceStore;
  readonly executionAdapter?: ICommandExecutionAdapter;
}

export interface ToolExecutionResult {
  readonly toolName: string;
  readonly success: boolean;
  readonly data?: any;
  readonly error?: string;
  readonly durationMs: number;
  readonly timestamp: number;
  readonly requiresApproval?: boolean;
  readonly approvalReason?: string;
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
 * Standard tool names that are safe for read-only modes (Ask, Plan).
 */
export const READ_ONLY_CANONICAL_TOOLS = new Set([
  'list_dir',
  'read_file',
  'search_codebase',
  'inspect_symbol',
  'retrieve_context',
  'inspect_diagnostics',
  'inspect_git',
]);

/**
 * Canonical tool argument schemas.
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
      operation: {
        type: 'string',
        enum: ['status', 'diff', 'log', 'branch'],
        description: 'Git read inspection operation',
      },
    },
    required: ['operation'],
  },
  request_approval: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'Action being requested' },
      reason: { type: 'string', description: 'Justification for requesting human approval' },
      target: { type: 'string', description: 'Target file or environment' },
    },
    required: ['action', 'reason'],
  },
  propose_changes: {
    type: 'object',
    properties: {
      changes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            newContent: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['path', 'newContent'],
        },
        description: 'Proposed file modifications',
      },
      title: { type: 'string', description: 'Proposal title' },
      description: { type: 'string', description: 'Proposal description' },
    },
    required: ['changes'],
  },
  run_command: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Verification command to execute inside container' },
      timeoutMs: { type: 'number', description: 'Maximum execution timeout in milliseconds' },
    },
    required: ['command'],
  },
};

/**
 * Validates tool argument structure against schemas.
 */
export function validateToolArgs(toolName: string, args: any): string | null {
  if (args === null || typeof args !== 'object') {
    return `Arguments for tool "${toolName}" must be an object.`;
  }
  const schema = (CANONICAL_TOOL_SCHEMAS as Record<string, any>)[toolName];
  if (!schema) return null;

  for (const req of schema.required || []) {
    if (args[req] === undefined || args[req] === null || (typeof args[req] === 'string' && !args[req].trim())) {
      return `Missing required parameter "${req}" for tool "${toolName}".`;
    }
  }
  return null;
}

/**
 * In-memory CanonicalToolRegistry implementation.
 */
export class CanonicalToolRegistry implements IToolRegistry {
  private readonly tools = new Map<string, IToolDefinition>();

  register(tool: IToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered in CanonicalToolRegistry`);
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
    const start = Date.now();
    const tool = this.tools.get(name);

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
      if (context.approvalToken) {
        const paramsHash = computeToolParamsHash(args);
        const verification = await verifyAndConsumeToolApprovalToken(
          context.approvalToken,
          {
            actionId: context.actionId,
            toolName: name,
            paramsHash,
            userId: context.userId,
            projectId: context.projectId,
          },
          context.approvalSecret,
          context.nonceStore
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
      } else if (context.actionId) {
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
