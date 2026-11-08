/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class PythonLanguageService {
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

let _serviceInstance: PythonLanguageService | null = null;

export function activate(context: vscode.ExtensionContext): { service: PythonLanguageService } {
	_serviceInstance = new PythonLanguageService();

	
	context.subscriptions.push(
		vscode.commands.registerCommand('python.selectInterpreter', () => {
			vscode.window.showInformationMessage('Python: Select Interpreter executed.');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('python.restartLspServer', () => {
			vscode.window.showInformationMessage('Python: Restart LSP Server executed.');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('python.runTests', () => {
			vscode.window.showInformationMessage('Python: Run All Tests executed.');
		})
	);

	return { service: _serviceInstance };
}

export function deactivate(): void {
	_serviceInstance = null;
}
