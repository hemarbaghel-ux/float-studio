/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { IFloatFileMerkleNode } from '../indexer/floatTreeSitterIndexer.js';
import { IFloatCodeChunk } from '../vector/floatVectorEngine.js';
import { IFloatSemanticChunk } from '../chunker/floatAstSemanticChunker.js';

export type IFloatStoredChunk = IFloatCodeChunk | IFloatSemanticChunk;

export interface IFloatIndexManifest {
	version: number;
	createdAt: number;
	totalFiles: number;
	totalSymbols: number;
	totalChunks: number;
	checksum: string;
}

export interface IFloatStoredIndexPayload {
	manifest: IFloatIndexManifest;
	nodes: IFloatFileMerkleNode[];
	chunks: IFloatStoredChunk[];
}

export class FloatDiskIndexStore {
	private readonly _storageDir: string;
	private readonly _manifestPath: string;
	private readonly _dataPath: string;

	constructor(storageDirectory: string) {
		this._storageDir = storageDirectory;
		this._manifestPath = path.join(this._storageDir, 'manifest.json');
		this._dataPath = path.join(this._storageDir, 'index.data.json');
	}

	private _isValidNode(value: unknown): value is IFloatFileMerkleNode {
		if (!value || typeof value !== 'object') {
			return false;
		}
		const node = value as IFloatFileMerkleNode;
		return typeof node.filePath === 'string' &&
			node.filePath.length > 0 &&
			typeof node.fileHash === 'string' &&
			typeof node.language === 'string' &&
			Number.isFinite(node.lastModified) &&
			Array.isArray(node.symbols) &&
			node.symbols.every(symbol => !!symbol &&
				typeof symbol.id === 'string' &&
				typeof symbol.name === 'string' &&
				typeof symbol.kind === 'string' &&
				typeof symbol.language === 'string' &&
				Number.isInteger(symbol.startLine) &&
				Number.isInteger(symbol.endLine) &&
				typeof symbol.hash === 'string');
	}

	private _isValidChunk(value: unknown): value is IFloatCodeChunk {
		if (!value || typeof value !== 'object') {
			return false;
		}
		const chunk = value as IFloatCodeChunk;
		return typeof chunk.id === 'string' &&
			typeof chunk.filePath === 'string' &&
			Number.isInteger(chunk.startLine) && chunk.startLine > 0 &&
			Number.isInteger(chunk.endLine) && chunk.endLine >= chunk.startLine &&
			typeof chunk.content === 'string' &&
			Array.isArray(chunk.symbols) && chunk.symbols.every(symbol => typeof symbol === 'string') &&
			(chunk.vector === undefined || (Array.isArray(chunk.vector) && chunk.vector.length === 384 && chunk.vector.every(Number.isFinite)));
	}

	private _isValidSemanticChunk(value: unknown): value is IFloatSemanticChunk {
		if (!value || typeof value !== 'object') {
			return false;
		}
		const chunk = value as IFloatSemanticChunk;
		return typeof chunk.id === 'string' &&
			typeof chunk.filePath === 'string' &&
			typeof chunk.language === 'string' &&
			Number.isInteger(chunk.startLine) && chunk.startLine > 0 &&
			Number.isInteger(chunk.endLine) && chunk.endLine >= chunk.startLine &&
			typeof chunk.content === 'string' &&
			typeof chunk.hash === 'string' &&
			(chunk.symbolName === undefined || typeof chunk.symbolName === 'string') &&
			(chunk.symbolKind === undefined || typeof chunk.symbolKind === 'string');
	}

	public async ensureDirectory(): Promise<void> {
		await fs.promises.mkdir(this._storageDir, { recursive: true, mode: 0o700 });
		if (process.platform !== 'win32') {
			await fs.promises.chmod(this._storageDir, 0o700);
		}
	}

