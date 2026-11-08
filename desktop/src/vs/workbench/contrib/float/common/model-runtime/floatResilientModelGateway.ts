/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface ICircuitBreakerConfig {
	failureThreshold: number;
	recoveryTimeoutMs: number;
	halfOpenSuccessThreshold: number;
}

export interface IProviderCircuitStatus {
	providerId: string;
	state: CircuitBreakerState;
	consecutiveFailures: number;
	consecutiveSuccesses: number;
	lastFailureTime: number;
	totalRequests: number;
	totalFailures: number;
}

export interface IGatewayRequestOptions {
	preferredProvider?: string;
	model?: string;
	maxRetries?: number;
	timeoutMs?: number;
}

export interface IGatewayResponse<T = any> {
	providerId: string;
	model: string;
	data: T;
	latencyMs: number;
	attempts: number;
	failedOver: boolean;
	originalProvider?: string;
}

export type ProviderExecutor<T = any> = (providerId: string, model: string) => Promise<T>;

export class FloatResilientModelGateway implements IDisposable {
	private readonly _circuits = new Map<string, IProviderCircuitStatus>();
	private readonly _executors = new Map<string, ProviderExecutor>();
	private _fallbackOrder: string[] = ['anthropic', 'openai', 'gemini', 'deepseek', 'ollama'];

	private readonly _config: ICircuitBreakerConfig;

	// Events
	private readonly _onDidCircuitStateChange = new Emitter<{ providerId: string; state: CircuitBreakerState; reason: string }>();
	public readonly onDidCircuitStateChange: Event<{ providerId: string; state: CircuitBreakerState; reason: string }> = this._onDidCircuitStateChange.event;

	private readonly _onDidFailover = new Emitter<{ fromProvider: string; toProvider: string; reason: string }>();
	public readonly onDidFailover: Event<{ fromProvider: string; toProvider: string; reason: string }> = this._onDidFailover.event;

	constructor(config?: Partial<ICircuitBreakerConfig>) {
		this._config = {
			failureThreshold: config?.failureThreshold ?? 3,
			recoveryTimeoutMs: config?.recoveryTimeoutMs ?? 5000,
			halfOpenSuccessThreshold: config?.halfOpenSuccessThreshold ?? 1
		};
	}

	public registerProvider(providerId: string, executor: ProviderExecutor): void {
		this._executors.set(providerId, executor);
		if (!this._circuits.has(providerId)) {
			this._circuits.set(providerId, {
				providerId,
				state: 'CLOSED',
				consecutiveFailures: 0,
				consecutiveSuccesses: 0,
				lastFailureTime: 0,
				totalRequests: 0,
				totalFailures: 0
			});
		}
	}

	public setFallbackOrder(order: string[]): void {
		this._fallbackOrder = [...order];
	}

	public getFallbackOrder(): string[] {
		return [...this._fallbackOrder];
	}

	public getCircuitStatus(providerId: string): IProviderCircuitStatus | undefined {
		const status = this._circuits.get(providerId);
		if (!status) return undefined;

		// Check if OPEN circuit has timed out to HALF_OPEN
		if (status.state === 'OPEN') {
			const elapsed = Date.now() - status.lastFailureTime;
			if (elapsed >= this._config.recoveryTimeoutMs) {
				status.state = 'HALF_OPEN';
				status.consecutiveSuccesses = 0;
				this._onDidCircuitStateChange.fire({
					providerId,
					state: 'HALF_OPEN',
					reason: `Recovery cool-down expired (${elapsed}ms >= ${this._config.recoveryTimeoutMs}ms)`
				});
			}
		}

		return { ...status };
	}

