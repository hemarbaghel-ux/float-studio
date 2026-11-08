/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { FloatTreeSitterIndexer } from '../indexer/floatTreeSitterIndexer.js';
import { FloatAstSemanticChunker } from '../chunker/floatAstSemanticChunker.js';
import { FloatVectorEngine } from '../vector/floatVectorEngine.js';
import { FloatDiskIndexStore } from '../storage/floatDiskIndexStore.js';

export interface IFloatAutoIndexerOptions {
	workspaceRoot: string;
	storageDirectory?: string;
	maxFileSizeBytes?: number;
	maxConcurrency?: number;
	allowedExtensions?: string[];
	customIgnoredPatterns?: string[];
	onProgress?: (progress: IFloatIndexingProgress) => void;
}

export interface IFloatIndexingProgress {
	phase: 'discovering' | 'indexing' | 'persisting' | 'idle';
	indexedCount: number;
	totalFiles: number;
	currentFile?: string;
}

export class FloatWorkspaceAutoIndexer {
	private readonly _workspaceRoot: string;
	private readonly _maxFileSize: number;
	private readonly _concurrency: number;
	private readonly _indexer: FloatTreeSitterIndexer;
	private readonly _chunker: FloatAstSemanticChunker;
	private readonly _vectorEngine: FloatVectorEngine;
	private readonly _diskStore: FloatDiskIndexStore;
	private readonly _allowedExtensions: Set<string>;
	private readonly _onProgress?: (progress: IFloatIndexingProgress) => void;

	private _isIndexing: boolean = false;
	private _abortController: AbortController | null = null;
	private readonly _pendingUpdates = new Set<string>();
	private _debounceTimer: NodeJS.Timeout | null = null;

	public static readonly SENSITIVE_PATTERNS = [
		/^\.env(\..+)?$/i,
		/\.pem$/i,
		/\.key$/i,
		/^id_rsa$/i,
		/^id_ed25519$/i,
		/credential/i,
		/secret/i,
		/\.pfx$/i,
		/\.p12$/i,
		/service[-_]?account.*\.json$/i
	];

	public static readonly DEFAULT_IGNORED_DIRS = new Set([
		'node_modules',
		'.git',
		'out',
		'.build',
		'dist',
		'target',
		'vendor',
		'.venv',
		'__pycache__',
		'.next',
		'.nuxt',
		'.idea',
		'.vscode'
	]);

	public static readonly DEFAULT_ALLOWED_EXTENSIONS = new Set([
		'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
		'.py', '.pyi',
		'.rs',
		'.go',
		'.cpp', '.cc', '.cxx', '.c', '.h', '.hpp',
		'.java',
		'.json',
		'.md'
	]);

	constructor(
		options: IFloatAutoIndexerOptions,
		indexer?: FloatTreeSitterIndexer,
		vectorEngine?: FloatVectorEngine
	) {
		this._workspaceRoot = path.resolve(options.workspaceRoot);
		this._maxFileSize = options.maxFileSizeBytes || 2 * 1024 * 1024; // 2MB default limit
		this._concurrency = options.maxConcurrency || 4;
		this._indexer = indexer || new FloatTreeSitterIndexer();
		this._chunker = new FloatAstSemanticChunker(this._indexer);
		this._vectorEngine = vectorEngine || new FloatVectorEngine();
		this._diskStore = new FloatDiskIndexStore(options.storageDirectory || path.join(this._workspaceRoot, '.float', 'index'));
		this._allowedExtensions = options.allowedExtensions ? new Set(options.allowedExtensions) : FloatWorkspaceAutoIndexer.DEFAULT_ALLOWED_EXTENSIONS;
		this._onProgress = options.onProgress;
	}

	public get indexer(): FloatTreeSitterIndexer {
		return this._indexer;
	}

	public get vectorEngine(): FloatVectorEngine {
		return this._vectorEngine;
	}

	public get diskStore(): FloatDiskIndexStore {
		return this._diskStore;
	}

	public isSensitiveOrIgnored(relativeOrFullPath: string): boolean {
		const base = path.basename(relativeOrFullPath);
		for (const pattern of FloatWorkspaceAutoIndexer.SENSITIVE_PATTERNS) {
			if (pattern.test(base)) {
				return true;
			}
		}

		const parts = relativeOrFullPath.split(/[\\/]/);
		for (const part of parts) {
			if (FloatWorkspaceAutoIndexer.DEFAULT_IGNORED_DIRS.has(part)) {
				return true;
			}
		}

		return false;
	}

	public isPathInsideWorkspace(targetPath: string): boolean {
		try {
			const realTarget = fs.realpathSync(targetPath);
			const realRoot = fs.realpathSync(this._workspaceRoot);
			const rel = path.relative(realRoot, realTarget);
			return !rel.startsWith('..') && !path.isAbsolute(rel);
		} catch {
			// If path does not exist yet or broken symlink
			return false;
		}
	}

