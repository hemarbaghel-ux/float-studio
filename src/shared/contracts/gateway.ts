/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Provider-Neutral Model Gateway Contracts (Phase 2)
 *
 * Defines the unified, provider-neutral gateway interface for executing model requests,
 * streaming tokens, managing timeouts and cancellations, and normalizing upstream errors.
 */

import { IModelCatalog, RoutedProvider } from './models';

export type ModelGatewayRole = 'system' | 'user' | 'assistant';

export interface ModelGatewayMessage {
  readonly role: ModelGatewayRole;
  readonly content: string;
  readonly name?: string;
}

export interface ModelGatewayRequest {
  readonly modelId: string;
  readonly messages: readonly ModelGatewayMessage[];
  readonly systemPrompt?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly reasoningEffort?: 'low' | 'medium' | 'high';
  readonly tools?: readonly any[];
  readonly stream?: boolean;
}

export interface ModelGatewayUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly durationMs: number;
}

export interface ModelGatewayDelta {
  readonly type: 'delta' | 'thought' | 'tool_call';
  readonly content: string;
  readonly toolCall?: {
    readonly id: string;
    readonly name: string;
    readonly args: Record<string, any>;
  };
}

export interface ModelGatewayResponse {
  readonly text: string;
  readonly usage: ModelGatewayUsage;
  readonly modelId: string;
  readonly toolCalls?: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly args: Record<string, any>;
  }>;
  readonly isSimulated?: boolean;
}

export type GatewayErrorCode =
  | 'AUTH_ERROR'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'MODEL_NOT_FOUND'
  | 'CONTEXT_EXCEEDED'
  | 'PROVIDER_ERROR'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'INVALID_REQUEST';

export class GatewayError extends Error {
  public readonly code: GatewayErrorCode;
  public readonly statusCode: number;
  public readonly providerId: RoutedProvider | string;
  public readonly retryable: boolean;

  constructor(options: {
    message: string;
    code: GatewayErrorCode;
    statusCode?: number;
    providerId?: RoutedProvider | string;
    retryable?: boolean;
  }) {
    super(options.message);
    this.name = 'GatewayError';
    this.code = options.code;
    this.statusCode = options.statusCode ?? GatewayError.mapCodeToStatus(options.code);
    this.providerId = options.providerId ?? 'float';
    this.retryable = options.retryable ?? (options.code === 'RATE_LIMITED' || options.code === 'TIMEOUT');
    Object.setPrototypeOf(this, GatewayError.prototype);
  }

  private static mapCodeToStatus(code: GatewayErrorCode): number {
    switch (code) {
      case 'AUTH_ERROR':
        return 401;
      case 'QUOTA_EXCEEDED':
        return 402;
      case 'RATE_LIMITED':
        return 429;
      case 'MODEL_NOT_FOUND':
        return 404;
      case 'CONTEXT_EXCEEDED':
        return 413;
      case 'INVALID_REQUEST':
        return 400;
      case 'TIMEOUT':
        return 504;
      case 'CANCELLED':
        return 499;
      case 'PROVIDER_ERROR':
      default:
        return 502;
    }
  }
}

export interface ProviderHealthStatus {
  readonly providerId: string;
  readonly operational: boolean;
  readonly latencyMs: number;
  readonly error?: string;
  readonly timestamp: number;
}

/**
 * Authoritative Model Gateway Interface
 */
export interface IModelGateway {
  /** Executes a synchronous generation request */
  generate(request: ModelGatewayRequest, signal?: AbortSignal): Promise<ModelGatewayResponse>;

  /** Streams deltas progressively with cancellation support */
  generateStream(
    request: ModelGatewayRequest,
    onDelta: (delta: ModelGatewayDelta) => void,
    signal?: AbortSignal
  ): Promise<ModelGatewayResponse>;

  /** Inspects provider operational status and latency */
  checkHealth(providerId: string): Promise<ProviderHealthStatus>;

  /** Returns the underlying model catalog */
  getCatalog(): IModelCatalog;
}
