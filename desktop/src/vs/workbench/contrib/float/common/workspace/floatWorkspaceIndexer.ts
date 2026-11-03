/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { FloatMerkleTree } from './floatMerkleTree.js';
import { FloatSemanticChunker, ISemanticCodeChunk } from './floatSemanticChunker.js';
import { FloatVectorIndex, IRankedCodeChunk, IBoundedContextResult } from './floatVectorIndex.js';

const EXCLUDED_PATTERNS = [
	/(^|[\\/])node_modules([\\/]|$)/i,
	/(^|[\\/])\.git([\\/]|$)/i,
	/(^|[\\/])dist([\\/]|$)/i,
	/(^|[\\/])build([\\/]|$)/i,
	/(^|[\\/])out([\\/]|$)/i,
	/(^|[\\/])\.build([\\/]|$)/i,
	/(^|[\\/])\.env/i,
	/(^|[\\/]).*\.pem$/i,
	/(^|[\\/])id_rsa/i,
	/(^|[\\/])id_ed25519/i,
	/(^|[\\/])credentials\.json/i
];

export interface IFloatIndexedFile {
	readonly relativePath: string;
	readonly contentLength: number;
	readonly isBinary: boolean;
	readonly hash?: string;
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

	public getStats(): { fileCount: number; chunkCount: number; rootHash: string } {
		return {
			fileCount: this._files.size,
			chunkCount: this._vectorIndex.chunkCount,
			rootHash: this._merkleTree.rootHash
		};
	}

	public clear(): void {
		this._files.clear();
		this._merkleTree.clear();
		this._vectorIndex.clear();
	}
}
