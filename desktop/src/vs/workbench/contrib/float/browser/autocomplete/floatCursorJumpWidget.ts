/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor, IContentWidget, IContentWidgetPosition, ContentWidgetPositionPreference } from '../../../../../editor/browser/editorBrowser.js';
import { IPosition } from '../../../../../editor/common/core/position.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import * as dom from '../../../../../base/browser/dom.js';
import { IContextKeyService, IContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { ICursorJumpRecommendation } from './floatAutocompleteTypes.js';
import { ctxFloatCursorJumpVisible } from './floatAutocompleteActions.js';

/**
 * Visual Cursor Tab Jump Pill rendered next to the cursor position.
 * Shows the speculated next edit location (e.g., "Tab ⇥ Jump to userController.ts:3").
 */
export class FloatCursorJumpWidget extends Disposable implements IContentWidget {
	public static readonly ID = 'float.cursorJumpWidget';

	private readonly _domNode: HTMLElement;
	private _position: IPosition | null = null;
	private _currentRecommendation: ICursorJumpRecommendation | null = null;
	private readonly _jumpVisibleKey?: IContextKey<boolean>;

	private readonly _onTriggerJump = this._register(new Emitter<ICursorJumpRecommendation>());
	public readonly onTriggerJump: Event<ICursorJumpRecommendation> = this._onTriggerJump.event;

	constructor(
		private readonly _editor: ICodeEditor,
		contextKeyService?: IContextKeyService
	) {
		super();
		this._jumpVisibleKey = contextKeyService ? ctxFloatCursorJumpVisible.bindTo(contextKeyService) : undefined;
		this._domNode = dom.$('.float-cursor-jump-pill');
		this._render();
		this._editor.addContentWidget(this);
	}

	public getId(): string {
		return FloatCursorJumpWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public get currentRecommendation(): ICursorJumpRecommendation | null {
		return this._currentRecommendation;
	}

	public isVisible(): boolean {
		return this._domNode.style.display !== 'none' && this._currentRecommendation !== null;
	}

	public getPosition(): IContentWidgetPosition | null {
		if (!this._position) return null;

		return {
			position: this._position,
			preference: [
				ContentWidgetPositionPreference.EXACT,
				ContentWidgetPositionPreference.ABOVE,
				ContentWidgetPositionPreference.BELOW
			]
		};
	}

	public showRecommendation(position: IPosition, recommendation: ICursorJumpRecommendation): void {
		this._position = position;
		this._currentRecommendation = recommendation;
		this._jumpVisibleKey?.set(true);

		const targetFile = recommendation.targetFilePath.split(/[\\/]/).pop() || recommendation.targetFilePath;
		this._domNode.innerHTML = `<span style="opacity: 0.7; margin-right: 4px;">Tab ⇥</span> <span>Jump to ${targetFile}:${recommendation.targetLine}</span>`;
		this._domNode.title = `${recommendation.reason} (Click or press Tab)`;
		this._domNode.style.display = 'inline-flex';

		this._editor.layoutContentWidget(this);
	}

	public hide(): void {
		this._position = null;
		this._currentRecommendation = null;
		this._jumpVisibleKey?.set(false);
		this._domNode.style.display = 'none';
		this._editor.layoutContentWidget(this);
	}

	public acceptJump(): boolean {
		if (this._currentRecommendation) {
			const rec = this._currentRecommendation;
			this.hide();
			this._onTriggerJump.fire(rec);
			return true;
		}
		return false;
	}

	private _render(): void {
		const node = this._domNode;
		node.style.display = 'none';
		node.style.alignItems = 'center';
		node.style.marginLeft = '12px';
		node.style.padding = '2px 8px';
		node.style.borderRadius = '12px';
		node.style.fontSize = '11px';
		node.style.fontWeight = '500';
		node.style.cursor = 'pointer';
		node.style.backgroundColor = 'rgba(99, 102, 241, 0.25)';
		node.style.color = '#a5b4fc';
		node.style.border = '1px solid rgba(99, 102, 241, 0.5)';
		node.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
		node.style.zIndex = '40';
		node.style.transition = 'all 0.15s ease-in-out';

		node.addEventListener('mouseenter', () => {
			node.style.backgroundColor = 'rgba(99, 102, 241, 0.4)';
			node.style.borderColor = 'rgba(99, 102, 241, 0.8)';
		});

		node.addEventListener('mouseleave', () => {
			node.style.backgroundColor = 'rgba(99, 102, 241, 0.25)';
			node.style.borderColor = 'rgba(99, 102, 241, 0.5)';
		});

		node.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.acceptJump();
		});
	}

	public override dispose(): void {
		this._jumpVisibleKey?.reset();
		this._editor.removeContentWidget(this);
		this._domNode.remove();
		super.dispose();
	}
}
