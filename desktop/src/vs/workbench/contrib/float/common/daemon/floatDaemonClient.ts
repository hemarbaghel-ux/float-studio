/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import {
	FloatIpcFramer,
	FloatIpcMessage,
	IFloatIpcRequest,
	IFloatIpcResponse,
	IFloatIpcStreamChunk,
	IFloatIpcStreamEnd
} from './floatIpcProtocol.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';

export interface IFloatDaemonClientOptions {
	pipeName?: string;
	connectTimeoutMs?: number;
}

export class FloatDaemonClient extends Disposable {
	private _socket: net.Socket | null = null;
	private readonly _pipePath: string;
	private _isConnected: boolean = false;
	private _requestCounter: number = 0;

	private readonly _pendingRequests = new Map<
		string,
		{
			resolve: (res: any) => void;
			reject: (err: any) => void;
			timer: NodeJS.Timeout;
		}
	>();

	private readonly _streamingListeners = new Map<
		string,
		{
			onChunk: (chunk: any) => void;
			onEnd: (summary: any) => void;
			onError: (err: any) => void;
		}
	>();

	private readonly _onDidChangeConnected = this._register(new Emitter<boolean>());
	public readonly onDidChangeConnected: Event<boolean> = this._onDidChangeConnected.event;

	constructor(options?: IFloatDaemonClientOptions) {
		super();
		this._pipePath = options?.pipeName || this._resolveDefaultPipePath();
	}

	public getPipePath(): string {
		return this._pipePath;
	}

	public isConnected(): boolean {
		return this._isConnected;
	}

	private _resolveDefaultPipePath(): string {
		if (process.platform === 'win32') {
			return '\\\\.\\pipe\\float-core-ipc';
		} else {
			return path.join(os.tmpdir(), 'float-core-ipc.sock');
		}
	}

	public async connect(timeoutMs: number = 3000): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const socket = net.createConnection(this._pipePath);
			this._socket = socket;

			const timer = setTimeout(() => {
				socket.destroy();
				reject(new Error(`Timeout connecting to FLOAT Daemon at ${this._pipePath}`));
			}, timeoutMs);

			socket.on('connect', () => {
				clearTimeout(timer);
				this._isConnected = true;
				this._onDidChangeConnected.fire(true);
				resolve();
			});

			let receiveBuffer = Buffer.alloc(0);

			socket.on('data', (data: Buffer) => {
				receiveBuffer = Buffer.concat([receiveBuffer, data]);
				receiveBuffer = FloatIpcFramer.decodeStream(receiveBuffer, (message: FloatIpcMessage) => {
					this._routeIncomingMessage(message);
				});
			});

			socket.on('close', () => {
				this._isConnected = false;
				this._onDidChangeConnected.fire(false);
				this._rejectAllPending(new Error('Connection to FLOAT Daemon closed'));
			});

