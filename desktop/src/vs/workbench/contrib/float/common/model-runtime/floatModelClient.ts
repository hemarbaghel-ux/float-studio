/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IFloatChatMessage } from '../protocols/floatProtocol.js';
import { getFloatModel, getDefaultFloatModel } from './floatModelRegistry.js';

export interface IFloatStreamResultMetadata {
	requestedModelId: string;
	executedModelId: string;
	isRoutingAlias: boolean;
	usage?: any;
	contextExplanation?: any;
}

export interface IFloatCompletionOptions {
	prefix: string;
	suffix: string;
	language?: string;
	fileName?: string;
	model?: string;
}

export interface IFloatCompletionResult {
	completion: string;
	cached?: boolean;
	durationMs?: number;
	cancelled?: boolean;
}

export interface IFloatStreamCallbacks {
	onChunk: (chunk: string) => void;
	onError: (error: Error) => void;
	onComplete: (fullText: string, metadata?: IFloatStreamResultMetadata) => void;
	onContext?: (contextInfo: any) => void;
}

export interface IFloatConversation {
	readonly id: string;
	projectId: string;
	requestedModelId: string;
	executedModelId: string;
	messages: IFloatChatMessage[];
	createdAt: number;
}

export class FloatModelClient {
	private readonly _activeAbortControllers = new Map<string, AbortController>();
	private _endpoint: string = 'http://localhost:3000/api/ai/chat';
	private readonly _conversations = new Map<string, IFloatConversation>();

	public setEndpoint(endpoint: string): void {
		this._endpoint = endpoint;
	}

	public getEndpoint(): string {
		return this._endpoint;
	}

	// --- Strict Conversation Isolation ---
	public getOrCreateConversation(id: string, projectId: string = 'default-project', modelId?: string): IFloatConversation {
		let conv = this._conversations.get(id);
		if (!conv) {
			const requested = modelId || getDefaultFloatModel().id;
			const regModel = getFloatModel(requested);
			conv = {
				id,
				projectId,
				requestedModelId: requested,
				executedModelId: regModel?.upstreamModelId || requested,
				messages: [],
				createdAt: Date.now()
			};
			this._conversations.set(id, conv);
		}
		return conv;
	}

	public getConversation(id: string): IFloatConversation | undefined {
		return this._conversations.get(id);
	}

	public clearConversation(id: string): void {
		this._conversations.delete(id);
	}

	public cancelActiveStream(conversationId?: string): void {
		if (conversationId !== undefined) {
			const key = conversationId || 'default';
			const controller = this._activeAbortControllers.get(key);
			if (controller) {
				controller.abort();
				if (this._activeAbortControllers.get(key) === controller) {
					this._activeAbortControllers.delete(key);
				}
			}
			return;
		}

		for (const controller of this._activeAbortControllers.values()) {
			controller.abort();
		}
		this._activeAbortControllers.clear();
	}

