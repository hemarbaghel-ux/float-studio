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
			const term = vscode.window.createTerminal({ name: 'Go Tests' });
			term.show();
			term.sendText('go test ./...');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('go.vet', () => {
			const term = vscode.window.createTerminal({ name: 'Go Vet' });
			term.show();
			term.sendText('go vet ./...');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('go.restartGopls', () => {
			_serviceInstance?.restart();
			vscode.window.showInformationMessage('Go language server (gopls) restarted.');
		})
	);

	return { service: _serviceInstance };
}

export function deactivate(): void {
	_serviceInstance = null;
}
