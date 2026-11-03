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
	private _activeAbortController: AbortController | null = null;
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

	public cancelActiveStream(): void {
		if (this._activeAbortController) {
			this._activeAbortController.abort();
			this._activeAbortController = null;
		}
	}

	public async streamChat(
		messages: IFloatChatMessage[],
		modelId: string,
		callbacks: IFloatStreamCallbacks,
		authToken?: string,
		projectId: string = 'default-project',
		contextItems?: Array<{ path: string; content: string }>,
		conversationId?: string
	): Promise<void> {
		this.cancelActiveStream();
		this._activeAbortController = new AbortController();
		const signal = this._activeAbortController.signal;

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

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				const chunk = decoder.decode(value, { stream: true });
				sseBuffer += chunk;

				// Process SSE double newline separated frames
				const frames = sseBuffer.split('\n\n');
				sseBuffer = frames.pop() || '';

				for (const frame of frames) {
					const trimmedFrame = frame.trim();
					if (!trimmedFrame) {
						continue;
					}

					// Process lines within the SSE frame (handles multiline data: frames)
					const lines = trimmedFrame.split('\n');
					const dataLines: string[] = [];

					for (const line of lines) {
						const trimmedLine = line.trim();
						if (trimmedLine.startsWith('data:')) {
							dataLines.push(trimmedLine.slice(5).trim());
						}
					}

					if (dataLines.length > 0) {
						const payload = dataLines.join('\n');
						try {
							const event = JSON.parse(payload);
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
						} catch (jsonErr: any) {
							// If not valid JSON, treat raw payload as text delta
							fullAccumulatedText += payload;
							callbacks.onChunk(payload);
						}
					} else {
						// Non-SSE raw chunk streaming fallback
						fullAccumulatedText += trimmedFrame;
						callbacks.onChunk(trimmedFrame);
					}
				}
			}

			// Flush any remaining buffer if not empty
			if (sseBuffer.trim()) {
				const trimmed = sseBuffer.trim();
				if (trimmed.startsWith('data:')) {
					try {
						const event = JSON.parse(trimmed.slice(5).trim());
						if (event.text) {
							fullAccumulatedText += event.text;
							callbacks.onChunk(event.text);
						}
					} catch {}
				} else {
					fullAccumulatedText += trimmed;
					callbacks.onChunk(trimmed);
				}
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
			this._activeAbortController = null;
		}
	}
}
