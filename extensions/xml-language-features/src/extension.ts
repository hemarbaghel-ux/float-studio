/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class XmlLanguageService {
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

let _serviceInstance: XmlLanguageService | null = null;

export function activate(context: vscode.ExtensionContext): { service: XmlLanguageService } {
	_serviceInstance = new XmlLanguageService();

	
	context.subscriptions.push(
		vscode.commands.registerCommand('xml.formatDocument', () => {
			vscode.window.showInformationMessage('XML: Format Document executed.');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('xml.validateSchema', () => {
			vscode.window.showInformationMessage('XML: Validate Well-Formedness executed.');
		})
	);

	return { service: _serviceInstance };
}

export function deactivate(): void {
	_serviceInstance = null;
}
