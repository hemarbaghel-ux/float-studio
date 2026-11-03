/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IFloatTurnCheckpoint } from '../protocols/floatProtocol.js';

export class FloatCheckpointService {
	private readonly _checkpoints: IFloatTurnCheckpoint[] = [];

	public createCheckpoint(description: string, files: Record<string, string>): IFloatTurnCheckpoint {
		const checkpoint: IFloatTurnCheckpoint = {
			id: `cp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
			timestamp: Date.now(),
			description,
			snapshot: { ...files }
		};

		this._checkpoints.push(checkpoint);
		return checkpoint;
	}

	public getLatestCheckpoint(): IFloatTurnCheckpoint | undefined {
		return this._checkpoints[this._checkpoints.length - 1];
	}

	public getCheckpoint(id: string): IFloatTurnCheckpoint | undefined {
		return this._checkpoints.find(c => c.id === id);
	}

	public getAllCheckpoints(): IFloatTurnCheckpoint[] {
		return [...this._checkpoints];
	}

	public popLatestCheckpoint(): IFloatTurnCheckpoint | undefined {
		return this._checkpoints.pop();
	}

	public clear(): void {
		this._checkpoints.length = 0;
	}
}
