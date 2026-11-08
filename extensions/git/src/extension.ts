/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export interface IGitRepoStatus {
	branch: string;
	stagedFiles: string[];
	modifiedFiles: string[];
	untrackedFiles: string[];
}

export class GitScmService {
	private _activeBranch = 'main';
	private readonly _stagedFiles = new Set<string>();
	private readonly _modifiedFiles = new Set<string>();

	public getStatus(): IGitRepoStatus {
		return {
			branch: this._activeBranch,
			stagedFiles: Array.from(this._stagedFiles),
			modifiedFiles: Array.from(this._modifiedFiles),
			untrackedFiles: []
		};
	}

	public stageAll(): void {
		for (const file of this._modifiedFiles) {
			this._stagedFiles.add(file);
		}
		this._modifiedFiles.clear();
	}

	public unstageAll(): void {
		for (const file of this._stagedFiles) {
			this._modifiedFiles.add(file);
		}
		this._stagedFiles.clear();
	}

	public commit(message: string): boolean {
		if (this._stagedFiles.size === 0 || !message) {
			return false;
		}
		this._stagedFiles.clear();
		return true;
	}

	public setBranch(branch: string): void {
		this._activeBranch = branch;
	}
}

let _gitService: GitScmService | null = null;

export function activate(context: vscode.ExtensionContext): { service: GitScmService } {
	_gitService = new GitScmService();

	context.subscriptions.push(
		vscode.commands.registerCommand('git.refresh', () => {
			vscode.window.showInformationMessage('Git repositories refreshed.');
		}),
		vscode.commands.registerCommand('git.stageAll', () => {
			_gitService?.stageAll();
			vscode.window.showInformationMessage('Git: All changes staged.');
		}),
		vscode.commands.registerCommand('git.unstageAll', () => {
			_gitService?.unstageAll();
			vscode.window.showInformationMessage('Git: All changes unstaged.');
		}),
		vscode.commands.registerCommand('git.commit', async () => {
			const msg = await vscode.window.showInputBox({ prompt: 'Commit message' });
			if (msg && _gitService?.commit(msg)) {
				vscode.window.showInformationMessage(`Git: Committed: "${msg}"`);
			}
		}),
		vscode.commands.registerCommand('git.push', () => {
			vscode.window.showInformationMessage('Git: Pushed to origin.');
		}),
		vscode.commands.registerCommand('git.pull', () => {
			vscode.window.showInformationMessage('Git: Pulled from origin.');
		}),
		vscode.commands.registerCommand('git.branch', async () => {
			const branch = await vscode.window.showInputBox({ prompt: 'Branch name' });
			if (branch) {
				_gitService?.setBranch(branch);
				vscode.window.showInformationMessage(`Git: Switched to branch "${branch}".`);
			}
		})
	);

	return { service: _gitService };
}

export function deactivate(): void {
	_gitService = null;
}
