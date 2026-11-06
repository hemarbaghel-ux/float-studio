/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'node:crypto';

export interface IMerkleNode {
	path: string;
	hash: string;
	isDirectory: boolean;
	children?: Map<string, IMerkleNode>;
}

export function calculateFileHash(content: string): string {
	const hash = crypto.createHash('sha256');
	hash.update(content);
	return hash.digest('hex');
}

export class FloatMerkleTree {
	private readonly _fileHashes = new Map<string, string>();
	private _rootHash: string = '';

	public get rootHash(): string {
		return this._rootHash;
	}

	public get fileCount(): number {
		return this._fileHashes.size;
	}

	public getFileHash(filePath: string): string | undefined {
		const norm = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
		return this._fileHashes.get(norm);
	}

	/**
	 * Incremental check & update: returns true if file is new or modified, false if unchanged
	 */
	public updateFile(filePath: string, content: string): boolean {
		const norm = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
		const newHash = calculateFileHash(content);
		const existingHash = this._fileHashes.get(norm);

		if (existingHash === newHash) {
			return false; // Unchanged, skip re-indexing!
		}

		this._fileHashes.set(norm, newHash);
		this._recalculateRoot();
		return true;
	}

	/** Restore path/hash pairs from a validated metadata snapshot. */
	public restoreFileHashes(entries: Array<{ path: string; hash: string }>): void {
		this._fileHashes.clear();
		for (const entry of entries) {
			const norm = entry.path.replace(/\\/g, '/').replace(/^\.\//, '');
			if (!norm || norm.startsWith('/') || /^[a-zA-Z]:/.test(norm) || !/^[a-f0-9]{64}$/i.test(entry.hash)) {
				throw new Error(`Invalid persisted Merkle entry: ${entry.path}`);
			}
			this._fileHashes.set(norm, entry.hash.toLowerCase());
		}
		this._recalculateRoot();
	}

	public removeFile(filePath: string): boolean {
		const norm = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
		if (this._fileHashes.delete(norm)) {
			this._recalculateRoot();
			return true;
		}
		return false;
	}

	public getDirtyFiles(files: Record<string, string>): string[] {
		const dirty: string[] = [];
		for (const [p, content] of Object.entries(files)) {
			const norm = p.replace(/\\/g, '/').replace(/^\.\//, '');
			const existingHash = this._fileHashes.get(norm);
			const currentHash = calculateFileHash(content);
			if (existingHash !== currentHash) {
				dirty.push(norm);
			}
		}
		return dirty;
	}

	public clear(): void {
		this._fileHashes.clear();
		this._rootHash = '';
	}

	private _recalculateRoot(): void {
		if (this._fileHashes.size === 0) {
			this._rootHash = '';
			return;
		}

		const sortedEntries = Array.from(this._fileHashes.entries()).sort((a, b) => a[0].localeCompare(b[0]));
		const combined = sortedEntries.map(([p, h]) => `${p}:${h}`).join('\n');
		this._rootHash = crypto.createHash('sha256').update(combined).digest('hex');
	}
}