	public async discoverEligibleFiles(): Promise<string[]> {
		const eligibleFiles: string[] = [];

		const scanDir = async (dir: string) => {
			if (!this.isPathInsideWorkspace(dir)) return;

			let entries: fs.Dirent[];
			try {
				entries = await fs.promises.readdir(dir, { withFileTypes: true });
			} catch {
				return;
			}

			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);

				if (entry.isDirectory()) {
					if (!FloatWorkspaceAutoIndexer.DEFAULT_IGNORED_DIRS.has(entry.name) && !this.isSensitiveOrIgnored(entry.name)) {
						await scanDir(fullPath);
					}
				} else if (entry.isFile()) {
					if (this.isSensitiveOrIgnored(fullPath)) continue;

					const ext = path.extname(entry.name).toLowerCase();
					if (this._allowedExtensions.has(ext)) {
						try {
							const stat = await fs.promises.stat(fullPath);
							if (stat.size <= this._maxFileSize) {
								eligibleFiles.push(fullPath);
							}
						} catch {}
					}
				}
			}
		};

		await scanDir(this._workspaceRoot);
		return eligibleFiles;
	}

	public async startInitialIndex(): Promise<{ totalIndexed: number; durationMs: number }> {
		const t0 = Date.now();
		this._isIndexing = true;
		this._abortController = new AbortController();
		const signal = this._abortController.signal;

		this._reportProgress('discovering', 0, 0);

		// 1. Try to load cached index from disk
		const loaded = await this._diskStore.loadIndex();
		if (loaded) {
			// Rehydrate indexer and vector engine
			for (const node of loaded.nodes) {
				(this._indexer as any)._fileNodes.set(node.filePath, node);
			}
			await this._vectorEngine.addChunks(loaded.chunks);
		}

		// 2. Discover current files on disk
		const eligibleFiles = await this.discoverEligibleFiles();
		const total = eligibleFiles.length;
		let indexedCount = 0;

		this._reportProgress('indexing', indexedCount, total);

		// 3. Perform bounded concurrency indexing
		const queue = [...eligibleFiles];
		const workers: Promise<void>[] = [];

		for (let w = 0; w < this._concurrency; w++) {
			workers.push((async () => {
				while (queue.length > 0) {
					if (signal.aborted) break;
					const filePath = queue.shift()!;
					try {
						const content = await fs.promises.readFile(filePath, 'utf8');
						const deltaRes = await this._indexer.indexFileAsync(filePath, content);
						if (deltaRes.delta !== 'unchanged') {
							const chunks = await this._chunker.chunkFileAsync(filePath, content);
							this._vectorEngine.clearFileChunks(filePath);
							await this._vectorEngine.addChunks(chunks, signal);
						}
					} catch {}
					indexedCount++;
					this._reportProgress('indexing', indexedCount, total, filePath);
				}
			})());
		}

		await Promise.all(workers);

		// 4. Persist updated index safely
		this._reportProgress('persisting', indexedCount, total);
		await this.persistIndex();

		this._isIndexing = false;
		this._reportProgress('idle', indexedCount, total);

		return {
			totalIndexed: indexedCount,
			durationMs: Date.now() - t0
		};
	}

	public onFileChanged(filePath: string): void {
		if (this.isSensitiveOrIgnored(filePath)) return;
		this._pendingUpdates.add(filePath);

		if (this._debounceTimer) {
			clearTimeout(this._debounceTimer);
		}

		this._debounceTimer = setTimeout(() => {
			this._flushPendingUpdates().catch(err => console.error('[FloatWorkspaceAutoIndexer] Error in incremental update:', err));
		}, 300);
	}

	public onFileDeleted(filePath: string): void {
		this._indexer.removeFile(filePath);
		this._vectorEngine.clearFileChunks(filePath);
		this.persistIndex().catch(() => {});
	}

	public onFileRenamed(oldPath: string, newPath: string): void {
		this.onFileDeleted(oldPath);
		this.onFileChanged(newPath);
	}

	private async _flushPendingUpdates(): Promise<void> {
		const filesToProcess = Array.from(this._pendingUpdates);
		this._pendingUpdates.clear();

		for (const filePath of filesToProcess) {
			try {
				if (!fs.existsSync(filePath)) {
					this.onFileDeleted(filePath);
					continue;
				}
				const stat = await fs.promises.stat(filePath);
				if (stat.size > this._maxFileSize) continue;

				const content = await fs.promises.readFile(filePath, 'utf8');
				const deltaRes = await this._indexer.indexFileAsync(filePath, content);
				if (deltaRes.delta !== 'unchanged') {
					const chunks = await this._chunker.chunkFileAsync(filePath, content);
					this._vectorEngine.clearFileChunks(filePath);
					await this._vectorEngine.addChunks(chunks);
				}
			} catch {}
		}

		await this.persistIndex();
	}

	public async persistIndex(): Promise<{ bytesWritten: number; checksum: string }> {
		const indexedFiles = this._indexer.getIndexedFiles();
		const nodes = indexedFiles.map(f => this._indexer.getFileNode(f)!).filter(Boolean);
		const chunks = this._vectorEngine.getAllChunks();

		return this._diskStore.saveIndex(nodes, chunks, {
			workspaceRoot: this._workspaceRoot,
			embeddingMetadata: this._vectorEngine.embeddingProvider
				? {
					providerId: this._vectorEngine.embeddingProvider.providerId,
					modelName: this._vectorEngine.embeddingProvider.modelName,
					dimension: this._vectorEngine.embeddingProvider.dimension
				}
				: undefined
		});
	}

	public cancel(): void {
		if (this._abortController) {
			this._abortController.abort();
		}
		this._isIndexing = false;
	}

	private _reportProgress(phase: IFloatIndexingProgress['phase'], indexed: number, total: number, file?: string): void {
		if (this._onProgress) {
			this._onProgress({
				phase,
				indexedCount: indexed,
				totalFiles: total,
				currentFile: file
			});
		}
	}
}
