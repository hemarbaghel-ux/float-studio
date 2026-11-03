/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { FloatSecurityGuard } from '../security/floatSecurityGuard.js';

export interface IFloatFileMetadata {
	readonly path: string;
	readonly size: number;
	readonly mtime: number;
}

export class FloatNativeFs {
	public static normalizePath(filePath: string): string {
		return FloatSecurityGuard.validateSafePath(filePath);
	}
}
