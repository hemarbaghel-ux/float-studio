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

export const FLOAT_INDEX_SCHEMA_VERSION = 2;
export const FLOAT_PARSER_VERSION = 'tree-sitter-wasm-0.1.4';
export type IFloatStoredChunk = IFloatCodeChunk | IFloatSemanticChunk;

export interface IFloatIndexManifest {
	schemaVersion: number;
	parserVersion: string;
	createdAt: number;
	totalFiles: number;
	totalSymbols: number;
	totalChunks: number;
	checksum: string;
	version?: number;
	dataFile?: string;
	workspaceConfig?: {
		rootPath?: string;
		indexedExtensions?: string[];
	};
	embeddingMetadata?: {
		providerId?: string;
		modelName?: string;
		dimension?: number;
	};
}

export interface IFloatStoredIndexPayload {
	manifest: IFloatIndexManifest;
	nodes: IFloatFileMerkleNode[];
	chunks: IFloatStoredChunk[];
	lexicalMetadata?: {
		totalTokens?: number;
	};
}

export class FloatDiskIndexStore {
	private readonly _storageDir: string;
	private readonly _manifestPath: string;
	private readonly _dataPath: string;
	private readonly _backupManifestPath: string;
	private readonly _backupDataPath: string;

	constructor(storageDirectory: string) {
		this._storageDir = storageDirectory;
		this._manifestPath = path.join(this._storageDir, 'manifest.json');
		this._dataPath = path.join(this._storageDir, 'index.data.json');
		this._backupManifestPath = path.join(this._storageDir, 'manifest.backup.json');
		this._backupDataPath = path.join(this._storageDir, 'index.data.backup.json');
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
			manifest.dataFile &&
			/^index\.data\.[a-zA-Z0-9.-]+\.json$/.test(manifest.dataFile) &&
			path.basename(manifest.dataFile) === manifest.dataFile
		) {
			return path.join(this._storageDir, manifest.dataFile);
		}
		return this._dataPath;
	}

	public async saveIndex(
		nodes: IFloatFileMerkleNode[],
		chunks: IFloatStoredChunk[],
		options?: {
			workspaceRoot?: string;
			embeddingMetadata?: IFloatIndexManifest['embeddingMetadata'];
		}
	): Promise<{ bytesWritten: number; manifestPath: string; checksum: string }> {
		await this.ensureDirectory();

		const totalSymbols = nodes.reduce((sum, n) => sum + (n.symbols ? n.symbols.length : 0), 0);
		const rawData = JSON.stringify({
			nodes,
			chunks,
			lexicalMetadata: {
				totalTokens: chunks.reduce((acc, c) => acc + (c.content.match(/\S+/g)?.length || 0), 0)
			}
		});
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
			schemaVersion: FLOAT_INDEX_SCHEMA_VERSION,
			version: 2,
			parserVersion: FLOAT_PARSER_VERSION,
			createdAt: Date.now(),
			totalFiles: nodes.length,
			totalSymbols,
			totalChunks: chunks.length,
			checksum,
			workspaceConfig: {
				rootPath: options?.workspaceRoot
			},
			embeddingMetadata: options?.embeddingMetadata,
			dataFile
		};

		let committed = false;
		try {
			await fs.promises.writeFile(tmpDataPath, rawData, { encoding: 'utf8', mode: 0o600 });
			await fs.promises.rename(tmpDataPath, dataFilePath);

			if (fs.existsSync(this._dataPath) && fs.existsSync(this._manifestPath)) {
				try {
					await fs.promises.copyFile(this._dataPath, this._backupDataPath);
					await fs.promises.copyFile(this._manifestPath, this._backupManifestPath);
				} catch {}
			}
			await fs.promises.writeFile(this._dataPath, rawData, 'utf8');

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
			manifestPath: this._manifestPath,
			checksum
		};
	}

	public async loadIndex(): Promise<IFloatStoredIndexPayload | null> {
		if (!fs.existsSync(this._manifestPath)) {
			return this._tryRecoverFromBackup();
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

			if (manifest.checksum !== currentChecksum) {
				console.warn('[FloatDiskIndexStore] Primary index corrupted (checksum mismatch). Attempting recovery from backup.');
				return this._tryRecoverFromBackup();
			}

			const parsed = JSON.parse(dataRaw);
			const nodes = (parsed.nodes || []) as IFloatFileMerkleNode[];
			const chunks = (parsed.chunks || []) as IFloatStoredChunk[];
			return {
				manifest,
				nodes,
				chunks,
				lexicalMetadata: parsed.lexicalMetadata
			};
		} catch (err) {
			console.error('[FloatDiskIndexStore] Failed reading primary index:', err);
			return this._tryRecoverFromBackup();
		}
	}

	private async _tryRecoverFromBackup(): Promise<IFloatStoredIndexPayload | null> {
		if (!fs.existsSync(this._backupManifestPath) || !fs.existsSync(this._backupDataPath)) {
			return null;
		}

		try {
			const manifestRaw = await fs.promises.readFile(this._backupManifestPath, 'utf8');
			const manifest: IFloatIndexManifest = JSON.parse(manifestRaw);

			const dataRaw = await fs.promises.readFile(this._backupDataPath, 'utf8');
			const currentChecksum = crypto.createHash('sha256').update(dataRaw, 'utf8').digest('hex');

			if (manifest.checksum !== currentChecksum) {
				console.warn('[FloatDiskIndexStore] Backup index also corrupted; clean rebuild required.');
				return null;
			}

			const parsed = JSON.parse(dataRaw);
			return {
				manifest,
				nodes: (parsed.nodes || []) as IFloatFileMerkleNode[],
				chunks: (parsed.chunks || []) as IFloatStoredChunk[],
				lexicalMetadata: parsed.lexicalMetadata
			};
		} catch {
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
		const filesToRemove = [
			this._manifestPath,
			this._dataPath,
			this._backupManifestPath,
			this._backupDataPath
		];
		for (const f of filesToRemove) {
			if (fs.existsSync(f)) {
				await fs.promises.unlink(f).catch(() => {});
			}
		}
		try {
			const entries = await fs.promises.readdir(this._storageDir);
			const ownedFiles = entries.filter(name =>
				name === 'index.data.json' ||
				/^index\.data\.[a-zA-Z0-9.-]+\.json(?:\.tmp)?$/.test(name) ||
				name.startsWith('manifest.json.tmp.') ||
				name.includes('.tmp') ||
				name.includes('.backup.')
			);
			await Promise.all(ownedFiles.map(name =>
				fs.promises.unlink(path.join(this._storageDir, name)).catch(() => undefined)
			));
		} catch {
			// A missing directory is already equivalent to an empty store.
		}
	}
}