			socket.on('error', (err) => {
				clearTimeout(timer);
				this._isConnected = false;
				this._onDidChangeConnected.fire(false);
				this._rejectAllPending(err);
				reject(err);
			});
		});
	}

	private _routeIncomingMessage(message: FloatIpcMessage): void {
		if (message.type === 'response') {
			const res = message as IFloatIpcResponse;
			const pending = this._pendingRequests.get(res.id);
			if (pending) {
				clearTimeout(pending.timer);
				this._pendingRequests.delete(res.id);

				if (res.error) {
					pending.reject(new Error(res.error.message));
				} else {
					pending.resolve(res.result);
				}
			}
		} else if (message.type === 'stream_chunk') {
			const chunk = message as IFloatIpcStreamChunk;
			const stream = this._streamingListeners.get(chunk.id);
			if (stream) {
				stream.onChunk(chunk.chunk);
			}
		} else if (message.type === 'stream_end') {
			const end = message as IFloatIpcStreamEnd;
			const stream = this._streamingListeners.get(end.id);
			if (stream) {
				this._streamingListeners.delete(end.id);
				stream.onEnd(end.summary);
			}
		}
	}

	public async call<T = any>(method: string, params: any = {}, timeoutMs: number = 30000): Promise<T> {
		if (!this._isConnected || !this._socket) {
			throw new Error('FLOAT Daemon client is not connected');
		}

		const id = `req-${++this._requestCounter}-${Date.now()}`;
		const request: IFloatIpcRequest = {
			id,
			type: 'request',
			method,
			params
		};

		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this._pendingRequests.delete(id);
				reject(new Error(`FLOAT Daemon request timed out for method: ${method}`));
			}, timeoutMs);

			this._pendingRequests.set(id, { resolve, reject, timer });
			this._socket!.write(FloatIpcFramer.encode(request));
		});
	}

	public async stream(
		method: string,
		params: any,
		callbacks: {
			onChunk: (chunk: any) => void;
			onEnd: (summary: any) => void;
			onError: (err: any) => void;
		}
	): Promise<void> {
		if (!this._isConnected || !this._socket) {
			throw new Error('FLOAT Daemon client is not connected');
		}

		const id = `stream-${++this._requestCounter}-${Date.now()}`;
		const request: IFloatIpcRequest = {
			id,
			type: 'request',
			method,
			params
		};

		this._streamingListeners.set(id, callbacks);
		this._socket.write(FloatIpcFramer.encode(request));
	}

	public async createCowShadowWorkspace(sourceRoot: string, sessionId?: string): Promise<any> {
		return this.call('shadow_create_cow_workspace', { sourceRoot, sessionId });
	}

	public async applyCowShadowEdit(sessionId: string, relativePath: string, newContent: string): Promise<any> {
		return this.call('shadow_apply_cow_edits', { sessionId, relativePath, newContent });
	}

	public async getCowShadowDiff(sessionId: string): Promise<any> {
		return this.call('shadow_get_diff', { sessionId });
	}

	public async runCowShadowToolchain(sessionId: string, command: string, args: string[] = [], timeoutMs?: number): Promise<any> {
		return this.call('shadow_run_sandboxed_toolchain', { sessionId, command, args, timeoutMs });
	}

	public async teardownCowShadowWorkspace(sessionId: string): Promise<any> {
		return this.call('shadow_teardown_workspace', { sessionId });
	}

	public async sliceSyntaxContext(filePath: string, content: string, cursorLine: number, cursorColumn: number = 1): Promise<any> {
		return this.call('tab_slice_syntax_context', { filePath, content, cursorLine, cursorColumn });
	}

	public async predictCursorJumps(symbolName: string, oldSignature: string, newSignature: string, workspaceFiles: Record<string, string>): Promise<any> {
		return this.call('tab_predict_cursor_jumps', { symbolName, oldSignature, newSignature, workspaceFiles });
	}

	public async testSpeculativeKeystrokes(prediction: string, keystrokes: string): Promise<any> {
		return this.call('tab_speculate_keystrokes', { prediction, keystrokes });
	}

	public async reviewMultiDiff(options: any): Promise<any> {
		return this.call('composer_multi_diff_review', options);
	}

	public async analyzeTerminalPty(rawOutput: string): Promise<any> {
		return this.call('terminal_pty_analyze_logs', { rawOutput });
	}

	public async executeDagPlan(goal: string, tasks: any[]): Promise<any> {
		return this.call('dag_plan_and_execute', { goal, tasks });
	}

	public async ping(): Promise<any> {
		return this.call('ping');
	}

	public async createShadowSandbox(sessionId: string, sourceWorkspaceRoot: string): Promise<any> {
		return this.call('create_shadow_sandbox', { sessionId, sourceWorkspaceRoot });
	}

	public async runShadowToolchain(sessionId: string, command: string, args: string[] = [], timeoutMs?: number): Promise<any> {
		return this.call('run_shadow_toolchain', { sessionId, command, args, timeoutMs });
	}

	public async cleanupShadowSandbox(sessionId: string): Promise<any> {
		return this.call('cleanup_shadow_sandbox', { sessionId });
	}

	public async predictNextEdit(options: any): Promise<any> {
		return this.call('predict_next_edit', options);
	}

	public async indexFileSemantics(filePath: string, content: string): Promise<any> {
		return this.call('semantic_index_file', { filePath, content });
	}

	public async searchSemantics(query: string, topK: number = 5): Promise<any> {
		return this.call('semantic_search', { query, topK });
	}

	public async chunkFileSemantics(filePath: string, content: string): Promise<any> {
		return this.call('semantic_chunk_file', { filePath, content });
	}

	public async persistIndex(storageDir?: string): Promise<any> {
		return this.call('semantic_persist_index', { storageDir });
	}

	public async loadIndex(storageDir?: string): Promise<any> {
		return this.call('semantic_load_index', { storageDir });
	}

	public async getSymbols(query?: string): Promise<any> {
		return this.call('semantic_get_symbols', { query });
	}

	private _rejectAllPending(err: Error): void {
		for (const [id, pending] of this._pendingRequests.entries()) {
			clearTimeout(pending.timer);
			pending.reject(err);
		}
		this._pendingRequests.clear();

		for (const [id, stream] of this._streamingListeners.entries()) {
			stream.onError(err);
		}
		this._streamingListeners.clear();
	}

	public disconnect(): void {
		if (this._socket) {
			this._socket.destroy();
			this._socket = null;
		}
		this._isConnected = false;
	}

	override dispose(): void {
		this.disconnect();
		super.dispose();
	}
}
