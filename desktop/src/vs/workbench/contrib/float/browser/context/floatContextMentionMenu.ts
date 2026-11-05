/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import * as dom from '../../../../../base/browser/dom.js';

export interface IContextMentionItem {
	key: string;
	title: string;
	description: string;
	icon: string;
}

export const BUILTIN_CONTEXT_MENTIONS: IContextMentionItem[] = [
	{ key: '@codebase', title: '@codebase', description: 'Semantic search across entire workspace with RAG', icon: '🔍' },
	{ key: '@file', title: '@file', description: 'Attach a specific workspace file to context', icon: '📄' },
	{ key: '@folder', title: '@folder', description: 'Attach a folder directory tree and its files', icon: '📁' },
	{ key: '@terminal', title: '@terminal', description: 'Attach recent terminal output and logs', icon: '💻' },
	{ key: '@git', title: '@git', description: 'Attach current working tree uncommitted git diff', icon: '🌿' },
	{ key: '@web', title: '@web', description: 'Search web for latest documentation and answers', icon: '🌐' },
	{ key: '@docs', title: '@docs', description: 'Search indexed frameworks and library documentations', icon: '📚' }
];

/**
 * Autocomplete popup for Cursor-style '@' context mentions in Composer and Chat inputs.
 */
export class FloatContextMentionMenu extends Disposable {
	private readonly _domNode: HTMLElement;
	private _items: IContextMentionItem[] = BUILTIN_CONTEXT_MENTIONS;
	private _selectedIndex: number = 0;
	private _filterText: string = '';
	private _visible: boolean = false;

	private readonly _onSelect = this._register(new Emitter<IContextMentionItem>());
	public readonly onSelect: Event<IContextMentionItem> = this._onSelect.event;

	constructor(private readonly _parentContainer: HTMLElement) {
		super();
		this._domNode = dom.$('.float-mention-menu');
		this._render();
		this._parentContainer.appendChild(this._domNode);
		this.hide();
	}

	public get isVisible(): boolean {
		return this._visible;
	}

	public showAt(x: number, y: number, filterQuery: string = ''): void {
		this._visible = true;
		this._domNode.style.display = 'flex';
		this._domNode.style.left = `${x}px`;
		this._domNode.style.top = `${y}px`;
		this.setFilter(filterQuery);
	}

	public hide(): void {
		this._visible = false;
		this._domNode.style.display = 'none';
	}

	public setFilter(query: string): void {
		this._filterText = query.toLowerCase();
		const filtered = BUILTIN_CONTEXT_MENTIONS.filter(item =>
			item.key.toLowerCase().includes(this._filterText) ||
			item.description.toLowerCase().includes(this._filterText)
		);
		this._items = filtered.length > 0 ? filtered : BUILTIN_CONTEXT_MENTIONS;
		this._selectedIndex = 0;
		this._renderItems();
	}

	public getFilteredOptions(inputQuery: string): IContextMentionItem[] {
		const clean = inputQuery.startsWith('@') ? inputQuery.substring(1).toLowerCase() : inputQuery.toLowerCase();
		if (!clean) {
			return [...BUILTIN_CONTEXT_MENTIONS];
		}
		return BUILTIN_CONTEXT_MENTIONS.filter(m =>
			m.key.toLowerCase().includes(clean) || m.description.toLowerCase().includes(clean)
		);
	}

	public formatMentionPill(mentionKey: string, value?: string): string {
		switch (mentionKey) {
			case 'codebase':
			case '@codebase':
				return '[@codebase]';
			case 'file':
			case '@file':
				return `[@file: ${value || 'current'}]`;
			case 'git':
			case '@git':
				return '[@git: diff]';
			case 'terminal':
			case '@terminal':
				return '[@terminal: last-error]';
			case 'web':
			case '@web':
				return `[@web: ${value || 'search'}]`;
			default:
				return `[@${mentionKey.replace(/^@/, '')}]`;
		}
	}

	public selectNext(): void {
		if (this._items.length === 0) return;
		this._selectedIndex = (this._selectedIndex + 1) % this._items.length;
		this._renderItems();
	}

	public selectPrevious(): void {
		if (this._items.length === 0) return;
		this._selectedIndex = (this._selectedIndex - 1 + this._items.length) % this._items.length;
		this._renderItems();
	}

	public confirmSelection(): IContextMentionItem | undefined {
		if (this._items.length === 0) return undefined;
		const selected = this._items[this._selectedIndex];
		this._onSelect.fire(selected);
		this.hide();
		return selected;
	}

	private _render(): void {
		const node = this._domNode;
		node.style.position = 'absolute';
		node.style.display = 'none';
		node.style.flexDirection = 'column';
		node.style.width = '320px';
		node.style.maxHeight = '240px';
		node.style.backgroundColor = 'var(--vscode-editorWidget-background, #18181b)';
		node.style.border = '1px solid var(--vscode-editorWidget-border, #3f3f46)';
		node.style.borderRadius = '8px';
		node.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.45)';
		node.style.zIndex = '100';
		node.style.overflowY = 'auto';
		node.style.padding = '4px';

		this._renderItems();
	}

	private _renderItems(): void {
		this._domNode.innerHTML = '';

		for (let i = 0; i < this._items.length; i++) {
			const item = this._items[i];
			const isSelected = i === this._selectedIndex;

			const row = dom.append(this._domNode, dom.$('.float-mention-item'));
			row.style.display = 'flex';
			row.style.alignItems = 'center';
			row.style.padding = '6px 10px';
			row.style.borderRadius = '4px';
			row.style.cursor = 'pointer';
			row.style.backgroundColor = isSelected ? 'var(--vscode-list-activeSelectionBackground, #2563eb)' : 'transparent';
			row.style.color = isSelected ? '#ffffff' : 'var(--vscode-foreground, #d4d4d8)';

			const icon = dom.append(row, dom.$('.float-mention-icon'));
			icon.textContent = item.icon;
			icon.style.marginRight = '8px';
			icon.style.fontSize = '14px';

			const textContainer = dom.append(row, dom.$('.float-mention-texts'));
			textContainer.style.display = 'flex';
			textContainer.style.flexDirection = 'column';

			const keySpan = dom.append(textContainer, dom.$('.float-mention-key'));
			keySpan.textContent = item.title;
			keySpan.style.fontWeight = '600';
			keySpan.style.fontSize = '12px';

			const descSpan = dom.append(textContainer, dom.$('.float-mention-desc'));
			descSpan.textContent = item.description;
			descSpan.style.fontSize = '11px';
			descSpan.style.color = isSelected ? 'rgba(255, 255, 255, 0.8)' : 'var(--vscode-descriptionForeground, #a1a1aa)';

			row.addEventListener('click', () => {
				this._selectedIndex = i;
				this.confirmSelection();
			});
		}
	}

	public override dispose(): void {
		this._domNode.remove();
		super.dispose();
	}
}