	public async saveIndex(nodes: IFloatFileMerkleNode[], chunks: IFloatStoredChunk[]): Promise<{ bytesWritten: number; manifestPath: string }> {
		await this.ensureDirectory();

		const totalSymbols = nodes.reduce((sum, n) => sum + (n.symbols ? n.symbols.length : 0), 0);
		const rawData = JSON.stringify({ nodes, chunks });
		const checksum = crypto.createHash('sha256').update(rawData, 'utf8').digest('hex');

		const manifest: IFloatIndexManifest = {
			version: 1,
			createdAt: Date.now(),
			totalFiles: nodes.length,
			totalSymbols,
			totalChunks: chunks.length,
			checksum
		};

		const tmpDataPath = `${this._dataPath}.tmp.${Date.now()}`;
		const tmpManifestPath = `${this._manifestPath}.tmp.${Date.now()}`;

		// Atomic write: write to temp file then rename
		await fs.promises.writeFile(tmpDataPath, rawData, 'utf8');
		await fs.promises.writeFile(tmpManifestPath, JSON.stringify(manifest, null, 2), 'utf8');

		if (fs.existsSync(this._dataPath)) {
			await fs.promises.unlink(this._dataPath).catch(() => {});
		}
		if (fs.existsSync(this._manifestPath)) {
			await fs.promises.unlink(this._manifestPath).catch(() => {});
		}

		await fs.promises.rename(tmpDataPath, this._dataPath);
		await fs.promises.rename(tmpManifestPath, this._manifestPath);

		const stat = await fs.promises.stat(this._dataPath);
		return {
			bytesWritten: stat.size,
			manifestPath: this._manifestPath
		};
	}

	public async loadIndex(): Promise<IFloatStoredIndexPayload | null> {
		if (!fs.existsSync(this._manifestPath) || !fs.existsSync(this._dataPath)) {
			return null;
		}

		try {
			const manifestRaw = await fs.promises.readFile(this._manifestPath, 'utf8');
			const manifest: IFloatIndexManifest = JSON.parse(manifestRaw);

			const dataRaw = await fs.promises.readFile(this._dataPath, 'utf8');
			const currentChecksum = crypto.createHash('sha256').update(dataRaw, 'utf8').digest('hex');

			if (manifest.checksum !== currentChecksum) {
				console.warn('[FloatDiskIndexStore] Checksum mismatch. Index corrupt, requiring rebuild.');
				return null;
			}

			const parsed = JSON.parse(dataRaw) as { nodes?: unknown; chunks?: unknown };
			if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.chunks)) {
				console.warn('[FloatDiskIndexStore] Invalid index payload shape. Index requires rebuild.');
				return null;
			}

			const nodes = parsed.nodes as IFloatFileMerkleNode[];
			const chunks = parsed.chunks as IFloatCodeChunk[];
			const totalSymbols = nodes.reduce((sum, node) => sum + (Array.isArray(node?.symbols) ? node.symbols.length : 0), 0);
			if (
				manifest.version !== 1 ||
				!Number.isSafeInteger(manifest.totalFiles) ||
				!Number.isSafeInteger(manifest.totalSymbols) ||
				!Number.isSafeInteger(manifest.totalChunks) ||
				manifest.totalFiles !== nodes.length ||
				manifest.totalSymbols !== totalSymbols ||
				manifest.totalChunks !== chunks.length ||
				!nodes.every(node => this._isValidNode(node)) ||
				!chunks.every(chunk => this._isValidChunk(chunk) || this._isValidSemanticChunk(chunk))
			) {
				console.warn('[FloatDiskIndexStore] Invalid index manifest or records. Index requires rebuild.');
				return null;
			}

			return { manifest, nodes, chunks };
		} catch (err) {
			console.error('[FloatDiskIndexStore] Failed to load cached index:', err);
			return null;
		}
	}

	public hasValidIndex(): boolean {
		return fs.existsSync(this._manifestPath) && fs.existsSync(this._dataPath);
	}

	public async clear(): Promise<void> {
		if (fs.existsSync(this._manifestPath)) {
			await fs.promises.unlink(this._manifestPath).catch(() => {});
		}
		if (fs.existsSync(this._dataPath)) {
			await fs.promises.unlink(this._dataPath).catch(() => {});
		}
	}
}
