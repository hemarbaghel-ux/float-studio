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
	dataFile?: string;
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


	private _resolveDataPath(manifest: IFloatIndexManifest): string | undefined {
		if (manifest.version === 1) {
			return this._dataPath;
		}
		if (
			manifest.version !== 2 ||
			typeof manifest.dataFile !== 'string' ||
			!/^index\\.data\\.[a-zA-Z0-9.-]+\\.json$/.test(manifest.dataFile) ||
			path.basename(manifest.dataFile) !== manifest.dataFile
		) {
			return undefined;
		}
		return path.join(this._storageDir, manifest.dataFile);
	}

	public async saveIndex(nodes: IFloatFileMerkleNode[], chunks: IFloatStoredChunk[]): Promise<{ bytesWritten: number; manifestPath: string }> {
		await this.ensureDirectory();

		const totalSymbols = nodes.reduce((sum, node) => sum + (node.symbols ? node.symbols.length : 0), 0);
		const rawData = JSON.stringify({ nodes, chunks });
		const checksum = crypto.createHash('sha256').update(rawData, 'utf8').digest('hex');
		const generation = `${Date.now()}.${crypto.randomBytes(8).toString('hex')}`;
		const dataFile = `index.data.${generation}.json`;
		const dataFilePath = path.join(this._storageDir, dataFile);
		const tmpDataPath = `${dataFilePath}.tmp`;
		const tmpManifestPath = `${this._manifestPath}.tmp.${generation}`;

		let previousDataPath: string | undefined;
		try {
			const previousManifest = JSON.parse(await fs.promises.readFile(this._manifestPath, 'utf8')) as IFloatIndexManifest;
			previousDataPath = this._resolveDataPath(previousManifest);
		} catch {
			// First save or an unreadable previous manifest. The new generation can
			// still be committed without trusting an unknown path from disk.
		}

		const manifest: IFloatIndexManifest = {
			version: 2,
			createdAt: Date.now(),
			totalFiles: nodes.length,
			totalSymbols,
			totalChunks: chunks.length,
			checksum,
			dataFile
		};

		let committed = false;
		try {
			// Write a new immutable data generation first. The old manifest keeps
			// pointing at the previous generation until the final manifest rename.
			await fs.promises.writeFile(tmpDataPath, rawData, { encoding: 'utf8', mode: 0o600 });
			await fs.promises.rename(tmpDataPath, dataFilePath);
			await fs.promises.writeFile(tmpManifestPath, JSON.stringify(manifest, null, 2), { encoding: 'utf8', mode: 0o600 });
			await fs.promises.rename(tmpManifestPath, this._manifestPath);
			committed = true;
		} catch (error) {
			await fs.promises.unlink(dataFilePath).catch(() => undefined);
			throw error;
		} finally {
			await fs.promises.unlink(tmpDataPath).catch(() => undefined);
			await fs.promises.unlink(tmpManifestPath).catch(() => undefined);
		}

		if (committed && previousDataPath && previousDataPath !== dataFilePath) {
			await fs.promises.unlink(previousDataPath).catch(() => undefined);
		}

		const stat = await fs.promises.stat(dataFilePath);
		return {
			bytesWritten: stat.size,
			manifestPath: this._manifestPath
		};
	}

	public async loadIndex(): Promise<IFloatStoredIndexPayload | null> {
		if (!fs.existsSync(this._manifestPath)) {
			return null;
		}

		try {
			const manifestRaw = await fs.promises.readFile(this._manifestPath, 'utf8');
			const manifest: IFloatIndexManifest = JSON.parse(manifestRaw);
			const dataPath = this._resolveDataPath(manifest);
			if (!dataPath || !fs.existsSync(dataPath)) {
				return null;
			}

			const dataRaw = await fs.promises.readFile(dataPath, 'utf8');
			const currentChecksum = crypto.createHash('sha256').update(dataRaw, 'utf8').digest('hex');
			if (typeof manifest.checksum !== 'string' || manifest.checksum !== currentChecksum) {
				console.warn('[FloatDiskIndexStore] Checksum mismatch. Index corrupt, requiring rebuild.');
				return null;
			}

			const parsed = JSON.parse(dataRaw) as { nodes?: unknown; chunks?: unknown };
			if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.chunks)) {
				console.warn('[FloatDiskIndexStore] Invalid index payload shape. Index requires rebuild.');
				return null;
			}

			const nodes = parsed.nodes as IFloatFileMerkleNode[];
			const chunks = parsed.chunks as IFloatStoredChunk[];
			const totalSymbols = nodes.reduce((sum, node) => sum + (Array.isArray(node?.symbols) ? node.symbols.length : 0), 0);
			if (
				(manifest.version !== 1 && manifest.version !== 2) ||
				!Number.isFinite(manifest.createdAt) ||
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
		try {
			if (!fs.existsSync(this._manifestPath)) {
				return false;
			}
			const manifest = JSON.parse(fs.readFileSync(this._manifestPath, 'utf8')) as IFloatIndexManifest;
			const dataPath = this._resolveDataPath(manifest);
			return !!dataPath && fs.existsSync(dataPath);
		} catch {
			return false;
		}
	}

	public async clear(): Promise<void> {
		await fs.promises.unlink(this._manifestPath).catch(() => undefined);
		try {
			const entries = await fs.promises.readdir(this._storageDir);
			const ownedFiles = entries.filter(name =>
				name === 'index.data.json' ||
				/^index\\.data\\.[a-zA-Z0-9.-]+\\.json(?:\\.tmp)?$/.test(name) ||
				name.startsWith('manifest.json.tmp.')
			);
			await Promise.all(ownedFiles.map(name =>
				fs.promises.unlink(path.join(this._storageDir, name)).catch(() => undefined)
			));
		} catch {
			// A missing directory is already equivalent to an empty store.
		}
	}

}
