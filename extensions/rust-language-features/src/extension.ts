/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class RustLanguageService {
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

let _serviceInstance: RustLanguageService | null = null;

export function activate(context: vscode.ExtensionContext): { service: RustLanguageService } {
	_serviceInstance = new RustLanguageService();

	
	context.subscriptions.push(
		vscode.commands.registerCommand('rust.cargoBuild', () => {
			vscode.window.showInformationMessage('Rust: Cargo Build executed.');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('rust.cargoTest', () => {
			vscode.window.showInformationMessage('Rust: Cargo Test executed.');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('rust.cargoClippy', () => {
			vscode.window.showInformationMessage('Rust: Cargo Clippy Diagnostics executed.');
		})
	);

	return { service: _serviceInstance };
}

export function deactivate(): void {
	_serviceInstance = null;
}
