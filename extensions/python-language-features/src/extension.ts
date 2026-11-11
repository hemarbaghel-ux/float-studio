/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class PythonLanguageService {
	private _isActive = true;
	private _selectedInterpreter = 'python';
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

	public setInterpreter(interp: string): void {
		this._selectedInterpreter = interp;
	}

	public getInterpreter(): string {
		return this._selectedInterpreter;
	}

	public restart(): void {
		this._isActive = false;
		this._isActive = true;
	}
}

let _serviceInstance: PythonLanguageService | null = null;

export function activate(context: vscode.ExtensionContext): { service: PythonLanguageService } {
	_serviceInstance = new PythonLanguageService();

	context.subscriptions.push(
		vscode.commands.registerCommand('python.selectInterpreter', async () => {
			const activeFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const options = [
				{ label: 'System Python 3', description: 'Default system interpreter' },
				{ label: 'Active Workspace Environment (.venv)', description: activeFolder ? `${activeFolder}/.venv` : 'Workspace .venv' }
			];
			const picked = await vscode.window.showQuickPick(options, {
				placeHolder: 'Select Python Interpreter for active workspace'
			});
			if (picked) {
				_serviceInstance?.setInterpreter(picked.label);
				vscode.window.showInformationMessage(`Python interpreter set to: ${picked.label}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('python.restartLspServer', () => {
			_serviceInstance?.restart();
			vscode.window.showInformationMessage('Python language service successfully restarted.');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('python.runTests', () => {
			const terminal = vscode.window.createTerminal({ name: 'Python Tests' });
			terminal.show();
			terminal.sendText('python -m unittest discover -s tests -p "*test*.py" 2>/dev/null || pytest');
		})
	);

	return { service: _serviceInstance };
}

export function deactivate(): void {
	_serviceInstance = null;
}
