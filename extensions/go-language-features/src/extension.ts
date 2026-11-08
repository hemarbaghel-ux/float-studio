/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class GoLanguageService {
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

let _serviceInstance: GoLanguageService | null = null;

export function activate(context: vscode.ExtensionContext): { service: GoLanguageService } {
	_serviceInstance = new GoLanguageService();

	
	context.subscriptions.push(
		vscode.commands.registerCommand('go.runTests', () => {
			vscode.window.showInformationMessage('Go: Run Package Tests executed.');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('go.vet', () => {
			vscode.window.showInformationMessage('Go: Vet Current Package executed.');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('go.restartGopls', () => {
			vscode.window.showInformationMessage('Go: Restart Gopls Language Server executed.');
		})
	);

	return { service: _serviceInstance };
}

export function deactivate(): void {
	_serviceInstance = null;
}
