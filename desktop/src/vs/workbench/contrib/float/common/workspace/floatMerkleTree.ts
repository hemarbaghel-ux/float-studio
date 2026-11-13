/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { StringSHA1 } from '../../../../../base/common/hash.js';

export interface IMerkleNode {
	path: string;
	hash: string;
	isDirectory: boolean;
	children?: Map<string, IMerkleNode>;
}

export function calculateFileHash(content: string): string {
	const sha = new StringSHA1();
	sha.update(content);
	return sha.digest();
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

	/**
	 * Restores a previously verified content hash from an index metadata snapshot.
	 * The stored hash is a cache fingerprint; callers must validate the snapshot schema.
	 */
	public restoreFileHash(filePath: string, hash: string): boolean {
		const norm = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
		if (!norm || norm.split('/').some(segment => segment === '..') || !/^[a-f0-9]{40}$/i.test(hash)) {
			return false;
		}
		this._fileHashes.set(norm, hash.toLowerCase());
		this._recalculateRoot();
		return true;
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
		this._rootHash = calculateFileHash(combined);
	}
}
