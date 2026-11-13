/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as path from '../../../../../base/common/path.js';
import { FloatMerkleTree } from './floatMerkleTree.js';
import { FloatSemanticChunker } from './floatSemanticChunker.js';
import { FloatVectorIndex, IRankedCodeChunk, IBoundedContextResult, ISerializedVectorIndex } from './floatVectorIndex.js';

function getNodeFs(): { fs: any; fsp: any } | null {
	try {
		if (typeof process !== 'undefined' && (process as any).versions?.node) {
			const req = (globalThis as any).require;
			if (typeof req === 'function') {
				const nFs = req('fs');
				return { fs: nFs, fsp: nFs.promises || req('fs/promises') };
			}
		}
	} catch {
		// In sandboxed browser environment
	}
	return null;
}

const EXCLUDED_PATTERNS = [
	/(^|[\\/])node_modules([\\/]|$)/i,
	/(^|[\\/])\.git([\\/]|$)/i,
	/(^|[\\/])dist([\\/]|$)/i,
	/(^|[\\/])build([\\/]|$)/i,
	/(^|[\\/])out([\\/]|$)/i,
	/(^|[\\/])\.build([\\/]|$)/i,
	/(^|[\\/])\.gemini([\\/]|$)/i,
	/(^|[\\/])\.vscode([\\/]|$)/i,
	/(^|[\\/])\.idea([\\/]|$)/i,
	/(^|[\\/])\.env(\..+)?$/i,
	/(^|[\\/]).*\.(pem|key|pfx|p12)$/i,
	/(^|[\\/])id_(rsa|ed25519|ecdsa|dsa)/i,
	/(^|[\\/])(credentials|client_secret.*|service-account.*|serviceAccount.*|token|auth)\.json$/i
];

export interface IFloatIndexedFile {
	readonly relativePath: string;
	readonly contentLength: number;
	readonly isBinary: boolean;
	readonly hash?: string;
}

export interface IFloatIndexMetadataPayload {
	version: number;
	timestamp: number;
	embeddingArchitecture: 'sparse_token_hash_projection';
	stats: {
		fileCount: number;
		chunkCount: number;
		rootHash: string;
	};
	files: IFloatIndexedFile[];
	vectorIndex?: ISerializedVectorIndex;
}

export class FloatWorkspaceIndexer {
	private readonly _files: Map<string, IFloatIndexedFile> = new Map();
	private readonly _merkleTree = new FloatMerkleTree();
	private readonly _vectorIndex = new FloatVectorIndex();

	public get vectorIndex(): FloatVectorIndex {
		return this._vectorIndex;
	}

	public get merkleTree(): FloatMerkleTree {
		return this._merkleTree;
	}

	public search(query: string, limit?: number) {
		return this._vectorIndex.search(query, limit);
	}

	public isExcluded(filePath: string): boolean {
		const normalized = filePath.replace(/\\/g, '/');
		return EXCLUDED_PATTERNS.some(pattern => pattern.test(normalized));
	}

	/**
	 * Incrementally indexes a file. If the file's Merkle hash has not changed, skips re-indexing.
	 */
	public indexFile(relativePath: string, content: string): boolean {
		if (this.isExcluded(relativePath)) {
			return false;
		}

		const normPath = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
		const hasChanged = this._merkleTree.updateFile(normPath, content);
		if (!hasChanged && this._files.has(normPath)) {
			return false; // Skip re-indexing!
		}

		// Re-chunk and index into vector index
		this._vectorIndex.removeChunksForFile(normPath);
		const chunks = FloatSemanticChunker.chunkFile(normPath, content);
		for (const chunk of chunks) {
			this._vectorIndex.addChunk(chunk);
		}

		this._files.set(normPath, {
			relativePath: normPath,
			contentLength: content.length,
			isBinary: false,
			hash: this._merkleTree.getFileHash(normPath)
		});

		return true;
	}

	public indexFiles(files: Record<string, string>): { indexed: number; skipped: number } {
		let indexed = 0;
		let skipped = 0;

		for (const [p, content] of Object.entries(files)) {
			if (this.indexFile(p, content)) {
				indexed++;
			} else {
				skipped++;
			}
		}

		return { indexed, skipped };
	}

	/**
	 * Automatically discovers all code and config files in workspace and indexes them incrementally.
	 */
	public async discoverAndIndexWorkspace(rootPath: string): Promise<{ indexed: number; skipped: number }> {
		let indexed = 0;
		let skipped = 0;

		const node = getNodeFs();
		if (!node || !node.fs.existsSync(rootPath)) {
			return { indexed, skipped };
		}

		const scanDir = async (dir: string, relBase: string) => {
			const entries = await node.fsp.readdir(dir, { withFileTypes: true });
			for (const entry of entries) {
				const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
				if (this.isExcluded(relPath)) {
					skipped++;
					continue;
				}

				const fullPath = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					await scanDir(fullPath, relPath);
				} else if (entry.isFile()) {
					try {
						// Only index text / code files under 2MB
						const stat = await node.fsp.stat(fullPath);
						if (stat.size > 2 * 1024 * 1024) {
							skipped++;
							continue;
						}

						const content = await node.fsp.readFile(fullPath, 'utf8');
						if (this.indexFile(relPath, content)) {
							indexed++;
						} else {
							skipped++;
						}
					} catch {
						skipped++;
					}
				}
			}
		};

