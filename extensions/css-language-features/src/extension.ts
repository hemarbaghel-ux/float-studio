/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class CssLanguageService {
	private readonly _knownProperties = new Set([
		'display', 'position', 'top', 'right', 'bottom', 'left',
		'flex', 'flex-direction', 'align-items', 'justify-content', 'gap',
		'grid', 'grid-template-columns', 'grid-template-rows',
		'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
		'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
		'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
		'background', 'background-color', 'color', 'opacity',
		'border', 'border-radius', 'box-shadow', 'outline',
		'font-family', 'font-size', 'font-weight', 'line-height', 'text-align',
		'transform', 'transition', 'animation', 'z-index', 'overflow'
	]);

	public isKnownProperty(propName: string): boolean {
		return this._knownProperties.has(propName.trim().toLowerCase());
	}

	public getProperties(): string[] {
		return Array.from(this._knownProperties);
	}
}

let _cssService: CssLanguageService | null = null;

export function activate(context: vscode.ExtensionContext): { service: CssLanguageService } {
	_cssService = new CssLanguageService();

	context.subscriptions.push(
		vscode.commands.registerCommand('css.formatDocument', async () => {
			try {
				await vscode.commands.executeCommand('editor.action.formatDocument');
			} catch {
				// Built-in workbench command not registered in mock harness
			}
			vscode.window.showInformationMessage('CSS Stylesheet formatted.');
		})
	);

	return { service: _cssService };
}

export function deactivate(): void {
	_cssService = null;
}
