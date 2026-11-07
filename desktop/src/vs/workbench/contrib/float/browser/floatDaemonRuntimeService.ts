/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import {
	IFloatDaemonRuntimeClient,
	IFloatDaemonRuntimeService,
	FloatDaemonRuntimeState,
	IFloatDaemonRuntimeStatus
} from '../common/daemon/floatDaemonRuntimeService.js';

/**
 * Browser workbenches do not have access to Electron utility processes.
 * Registering this no-op implementation keeps shared Chat/Composer actions
 * available while allowing their existing local-index fallbacks to work.
 * Electron replaces this registration with the native worker implementation.
 */
export class FloatBrowserDaemonRuntimeService implements IFloatDaemonRuntimeService {
	declare readonly _serviceBrand: undefined;

	public readonly onDidChangeState: Event<IFloatDaemonRuntimeStatus> = Event.None;
	public readonly state: FloatDaemonRuntimeState = 'stopped';

	public getClient(): IFloatDaemonRuntimeClient | undefined {
		return undefined;
	}

	public start(): Promise<void> {
		return Promise.resolve();
	}

	public stop(): Promise<void> {
		return Promise.resolve();
	}
}
