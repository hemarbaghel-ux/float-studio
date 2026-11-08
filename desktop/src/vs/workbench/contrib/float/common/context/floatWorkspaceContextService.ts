/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { FloatDaemonClient } from '../daemon/floatDaemonClient.js';
import { FloatDaemonLifecycleManager } from '../daemon/floatDaemonLifecycleManager.js';
import { FloatWorkspaceAutoIndexer } from '../../../../../../../../daemon/src/workspace/floatWorkspaceAutoIndexer.js';

export const IFloatWorkspaceContextService = createDecorator<IFloatWorkspaceContextService>('floatWorkspaceContextService');

export interface IFloatRetrievedChunk {
	filePath: string;
	startLine: number;
	endLine: number;
	symbolName?: string;
	symbolKind?: string;
	content: string;
	score: number;
	matchType: string;
}

export interface IFloatEvidenceReference {
	filePath: string;
	lineRange: string;
	symbolName?: string;
	score: number;
}

export interface IFloatRetrievedContext {
	query: string;
	hasCodebaseContext: boolean;
	includedFiles: string[];
	chunks: IFloatRetrievedChunk[];
	evidenceReferences: IFloatEvidenceReference[];
	totalTokensApprox: number;
	groundedContextPrompt: string;
}

export interface IFloatCodebaseSearchOptions {
	topK?: number;
	tokenBudget?: number;
	maxChunksPerFile?: number;
	relevanceThreshold?: number;
	activeFile?: string;
	signal?: AbortSignal;
}

export interface IFloatWorkspaceContextService {
	readonly _serviceBrand: undefined;

	readonly onDidUpdateIndex: Event<{ totalFiles: number; totalChunks: number }>;
	readonly onDidRetrieveContext: Event<IFloatRetrievedContext>;

	indexWorkspace(rootPath: string): Promise<{ totalIndexed: number; durationMs: number }>;
	refreshIndex(filePath?: string): Promise<void>;
	searchCodebase(query: string, options?: IFloatCodebaseSearchOptions): Promise<IFloatRetrievedContext>;
	searchSymbols(query: string): Promise<any[]>;
	getFileContext(filePath: string): Promise<string | null>;
	getRelatedFiles(filePath: string): Promise<string[]>;
	getWorkspaceContext(query: string, tokenBudget?: number): Promise<IFloatRetrievedContext>;
	processCodebaseMention(userPrompt: string, options?: IFloatCodebaseSearchOptions): Promise<{
		cleanPrompt: string;
		hasCodebaseMention: boolean;
		context: IFloatRetrievedContext | null;
	}>;
	dispose(): void;
}

export class FloatWorkspaceContextService extends Disposable implements IFloatWorkspaceContextService {
	readonly _serviceBrand: undefined;

	private readonly _daemonLifecycle: FloatDaemonLifecycleManager;
	private _activeWorkspaceRoot: string | null = null;
	private _localAutoIndexer: FloatWorkspaceAutoIndexer | null = null;

	private readonly _onDidUpdateIndex = this._register(new Emitter<{ totalFiles: number; totalChunks: number }>());
	public readonly onDidUpdateIndex: Event<{ totalFiles: number; totalChunks: number }> = this._onDidUpdateIndex.event;

	private readonly _onDidRetrieveContext = this._register(new Emitter<IFloatRetrievedContext>());
	public readonly onDidRetrieveContext: Event<IFloatRetrievedContext> = this._onDidRetrieveContext.event;

	constructor(lifecycleManager?: FloatDaemonLifecycleManager) {
		super();
		this._daemonLifecycle = lifecycleManager || this._register(new FloatDaemonLifecycleManager());
	}

