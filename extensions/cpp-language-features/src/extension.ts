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
		vscode.commands.registerCommand('cpp.switchHeaderSource', async () => {
			const active = vscode.window.activeTextEditor;
			if (!active) {
				vscode.window.showErrorMessage('No active C/C++ editor.');
				return;
			}
			const current = active.document.fileName;
			const isHeader = /\.(h|hpp|hxx)$/i.test(current);
			const targetExts = isHeader ? ['.cpp', '.cc', '.cxx', '.c'] : ['.h', '.hpp', '.hxx'];
			const base = current.replace(/\.[^.]+$/, '');
			for (const ext of targetExts) {
				const candidate = vscode.Uri.file(`${base}${ext}`);
				try {
					const doc = await vscode.workspace.openTextDocument(candidate);
					await vscode.window.showTextDocument(doc);
					return;
				} catch {
					// candidate does not exist, continue search
				}
			}
			vscode.window.showWarningMessage(`Corresponding ${isHeader ? 'source' : 'header'} file not found for ${active.document.fileName}`);
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('cpp.rescanCompileCommands', async () => {
			const files = await vscode.workspace.findFiles('**/compile_commands.json', undefined, 1);
			if (files.length > 0) {
				_serviceInstance?.restart();
				vscode.window.showInformationMessage(`Loaded compilation database: ${files[0].fsPath}`);
			} else {
				vscode.window.showWarningMessage('No compile_commands.json found in workspace.');
			}
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('cpp.formatDocument', () => {
			vscode.commands.executeCommand('editor.action.formatDocument');
		})
	);

	return { service: _serviceInstance };
}

export function deactivate(): void {
	_serviceInstance = null;
}