	public async streamChat(
		messages: IFloatChatMessage[],
		modelId: string,
		callbacks: IFloatStreamCallbacks,
		authToken?: string,
		projectId: string = 'default-project',
		contextItems?: Array<{ path: string; content: string }>,
		conversationId?: string,
		callerSignal?: AbortSignal
	): Promise<void> {
		const requestKey = conversationId || 'default';
		// Replace only the previous stream for this conversation. Independent
		// conversations must not cancel each other's model requests.
		this.cancelActiveStream(requestKey);
		const requestController = new AbortController();
		const abortFromCaller = () => requestController.abort();
		if (callerSignal?.aborted) {
			requestController.abort();
		} else {
			callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
		}
		this._activeAbortControllers.set(requestKey, requestController);
		const signal = requestController.signal;

		// 1. Model resolution and capability validation
		const registeredModel = getFloatModel(modelId);
		const requestedModelId = modelId || getDefaultFloatModel().id;
		const executedModelId = registeredModel?.upstreamModelId || requestedModelId;
		const isRoutingAlias = Boolean(registeredModel?.isRoutingAlias);

		// Record conversation state for session isolation
		if (conversationId) {
			const conv = this.getOrCreateConversation(conversationId, projectId, requestedModelId);
			conv.projectId = projectId;
			conv.requestedModelId = requestedModelId;
			conv.executedModelId = executedModelId;
			conv.messages = [...messages];
		}

		try {
			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
				'Accept': 'text/event-stream',
				'X-Float-Project-Id': projectId
			};
			if (authToken) {
				headers['Authorization'] = `Bearer ${authToken}`;
			}
			if (conversationId) {
				headers['X-Float-Conversation-Id'] = conversationId;
			}

			// Format messages cleanly for FLOAT's server model router
			const formattedMessages = messages.map(m => ({
				role: m.role === 'assistant' ? 'model' : m.role,
				parts: [{ text: m.content }]
			}));

			const response = await fetch(this._endpoint, {
				method: 'POST',
				headers,
				body: JSON.stringify({
					messages: formattedMessages,
					model: requestedModelId,
					stream: true,
					projectId,
					contextItems: contextItems || []
				}),
				signal
			});

			if (!response.ok) {
				const errorText = await response.text();
				let parsedMsg = errorText;
				try {
					const json = JSON.parse(errorText);
					parsedMsg = json.error || json.message || errorText;
				} catch {}

				const statusText = response.status === 401 ? 'Unauthorized (Authentication token missing or invalid)' :
					response.status === 403 ? 'Forbidden (Access denied to project)' :
					response.status === 429 ? 'Rate limit exceeded' :
					response.status === 400 ? 'Invalid model or request payload' :
					response.statusText;

				throw new Error(`Upstream request failed (HTTP ${response.status} ${statusText}): ${parsedMsg || response.statusText}`);
			}

			const reader = response.body?.getReader();
			if (!reader) {
				throw new Error('No readable stream available in response body');
			}

			const decoder = new TextDecoder();
			let sseBuffer = '';
			let fullAccumulatedText = '';
			let latestContextExplanation: any = null;
			let latestUsage: any = null;

			// Parse every complete or trailing SSE frame through one code path. Keep
			// JSON parsing separate from event handling so a valid { type: "error" }
			// event cannot be mistaken for malformed JSON.
			const processFrame = (frame: string): void => {
				const trimmedFrame = frame.trim();
				if (!trimmedFrame || trimmedFrame.startsWith(':')) {
					return;
				}

				const dataLines = trimmedFrame
					.split(/\r?\n/)
					.filter(line => line.trimStart().startsWith('data:'))
					.map(line => line.trimStart().slice(5).trim());

				if (dataLines.length === 0) {
					fullAccumulatedText += trimmedFrame;
					callbacks.onChunk(trimmedFrame);
					return;
				}

				const payload = dataLines.join('\n');
				let event: any;
				try {
					event = JSON.parse(payload);
				} catch {
					// Preserve compatibility with upstreams that stream plain text in
					// data: frames instead of JSON event envelopes.
					fullAccumulatedText += payload;
					callbacks.onChunk(payload);
					return;
				}

				if (!event || typeof event !== 'object') {
					return;
				}
				if ((event.type === 'delta' || event.type === 'chunk') && typeof event.text === 'string') {
					fullAccumulatedText += event.text;
					callbacks.onChunk(event.text);
				} else if (event.type === 'context_info' && event.contextExplanation) {
					latestContextExplanation = event.contextExplanation;
					callbacks.onContext?.(event.contextExplanation);
				} else if (event.type === 'done') {
					if (event.usage) latestUsage = event.usage;
					if (event.contextExplanation) latestContextExplanation = event.contextExplanation;
				} else if (event.type === 'error') {
					throw new Error(event.error || event.message || 'Stream error from model router');
				}
			};

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				sseBuffer += decoder.decode(value, { stream: true });

				// SSE permits LF and CRLF frame separators.
				const frames = sseBuffer.split(/\r?\n\r?\n/);
				sseBuffer = frames.pop() || '';
				for (const frame of frames) {
					processFrame(frame);
				}
			}

			// Flush the decoder and parse the final frame even when the server
			// closes without the optional trailing blank line.
			sseBuffer += decoder.decode();
			if (sseBuffer.trim()) {
				processFrame(sseBuffer);
			}

			// Update conversation state with assistant response
			if (conversationId) {
				const conv = this.getOrCreateConversation(conversationId);
				conv.messages.push({
					id: `reply-${Date.now()}`,
					role: 'assistant',
					content: fullAccumulatedText,
					timestamp: Date.now(),
					model: executedModelId
				});
			}

			callbacks.onComplete(fullAccumulatedText, {
				requestedModelId,
				executedModelId,
				isRoutingAlias,
				usage: latestUsage,
				contextExplanation: latestContextExplanation
			});
		} catch (err: any) {
			if (signal.aborted) {
				callbacks.onError(new Error('Generation cancelled by user'));
			} else {
				callbacks.onError(err instanceof Error ? err : new Error(String(err)));
			}
		} finally {
			callerSignal?.removeEventListener('abort', abortFromCaller);
			// A late request must not clear a newer request's cancellation handle.
			if (this._activeAbortControllers.get(requestKey) === requestController) {
				this._activeAbortControllers.delete(requestKey);
			}
		}
	}

	/**
	 * Fast inline code autocompletion endpoint (Cursor Tab style)
	 */
	public async completeCode(
		options: IFloatCompletionOptions,
		authToken?: string,
		projectId: string = 'default-project',
		signal?: AbortSignal
	): Promise<IFloatCompletionResult> {
		const startTime = Date.now();
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'X-Float-Project-Id': projectId
		};
		if (authToken) {
			headers['Authorization'] = `Bearer ${authToken}`;
		}

		const base = this._endpoint.replace(/\/api\/ai\/chat.*$/, '');
		const completeUrl = `${base}/api/ai/complete`;

		try {
			const res = await fetch(completeUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify({
					prefix: options.prefix,
					suffix: options.suffix,
					language: options.language || 'plaintext',
					fileName: options.fileName || 'file',
					model: options.model || getDefaultFloatModel().id
				}),
				signal
			});

			if (!res.ok) {
				const errBody = await res.text().catch(() => '');
				throw new Error(`Completion HTTP ${res.status}: ${errBody}`);
			}

			const data: any = await res.json();
			return {
				completion: data.completion || '',
				cancelled: data.cancelled || false,
				durationMs: Date.now() - startTime
			};
		} catch (err: any) {
			if (signal?.aborted || err?.name === 'AbortError') {
				return { completion: '', cancelled: true, durationMs: Date.now() - startTime };
			}
			throw err;
		}
	}
}
