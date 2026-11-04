/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IFloatChatMessage, IFloatModelInfo } from '../protocols/floatProtocol.js';
import { IFloatStreamCallbacks, IFloatStreamResultMetadata, IFloatCompletionOptions, IFloatCompletionResult } from './floatModelClient.js';

export interface IFloatOllamaModelTag {
	name: string;
	model: string;
	modified_at: string;
	size: number;
	digest: string;
	details?: {
		parent_model?: string;
		format?: string;
		family?: string;
		families?: string[];
		parameter_size?: string;
		quantization_level?: string;
	};
}

export interface IFloatOllamaChatResponseChunk {
	model: string;
	created_at: string;
	message: {
		role: string;
		content: string;
	};
	done: boolean;
	total_duration?: number;
	load_duration?: number;
	prompt_eval_count?: number;
	prompt_eval_duration?: number;
	eval_count?: number;
	eval_duration?: number;
}

export class FloatLocalOllamaProvider {
	private _baseUrl: string;
	private _activeAbortController: AbortController | null = null;

	constructor(baseUrl: string = 'http://localhost:11434') {
		this._baseUrl = baseUrl.replace(/\/+$/, '');
	}

	public getBaseUrl(): string {
		return this._baseUrl;
	}

	public setBaseUrl(url: string): void {
		this._baseUrl = url.replace(/\/+$/, '');
	}

