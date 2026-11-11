/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class YamlLanguageService {
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

let _serviceInstance: YamlLanguageService | null = null;

export function activate(context: vscode.ExtensionContext): { service: YamlLanguageService } {
	_serviceInstance = new YamlLanguageService();

	
	context.subscriptions.push(
		vscode.commands.registerCommand('yaml.validateSchema', () => {
			const active = vscode.window.activeTextEditor;
			if (!active) {
				vscode.window.showWarningMessage('Open a YAML file to validate.');
				return;
			}
			const text = active.document.getText();
			// Check for tab indentation which is strictly invalid in YAML
			const lines = text.split(/\r?\n/);
			let tabLine = -1;
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].startsWith('\t') || lines[i].includes(':\t')) {
					tabLine = i + 1;
					break;
				}
			}
			if (tabLine > 0) {
				vscode.window.showErrorMessage(`YAML validation error: Tab indentation detected at line ${tabLine}. YAML requires spaces.`);
			} else {
				vscode.window.showInformationMessage('YAML document indentation structure is valid.');
			}
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('yaml.formatDocument', () => {
			vscode.commands.executeCommand('editor.action.formatDocument');
		})
	);

	return { service: _serviceInstance };
}

export function deactivate(): void {
	_serviceInstance = null;
}
