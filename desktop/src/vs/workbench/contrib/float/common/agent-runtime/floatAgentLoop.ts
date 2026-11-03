/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IFloatProposal } from '../protocols/floatProtocol.js';
import { sanitizeProposalPath } from '../proposals/floatProposalValidator.js';

export interface IFloatAgentToolCall {
	readonly id: string;
	readonly name: string;
	readonly arguments: Record<string, any>;
}

export interface IFloatAgentTurnResult {
	readonly iteration: number;
	readonly toolCalls: IFloatAgentToolCall[];
	readonly proposals: IFloatProposal[];
	readonly isFinished: boolean;
	readonly error?: string;
}

export class FloatBoundedAgentLoop {
	private readonly _maxIterations: number;
	private _currentIteration: number = 0;
	private _isCancelled: boolean = false;

	constructor(maxIterations: number = 10) {
		this._maxIterations = Math.max(1, Math.min(maxIterations, 25));
	}

	public cancel(): void {
		this._isCancelled = true;
	}

	public get isCancelled(): boolean {
		return this._isCancelled;
	}

	public get currentIteration(): number {
		return this._currentIteration;
	}

	public get maxIterations(): number {
		return this._maxIterations;
	}

	public canContinue(): boolean {
		return !this._isCancelled && this._currentIteration < this._maxIterations;
	}

	public nextIteration(): number {
		if (!this.canContinue()) {
			throw new Error(`Agent loop reached boundary limit (${this._currentIteration}/${this._maxIterations})`);
		}
		this._currentIteration++;
		return this._currentIteration;
	}

	public validateToolTarget(filePath: string): string {
		return sanitizeProposalPath(filePath);
	}

	public reset(): void {
		this._currentIteration = 0;
		this._isCancelled = false;
	}
}
