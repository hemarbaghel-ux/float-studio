/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class CSharpLanguageService {
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

let _serviceInstance: CSharpLanguageService | null = null;

export function activate(context: vscode.ExtensionContext): { service: CSharpLanguageService } {
	_serviceInstance = new CSharpLanguageService();

	
	context.subscriptions.push(
		vscode.commands.registerCommand('csharp.restore', () => {
			vscode.window.showInformationMessage('C#: dotnet restore executed.');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('csharp.build', () => {
			vscode.window.showInformationMessage('C#: dotnet build executed.');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('csharp.restartOmniSharp', () => {
			vscode.window.showInformationMessage('C#: Restart Language Engine executed.');
		})
	);

	return { service: _serviceInstance };
}

export function deactivate(): void {
	_serviceInstance = null;
}
