/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { FloatSecurityGuard } from '../security/floatSecurityGuard.js';

export interface IFloatProcessExecutionResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly executionTimeMs: number;
}

export class FloatNativeProcess {
	public static isPermitted(command: string): boolean {
		return FloatSecurityGuard.isCommandSafe(command);
	}
}