	public async indexWorkspace(rootPath: string): Promise<{ totalIndexed: number; durationMs: number }> {
		this._activeWorkspaceRoot = path.resolve(rootPath);

		// 1. Try daemon-based indexing if daemon is alive
		const isRunning = await this._daemonLifecycle.ensureDaemonRunning();
		if (isRunning) {
			try {
				const res = await this._daemonLifecycle.client.call('workspace_auto_index', {
					workspaceRoot: this._activeWorkspaceRoot,
					storageDirectory: path.join(this._activeWorkspaceRoot, '.float', 'index')
				}, 60000);
				this._onDidUpdateIndex.fire({ totalFiles: res.totalIndexed, totalChunks: res.totalIndexed * 4 });
				return res;
			} catch (err) {
				console.warn('[FloatWorkspaceContextService] Daemon index call failed, falling back to local indexer:', err);
			}
		}

		// 2. Local in-process auto-indexer fallback
		this._localAutoIndexer = new FloatWorkspaceAutoIndexer({
			workspaceRoot: this._activeWorkspaceRoot,
			storageDirectory: path.join(this._activeWorkspaceRoot, '.float', 'index')
		});

		const summary = await this._localAutoIndexer.startInitialIndex();
		this._onDidUpdateIndex.fire({ totalFiles: summary.totalIndexed, totalChunks: this._localAutoIndexer.vectorEngine.totalChunks });
		return summary;
	}

	public async refreshIndex(filePath?: string): Promise<void> {
		if (filePath) {
			if (this._localAutoIndexer) {
				this._localAutoIndexer.onFileChanged(filePath);
			}
			if (this._daemonLifecycle.client.isConnected()) {
				try {
					if (fs.existsSync(filePath)) {
						const content = await fs.promises.readFile(filePath, 'utf8');
						await this._daemonLifecycle.client.call('semantic_index_file', { filePath, content });
					}
				} catch {}
			}
		} else if (this._activeWorkspaceRoot) {
			await this.indexWorkspace(this._activeWorkspaceRoot);
		}
	}

	public async searchCodebase(query: string, options: IFloatCodebaseSearchOptions = {}): Promise<IFloatRetrievedContext> {
		const topK = options.topK || 10;
		const tokenBudget = options.tokenBudget || 4000;
		const maxChunksPerFile = options.maxChunksPerFile || 3;
		const relevanceThreshold = options.relevanceThreshold || 0.15;

		let rawMatches: any[] = [];

		// 1. Search via daemon IPC if connected
		if (this._daemonLifecycle.client.isConnected()) {
			try {
				const searchRes = await this._daemonLifecycle.client.call('semantic_search', {
					query,
					topK,
					activeFile: options.activeFile
				}, 5000);
				rawMatches = searchRes.matches || [];
			} catch (err) {
				console.warn('[FloatWorkspaceContextService] Daemon search failed, falling back to local:', err);
			}
		}

		// 2. Search via local engine if daemon returned nothing or was not connected
		if (rawMatches.length === 0 && this._localAutoIndexer) {
			const localResults = await this._localAutoIndexer.vectorEngine.searchHybrid(query, {
				topK,
				activeFile: options.activeFile,
				signal: options.signal
			});
			rawMatches = localResults.map(r => ({
				filePath: r.chunk.filePath,
				startLine: r.chunk.startLine,
				endLine: r.chunk.endLine,
				symbolName: r.chunk.symbolName,
				symbolKind: r.chunk.symbolKind,
				snippet: r.chunk.content,
				score: r.score,
				matchType: r.matchType
			}));
		}

		// 3. Filter & Budget Enforcement
		const chunks: IFloatRetrievedChunk[] = [];
		const evidenceReferences: IFloatEvidenceReference[] = [];
		const includedFilesSet = new Set<string>();
		const chunksPerFile = new Map<string, number>();

		let accumulatedTokens = 0;

		for (const m of rawMatches) {
			if (m.score < relevanceThreshold) continue;

			// Per-file limit
			const count = chunksPerFile.get(m.filePath) || 0;
			if (count >= maxChunksPerFile) continue;

			const chunkContent = m.snippet || '';
			const approxTokens = Math.ceil(chunkContent.length / 4);

			// Budget limit
			if (accumulatedTokens + approxTokens > tokenBudget) {
				break;
			}

			chunksPerFile.set(m.filePath, count + 1);
			includedFilesSet.add(m.filePath);
			accumulatedTokens += approxTokens;

			chunks.push({
				filePath: m.filePath,
				startLine: m.startLine,
				endLine: m.endLine,
				symbolName: m.symbolName,
				symbolKind: m.symbolKind,
				content: chunkContent,
				score: m.score,
				matchType: m.matchType || 'hybrid'
			});

			evidenceReferences.push({
				filePath: m.filePath,
				lineRange: `L${m.startLine}-L${m.endLine}`,
				symbolName: m.symbolName,
				score: m.score
			});
		}

		// 4. Construct Grounded Prompt Payload
		const promptSections: string[] = [];
		for (const c of chunks) {
			promptSections.push(
				`\n--- CODEBASE EVIDENCE: ${c.filePath} (Lines ${c.startLine}-${c.endLine})${c.symbolName ? ` [Symbol: ${c.symbolName}]` : ''} ---\n${c.content}\n--- END EVIDENCE ---`
			);
		}

		const result: IFloatRetrievedContext = {
			query,
			hasCodebaseContext: chunks.length > 0,
			includedFiles: Array.from(includedFilesSet),
			chunks,
			evidenceReferences,
			totalTokensApprox: accumulatedTokens,
			groundedContextPrompt: promptSections.join('\n')
		};

		this._onDidRetrieveContext.fire(result);
		return result;
	}

