/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from '../../../../../editor/browser/editorBrowser.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import * as dom from '../../../../../base/browser/dom.js';

export interface IFloatingComposerSubmitEvent {
	prompt: string;
	mode: 'agent' | 'fast';
	modelId?: string;
}

/**
 * Floating in-editor Composer modal (Cursor-style Ctrl+I).
 * Docks over the active editor with mode pills, context tags, live execution stream,
 * and speculative shadow validation status.
 */
export class FloatFloatingComposerWidget extends Disposable implements IOverlayWidget {
	public static readonly ID = 'float.floatingComposerWidget';

	private readonly _domNode: HTMLElement;
	private _inputArea!: HTMLTextAreaElement;
	private _modePill!: HTMLElement;
	private _modelPill!: HTMLElement;
	private _statusRow!: HTMLElement;
	private _statusText!: HTMLElement;
	private _shadowBadge!: HTMLElement;
	private _actionsRow!: HTMLElement;
	private _submitBtn!: HTMLButtonElement;
	private _acceptBtn!: HTMLButtonElement;
	private _rejectBtn!: HTMLButtonElement;
	private _filesSummary!: HTMLElement;

	private _mode: 'agent' | 'fast' = 'agent';
	private _isVisible: boolean = false;

	private readonly _onSubmit = this._register(new Emitter<IFloatingComposerSubmitEvent>());
	public readonly onSubmit: Event<IFloatingComposerSubmitEvent> = this._onSubmit.event;

	private readonly _onAccept = this._register(new Emitter<void>());
	public readonly onAccept: Event<void> = this._onAccept.event;

	private readonly _onReject = this._register(new Emitter<void>());
	public readonly onReject: Event<void> = this._onReject.event;