	/**
	 * Checks whether the local Ollama daemon is reachable and responding.
	 */
	public async isAvailable(timeoutMs: number = 1500): Promise<boolean> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const res = await fetch(`${this._baseUrl}/api/tags`, {
				method: 'GET',
				signal: controller.signal
			});
			clearTimeout(timer);
			return res.ok;
		} catch {
			clearTimeout(timer);
			return false;
		}
	}

	/**
	 * Lists all models currently pulled and available in the local Ollama instance.
	 */
	public async listModels(): Promise<IFloatOllamaModelTag[]> {
		try {
			const res = await fetch(`${this._baseUrl}/api/tags`, { method: 'GET' });
			if (!res.ok) {
				throw new Error(`Ollama returned status ${res.status}: ${res.statusText}`);
			}
			const data = (await res.json()) as { models?: IFloatOllamaModelTag[] };
			return data.models || [];
		} catch (err: any) {
			throw new Error(`Failed to list local Ollama models from ${this._baseUrl}: ${err.message || err}`);
		}
	}

	/**
	 * Converts local Ollama tags into Code-OSS workbench IFloatModelInfo entries.
	 */
	public convertToFloatModels(ollamaTags: IFloatOllamaModelTag[]): IFloatModelInfo[] {
		return ollamaTags.map(tag => {
			const id = `ollama/${tag.name}`;
			return {
				id,
				name: `${tag.name} (Local Ollama)`,
				provider: 'ollama',
				upstreamModelId: tag.name,
				isRoutingAlias: false,
				contextWindow: 128000,
				supportsStreaming: true,
				capabilities: {
					coding: true,
					reasoning: tag.name.toLowerCase().includes('deepseek') || tag.name.toLowerCase().includes('coder'),
					vision: tag.name.toLowerCase().includes('llava') || tag.name.toLowerCase().includes('vision'),
					tools: false,
					streaming: true
				}
			};
		});
	}

	/**
	 * Streams a chat conversation from the local Ollama instance with NDJSON decoding.
	 */
	public async streamChat(
		options: {
			model: string;
			messages: IFloatChatMessage[];
			temperature?: number;
		},
		callbacks: IFloatStreamCallbacks,
		signal?: AbortSignal
	): Promise<void> {
		this.cancelActiveStream();

		const controller = new AbortController();
		this._activeAbortController = controller;

		const combinedSignal = signal
			? this._combineAbortSignals(signal, controller.signal)
			: controller.signal;

		const targetModel = options.model.startsWith('ollama/')
			? options.model.replace('ollama/', '')
			: options.model;

		const requestBody = {
			model: targetModel,
			messages: options.messages.map(m => ({
				role: m.role,
				content: m.content
			})),
			stream: true,
			options: {
				temperature: options.temperature ?? 0.2
			}
		};

		try {
			const response = await fetch(`${this._baseUrl}/api/chat`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody),
				signal: combinedSignal
			});

			if (!response.ok) {
				const errorText = await response.text().catch(() => 'Unknown error');
				const err = new Error(`Ollama Chat Error (${response.status}): ${errorText}`);
				callbacks.onError(err);
				return;
			}

			if (!response.body) {
				callbacks.onError(new Error('Ollama response body is null'));
				return;
			}

			let fullText = '';
			let promptEvalCount = 0;
			let evalCount = 0;
			let totalDuration = 0;

			const reader = response.body.getReader();
			const decoder = new TextDecoder('utf-8');
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed) {
						continue;
					}

					try {
						const chunk: IFloatOllamaChatResponseChunk = JSON.parse(trimmed);
						if (chunk.message && chunk.message.content) {
							fullText += chunk.message.content;
							callbacks.onChunk(chunk.message.content);
						}

						if (chunk.done) {
							promptEvalCount = chunk.prompt_eval_count ?? promptEvalCount;
							evalCount = chunk.eval_count ?? evalCount;
							totalDuration = chunk.total_duration ?? totalDuration;
						}
					} catch {
						// Ignore partial or unparseable json lines
					}
				}
			}

			if (buffer.trim()) {
				try {
					const chunk: IFloatOllamaChatResponseChunk = JSON.parse(buffer.trim());
					if (chunk.message && chunk.message.content) {
						fullText += chunk.message.content;
						callbacks.onChunk(chunk.message.content);
					}
				} catch {
					// Ignore
				}
			}

			const metadata: IFloatStreamResultMetadata = {
				requestedModelId: options.model,
				executedModelId: targetModel,
				isRoutingAlias: false,
				usage: {
					promptTokens: promptEvalCount,
					completionTokens: evalCount,
					totalTokens: promptEvalCount + evalCount,
					estimatedCostUsd: 0.0, // 100% Free local inference
					isLocalInference: true,
					durationMs: totalDuration ? Math.round(totalDuration / 1e6) : 0
				}
			};

			callbacks.onComplete(fullText, metadata);
		} catch (err: any) {
			if (combinedSignal.aborted) {
				// Clean client cancellation
				return;
			}
			callbacks.onError(err instanceof Error ? err : new Error(String(err)));
		} finally {
			if (this._activeAbortController === controller) {
				this._activeAbortController = null;
			}
		}
	}

	/**
	 * Generates predictive code completion from the local Ollama instance.
	 */
	public async completeCode(
		options: IFloatCompletionOptions,
		signal?: AbortSignal
	): Promise<IFloatCompletionResult> {
		const startTime = performance.now();
		const targetModel = (options.model || 'qwen2.5-coder:latest').replace('ollama/', '');

		const prompt = `<｜fim begin｜>${options.prefix}<｜fim hole｜>${options.suffix}<｜fim end｜>`;

		try {
			const res = await fetch(`${this._baseUrl}/api/generate`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: targetModel,
					prompt,
					stream: false,
					options: {
						temperature: 0.1,
						stop: ['<｜fim end｜>', '\n\n\n']
					}
				}),
				signal
			});

			if (!res.ok) {
				return {
					completion: '',
					cached: false,
					durationMs: Math.round(performance.now() - startTime),
					cancelled: false
				};
			}

			const data = (await res.json()) as { response?: string };
			return {
				completion: data.response || '',
				cached: false,
				durationMs: Math.round(performance.now() - startTime),
				cancelled: false
			};
		} catch (err: any) {
			return {
				completion: '',
				cached: false,
				durationMs: Math.round(performance.now() - startTime),
				cancelled: signal?.aborted || false
			};
		}
	}

	public cancelActiveStream(): void {
		if (this._activeAbortController) {
			this._activeAbortController.abort();
			this._activeAbortController = null;
		}
	}

	private _combineAbortSignals(sig1: AbortSignal, sig2: AbortSignal): AbortSignal {
		if (sig1.aborted) {
			return sig1;
		}
		if (sig2.aborted) {
			return sig2;
		}
		const controller = new AbortController();
		sig1.addEventListener('abort', () => controller.abort(), { once: true });
		sig2.addEventListener('abort', () => controller.abort(), { once: true });
		return controller.signal;
	}
}
