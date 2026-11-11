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
			vscode.commands.executeCommand('editor.action.formatDocument');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('sql.detectDialect', async () => {
			const dialects = ['PostgreSQL', 'MySQL', 'SQLite', 'ANSI SQL', 'Snowflake', 'BigQuery'];
			const picked = await vscode.window.showQuickPick(dialects, { placeHolder: 'Select SQL Dialect' });
			if (picked) {
				vscode.window.showInformationMessage(`Active SQL Dialect set to ${picked}`);
			}
		})
	);

	return { service: _serviceInstance };
}

export function deactivate(): void {
	_serviceInstance = null;
}