		await scanDir(rootPath, '');
		return { indexed, skipped };
	}

	// Filesystem Watcher Handlers
	public onFileCreated(relPath: string, content: string): boolean {
		return this.indexFile(relPath, content);
	}

	public onFileChanged(relPath: string, content: string): boolean {
		return this.indexFile(relPath, content);
	}

	public onFileDeleted(relPath: string): void {
		this.unregisterFile(relPath);
	}

	public onFileRenamed(oldRelPath: string, newRelPath: string, content?: string): void {
		this.unregisterFile(oldRelPath);
		if (content !== undefined) {
			this.indexFile(newRelPath, content);
		}
	}

	/**
	 * Persists index metadata snapshot and serialized semantic vectors to disk for instant recovery after workbench restart.
	 */
	public async saveIndexMetadata(savePath: string): Promise<void> {
		const node = getNodeFs();
		if (!node) {
			return;
		}

		const payload: IFloatIndexMetadataPayload = {
			version: 1,
			timestamp: Date.now(),
			embeddingArchitecture: 'sparse_token_hash_projection',
			stats: this.getStats(),
			files: this.getIndexedFiles(),
			vectorIndex: this._vectorIndex.serialize()
		};

		await node.fsp.mkdir(path.dirname(savePath), { recursive: true });
		await node.fsp.writeFile(savePath, JSON.stringify(payload, null, 2), 'utf8');
	}

	/**
	 * Restores index metadata and serialized semantic vector chunks from disk snapshot.
	 */
	public async loadIndexMetadata(metaPath: string): Promise<boolean> {
		const node = getNodeFs();
		if (!node || !node.fs.existsSync(metaPath)) {
			return false;
		}

		try {
			const raw = await node.fsp.readFile(metaPath, 'utf8');
			const payload: IFloatIndexMetadataPayload = JSON.parse(raw);
			if (!payload.files || !Array.isArray(payload.files)) {
				return false;
			}

			this.clear();

			for (const file of payload.files) {
				if (!this.isExcluded(file.relativePath)) {
					this._files.set(file.relativePath, file);
					if (file.hash) {
						this._merkleTree.updateFile(file.relativePath, '');
					}
				}
			}

			if (payload.vectorIndex) {
				this._vectorIndex.deserialize(payload.vectorIndex);
			}

			return true;
		} catch {
			return false;
		}
	}

	public registerFile(relativePath: string, contentLength: number, isBinary: boolean = false): boolean {
		if (this.isExcluded(relativePath)) {
			return false;
		}

		this._files.set(relativePath, {
			relativePath,
			contentLength,
			isBinary
		});
		return true;
	}

	public unregisterFile(relativePath: string): void {
		const norm = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
		this._files.delete(norm);
		this._merkleTree.removeFile(norm);
		this._vectorIndex.removeChunksForFile(norm);
	}

	public getIndexedFiles(): IFloatIndexedFile[] {
		return Array.from(this._files.values());
	}

	public searchFiles(query: string, limit: number = 20): IFloatIndexedFile[] {
		const q = query.toLowerCase();
		const results: IFloatIndexedFile[] = [];

		for (const file of this._files.values()) {
			if (file.relativePath.toLowerCase().includes(q)) {
				results.push(file);
				if (results.length >= limit) {
					break;
				}
			}
		}

		return results;
	}

	public searchCodebase(query: string, limit: number = 10): IRankedCodeChunk[] {
		return this._vectorIndex.search(query, limit);
	}

	public retrieveBoundedContext(query: string, maxChars: number = 6000): IBoundedContextResult {
		return this._vectorIndex.retrieveBoundedContext(query, maxChars);
	}

	public getStats(): {
		fileCount: number;
		chunkCount: number;
		rootHash: string;
		embeddingArchitecture: 'sparse_token_hash_projection';
	} {
		return {
			fileCount: this._files.size,
			chunkCount: this._vectorIndex.chunkCount,
			rootHash: this._merkleTree.rootHash,
			embeddingArchitecture: 'sparse_token_hash_projection' // Deterministic hash-based sparse projection, distinct from neural learned weights
		};
	}

	public clear(): void {
		this._files.clear();
		this._merkleTree.clear();
		this._vectorIndex.clear();
	}
}