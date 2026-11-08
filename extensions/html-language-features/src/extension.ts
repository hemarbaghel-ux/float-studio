/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class HtmlLanguageService {
	public getClosingTag(textBeforeCursor: string): string | null {
		const match = textBeforeCursor.match(/<([a-zA-Z0-9_-]+)(?:\s+[^>]*)?>$/);
		if (match) {
			const tag = match[1];
			const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
			if (!voidTags.has(tag.toLowerCase())) {
				return `</${tag}>`;
			}
		}
		return null;
	}
}

let _htmlService: HtmlLanguageService | null = null;

export function activate(context: vscode.ExtensionContext): { service: HtmlLanguageService } {
	_htmlService = new HtmlLanguageService();

	context.subscriptions.push(
		vscode.commands.registerCommand('html.autoCloseTag', () => {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document.languageId === 'html') {
				const pos = editor.selection.active;
				const linePrefix = editor.document.lineAt(pos.line).text.substring(0, pos.character);
				const closeTag = _htmlService?.getClosingTag(linePrefix);
				if (closeTag) {
					editor.edit(builder => builder.insert(pos, closeTag));
				}
			}
		})
	);

	return { service: _htmlService };
}

export function deactivate(): void {
	_htmlService = null;
}
