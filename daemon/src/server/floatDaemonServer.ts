/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
	FloatIpcFramer,
	FloatIpcMessage,
	IFloatIpcRequest,
	IFloatIpcResponse,
	IFloatIpcStreamChunk,
	IFloatIpcStreamEnd
} from '../ipc/floatIpcProtocol.js';
import { FloatShadowDaemon } from '../../../desktop/src/vs/workbench/contrib/float/common/shadow/floatShadowDaemon.js';
import { FloatNextActionSpeculator } from '../../../desktop/src/vs/workbench/contrib/float/browser/autocomplete/floatNextActionSpeculator.js';
import { FloatVectorIndex } from '../../../desktop/src/vs/workbench/contrib/float/common/workspace/floatVectorIndex.js';

export interface IFloatDaemonOptions {
	pipeName?: string;
	maxConnections?: number;
}

export class FloatDaemonServer {
	private _server: net.Server | null = null;
	private _pipePath: string;
	private readonly _clients = new Set<net.Socket>();
	private _isShuttingDown: boolean = false;
	private readonly _shadowDaemon: FloatShadowDaemon;
	private readonly _speculator: FloatNextActionSpeculator;

	constructor(options?: IFloatDaemonOptions) {
		this._pipePath = options?.pipeName || this._resolveDefaultPipePath();
		this._shadowDaemon = new FloatShadowDaemon();
		this._speculator = new FloatNextActionSpeculator();
	}

	public getPipePath(): string {
		return this._pipePath;
	}

	private _resolveDefaultPipePath(): string {
		if (process.platform === 'win32') {
			return '\\\\.\\pipe\\float-core-ipc';
		} else {
			return path.join(os.tmpdir(), 'float-core-ipc.sock');
		}
	}

	public async start(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			if (process.platform !== 'win32' && fs.existsSync(this._pipePath)) {
				try {
					fs.unlinkSync(this._pipePath);
				} catch {}
			}

			const server = net.createServer((socket: net.Socket) => {
				this._handleConnection(socket);
			});

			this._server = server;

			server.on('error', (err) => {
				if (!this._isShuttingDown) {
					console.error('[FloatDaemonServer] Error:', err);
					reject(err);
				}
			});

			server.listen(this._pipePath, () => {
				resolve();
			});
		});
	}

	private _handleConnection(socket: net.Socket): void {
		this._clients.add(socket);
		let receiveBuffer = Buffer.alloc(0);

		socket.on('data', (data: Buffer) => {
			receiveBuffer = Buffer.concat([receiveBuffer, data]);
			receiveBuffer = FloatIpcFramer.decodeStream(receiveBuffer, (message: FloatIpcMessage) => {
				if (message.type === 'request') {
					this._handleRequest(socket, message as IFloatIpcRequest);
				}
			});
		});

		socket.on('close', () => {
			this._clients.delete(socket);
		});

		socket.on('error', () => {
			this._clients.delete(socket);
		});
	}

	private async _handleRequest(socket: net.Socket, request: IFloatIpcRequest): Promise<void> {
		const { id, method, params } = request;

		try {
			switch (method) {
				case 'ping': {
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: {
							status: 'ok',
							pid: process.pid,
							uptimeSec: Math.round(process.uptime()),
							platform: process.platform,
							version: '1.0.0-daemon',
							activeClients: this._clients.size
						}
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'create_shadow_sandbox': {
					const t0 = Date.now();
					const sandboxRoot = await this._shadowDaemon.createShadowSandbox(params.sessionId, params.sourceWorkspaceRoot);
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: {
							sessionId: params.sessionId,
							sandboxRoot,
							durationMs: Date.now() - t0
						}
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'run_shadow_toolchain': {
					const fullCommand = Array.isArray(params.args) && params.args.length > 0
						? `${params.command} ${params.args.join(' ')}`
						: params.command;
					const result = await this._shadowDaemon.executeToolchain(
						params.sessionId,
						fullCommand,
						params.timeoutMs || 30000
					);
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'cleanup_shadow_sandbox': {
					await this._shadowDaemon.destroyShadowSandbox(params.sessionId);
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: { success: true }
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'predict_next_edit': {
					const t0 = Date.now();
					const ctx = params.context || {
						prefix: params.activePrefix || '',
						suffix: params.activeSuffix || '',
						lineNumber: params.cursorPosition?.line || 1,
						column: params.cursorPosition?.column || 1,
						fileName: params.currentFile || 'file.ts',
						language: 'typescript'
					};
					const promptContext = this._speculator.buildPromptContext(ctx);
					const jump = this._speculator.predictCursorJump(ctx);
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: {
							suggestedEdits: [{ text: params.activePrefix ? '// completion' : '' }],
							promptContext,
							jumpRecommendation: jump,
							durationMs: Date.now() - t0
						}
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'stream_agent_task': {
					// Stream multi-step progress chunks
					const totalSteps = params.steps || 3;
					for (let i = 1; i <= totalSteps; i++) {
						const chunkMsg: IFloatIpcStreamChunk = {
							id,
							type: 'stream_chunk',
							sequence: i,
							chunk: {
								step: i,
								action: `Executing step ${i} of ${totalSteps}`,
								progressPercent: Math.round((i / totalSteps) * 100)
							}
						};
						socket.write(FloatIpcFramer.encode(chunkMsg));
						// Small micro-pause between steps
						await new Promise(r => setTimeout(r, 20));
					}

					const endMsg: IFloatIpcStreamEnd = {
						id,
						type: 'stream_end',
						totalChunks: totalSteps,
						summary: { status: 'completed', stepsExecuted: totalSteps }
					};
					socket.write(FloatIpcFramer.encode(endMsg));
					break;
				}

				default: {
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						error: {
							code: -32601,
							message: `Method not found: ${method}`
						}
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}
			}
		} catch (err: any) {
			const res: IFloatIpcResponse = {
				id,
				type: 'response',
				error: {
					code: -32000,
					message: err.message || String(err)
				}
			};
			socket.write(FloatIpcFramer.encode(res));
		}
	}

	public async stop(): Promise<void> {
		this._isShuttingDown = true;

		for (const client of this._clients) {
			try {
				client.destroy();
			} catch {}
		}
		this._clients.clear();

		await this._shadowDaemon.destroyAllSandboxes();

		return new Promise<void>((resolve) => {
			if (this._server) {
				this._server.close(() => {
					if (process.platform !== 'win32' && fs.existsSync(this._pipePath)) {
						try {
							fs.unlinkSync(this._pipePath);
						} catch {}
					}
					this._server = null;
					resolve();
				});
			} else {
				resolve();
			}
		});
	}
}