	private readonly _onClose = this._register(new Emitter<void>());
	public readonly onClose: Event<void> = this._onClose.event;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _defaultModelName: string = 'gpt-6-astra'
	) {
		super();
		this._domNode = dom.$('.float-floating-composer-widget');
		this._render();
		this._editor.addOverlayWidget(this);
		this.hide();
	}

	public getId(): string {
		return FloatFloatingComposerWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): IOverlayWidgetPosition | null {
		return {
			preference: OverlayWidgetPositionPreference.TOP_CENTER
		};
	}

	public get isVisible(): boolean {
		return this._isVisible;
	}

	public show(): void {
		this._domNode.style.display = 'flex';
		this._isVisible = true;
		this._editor.layoutOverlayWidget(this);
		setTimeout(() => {
			this._inputArea.focus();
		}, 50);
	}

	public hide(): void {
		this._domNode.style.display = 'none';
		this._isVisible = false;
		this._editor.focus();
		this._onClose.fire();
	}

	public setStatus(message: string, isError: boolean = false): void {
		this._statusRow.style.display = 'flex';
		this._statusText.textContent = message;
		this._statusText.style.color = isError
			? 'var(--vscode-errorForeground, #f48771)'
			: 'var(--vscode-descriptionForeground, #9d9d9d)';
	}

	public setShadowValidation(clean: boolean, errorsCount: number = 0, warningsCount: number = 0): void {
		this._shadowBadge.style.display = 'inline-flex';
		if (clean) {
			this._shadowBadge.textContent = '✓ Shadow Validation: Clean (0 errors)';
			this._shadowBadge.style.backgroundColor = 'rgba(78, 201, 176, 0.2)';
			this._shadowBadge.style.color = '#4ec9b0';
			this._shadowBadge.style.border = '1px solid rgba(78, 201, 176, 0.4)';
		} else {
			this._shadowBadge.textContent = `⚠ Shadow Validation: ${errorsCount} error(s), ${warningsCount} warning(s)`;
			this._shadowBadge.backgroundColor = 'rgba(244, 135, 113, 0.2)';
			this._shadowBadge.style.color = '#f48771';
			this._shadowBadge.style.border = '1px solid rgba(244, 135, 113, 0.4)';
		}
	}

	public setProposalReady(filesCount: number, additions: number, deletions: number): void {
		this._filesSummary.style.display = 'block';
		this._filesSummary.textContent = `${filesCount} file(s) staged (+${additions} / -${deletions} lines)`;
		this._acceptBtn.style.display = 'inline-block';
		this._rejectBtn.style.display = 'inline-block';
		this._submitBtn.style.display = 'none';
	}

	public resetState(): void {
		this._statusRow.style.display = 'none';
		this._shadowBadge.style.display = 'none';
		this._filesSummary.style.display = 'none';
		this._acceptBtn.style.display = 'none';
		this._rejectBtn.style.display = 'none';
		this._submitBtn.style.display = 'inline-block';
		this._inputArea.value = '';
	}

	private _render(): void {
		const node = this._domNode;
		node.style.display = 'flex';
		node.style.flexDirection = 'column';
		node.style.width = '640px';
		node.style.maxWidth = '90vw';
		node.style.marginTop = '24px';
		node.style.padding = '14px 16px';
		node.style.backgroundColor = 'var(--vscode-editorWidget-background, #18181b)';
		node.style.border = '1px solid var(--vscode-focusBorder, #3b82f6)';
		node.style.borderRadius = '10px';
		node.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)';
		node.style.fontFamily = 'var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)';
		node.style.zIndex = '50';

		// Top Header Bar: Mode & Model Controls
		const topBar = dom.append(node, dom.$('.float-composer-topbar'));
		topBar.style.display = 'flex';
		topBar.style.justifyContent = 'space-between';
		topBar.style.alignItems = 'center';
		topBar.style.marginBottom = '10px';

		const pillsLeft = dom.append(topBar, dom.$('.float-pills-left'));
		pillsLeft.style.display = 'flex';
		pillsLeft.style.gap = '8px';
		pillsLeft.style.alignItems = 'center';

		// Mode Pill
		this._modePill = dom.append(pillsLeft, dom.$('.float-pill-mode'));
		this._modePill.textContent = '✨ Autonomous Agent';
		this._modePill.style.padding = '3px 10px';
		this._modePill.style.borderRadius = '12px';
		this._modePill.style.fontSize = '11px';
		this._modePill.style.fontWeight = '600';
		this._modePill.style.cursor = 'pointer';
		this._modePill.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
		this._modePill.style.color = '#60a5fa';
		this._modePill.style.border = '1px solid rgba(59, 130, 246, 0.4)';
		this._modePill.title = 'Click to toggle between Autonomous Agent and Fast Edit mode';

		this._modePill.addEventListener('click', () => {
			this._mode = this._mode === 'agent' ? 'fast' : 'agent';
			if (this._mode === 'agent') {
				this._modePill.textContent = '✨ Autonomous Agent';
				this._modePill.style.color = '#60a5fa';
				this._modePill.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
			} else {
				this._modePill.textContent = '⚡ Quick Multi-File Edit';
				this._modePill.style.color = '#34d399';
				this._modePill.style.backgroundColor = 'rgba(52, 211, 153, 0.2)';
			}
		});

		// Model Pill
		this._modelPill = dom.append(pillsLeft, dom.$('.float-pill-model'));
		this._modelPill.textContent = this._defaultModelName;
		this._modelPill.style.padding = '3px 10px';
		this._modelPill.style.borderRadius = '12px';
		this._modelPill.style.fontSize = '11px';
		this._modelPill.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
		this._modelPill.style.color = '#d4d4d8';
		this._modelPill.style.border = '1px solid rgba(255, 255, 255, 0.12)';

		// Close icon button
		const closeBtn = dom.append(topBar, dom.$('.float-composer-close'));
		closeBtn.textContent = '✕';
		closeBtn.style.cursor = 'pointer';
		closeBtn.style.fontSize = '13px';
		closeBtn.style.color = '#a1a1aa';
		closeBtn.addEventListener('click', () => this.hide());

		// Input Area
		this._inputArea = dom.append(node, dom.$<HTMLTextAreaElement>('textarea.float-composer-textarea'));
		this._inputArea.placeholder = 'Describe changes across workspace... (e.g. "Add JWT refresh token flow", "Fix type errors in auth")';
		this._inputArea.rows = 3;
		this._inputArea.style.width = '100%';
		this._inputArea.style.padding = '10px 12px';
		this._inputArea.style.fontSize = '13px';
		this._inputArea.style.lineHeight = '1.5';
		this._inputArea.style.backgroundColor = 'var(--vscode-input-background, #27272a)';
		this._inputArea.style.color = 'var(--vscode-input-foreground, #ffffff)';
		this._inputArea.style.border = '1px solid var(--vscode-input-border, #3f3f46)';
		this._inputArea.style.borderRadius = '6px';
		this._inputArea.style.resize = 'vertical';
		this._inputArea.style.outline = 'none';

		// Keybinding handlers inside textarea
		this._inputArea.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				this._triggerSubmit();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				this.hide();
			}
		});

		// Status Row & Shadow Badge
		this._statusRow = dom.append(node, dom.$('.float-composer-status-row'));
		this._statusRow.style.display = 'none';
		this._statusRow.style.flexDirection = 'column';
		this._statusRow.style.gap = '6px';
		this._statusRow.style.marginTop = '10px';

		this._statusText = dom.append(this._statusRow, dom.$('.float-composer-status-text'));
		this._statusText.style.fontSize = '12px';

		this._shadowBadge = dom.append(this._statusRow, dom.$('.float-composer-shadow-badge'));
		this._shadowBadge.style.display = 'none';
		this._shadowBadge.style.alignSelf = 'flex-start';
		this._shadowBadge.style.fontSize = '11px';
		this._shadowBadge.style.padding = '2px 8px';
		this._shadowBadge.style.borderRadius = '4px';

		this._filesSummary = dom.append(this._statusRow, dom.$('.float-composer-files-summary'));
		this._filesSummary.style.display = 'none';
		this._filesSummary.style.fontSize = '12px';
		this._filesSummary.style.color = '#38bdf8';
		this._filesSummary.style.fontWeight = '500';

		// Bottom Action Bar
		this._actionsRow = dom.append(node, dom.$('.float-composer-actions'));
		this._actionsRow.style.display = 'flex';
		this._actionsRow.style.justifyContent = 'space-between';
		this._actionsRow.style.alignItems = 'center';
		this._actionsRow.style.marginTop = '12px';

		const hint = dom.append(this._actionsRow, dom.$('.float-composer-hint'));
		hint.textContent = 'Ctrl+Enter to generate • Esc to close';
		hint.style.fontSize = '11px';
		hint.style.color = '#71717a';

		const btnGroup = dom.append(this._actionsRow, dom.$('.float-composer-btn-group'));
		btnGroup.style.display = 'flex';
		btnGroup.style.gap = '8px';

		this._submitBtn = dom.append(btnGroup, dom.$<HTMLButtonElement>('button.float-btn-submit'));
		this._submitBtn.textContent = 'Run Composer';
		this._submitBtn.style.padding = '6px 14px';
		this._submitBtn.style.fontSize = '12px';
		this._submitBtn.style.fontWeight = '500';
		this._submitBtn.style.borderRadius = '6px';
		this._submitBtn.style.border = 'none';
		this._submitBtn.style.backgroundColor = 'var(--vscode-button-background, #2563eb)';
		this._submitBtn.style.color = '#ffffff';
		this._submitBtn.style.cursor = 'pointer';
		this._submitBtn.addEventListener('click', () => this._triggerSubmit());

		this._acceptBtn = dom.append(btnGroup, dom.$<HTMLButtonElement>('button.float-btn-accept'));
		this._acceptBtn.textContent = '✓ Accept All';
		this._acceptBtn.style.display = 'none';
		this._acceptBtn.style.padding = '6px 14px';
		this._acceptBtn.style.fontSize = '12px';
		this._acceptBtn.style.fontWeight = '500';
		this._acceptBtn.style.borderRadius = '6px';
		this._acceptBtn.style.border = 'none';
		this._acceptBtn.style.backgroundColor = '#16a34a';
		this._acceptBtn.style.color = '#ffffff';
		this._acceptBtn.style.cursor = 'pointer';
		this._acceptBtn.addEventListener('click', () => {
			this._onAccept.fire();
			this.hide();
		});

		this._rejectBtn = dom.append(btnGroup, dom.$<HTMLButtonElement>('button.float-btn-reject'));
		this._rejectBtn.textContent = '✕ Reject';
		this._rejectBtn.style.display = 'none';
		this._rejectBtn.style.padding = '6px 12px';
		this._rejectBtn.style.fontSize = '12px';
		this._rejectBtn.style.borderRadius = '6px';
		this._rejectBtn.style.border = '1px solid rgba(255, 255, 255, 0.15)';
		this._rejectBtn.style.backgroundColor = 'transparent';
		this._rejectBtn.style.color = '#e4e4e7';
		this._rejectBtn.style.cursor = 'pointer';
		this._rejectBtn.addEventListener('click', () => {
			this._onReject.fire();
			this.hide();
		});
	}

	private _triggerSubmit(): void {
		const text = this._inputArea.value.trim();
		if (!text) return;

		this.setStatus(`Executing ${this._mode === 'agent' ? 'Autonomous Agent' : 'Multi-File Edit'}...`);
		this._onSubmit.fire({
			prompt: text,
			mode: this._mode
		});
	}

	public override dispose(): void {
		this._editor.removeOverlayWidget(this);
		this._domNode.remove();
		super.dispose();
	}
}
