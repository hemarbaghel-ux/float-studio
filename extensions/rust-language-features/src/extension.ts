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
			const terminal = vscode.window.createTerminal({ name: 'Cargo Build' });
			terminal.show();
			terminal.sendText('cargo build');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rust.cargoTest', () => {
			const terminal = vscode.window.createTerminal({ name: 'Cargo Test' });
			terminal.show();
			terminal.sendText('cargo test');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rust.cargoClippy', () => {
			const terminal = vscode.window.createTerminal({ name: 'Cargo Clippy' });
			terminal.show();
			terminal.sendText('cargo clippy');
		})
	);

	return { service: _serviceInstance };
}

export function deactivate(): void {
	_serviceInstance = null;
}