	public async execute<T = any>(prompt: string, options?: IGatewayRequestOptions): Promise<IGatewayResponse<T>> {
		const preferred = options?.preferredProvider || this._fallbackOrder[0] || 'anthropic';
		const maxRetries = options?.maxRetries ?? 2;

		// Build prioritized candidate providers
		const candidates: string[] = [preferred];
		for (const p of this._fallbackOrder) {
			if (!candidates.includes(p)) {
				candidates.push(p);
			}
		}

		let lastError: Error | null = null;
		let attempts = 0;
		let initialProvider: string = preferred;

		for (const providerId of candidates) {
			const circuit = this.getCircuitStatus(providerId);
			if (!circuit) {
				continue;
			}

			// If circuit is OPEN, skip immediately to next provider in fallback chain
			if (circuit.state === 'OPEN') {
				continue;
			}

			const executor = this._executors.get(providerId);
			if (!executor) {
				continue;
			}

			if (attempts > 0 && providerId !== initialProvider) {
				this._onDidFailover.fire({
					fromProvider: initialProvider,
					toProvider: providerId,
					reason: lastError?.message || 'Failover triggered'
				});
			}

			// Try executing with retry
			for (let retry = 0; retry <= maxRetries; retry++) {
				attempts++;
				const startTime = Date.now();
				try {
					const data = await executor(providerId, options?.model || 'default');
					this._recordSuccess(providerId);

					return {
						providerId,
						model: options?.model || 'default',
						data,
						latencyMs: Date.now() - startTime,
						attempts,
						failedOver: providerId !== initialProvider,
						originalProvider: providerId !== initialProvider ? initialProvider : undefined
					};
				} catch (err: any) {
					lastError = err;
					this._recordFailure(providerId, err.message);

					// If circuit opened on this failure, immediately break to failover
					const updated = this._circuits.get(providerId);
					if (updated && updated.state === 'OPEN') {
						break;
					}
				}
			}
		}

		throw new Error(`All providers exhausted in resilient model gateway. Last error: ${lastError?.message || 'Unknown'}`);
	}

	private _recordSuccess(providerId: string): void {
		const circuit = this._circuits.get(providerId);
		if (!circuit) return;

		circuit.totalRequests++;
		circuit.consecutiveFailures = 0;

		if (circuit.state === 'HALF_OPEN') {
			circuit.consecutiveSuccesses++;
			if (circuit.consecutiveSuccesses >= this._config.halfOpenSuccessThreshold) {
				circuit.state = 'CLOSED';
				this._onDidCircuitStateChange.fire({
					providerId,
					state: 'CLOSED',
					reason: `Probe successful (${circuit.consecutiveSuccesses} >= ${this._config.halfOpenSuccessThreshold})`
				});
			}
		}
	}

	private _recordFailure(providerId: string, errorReason: string): void {
		const circuit = this._circuits.get(providerId);
		if (!circuit) return;

		circuit.totalRequests++;
		circuit.totalFailures++;
		circuit.consecutiveFailures++;
		circuit.lastFailureTime = Date.now();

		if (circuit.state === 'HALF_OPEN') {
			circuit.state = 'OPEN';
			this._onDidCircuitStateChange.fire({
				providerId,
				state: 'OPEN',
				reason: `Half-open probe failed: ${errorReason}`
			});
		} else if (circuit.state === 'CLOSED') {
			if (circuit.consecutiveFailures >= this._config.failureThreshold) {
				circuit.state = 'OPEN';
				this._onDidCircuitStateChange.fire({
					providerId,
					state: 'OPEN',
					reason: `Failure threshold reached (${circuit.consecutiveFailures} >= ${this._config.failureThreshold}): ${errorReason}`
				});
			}
		}
	}

	public resetCircuit(providerId: string): void {
		const circuit = this._circuits.get(providerId);
		if (circuit) {
			circuit.state = 'CLOSED';
			circuit.consecutiveFailures = 0;
			circuit.consecutiveSuccesses = 0;
			circuit.lastFailureTime = 0;
		}
	}

	public dispose(): void {
		this._circuits.clear();
		this._executors.clear();
		this._onDidCircuitStateChange.dispose();
		this._onDidFailover.dispose();
	}
}
