/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IFloatChatMessage } from '../protocols/floatProtocol.js';

export interface IFloatStreamCallbacks {
	onChunk: (chunk: string) => void;
	onError: (error: Error) => void;
	onComplete: () => void;
}

export class FloatModelClient {
	private _activeAbortController: AbortController | null = null;
	private _endpoint: string = 'http://localhost:3000/api/ai/chat';

	public setEndpoint(endpoint: string): void {
		this._endpoint = endpoint;
	}

	public getEndpoint(): string {
		return this._endpoint;
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
		projectId: string = 'default-project'
	): Promise<void> {
		this.cancelActiveStream();
		this._activeAbortController = new AbortController();
		const signal = this._activeAbortController.signal;

		try {
			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
				'Accept': 'text/event-stream'
			};
			if (authToken) {
				headers['Authorization'] = `Bearer ${authToken}`;
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
					model: modelId,
					stream: true,
					projectId
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
				throw new Error(`Upstream request failed (HTTP ${response.status}): ${parsedMsg || response.statusText}`);
			}

			const reader = response.body?.getReader();
			if (!reader) {
				throw new Error('No readable stream available in response body');
			}

			const decoder = new TextDecoder();
			let sseBuffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				const chunk = decoder.decode(value, { stream: true });
				sseBuffer += chunk;

				// Process SSE double newline separated frames
				const parts = sseBuffer.split('\n\n');
				sseBuffer = parts.pop() || '';

				for (const part of parts) {
					const trimmed = part.trim();
					if (!trimmed) {
						continue;
					}

					// SSE data lines
					if (trimmed.startsWith('data:')) {
						const jsonStr = trimmed.slice(5).trim();
						try {
							const event = JSON.parse(jsonStr);
							if ((event.type === 'delta' || event.type === 'chunk') && typeof event.text === 'string') {
								callbacks.onChunk(event.text);
							} else if (event.type === 'done') {
								// Stream finished
							} else if (event.type === 'error') {
								throw new Error(event.error || 'Stream error from model router');
							}
						} catch (jsonErr: any) {
							// If not valid JSON, treat raw payload as text chunk
							callbacks.onChunk(jsonStr);
						}
					} else {
						// Non-SSE raw chunk streaming fallback
						callbacks.onChunk(trimmed);
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
							callbacks.onChunk(event.text);
						}
					} catch {}
				} else {
					callbacks.onChunk(trimmed);
				}
			}

			callbacks.onComplete();
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
