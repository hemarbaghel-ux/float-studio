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
			vscode.window.showInformationMessage('YAML: Validate Against Active Schema executed.');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('yaml.formatDocument', () => {
			vscode.window.showInformationMessage('YAML: Format Document executed.');
		})
	);

	return { service: _serviceInstance };
}

export function deactivate(): void {
	_serviceInstance = null;
}
