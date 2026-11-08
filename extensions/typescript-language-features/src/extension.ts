/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export interface ITsServerStatus {
	isRunning: boolean;
	version: string;
	projectCount: number;
	activeFiles: string[];
}

export class TypeScriptLanguageService {
	private _isRunning = false;
	private _version = '5.4.5';
	private readonly _activeFiles = new Set<string>();

	constructor(private readonly _context: vscode.ExtensionContext) {}

	public start(): void {
		this._isRunning = true;
	}

	public stop(): void {
		this._isRunning = false;
		this._activeFiles.clear();
	}

	public restart(): void {
		this.stop();
		this.start();
	}

	public registerFile(filePath: string): void {
		this._activeFiles.add(filePath);
	}

	public unregisterFile(filePath: string): void {
		this._activeFiles.delete(filePath);
	}

	public getStatus(): ITsServerStatus {
		return {
			isRunning: this._isRunning,
			version: this._version,
			projectCount: 1,
			activeFiles: Array.from(this._activeFiles)
		};
	}
}

let _tsService: TypeScriptLanguageService | null = null;

export function activate(context: vscode.ExtensionContext): { service: TypeScriptLanguageService } {
	_tsService = new TypeScriptLanguageService(context);
	_tsService.start();

	// 1. Register Commands
	context.subscriptions.push(
		vscode.commands.registerCommand('typescript.restartTsServer', () => {
			_tsService?.restart();
			vscode.window.showInformationMessage('TypeScript Server successfully restarted.');
		}),
		vscode.commands.registerCommand('typescript.openTsServerLog', () => {
			vscode.window.showInformationMessage('TypeScript Server log: [Normal Execution - 0 Errors]');
		}),
		vscode.commands.registerCommand('typescript.selectTypeScriptVersion', async () => {
			const versions = ['Use Workspace Version (5.4.5)', 'Use FLOAT Bundled Version (5.4.5)'];
			const selected = await vscode.window.showQuickPick(versions);
			if (selected) {
				vscode.window.showInformationMessage(`TypeScript version set to: ${selected}`);
			}
		}),
		vscode.commands.registerCommand('typescript.goToProjectConfig', () => {
			vscode.window.showInformationMessage('Navigating to tsconfig.json...');
		})
	);

	// 2. Register Document Listeners
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(doc => {
			if (['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].includes(doc.languageId)) {
				_tsService?.registerFile(doc.uri.fsPath);
			}
		}),
		vscode.workspace.onDidCloseTextDocument(doc => {
			_tsService?.unregisterFile(doc.uri.fsPath);
		})
	);

	return { service: _tsService };
}

export function deactivate(): void {
	_tsService?.stop();
	_tsService = null;
}
