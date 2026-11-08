/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class JsonLanguageService {
	private readonly _schemaCache = new Map<string, any>();

	public clearCache(): void {
		this._schemaCache.clear();
	}

	public getCachedSchemasCount(): number {
		return this._schemaCache.size;
	}

	public sortJson(content: string): string {
		try {
			const parsed = JSON.parse(content);
			const sortObject = (obj: any): any => {
				if (Array.isArray(obj)) {
					return obj.map(sortObject);
				} else if (obj !== null && typeof obj === 'object') {
					const sorted: Record<string, any> = {};
					for (const key of Object.keys(obj).sort()) {
						sorted[key] = sortObject(obj[key]);
					}
					return sorted;
				}
				return obj;
			};
			return JSON.stringify(sortObject(parsed), null, 2);
		} catch {
			return content;
		}
	}
}

let _jsonService: JsonLanguageService | null = null;

export function activate(context: vscode.ExtensionContext): { service: JsonLanguageService } {
	_jsonService = new JsonLanguageService();

	context.subscriptions.push(
		vscode.commands.registerCommand('json.clearCache', () => {
			_jsonService?.clearCache();
			vscode.window.showInformationMessage('JSON schema cache cleared.');
		}),
		vscode.commands.registerCommand('json.sort', () => {
			const editor = vscode.window.activeTextEditor;
			if (editor && (editor.document.languageId === 'json' || editor.document.languageId === 'jsonc')) {
				const sorted = _jsonService?.sortJson(editor.document.getText());
				if (sorted) {
					editor.edit(builder => {
						const entireRange = new vscode.Range(
							editor.document.positionAt(0),
							editor.document.positionAt(editor.document.getText().length)
						);
						builder.replace(entireRange, sorted);
					});
				}
			}
		})
	);

	return { service: _jsonService };
}

export function deactivate(): void {
	_jsonService?.clearCache();
	_jsonService = null;
}
