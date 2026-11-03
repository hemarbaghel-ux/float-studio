/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

const EXCLUDED_PATTERNS = [
	/(^|[\\/])node_modules([\\/]|$)/i,
	/(^|[\\/])\.git([\\/]|$)/i,
	/(^|[\\/])dist([\\/]|$)/i,
	/(^|[\\/])build([\\/]|$)/i,
	/(^|[\\/])out([\\/]|$)/i,
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
}

export class FloatWorkspaceIndexer {
	private readonly _files: Map<string, IFloatIndexedFile> = new Map();

	public isExcluded(filePath: string): boolean {
		const normalized = filePath.replace(/\\/g, '/');
		return EXCLUDED_PATTERNS.some(pattern => pattern.test(normalized));
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
		this._files.delete(relativePath);
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

	public clear(): void {
		this._files.clear();
	}
}
