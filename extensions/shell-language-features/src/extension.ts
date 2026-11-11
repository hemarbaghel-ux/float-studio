/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class ShellLanguageService {
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

let _serviceInstance: ShellLanguageService | null = null;

export function activate(context: vscode.ExtensionContext): { service: ShellLanguageService } {
	_serviceInstance = new ShellLanguageService();

	
	context.subscriptions.push(
		vscode.commands.registerCommand('shell.runScript', () => {
			const active = vscode.window.activeTextEditor;
			if (!active) {
				vscode.window.showWarningMessage('Open a shell script to run.');
				return;
			}
			const term = vscode.window.createTerminal({ name: 'Shell Run' });
			term.show();
			term.sendText(`bash "${active.document.fileName}"`);
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('shell.lintScript', () => {
			const active = vscode.window.activeTextEditor;
			const target = active ? `"${active.document.fileName}"` : '*.sh';
			const term = vscode.window.createTerminal({ name: 'ShellCheck' });
			term.show();
			term.sendText(`shellcheck ${target}`);
		})
	);

	return { service: _serviceInstance };
}

export function deactivate(): void {
	_serviceInstance = null;
}
