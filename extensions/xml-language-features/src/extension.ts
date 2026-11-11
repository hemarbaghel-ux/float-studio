/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class XmlLanguageService {
	private _isActive = true;
	private readonly _activeFiles = new Set<string>();

	public isRunning(): boolean {
		return this._isActive;
	}

	public registerFile(path: string): void {
		this._activeFiles.add(path);
	}

	public unregisterFile(path: string): void {
		this._activeFiles.delete(path);
	}

	public getActiveFiles(): string[] {
		return Array.from(this._activeFiles);
	}

	public restart(): void {
		this._isActive = false;
		this._isActive = true;
	}
}

let _serviceInstance: XmlLanguageService | null = null;

export function activate(context: vscode.ExtensionContext): { service: XmlLanguageService } {
	_serviceInstance = new XmlLanguageService();

	
	context.subscriptions.push(
		vscode.commands.registerCommand('xml.formatDocument', () => {
			vscode.commands.executeCommand('editor.action.formatDocument');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('xml.validateSchema', () => {
			const active = vscode.window.activeTextEditor;
			if (!active) {
				vscode.window.showWarningMessage('Open an XML file to validate.');
				return;
			}
			const text = active.document.getText();
			// Basic XML well-formedness validation check
			const openTags: string[] = [];
			const tagRegex = /<(\/)?([a-zA-Z0-9_\-:]+)(?:\s[^>]*)?(\/)?>/g;
			let match;
			let isWellFormed = true;
			while ((match = tagRegex.exec(text)) !== null) {
				const isClosing = match[1] === '/';
				const tagName = match[2];
				const isSelfClosing = match[3] === '/';
				if (isSelfClosing) continue;
				if (isClosing) {
					const last = openTags.pop();
					if (last !== tagName) {
						vscode.window.showErrorMessage(`XML mismatch: expected </${last}> but found </${tagName}>.`);
						isWellFormed = false;
						break;
					}
				} else {
					openTags.push(tagName);
				}
			}
			if (isWellFormed && openTags.length === 0) {
				vscode.window.showInformationMessage('XML document is well-formed.');
			} else if (isWellFormed) {
				vscode.window.showErrorMessage(`XML error: unclosed tag <${openTags.pop()}>.`);
			}
		})
	);

	return { service: _serviceInstance };
}

export function deactivate(): void {
	_serviceInstance = null;
}
