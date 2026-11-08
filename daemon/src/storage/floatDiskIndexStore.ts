/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { IFloatFileMerkleNode } from '../indexer/floatTreeSitterIndexer.js';
import { IFloatSemanticChunk } from '../chunker/floatAstSemanticChunker.js';

export const FLOAT_INDEX_SCHEMA_VERSION = 2;
export const FLOAT_PARSER_VERSION = 'tree-sitter-wasm-0.1.4';

export interface IFloatIndexManifest {
	schemaVersion: number;
	parserVersion: string;
	createdAt: number;
	totalFiles: number;
	totalSymbols: number;
	totalChunks: number;
	checksum: string;
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
	chunks: IFloatSemanticChunk[];
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

	public async ensureDirectory(): Promise<void> {
		if (!fs.existsSync(this._storageDir)) {
			await fs.promises.mkdir(this._storageDir, { recursive: true });
		}
	}

	public async saveIndex(
		nodes: IFloatFileMerkleNode[],
		chunks: IFloatSemanticChunk[],
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

		const manifest: IFloatIndexManifest = {
			schemaVersion: FLOAT_INDEX_SCHEMA_VERSION,
			parserVersion: FLOAT_PARSER_VERSION,
			createdAt: Date.now(),
			totalFiles: nodes.length,
			totalSymbols,
			totalChunks: chunks.length,
			checksum,
			workspaceConfig: {
				rootPath: options?.workspaceRoot
			},
			embeddingMetadata: options?.embeddingMetadata
		};

		const nonce = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
		const stagingDataPath = path.join(this._storageDir, `staging.data.${nonce}.tmp`);
		const stagingManifestPath = path.join(this._storageDir, `staging.manifest.${nonce}.tmp`);

		// 1. Write data to staging file
		await fs.promises.writeFile(stagingDataPath, rawData, 'utf8');
		// 2. Write manifest to staging file
		await fs.promises.writeFile(stagingManifestPath, JSON.stringify(manifest, null, 2), 'utf8');

		// 3. Backup previous valid files before replacement (safe crash resilience)
		if (fs.existsSync(this._dataPath) && fs.existsSync(this._manifestPath)) {
			try {
				await fs.promises.copyFile(this._dataPath, this._backupDataPath);
				await fs.promises.copyFile(this._manifestPath, this._backupManifestPath);
			} catch {}
		}

		// 4. Atomic rename staging -> live
		await fs.promises.rename(stagingDataPath, this._dataPath);
		await fs.promises.rename(stagingManifestPath, this._manifestPath);

		const stat = await fs.promises.stat(this._dataPath);
		return {
			bytesWritten: stat.size,
			manifestPath: this._manifestPath,
			checksum
		};
	}

	public async loadIndex(): Promise<IFloatStoredIndexPayload | null> {
		if (!fs.existsSync(this._manifestPath) || !fs.existsSync(this._dataPath)) {
			// Check if backup is available
			return this._tryRecoverFromBackup();
		}

		try {
			const manifestRaw = await fs.promises.readFile(this._manifestPath, 'utf8');
			const manifest: IFloatIndexManifest = JSON.parse(manifestRaw);

			// Schema migration / compatibility check
			if (!manifest.schemaVersion || manifest.schemaVersion < FLOAT_INDEX_SCHEMA_VERSION) {
				console.warn(`[FloatDiskIndexStore] Incompatible schema version ${manifest.schemaVersion}; rebuild required.`);
				return null;
			}

			const dataRaw = await fs.promises.readFile(this._dataPath, 'utf8');
			const currentChecksum = crypto.createHash('sha256').update(dataRaw, 'utf8').digest('hex');

			if (manifest.checksum !== currentChecksum) {
				console.warn('[FloatDiskIndexStore] Primary index corrupted (checksum mismatch). Attempting recovery from backup.');
				return this._tryRecoverFromBackup();
			}

			const parsed = JSON.parse(dataRaw);
			return {
				manifest,
				nodes: parsed.nodes || [],
				chunks: parsed.chunks || [],
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
				nodes: parsed.nodes || [],
				chunks: parsed.chunks || [],
				lexicalMetadata: parsed.lexicalMetadata
			};
		} catch {
			return null;
		}
	}

	public hasValidIndex(): boolean {
		return fs.existsSync(this._manifestPath) && fs.existsSync(this._dataPath);
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
	}
}
