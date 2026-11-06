/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { FloatMerkleTree } from './floatMerkleTree.js';
import { FloatSemanticChunker, ISemanticCodeChunk } from './floatSemanticChunker.js';
import { FloatVectorIndex, IRankedCodeChunk, IBoundedContextResult, ISerializedVectorIndex } from './floatVectorIndex.js';

const INDEXABLE_TEXT_EXTENSIONS = new Set([
	'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.jsonc', '.md', '.mdx',
	'.py', '.pyi', '.rs', '.go', '.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.java',
	'.cs', '.css', '.scss', '.less', '.html', '.htm', '.xml', '.yaml', '.yml', '.toml',
	'.sql', '.sh', '.bash', '.ps1', '.bat', '.cmd', '.vue', '.svelte', '.php', '.rb',
	'.swift', '.kt', '.kts', '.dart', '.lua', '.ex', '.exs', '.erl', '.hrl', '.graphql',
	'.gql', '.proto', '.tf', '.hcl', '.gradle', '.properties', '.ini'
]);

const EXCLUDED_PATTERNS = [
	/(^|[\\/])node_modules([\\/]|$)/i,
	/(^|[\\/])\.git([\\/]|$)/i,
	/(^|[\\/])\.float([\\/]|$)/i,
	/(^|[\\/])dist([\\/]|$)/i,
	/(^|[\\/])build([\\/]|$)/i,
	/(^|[\\/])out([\\/]|$)/i,
	/(^|[\\/])\.build([\\/]|$)/i,
	/(^|[\\/])\.gemini([\\/]|$)/i,
	/(^|[\\/])\.vscode([\\/]|$)/i,
	/(^|[\\/])\.idea([\\/]|$)/i,
	/(^|[\\/])(?:\.ssh|\.aws|\.azure|\.gnupg|\.kube|\.docker|\.npm|secrets?|credentials|private)([\\/]|$)/i,
	/(^|[\\/])\.env(\..+)?$/i,
	/(^|[\\/])(?:\.npmrc|\.pnpmrc|\.pypirc|\.netrc|\.git-credentials|\.gitconfig|\.yarnrc\.yml)$/i,
	/(^|[\\/])\.cargo[\\/]credentials(?:\.[^/]+)?$/i,
	/(^|[\\/]).*\.(pem|key|pfx|p12|ppk|jks|keystore|crt|cer|der)$/i,
	/(^|[\\/])id_(rsa|ed25519|ecdsa|dsa)/i,
	/(^|[\\/])[^/]*(credential|client[_-]?secret|service[-_]?account|private[_-]?key|access[_-]?token|refresh[_-]?token)[^/]*\.(json|ya?ml|txt)$/i,
	/(^|[\\/])(credentials|secrets|token|auth)\.(json|ya?ml|txt)$/i
];

const INDEXABLE_EXTENSIONLESS_NAMES = new Set(['dockerfile', 'makefile', 'justfile', '.gitignore', '.gitattributes', '.editorconfig']);

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

	public retrieveBoundedContext(query: string, maxChars?: number) {
		return this._vectorIndex.retrieveBoundedContext(query, maxChars);
	}

	public isExcluded(filePath: string): boolean {
		const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
		return EXCLUDED_PATTERNS.some(pattern => pattern.test(normalized));
	}

	public isIndexableFile(filePath: string): boolean {
		if (!filePath || this.isExcluded(filePath)) {
			return false;
		}
		const baseName = path.posix.basename(filePath.replace(/\\/g, '/')).toLowerCase();
		const extension = path.posix.extname(baseName);
		return INDEXABLE_TEXT_EXTENSIONS.has(extension) || INDEXABLE_EXTENSIONLESS_NAMES.has(baseName);
	}

	/**
	 * Incrementally indexes a file. If the file's Merkle hash has not changed, skips re-indexing.
	 */
	public indexFile(relativePath: string, content: string): boolean {
		if (!this.isIndexableFile(relativePath)) {
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
		const discovered = new Set<string>();

		if (!fs.existsSync(rootPath)) {
			return { indexed, skipped };
		}

		const scanDir = async (dir: string, relBase: string): Promise<void> => {
			const entries = await fsp.readdir(dir, { withFileTypes: true });
			for (const entry of entries) {
				const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
				if (this.isExcluded(relPath)) {
					skipped++;
					continue;
				}

				const fullPath = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					await scanDir(fullPath, relPath);
					continue;
				}
				if (!entry.isFile()) {
					// Never follow symlinks or special files during automatic indexing.
					skipped++;
					continue;
				}

				if (!this.isIndexableFile(relPath)) {
					skipped++;
					continue;
				}

				const normalized = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
				discovered.add(normalized);
				try {
					const stat = await fsp.stat(fullPath);
					if (stat.size > 2 * 1024 * 1024) {
						skipped++;
						continue;
					}
					const content = await fsp.readFile(fullPath, 'utf8');
					if (this.indexFile(normalized, content)) {
						indexed++;
					} else {
						skipped++;
					}
				} catch {
					skipped++;
				}
			}
		};

		await scanDir(rootPath, '');
		for (const existing of this._files.keys()) {
			if (!discovered.has(existing)) {
				this.unregisterFile(existing);
			}
		}
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
		const payload: IFloatIndexMetadataPayload = {
			version: 1,
			timestamp: Date.now(),
			embeddingArchitecture: 'sparse_token_hash_projection',
			stats: this.getStats(),
			files: this.getIndexedFiles(),
			vectorIndex: this._vectorIndex.serialize()
		};

		await fsp.mkdir(path.dirname(savePath), { recursive: true });
		const temporaryPath = `${savePath}.tmp-${process.pid}-${Date.now()}`;
		try {
			await fsp.writeFile(temporaryPath, JSON.stringify(payload, null, 2), 'utf8');
			await fsp.rename(temporaryPath, savePath);
		} catch (error) {
			await fsp.rm(temporaryPath, { force: true }).catch(() => undefined);
			throw error;
		}
	}

	/**
	 * Restores index metadata and serialized semantic vector chunks from disk snapshot.
	 */
	public async loadIndexMetadata(metaPath: string): Promise<boolean> {
		if (!fs.existsSync(metaPath)) {
			return false;
		}

		try {
			const raw = await fsp.readFile(metaPath, 'utf8');
			const payload: IFloatIndexMetadataPayload = JSON.parse(raw);
			if (payload.version !== 1 || !Array.isArray(payload.files)) {
				return false;
			}

			this.clear();
			const restoredHashes: Array<{ path: string; hash: string }> = [];
			for (const file of payload.files) {
				if (!this.isExcluded(file.relativePath) && !file.isBinary) {
					this._files.set(file.relativePath, file);
					if (file.hash) {
						restoredHashes.push({ path: file.relativePath, hash: file.hash });
					}
				}
			}
			this._merkleTree.restoreFileHashes(restoredHashes);
			if (payload.stats?.rootHash && payload.stats.rootHash !== this._merkleTree.rootHash) {
				this.clear();
				return false;
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

	/** Removes one file or every indexed file below a deleted directory. */
	public unregisterPath(relativePath: string): void {
		const norm = relativePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
		if (!norm || norm === '.' || norm.startsWith('../') || path.posix.isAbsolute(norm)) {
			return;
		}
		const prefix = norm + '/';
		for (const indexedPath of Array.from(this._files.keys())) {
			if (indexedPath === norm || indexedPath.startsWith(prefix)) {
				this.unregisterFile(indexedPath);
			}
		}
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