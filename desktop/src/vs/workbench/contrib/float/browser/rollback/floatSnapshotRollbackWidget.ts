/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';

export interface IFloatCheckpointSnapshot {
	id: string;
	sequence: number;
	timestamp: number;
	summary: string;
	filesChanged: { filePath: string; beforeContent: string; afterContent: string }[];
	isRollbackTarget?: boolean;
}

export class FloatSnapshotRollbackWidget implements IDisposable {
	private readonly _snapshots: IFloatCheckpointSnapshot[] = [];
	private _currentSequence: number = 0;

	public createCheckpoint(summary: string, filesChanged: { filePath: string; beforeContent: string; afterContent: string }[]): IFloatCheckpointSnapshot {
		this._currentSequence++;
		const snapshot: IFloatCheckpointSnapshot = {
			id: `chk-${this._currentSequence}-${Date.now()}`,
			sequence: this._currentSequence,
			timestamp: Date.now(),
			summary,
			filesChanged
		};

		this._snapshots.push(snapshot);
		return snapshot;
	}

	public getSnapshots(): IFloatCheckpointSnapshot[] {
		return [...this._snapshots];
	}

	public getCurrentSequence(): number {
		return this._currentSequence;
	}

	public rollbackToSequence(targetSequence: number): { restoredFiles: Map<string, string>; rolledBackSnapshots: number } {
		const restoredFiles = new Map<string, string>();
		if (targetSequence >= this._currentSequence || targetSequence < 0) {
			return { restoredFiles, rolledBackSnapshots: 0 };
		}

		// Replay in reverse from current down to targetSequence + 1
		let count = 0;
		for (let s = this._snapshots.length - 1; s >= 0; s--) {
			const snap = this._snapshots[s];
			if (snap.sequence > targetSequence) {
				for (const f of snap.filesChanged) {
					restoredFiles.set(f.filePath, f.beforeContent);
				}
				count++;
			}
		}

		this._currentSequence = targetSequence;
		return { restoredFiles, rolledBackSnapshots: count };
	}

	public dispose(): void {
		this._snapshots.length = 0;
	}
}
