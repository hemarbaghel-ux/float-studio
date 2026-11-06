/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { IFloatFileMerkleNode } from '../indexer/floatTreeSitterIndexer.js';
import { IFloatSemanticChunk } from '../chunker/floatAstSemanticChunker.js';

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
	chunks: IFloatSemanticChunk[];
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

	public async ensureDirectory(): Promise<void> {
		await fs.promises.mkdir(this._storageDir, { recursive: true, mode: 0o700 });
		if (process.platform !== 'win32') {
			await fs.promises.chmod(this._storageDir, 0o700);
		}
	}

	public async saveIndex(nodes: IFloatFileMerkleNode[], chunks: IFloatSemanticChunk[]): Promise<{ bytesWritten: number; manifestPath: string }> {
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

			const parsed = JSON.parse(dataRaw);
			return {
				manifest,
				nodes: parsed.nodes || [],
				chunks: parsed.chunks || []
			};
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