	public async searchSymbols(query: string): Promise<any[]> {
		if (this._daemonLifecycle.client.isConnected()) {
			try {
				const res = await this._daemonLifecycle.client.call('semantic_get_symbols', { query });
				return res.symbols || [];
			} catch {}
		}
		if (this._localAutoIndexer) {
			return this._localAutoIndexer.indexer.findSymbolsByName(query);
		}
		return [];
	}

	public async getFileContext(filePath: string): Promise<string | null> {
		try {
			if (fs.existsSync(filePath)) {
				return await fs.promises.readFile(filePath, 'utf8');
			}
		} catch {}
		return null;
	}

	public async getRelatedFiles(filePath: string): Promise<string[]> {
		const related: string[] = [];
		const symbols = await this.searchSymbols('');
		const currentFileSymbols = symbols.filter(s => s.filePath === filePath);

		for (const sym of currentFileSymbols) {
			const refs = symbols.filter(s => s.filePath !== filePath && s.name === sym.name);
			for (const r of refs) {
				if (!related.includes(r.filePath)) {
					related.push(r.filePath);
				}
			}
		}
		return related.slice(0, 5);
	}

	public async getWorkspaceContext(query: string, tokenBudget?: number): Promise<IFloatRetrievedContext> {
		return this.searchCodebase(query, { tokenBudget });
	}

	public async processCodebaseMention(
		userPrompt: string,
		options: IFloatCodebaseSearchOptions = {}
	): Promise<{
		cleanPrompt: string;
		hasCodebaseMention: boolean;
		context: IFloatRetrievedContext | null;
	}> {
		const codebaseMentionRegex = /@codebase\b/i;
		if (!codebaseMentionRegex.test(userPrompt)) {
			return {
				cleanPrompt: userPrompt,
				hasCodebaseMention: false,
				context: null
			};
		}

		// Remove @codebase from prompt string
		const cleanPrompt = userPrompt.replace(codebaseMentionRegex, '').trim();
		const searchQuery = cleanPrompt || 'overview of core architecture and services';

		const context = await this.searchCodebase(searchQuery, options);

		return {
			cleanPrompt,
			hasCodebaseMention: true,
			context
		};
	}

	public override dispose(): void {
		if (this._localAutoIndexer) {
			this._localAutoIndexer.cancel();
			this._localAutoIndexer = null;
		}
		super.dispose();
	}
}
