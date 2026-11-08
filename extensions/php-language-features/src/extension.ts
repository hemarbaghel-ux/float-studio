/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class PhpLanguageService {
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

let _serviceInstance: PhpLanguageService | null = null;

export function activate(context: vscode.ExtensionContext): { service: PhpLanguageService } {
	_serviceInstance = new PhpLanguageService();

	
	context.subscriptions.push(
		vscode.commands.registerCommand('php.validateSyntax', () => {
			vscode.window.showInformationMessage('PHP: Validate Syntax executed.');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('php.composerInstall', () => {
			vscode.window.showInformationMessage('PHP: Composer Install executed.');
		})
	);

	return { service: _serviceInstance };
}

export function deactivate(): void {
	_serviceInstance = null;
}
