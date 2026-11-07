/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../../base/common/event.js';

export type FloatDaemonRuntimeState = 'stopped' | 'starting' | 'running' | 'failed';

export interface IFloatDaemonRuntimeStatus {
  state: FloatDaemonRuntimeState;
  message?: string;
}

/**
 * Renderer-safe RPC facade. Calls are forwarded over Code-OSS MessagePort IPC;
 * Node.js sockets and filesystem APIs stay inside the utility process.
 */
export interface IFloatDaemonRuntimeClient {
  call<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
  ping(): Promise<unknown>;
  indexFileSemantics(filePath: string, content: string): Promise<unknown>;
  removeFileSemantics(filePath: string): Promise<unknown>;
  searchSemantics(query: string, topK?: number): Promise<unknown>;
  getSymbols(query?: string): Promise<unknown>;
}

export const IFloatDaemonRuntimeService = createDecorator<IFloatDaemonRuntimeService>('floatDaemonRuntimeService');

export interface IFloatDaemonRuntimeService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeState: Event<IFloatDaemonRuntimeStatus>;
  readonly state: FloatDaemonRuntimeState;
  getClient(): IFloatDaemonRuntimeClient | undefined;
  start(): Promise<void>;
  stop(): Promise<void>;
}
