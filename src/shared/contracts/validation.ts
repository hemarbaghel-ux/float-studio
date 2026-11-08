/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Typed API Contracts & Runtime Schema Validation (Phase 2)
 *
 * Provides typed request/response contracts and runtime schema validation guards
 * for API boundaries, preventing malformed inputs and ensuring fail-closed safety.
 */

export interface ChatApiRequest {
  readonly model?: string;
  readonly messages: Array<{
    readonly role: 'user' | 'assistant' | 'system' | 'model';
    readonly content?: string;
    readonly parts?: Array<{ readonly text: string }>;
  }>;
  readonly systemInstruction?: string;
  readonly reasoningEffort?: 'low' | 'medium' | 'high';
  readonly isStream?: boolean;
  readonly projectId?: string;
  readonly contextItems?: Array<{
    readonly path: string;
    readonly content: string;
  }>;
}

export interface ProposalApiRequest {
  readonly title: string;
  readonly explanation?: string;
  readonly changes: Array<{
    readonly path: string;
    readonly proposedContent: string;
    readonly originalContent?: string;
    readonly operation?: 'create' | 'modify' | 'delete' | 'rename';
  }>;
}

export interface HealthApiResponse {
  readonly status: 'ok';
  readonly uptime: number;
  readonly timestamp: number;
}

export class ValidationError extends Error {
  public readonly field: string;
  public readonly statusCode: number = 400;

  constructor(field: string, message: string) {
    super(`Validation failed for "${field}": ${message}`);
    this.name = 'ValidationError';
    this.field = field;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(fieldName, 'Expected non-empty string.');
  }
  return value.trim();
}

export function assertArray<T>(value: unknown, fieldName: string, maxLen = 100): T[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(fieldName, 'Expected array.');
  }
  if (value.length > maxLen) {
    throw new ValidationError(fieldName, `Array exceeds maximum length of ${maxLen}.`);
  }
  return value as T[];
}

export function validateChatApiRequest(body: unknown): ChatApiRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('body', 'Request body must be an object.');
  }
  const raw = body as Record<string, any>;
  const messages = assertArray(raw.messages, 'messages', 40);
  if (messages.length === 0) {
    throw new ValidationError('messages', 'Messages array cannot be empty.');
  }

  return {
    model: typeof raw.model === 'string' ? raw.model : undefined,
    messages: messages.map((m: any, idx: number) => {
      if (!m || typeof m !== 'object') {
        throw new ValidationError(`messages[${idx}]`, 'Message must be an object.');
      }
      return {
        role: m.role || 'user',
        content: typeof m.content === 'string' ? m.content : undefined,
        parts: Array.isArray(m.parts) ? m.parts : undefined,
      };
    }),
    systemInstruction: typeof raw.systemInstruction === 'string' ? raw.systemInstruction : undefined,
    reasoningEffort: ['low', 'medium', 'high'].includes(raw.reasoningEffort)
      ? raw.reasoningEffort
      : undefined,
    isStream: Boolean(raw.isStream || raw.stream),
    projectId: typeof raw.projectId === 'string' ? raw.projectId : undefined,
    contextItems: Array.isArray(raw.contextItems) ? raw.contextItems : undefined,
  };
}

export function validateProposalApiRequest(body: unknown): ProposalApiRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('body', 'Request body must be an object.');
  }
  const raw = body as Record<string, any>;
  const title = assertNonEmptyString(raw.title, 'title');
  const rawChanges = assertArray(raw.changes, 'changes', 50);

  if (rawChanges.length === 0) {
    throw new ValidationError('changes', 'At least one file change must be provided.');
  }

  const changes = rawChanges.map((c: any, idx: number) => {
    if (!c || typeof c !== 'object') {
      throw new ValidationError(`changes[${idx}]`, 'Change item must be an object.');
    }
    const path = assertNonEmptyString(c.path, `changes[${idx}].path`);
    return {
      path,
      proposedContent: typeof c.proposedContent === 'string' ? c.proposedContent : '',
      originalContent: typeof c.originalContent === 'string' ? c.originalContent : undefined,
      operation: c.operation || 'modify',
    };
  });

  return {
    title,
    explanation: typeof raw.explanation === 'string' ? raw.explanation : undefined,
    changes,
  };
}

export function validateHealthResponse(body: unknown): HealthApiResponse {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('body', 'Health response must be an object.');
  }
  const raw = body as Record<string, any>;
  if (raw.status !== 'ok') {
    throw new ValidationError('status', 'Expected status === "ok".');
  }
  return {
    status: 'ok',
    uptime: Number(raw.uptime) || 0,
    timestamp: Number(raw.timestamp) || Date.now(),
  };
}
