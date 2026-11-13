/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ZoneWidget } from '../../../../../editor/contrib/zoneWidget/browser/zoneWidget.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import * as dom from '../../../../../base/browser/dom.js';

export interface IInlineDiffSubmitEvent {
	prompt: string;
}

export class FloatInlineDiffZoneWidget extends ZoneWidget {
	private _inputElement: HTMLInputElement | null = null;
	private _statusElement: HTMLElement | null = null;
	private _actionButtons: HTMLElement | null = null;
	private _acceptButton: HTMLButtonElement | null = null;
	private _rejectButton: HTMLButtonElement | null = null;

	private readonly _onSubmit = this._disposables.add(new Emitter<IInlineDiffSubmitEvent>());
	public readonly onSubmit: Event<IInlineDiffSubmitEvent> = this._onSubmit.event;

	private readonly _onAccept = this._disposables.add(new Emitter<void>());
	public readonly onAccept: Event<void> = this._onAccept.event;

	private readonly _onReject = this._disposables.add(new Emitter<void>());
	public readonly onReject: Event<void> = this._onReject.event;

	private readonly _onCancel = this._disposables.add(new Emitter<void>());
	public readonly onCancel: Event<void> = this._onCancel.event;

	constructor(editor: ICodeEditor) {
		super(editor, {
			showArrow: true,
			showFrame: true,
			frameWidth: 1,
			className: 'float-inline-diff-zone-widget',
			isResizeable: false,
			keepEditorSelection: true
		});
	}

	protected override _fillContainer(container: HTMLElement): void {
		container.style.display = 'flex';
		container.style.flexDirection = 'column';
		container.style.padding = '8px 12px';
		container.style.backgroundColor = 'var(--vscode-editorWidget-background, #1e1e1e)';
		container.style.border = '1px solid var(--vscode-editorWidget-border, #007acc)';
		container.style.borderRadius = '4px';
		container.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.35)';

		// Header
		const header = dom.append(container, dom.$('.float-zone-header'));
		header.style.display = 'flex';
		header.style.justifyContent = 'space-between';
		header.style.alignItems = 'center';
		header.style.marginBottom = '6px';

		const title = dom.append(header, dom.$('.float-zone-title'));
		title.textContent = 'FLOAT Inline Diff (Ctrl+K)';
		title.style.fontWeight = 'bold';
		title.style.fontSize = '12px';
		title.style.color = 'var(--vscode-editorWidget-foreground, #cccccc)';

		this._statusElement = dom.append(header, dom.$('.float-zone-status'));
		this._statusElement.style.fontSize = '11px';
		this._statusElement.style.color = 'var(--vscode-descriptionForeground, #888888)';
		this._statusElement.textContent = 'Ready';

		// Input row
		const inputRow = dom.append(container, dom.$('.float-zone-input-row'));
		inputRow.style.display = 'flex';
		inputRow.style.gap = '8px';
		inputRow.style.alignItems = 'center';

		this._inputElement = dom.append(inputRow, dom.$<HTMLInputElement>('input.float-zone-input'));
		this._inputElement.type = 'text';
		this._inputElement.placeholder = 'Describe change... (e.g., Optimize loop, add types, handle null error)';
		this._inputElement.style.flex = '1';
		this._inputElement.style.padding = '6px 10px';
		this._inputElement.style.fontSize = '12px';
		this._inputElement.style.backgroundColor = 'var(--vscode-input-background, #2d2d2d)';
		this._inputElement.style.color = 'var(--vscode-input-foreground, #ffffff)';
		this._inputElement.style.border = '1px solid var(--vscode-input-border, #3c3c3c)';
		this._inputElement.style.borderRadius = '2px';
		this._inputElement.style.outline = 'none';

		// Action Buttons Container
		this._actionButtons = dom.append(inputRow, dom.$('.float-zone-actions'));
		this._actionButtons.style.display = 'flex';
		this._actionButtons.style.gap = '6px';

		const submitBtn = dom.append(this._actionButtons, dom.$<HTMLButtonElement>('button.float-submit-btn'));
		submitBtn.textContent = 'Generate';
		submitBtn.style.padding = '5px 12px';
		submitBtn.style.fontSize = '11px';
		submitBtn.style.cursor = 'pointer';
		submitBtn.style.backgroundColor = 'var(--vscode-button-background, #007acc)';
		submitBtn.style.color = 'var(--vscode-button-foreground, #ffffff)';
		submitBtn.style.border = 'none';
		submitBtn.style.borderRadius = '2px';

		this._acceptButton = dom.append(this._actionButtons, dom.$<HTMLButtonElement>('button.float-accept-btn'));
		this._acceptButton.textContent = 'Accept (Ctrl+Enter)';
		this._acceptButton.style.padding = '5px 10px';
		this._acceptButton.style.fontSize = '11px';
		this._acceptButton.style.cursor = 'pointer';
		this._acceptButton.style.display = 'none';
		this._acceptButton.style.backgroundColor = '#2ea043';
		this._acceptButton.style.color = '#ffffff';
		this._acceptButton.style.border = 'none';
		this._acceptButton.style.borderRadius = '2px';

		this._rejectButton = dom.append(this._actionButtons, dom.$<HTMLButtonElement>('button.float-reject-btn'));
		this._rejectButton.textContent = 'Reject (Esc)';
		this._rejectButton.style.padding = '5px 10px';
		this._rejectButton.style.fontSize = '11px';
		this._rejectButton.style.cursor = 'pointer';
		this._rejectButton.style.display = 'none';
		this._rejectButton.style.backgroundColor = '#da3633';
		this._rejectButton.style.color = '#ffffff';
		this._rejectButton.style.border = 'none';
		this._rejectButton.style.borderRadius = '2px';

		// Event handlers
		const fireSubmit = () => {
			const text = this._inputElement?.value || '';
			if (text.trim()) {
				this._onSubmit.fire({ prompt: text.trim() });
			}
		};

		submitBtn.addEventListener('click', fireSubmit);
		this._acceptButton.addEventListener('click', () => this._onAccept.fire());
		this._rejectButton.addEventListener('click', () => this._onReject.fire());

		this._inputElement.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				if (e.ctrlKey || e.metaKey) {
					e.preventDefault();
					this._onAccept.fire();
				} else {
					e.preventDefault();
					fireSubmit();
				}
			} else if (e.key === 'Escape') {
				e.preventDefault();
				this._onReject.fire();
			}
		});
	}

	public setStatus(text: string, isError: boolean = false): void {
		if (this._statusElement) {
			this._statusElement.textContent = text;
			this._statusElement.style.color = isError ? 'var(--vscode-errorForeground, #f48771)' : 'var(--vscode-descriptionForeground, #888888)';
		}
	}

	public showDiffActions(): void {
		if (this._acceptButton) {
			this._acceptButton.style.display = 'inline-block';
		}
		if (this._rejectButton) {
			this._rejectButton.style.display = 'inline-block';
		}
	}

	public focus(): void {
		if (this._inputElement) {
			this._inputElement.focus();
			this._inputElement.select();
		}
	}

	public openAtRange(range: IRange): void {
		const targetRange = Range.lift(range);
		this.show(targetRange, 3);
		this.focus();
	}
}
