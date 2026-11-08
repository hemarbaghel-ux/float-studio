/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class RubyLanguageService {
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

let _serviceInstance: RubyLanguageService | null = null;

export function activate(context: vscode.ExtensionContext): { service: RubyLanguageService } {
	_serviceInstance = new RubyLanguageService();

	
	context.subscriptions.push(
		vscode.commands.registerCommand('ruby.bundleInstall', () => {
			vscode.window.showInformationMessage('Ruby: Bundle Install executed.');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('ruby.runRubocop', () => {
			vscode.window.showInformationMessage('Ruby: Run RuboCop Linter executed.');
		})
	);

	return { service: _serviceInstance };
}

export function deactivate(): void {
	_serviceInstance = null;
}
