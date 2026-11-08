/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class JavaLanguageService {
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

let _serviceInstance: JavaLanguageService | null = null;

export function activate(context: vscode.ExtensionContext): { service: JavaLanguageService } {
	_serviceInstance = new JavaLanguageService();

	
	context.subscriptions.push(
		vscode.commands.registerCommand('java.buildProject', () => {
			vscode.window.showInformationMessage('Java: Build Project (Maven/Gradle) executed.');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('java.runJunitTests', () => {
			vscode.window.showInformationMessage('Java: Run JUnit Tests executed.');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('java.cleanWorkspace', () => {
			vscode.window.showInformationMessage('Java: Clean Java Language Server Workspace executed.');
		})
	);

	return { service: _serviceInstance };
}

export function deactivate(): void {
	_serviceInstance = null;
}
