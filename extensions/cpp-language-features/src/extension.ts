/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class CppLanguageService {
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

let _serviceInstance: CppLanguageService | null = null;

export function activate(context: vscode.ExtensionContext): { service: CppLanguageService } {
	_serviceInstance = new CppLanguageService();

	
	context.subscriptions.push(
		vscode.commands.registerCommand('cpp.switchHeaderSource', () => {
			vscode.window.showInformationMessage('C/C++: Switch Header/Source executed.');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('cpp.rescanCompileCommands', () => {
			vscode.window.showInformationMessage('C/C++: Rescan compile_commands.json executed.');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('cpp.formatDocument', () => {
			vscode.window.showInformationMessage('C/C++: Format Document executed.');
		})
	);

	return { service: _serviceInstance };
}

export function deactivate(): void {
	_serviceInstance = null;
}
