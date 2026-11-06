/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../../base/common/event.js';
import type { FloatDaemonClient } from './floatDaemonClient.js';

export type FloatDaemonRuntimeState = 'stopped' | 'starting' | 'running' | 'failed';

export interface IFloatDaemonRuntimeStatus {
  state: FloatDaemonRuntimeState;
  message?: string;
}

export const IFloatDaemonRuntimeService = createDecorator<IFloatDaemonRuntimeService>('floatDaemonRuntimeService');

export interface IFloatDaemonRuntimeService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeState: Event<IFloatDaemonRuntimeStatus>;
  readonly state: FloatDaemonRuntimeState;
  getClient(): FloatDaemonClient | undefined;
  start(): Promise<void>;
  stop(): Promise<void>;
}
