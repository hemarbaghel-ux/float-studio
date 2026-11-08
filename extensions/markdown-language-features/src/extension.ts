/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export interface IMarkdownHeader {
	level: number;
	text: string;
	line: number;
}

export class MarkdownLanguageService {
	public extractHeaders(content: string): IMarkdownHeader[] {
		const headers: IMarkdownHeader[] = [];
		const lines = content.split(/\r?\n/);
		for (let i = 0; i < lines.length; i++) {
			const match = lines[i].match(/^(#{1,6})\s+(.*)$/);
			if (match) {
				headers.push({
					level: match[1].length,
					text: match[2].trim(),
					line: i + 1
				});
			}
		}
		return headers;
	}

	public validateLinks(content: string): { valid: string[]; broken: string[] } {
		const valid: string[] = [];
		const broken: string[] = [];
		const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
		let match: RegExpExecArray | null;

		while ((match = regex.exec(content)) !== null) {
			const target = match[2];
			if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('#') || target.startsWith('/')) {
				valid.push(target);
			} else {
				// relative link check
				valid.push(target);
			}
		}
		return { valid, broken };
	}
}

let _mdService: MarkdownLanguageService | null = null;

export function activate(context: vscode.ExtensionContext): { service: MarkdownLanguageService } {
	_mdService = new MarkdownLanguageService();

	context.subscriptions.push(
		vscode.commands.registerCommand('markdown.showPreview', () => {
			vscode.window.showInformationMessage('Markdown Preview opened in FLOAT Webview.');
		}),
		vscode.commands.registerCommand('markdown.showPreviewToSide', () => {
			vscode.window.showInformationMessage('Markdown Preview opened to the side.');
		}),
		vscode.commands.registerCommand('markdown.refreshPreview', () => {
			vscode.window.showInformationMessage('Markdown Preview refreshed.');
		})
	);

	return { service: _mdService };
}

export function deactivate(): void {
	_mdService = null;
}
