/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export type ConfigDocType = 'settings' | 'keybindings' | 'launch' | 'tasks';

export interface IValidationResult {
	isValid: boolean;
	errors: string[];
}

export class ConfigurationEditingService {
	private readonly _knownKeys: Record<ConfigDocType, string[]> = {
		settings: [
			'editor.fontSize',
			'editor.tabSize',
			'editor.formatOnSave',
			'editor.minimap.enabled',
			'float.ai.enabled',
			'float.ai.model',
			'float.cursorTab.enabled',
			'float.debugAutoRepair.enabled',
			'files.autoSave',
			'files.exclude',
			'workbench.colorTheme',
			'terminal.integrated.defaultProfile.windows'
		],
		keybindings: [
			'key',
			'command',
			'when',
			'args'
		],
		launch: [
			'version',
			'configurations',
			'type',
			'request',
			'name',
			'program',
			'args',
			'env',
			'cwd',
			'stopOnEntry'
		],
		tasks: [
			'version',
			'tasks',
			'label',
			'type',
			'command',
			'args',
			'group',
			'presentation',
			'problemMatcher'
		]
	};

	public getKnownKeys(docType: ConfigDocType): string[] {
		return this._knownKeys[docType] || [];
	}

	public getCompletions(docType: ConfigDocType, prefix: string): string[] {
		const keys = this.getKnownKeys(docType);
		if (!prefix) {
			return keys;
		}
		const lower = prefix.toLowerCase();
		return keys.filter(k => k.toLowerCase().includes(lower));
	}

	public validateConfiguration(docType: ConfigDocType, content: string): IValidationResult {
		const errors: string[] = [];
		try {
			const parsed = JSON.parse(content);
			if (docType === 'keybindings') {
				if (!Array.isArray(parsed)) {
					errors.push('keybindings.json root must be a JSON array of keybinding definitions.');
				} else {
					parsed.forEach((item, idx) => {
						if (!item.key) {
							errors.push(`Item at index ${idx} is missing required 'key' property.`);
						}
						if (!item.command) {
							errors.push(`Item at index ${idx} is missing required 'command' property.`);
						}
					});
				}
			} else if (docType === 'launch') {
				if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
					errors.push('launch.json root must be a JSON object.');
				} else if (!parsed.configurations || !Array.isArray(parsed.configurations)) {
					errors.push('launch.json must define a "configurations" array.');
				}
			} else if (docType === 'tasks') {
				if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
					errors.push('tasks.json root must be a JSON object.');
				} else if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
					errors.push('tasks.json must define a "tasks" array.');
				}
			} else if (docType === 'settings') {
				if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
					errors.push('settings.json root must be a JSON object.');
				}
			}
		} catch (err: any) {
			errors.push(`JSON Syntax Error: ${err.message}`);
		}

		return {
			isValid: errors.length === 0,
			errors
		};
	}
}

let _configService: ConfigurationEditingService | null = null;

export function activate(context: vscode.ExtensionContext): { service: ConfigurationEditingService } {
	_configService = new ConfigurationEditingService();

	context.subscriptions.push(
		vscode.commands.registerCommand('config.validate', () => {
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				const fileName = editor.document.fileName.toLowerCase();
				let docType: ConfigDocType = 'settings';
				if (fileName.endsWith('keybindings.json')) {
					docType = 'keybindings';
				} else if (fileName.endsWith('launch.json')) {
					docType = 'launch';
				} else if (fileName.endsWith('tasks.json')) {
					docType = 'tasks';
				}

				const result = _configService?.validateConfiguration(docType, editor.document.getText());
				if (result?.isValid) {
					vscode.window.showInformationMessage(`Configuration (${docType}) is valid.`);
				} else {
					vscode.window.showErrorMessage(`Configuration (${docType}) has errors: ${result?.errors.join('; ')}`);
				}
			}
		})
	);

	return { service: _configService };
}

export function deactivate(): void {
	_configService = null;
}
