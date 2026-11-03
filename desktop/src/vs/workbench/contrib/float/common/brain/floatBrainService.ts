/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IFloatSymbolNode {
	readonly name: string;
	readonly kind: 'function' | 'class' | 'interface' | 'variable' | 'constant';
	readonly filePath: string;
	readonly line: number;
}

export class FloatBrainService {
	private readonly _symbols: Map<string, IFloatSymbolNode[]> = new Map();
	private readonly _projectMemories: Map<string, string[]> = new Map();

	public registerSymbols(filePath: string, symbols: IFloatSymbolNode[]): void {
		this._symbols.set(filePath, symbols);
	}

	public findSymbols(query: string, maxResults: number = 10): IFloatSymbolNode[] {
		const q = query.toLowerCase();
		const results: IFloatSymbolNode[] = [];

		for (const fileSymbols of this._symbols.values()) {
			for (const sym of fileSymbols) {
				if (sym.name.toLowerCase().includes(q)) {
					results.push(sym);
					if (results.length >= maxResults) {
						return results;
					}
				}
			}
		}

		return results;
	}

	public addProjectMemory(projectId: string, note: string): void {
		const existing = this._projectMemories.get(projectId) || [];
		existing.push(note);
		this._projectMemories.set(projectId, existing);
	}

	public getProjectMemories(projectId: string): string[] {
		return this._projectMemories.get(projectId) || [];
	}

	public clear(): void {
		this._symbols.clear();
		this._projectMemories.clear();
	}
}
