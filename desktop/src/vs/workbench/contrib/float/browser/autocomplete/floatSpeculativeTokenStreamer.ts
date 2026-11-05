/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface ISpeculativeKeystrokeResult {
	matched: boolean;
	acceptedText: string;
	remainingSpeculation: string;
	latencyMs: number;
}

export interface ISpeculativeStreamMetrics {
	totalKeystrokes: number;
	speculativeHits: number;
	divergences: number;
	hitRatePercent: number;
}

export class FloatSpeculativeTokenStreamer {
	private _speculativeBuffer: string = '';
	private _offset: number = 0;
	private _totalKeystrokes: number = 0;
	private _speculativeHits: number = 0;
	private _divergences: number = 0;

	public setSpeculativePrediction(prediction: string): void {
		this._speculativeBuffer = prediction;
		this._offset = 0;
	}

	public appendTokens(tokens: string): void {
		this._speculativeBuffer += tokens;
	}

	public getRemainingSpeculation(): string {
		return this._speculativeBuffer.slice(this._offset);
	}

	public onKeystroke(char: string): ISpeculativeKeystrokeResult {
		this._totalKeystrokes++;

		if (this._offset < this._speculativeBuffer.length && this._speculativeBuffer[this._offset] === char) {
			this._offset++;
			this._speculativeHits++;
			return {
				matched: true,
				acceptedText: char,
				remainingSpeculation: this.getRemainingSpeculation(),
				latencyMs: 0 // Zero-latency forward-cache match
			};
		}

		// Divergence: user typed a character that diverged from speculative prediction
		this._divergences++;
		this._speculativeBuffer = '';
		this._offset = 0;

		return {
			matched: false,
			acceptedText: char,
			remainingSpeculation: '',
			latencyMs: 0
		};
	}

	public getMetrics(): ISpeculativeStreamMetrics {
		const hitRate = this._totalKeystrokes > 0
			? Math.round((this._speculativeHits / this._totalKeystrokes) * 100)
			: 0;

		return {
			totalKeystrokes: this._totalKeystrokes,
			speculativeHits: this._speculativeHits,
			divergences: this._divergences,
			hitRatePercent: hitRate
		};
	}

	public reset(): void {
		this._speculativeBuffer = '';
		this._offset = 0;
	}
}
