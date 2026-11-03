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
		authToken?: string
	): Promise<void> {
		this.cancelActiveStream();
		this._activeAbortController = new AbortController();
		const signal = this._activeAbortController.signal;

		try {
			const headers: Record<string, string> = {
				'Content-Type': 'application/json'
			};
			if (authToken) {
				headers['Authorization'] = `Bearer ${authToken}`;
			}

			const response = await fetch(this._endpoint, {
				method: 'POST',
				headers,
				body: JSON.stringify({
					messages: messages.map(m => ({ role: m.role, content: m.content })),
					model: modelId,
					stream: true
				}),
				signal
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Upstream request failed (HTTP ${response.status}): ${errorText || response.statusText}`);
			}

			const reader = response.body?.getReader();
			if (!reader) {
				throw new Error('No readable stream available in response');
			}

			const decoder = new TextDecoder();
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				const chunk = decoder.decode(value, { stream: true });
				callbacks.onChunk(chunk);
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
