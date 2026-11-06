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
import { FloatTreeSitterIndexer } from '../indexer/floatTreeSitterIndexer.js';
import { FloatVectorEngine } from '../vector/floatVectorEngine.js';
import { FloatAstSemanticChunker } from '../chunker/floatAstSemanticChunker.js';
import { FloatDiskIndexStore } from '../storage/floatDiskIndexStore.js';
import { FloatShadowWorkspaceManager } from '../shadow/floatShadowWorkspaceManager.js';
import { FloatSandboxedProcessRunner } from '../sandbox/floatSandboxedProcessRunner.js';
import { FloatShadowDiagnosticDiffCollector } from '../../../desktop/src/vs/workbench/contrib/float/common/shadow/floatShadowDiagnosticDiffCollector.js';
import { FloatSyntaxContextSlicer } from '../../../desktop/src/vs/workbench/contrib/float/browser/autocomplete/floatSyntaxContextSlicer.js';
import { FloatCursorJumpPredictor } from '../../../desktop/src/vs/workbench/contrib/float/browser/autocomplete/floatCursorJumpPredictor.js';
import { FloatSpeculativeTokenStreamer } from '../../../desktop/src/vs/workbench/contrib/float/browser/autocomplete/floatSpeculativeTokenStreamer.js';
import { FloatMultiFileSyncDiffEditor } from '../../../desktop/src/vs/workbench/contrib/float/browser/diff/floatMultiFileSyncDiffEditor.js';
import { FloatTerminalPtyAgent } from '../../../desktop/src/vs/workbench/contrib/float/browser/terminal/floatTerminalPtyAgent.js';
import { FloatDagTaskPlanner } from '../../../desktop/src/vs/workbench/contrib/float/common/planner/floatDagTaskPlanner.js';

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
	private readonly _indexer: FloatTreeSitterIndexer;
	private readonly _vectorEngine: FloatVectorEngine;
	private readonly _semanticChunker: FloatAstSemanticChunker;
	private readonly _diskStore: FloatDiskIndexStore;
	private readonly _shadowManager: FloatShadowWorkspaceManager;
	private readonly _sandboxRunner: FloatSandboxedProcessRunner;
	private readonly _diagnosticCollector: FloatShadowDiagnosticDiffCollector;
	private readonly _syntaxSlicer: FloatSyntaxContextSlicer;
	private readonly _jumpPredictor: FloatCursorJumpPredictor;
	private readonly _speculativeStreamer: FloatSpeculativeTokenStreamer;
	private readonly _multiDiffEditor: FloatMultiFileSyncDiffEditor;
	private readonly _terminalAgent: FloatTerminalPtyAgent;
	private readonly _dagPlanner: FloatDagTaskPlanner;

	constructor(options?: IFloatDaemonOptions) {
		this._pipePath = options?.pipeName || this._resolveDefaultPipePath();
		this._shadowDaemon = new FloatShadowDaemon();
		this._speculator = new FloatNextActionSpeculator();
		this._indexer = new FloatTreeSitterIndexer();
		this._vectorEngine = new FloatVectorEngine();
		this._semanticChunker = new FloatAstSemanticChunker(this._indexer);
		this._diskStore = new FloatDiskIndexStore(path.join(os.tmpdir(), 'float-daemon-index'));
		this._shadowManager = new FloatShadowWorkspaceManager();
		this._sandboxRunner = new FloatSandboxedProcessRunner();
		this._diagnosticCollector = new FloatShadowDiagnosticDiffCollector();
		this._syntaxSlicer = new FloatSyntaxContextSlicer(this._indexer);
		this._jumpPredictor = new FloatCursorJumpPredictor();
		this._speculativeStreamer = new FloatSpeculativeTokenStreamer();
		this._multiDiffEditor = new FloatMultiFileSyncDiffEditor();
		this._terminalAgent = new FloatTerminalPtyAgent();
		this._dagPlanner = new FloatDagTaskPlanner();
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

				case 'semantic_index_file': {
					const { filePath, content } = params;
					const indexRes = this._indexer.indexFile(filePath, content);
					const chunks = this._vectorEngine.chunkFile(filePath, content);
					this._vectorEngine.clearFileChunks(filePath);
					this._vectorEngine.addChunks(chunks);
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: {
							delta: indexRes.delta,
							symbolsCount: indexRes.node.symbols.length,
							chunksCount: chunks.length,
							fileHash: indexRes.node.fileHash
						}
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'semantic_search': {
					const { query, topK } = params;
					const results = this._vectorEngine.search(query, topK || 5);
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: {
							query,
							totalChunksIndexed: this._vectorEngine.totalChunks,
							matches: results.map(r => ({
								filePath: r.chunk.filePath,
								startLine: r.chunk.startLine,
								endLine: r.chunk.endLine,
								snippet: r.chunk.content.substring(0, 200),
								score: Math.round(r.score * 1000) / 1000,
								matchType: r.matchType
							}))
						}
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'semantic_get_symbols': {
					const { query } = params;
					const syms = query ? this._indexer.findSymbolsByName(query) : this._indexer.getAllSymbols();
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: {
							totalSymbols: syms.length,
							symbols: syms.slice(0, 50).map(s => ({
								filePath: s.filePath,
								name: s.symbol.name,
								kind: s.symbol.kind,
								language: s.symbol.language,
								signature: s.symbol.signature,
								line: s.symbol.startLine
							}))
						}
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'semantic_chunk_file': {
					const { filePath, content } = params;
					const chunks = this._semanticChunker.chunkFile(filePath, content);
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: {
							filePath,
							chunksCount: chunks.length,
							chunks: chunks.map(c => ({
								id: c.id,
								symbolName: c.symbolName,
								symbolKind: c.symbolKind,
								startLine: c.startLine,
								endLine: c.endLine,
								content: c.content
							}))
						}
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'semantic_persist_index': {
					const storageDir = params?.storageDir;
					const store = storageDir ? new FloatDiskIndexStore(storageDir) : this._diskStore;
					const indexedFiles = this._indexer.getIndexedFiles();
					const nodes = indexedFiles.map(f => this._indexer.getFileNode(f)!).filter(Boolean);
					const chunks = this._vectorEngine.getAllChunks();
					const writeRes = await store.saveIndex(nodes, chunks);
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: {
							saved: true,
							manifestPath: writeRes.manifestPath,
							bytesWritten: writeRes.bytesWritten,
							totalFiles: nodes.length,
							totalChunks: chunks.length
						}
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'semantic_load_index': {
					const storageDir = params?.storageDir;
					const store = storageDir ? new FloatDiskIndexStore(storageDir) : this._diskStore;
					const loaded = await store.loadIndex();
					if (loaded) {
						this._indexer.restoreNodes(loaded.nodes);
						this._vectorEngine.restoreChunks(loaded.chunks);
					}
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: {
							loaded: loaded !== null,
							totalFiles: loaded?.manifest.totalFiles || 0,
							totalSymbols: loaded?.manifest.totalSymbols || 0,
							totalChunks: loaded?.chunks.length || 0
						}
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'shadow_create_cow_workspace': {
					const { sourceRoot, sessionId } = params;
					const session = await this._shadowManager.createShadowWorkspace(sourceRoot, sessionId);
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: {
							sessionId: session.sessionId,
							shadowRoot: session.shadowRoot,
							sourceRoot: session.sourceRoot,
							trackedFilesCount: session.trackedFiles.size
						}
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'shadow_apply_cow_edits': {
					const { sessionId, relativePath, newContent } = params;
					await this._shadowManager.applyShadowEdit(sessionId, relativePath, newContent);
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: {
							applied: true,
							sessionId,
							relativePath
						}
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'shadow_get_diff': {
					const { sessionId } = params;
					const diff = this._shadowManager.getShadowDiff(sessionId);
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: diff
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'shadow_run_sandboxed_toolchain': {
					const { sessionId, command, args, timeoutMs } = params;
					const session = this._shadowManager.getSession(sessionId);
					if (!session) {
						throw new Error(`Shadow session not found: ${sessionId}`);
					}
					const execRes = await this._sandboxRunner.runInShadowWorkspace(session.shadowRoot, command, args, { timeoutMs });
					const diagnostics = this._diagnosticCollector.parseDiagnostics(execRes.stdout + '\n' + execRes.stderr);
					const repairPrompt = this._diagnosticCollector.generateRepairPrompt(diagnostics);

					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: {
							command,
							exitCode: execRes.exitCode,
							stdout: execRes.stdout,
							stderr: execRes.stderr,
							durationMs: execRes.durationMs,
							timedOut: execRes.timedOut,
							diagnosticsCount: diagnostics.length,
							diagnostics,
							repairPrompt
						}
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'shadow_teardown_workspace': {
					const { sessionId } = params;
					const cleaned = await this._shadowManager.teardownSession(sessionId);
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: { cleaned, sessionId }
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'tab_slice_syntax_context': {
					const { filePath, content, cursorLine, cursorColumn } = params;
					const slice = this._syntaxSlicer.sliceContext(filePath, content, cursorLine, cursorColumn);
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: slice
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'tab_predict_cursor_jumps': {
					const { symbolName, oldSignature, newSignature, workspaceFiles } = params;
					const jumps = this._jumpPredictor.predictRemoteJumps(symbolName, oldSignature, newSignature, workspaceFiles || {});
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: {
							symbolName,
							totalJumps: jumps.length,
							jumps
						}
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'tab_speculate_keystrokes': {
					const { prediction, keystrokes } = params;
					this._speculativeStreamer.setSpeculativePrediction(prediction);
					const results: any[] = [];
					for (const char of (keystrokes || '')) {
						results.push(this._speculativeStreamer.onKeystroke(char));
					}
					const metrics = this._speculativeStreamer.getMetrics();
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: {
							metrics,
							results
						}
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'composer_multi_diff_review': {
					const { files, action, hunkId, targetFile } = params;
					if (files) {
						for (const f of files) {
							this._multiDiffEditor.loadDiff(f.filePath, f.originalContent, f.proposedContent);
						}
					}
					if (action === 'accept_hunk' && hunkId && targetFile) {
						this._multiDiffEditor.acceptHunk(targetFile, hunkId);
					} else if (action === 'reject_hunk' && hunkId && targetFile) {
						this._multiDiffEditor.rejectHunk(targetFile, hunkId);
					} else if (action === 'accept_all') {
						this._multiDiffEditor.acceptAll(targetFile);
					} else if (action === 'reject_all') {
						this._multiDiffEditor.rejectAll(targetFile);
					}

					const stats = this._multiDiffEditor.getAggregatedStats();
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: stats
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'terminal_pty_analyze_logs': {
					const { rawOutput } = params;
					const analysis = this._terminalAgent.analyzeTerminalOutput(rawOutput || '');
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: analysis
					};
					socket.write(FloatIpcFramer.encode(res));
					break;
				}

				case 'dag_plan_and_execute': {
					const { goal, tasks } = params;
					const planner = new FloatDagTaskPlanner();
					for (const t of (tasks || [])) {
						planner.addTask(t);
					}
					const summary = await planner.executePlan(goal || 'Execute goal', async () => true);
					const res: IFloatIpcResponse = {
						id,
						type: 'response',
						result: summary
					};
					socket.write(FloatIpcFramer.encode(res));
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
