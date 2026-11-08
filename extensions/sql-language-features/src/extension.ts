/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class SqlLanguageService {
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

let _serviceInstance: SqlLanguageService | null = null;

export function activate(context: vscode.ExtensionContext): { service: SqlLanguageService } {
	_serviceInstance = new SqlLanguageService();

	
	context.subscriptions.push(
		vscode.commands.registerCommand('sql.formatQuery', () => {
			vscode.window.showInformationMessage('SQL: Format Active Query executed.');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('sql.detectDialect', () => {
			vscode.window.showInformationMessage('SQL: Detect Active Dialect executed.');
		})
	);

	return { service: _serviceInstance };
}

export function deactivate(): void {
	_serviceInstance = null;
}
