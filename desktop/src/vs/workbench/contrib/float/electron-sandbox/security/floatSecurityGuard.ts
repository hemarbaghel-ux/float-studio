/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { sanitizeProposalPath } from '../../common/proposals/floatProposalValidator.js';

export class FloatSecurityGuard {
	public static validateSafePath(path: string): string {
		return sanitizeProposalPath(path);
	}

	public static isCommandSafe(command: string): boolean {
		const lower = command.trim().toLowerCase();
		const dangerous = [
			'rm -rf /',
			'format c:',
			':(){ :|:& };:',
			'del /f /s /q c:\\',
			'shutdown',
			'drop database'
		];
		return !dangerous.some(d => lower.includes(d));
	}
}
