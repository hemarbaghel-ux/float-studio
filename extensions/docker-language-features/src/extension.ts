/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class DockerLanguageService {
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

let _serviceInstance: DockerLanguageService | null = null;

export function activate(context: vscode.ExtensionContext): { service: DockerLanguageService } {
	_serviceInstance = new DockerLanguageService();

	
	context.subscriptions.push(
		vscode.commands.registerCommand('docker.lintDockerfile', () => {
			vscode.window.showInformationMessage('Docker: Lint Dockerfile executed.');
		})
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('docker.buildImage', () => {
			vscode.window.showInformationMessage('Docker: Build Image from Current File executed.');
		})
	);

	return { service: _serviceInstance };
}

export function deactivate(): void {
	_serviceInstance = null;
}
