/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import * as dom from '../../../../../base/browser/dom.js';

export interface IFloatCheckpointSnapshot {
	id: string;
	sequence: number;
	timestamp: number;
	summary: string;
	filesChanged: { filePath: string; beforeContent: string; afterContent: string }[];
	isRollbackTarget?: boolean;
}

export interface IFloatSnapshotPreview {
	sequence: number;
	summary: string;
	timestamp: number;
	previewFiles: Array<{
		filePath: string;
		beforeContent: string;
		afterContent: string;
		additions: number;
		deletions: number;
	}>;
}

export class FloatSnapshotRollbackWidget implements IDisposable {
	private readonly _snapshots: IFloatCheckpointSnapshot[] = [];
	private _currentSequence: number = 0;

	public createCheckpoint(summary: string, filesChanged: { filePath: string; beforeContent: string; afterContent: string }[]): IFloatCheckpointSnapshot {
		this._currentSequence++;
		const snapshot: IFloatCheckpointSnapshot = {
			id: `chk-${this._currentSequence}-${Date.now()}`,
			sequence: this._currentSequence,
			timestamp: Date.now(),
			summary,
			filesChanged
		};

		this._snapshots.push(snapshot);
		return snapshot;
	}

	public getSnapshots(): IFloatCheckpointSnapshot[] {
		return [...this._snapshots];
	}

	public getCurrentSequence(): number {
		return this._currentSequence;
	}

	public previewSnapshot(targetSequence: number): IFloatSnapshotPreview | undefined {
		const snap = this._snapshots.find(s => s.sequence === targetSequence);
		if (!snap) return undefined;

		const previewFiles = snap.filesChanged.map(f => {
			const beforeLines = f.beforeContent ? f.beforeContent.split('\n').length : 0;
			const afterLines = f.afterContent ? f.afterContent.split('\n').length : 0;
			return {
				filePath: f.filePath,
				beforeContent: f.beforeContent,
				afterContent: f.afterContent,
				additions: Math.max(0, afterLines - beforeLines),
				deletions: Math.max(0, beforeLines - afterLines)
			};
		});

		return {
			sequence: snap.sequence,
			summary: snap.summary,
			timestamp: snap.timestamp,
			previewFiles
		};
	}

	public rollbackToSequence(targetSequence: number): { restoredFiles: Map<string, string>; rolledBackSnapshots: number } {
		const restoredFiles = new Map<string, string>();
		if (targetSequence >= this._currentSequence || targetSequence < 0) {
			return { restoredFiles, rolledBackSnapshots: 0 };
		}

		// Replay in reverse from current down to targetSequence + 1
		let count = 0;
		for (let s = this._snapshots.length - 1; s >= 0; s--) {
			const snap = this._snapshots[s];
			if (snap.sequence > targetSequence) {
				for (const f of snap.filesChanged) {
					restoredFiles.set(f.filePath, f.beforeContent);
				}
				count++;
			}
		}

		this._currentSequence = targetSequence;
		return { restoredFiles, rolledBackSnapshots: count };
	}

	public cherryPickFile(targetSequence: number, targetFilePath: string): { restoredContent?: string; success: boolean } {
		const normTarget = targetFilePath.replace(/\\/g, '/');
		for (let s = this._snapshots.length - 1; s >= 0; s--) {
			const snap = this._snapshots[s];
			if (snap.sequence === targetSequence) {
				const match = snap.filesChanged.find(f => f.filePath.replace(/\\/g, '/') === normTarget);
				if (match) {
					return { restoredContent: match.beforeContent, success: true };
				}
			}
		}
		return { success: false };
	}

	public renderTimeline(
		container: HTMLElement,
		options?: {
			onScrub?: (sequence: number) => void;
			onRollback?: (sequence: number) => void;
			onCherryPick?: (sequence: number, filePath: string) => void;
			onClose?: () => void;
		}
	): HTMLElement {
		container.textContent = '';
		container.className = 'float-snapshot-timeline-widget';
		container.style.display = 'flex';
		container.style.flexDirection = 'column';
		container.style.padding = '10px 14px';
		container.style.backgroundColor = 'var(--vscode-editorWidget-background, #1e1e1e)';
		container.style.border = '1px solid var(--vscode-editorWidget-border, #3c3c3c)';
		container.style.borderRadius = '6px';
		container.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4)';
		container.style.minWidth = '340px';
		container.style.maxWidth = '460px';

		// Header
		const header = dom.append(container, dom.$('.float-timeline-header'));
		header.style.display = 'flex';
		header.style.justifyContent = 'space-between';
		header.style.alignItems = 'center';
		header.style.marginBottom = '8px';

		const title = dom.append(header, dom.$('span.float-timeline-title'));
		title.textContent = '⏱ Snapshot Timeline (0ms Rollback)';
		title.style.fontWeight = 'bold';
		title.style.fontSize = '12px';
		title.style.color = 'var(--vscode-editorWidget-foreground, #ffffff)';

		const closeBtn = dom.append(header, dom.$<HTMLButtonElement>('button.float-close-btn'));
		closeBtn.textContent = '✕';
		closeBtn.style.background = 'none';
		closeBtn.style.border = 'none';
		closeBtn.style.color = 'var(--vscode-descriptionForeground, #888888)';
		closeBtn.style.cursor = 'pointer';
		closeBtn.style.fontSize = '12px';
		closeBtn.addEventListener('click', () => options?.onClose?.());

		if (this._snapshots.length === 0) {
			const emptyMsg = dom.append(container, dom.$('div.float-empty-timeline'));
			emptyMsg.textContent = 'No snapshots recorded yet in this workspace session.';
			emptyMsg.style.fontSize = '11px';
			emptyMsg.style.color = 'var(--vscode-descriptionForeground, #888888)';
			emptyMsg.style.padding = '12px 0';
			return container;
		}

		// Slider Scrub Row
		const scrubRow = dom.append(container, dom.$('.float-timeline-scrub-row'));
		scrubRow.style.display = 'flex';
		scrubRow.style.alignItems = 'center';
		scrubRow.style.gap = '10px';
		scrubRow.style.marginBottom = '8px';

		const slider = dom.append(scrubRow, dom.$<HTMLInputElement>('input.float-timeline-slider'));
		slider.type = 'range';
		slider.min = '1';
		slider.max = String(this._snapshots.length);
		slider.value = String(this._currentSequence || this._snapshots.length);
		slider.style.flex = '1';
		slider.style.cursor = 'pointer';

		const seqBadge = dom.append(scrubRow, dom.$('span.float-seq-badge'));
		seqBadge.textContent = `#${slider.value}/${this._snapshots.length}`;
		seqBadge.style.fontSize = '11px';
		seqBadge.style.fontWeight = 'bold';
		seqBadge.style.color = 'var(--vscode-badge-foreground, #ffffff)';
		seqBadge.style.backgroundColor = 'var(--vscode-badge-background, #007acc)';
		seqBadge.style.padding = '2px 6px';
		seqBadge.style.borderRadius = '3px';

		// Details Card
		const detailsCard = dom.append(container, dom.$('.float-timeline-details'));
		detailsCard.style.padding = '8px';
		detailsCard.style.backgroundColor = 'var(--vscode-editor-background, #141414)';
		detailsCard.style.borderRadius = '4px';
		detailsCard.style.marginBottom = '10px';

		const summaryEl = dom.append(detailsCard, dom.$('.float-timeline-summary'));
		summaryEl.style.fontSize = '12px';
		summaryEl.style.fontWeight = '500';
		summaryEl.style.color = 'var(--vscode-editorWidget-foreground, #cccccc)';

		const filesContainer = dom.append(detailsCard, dom.$('.float-timeline-files'));
		filesContainer.style.fontSize = '11px';
		filesContainer.style.marginTop = '6px';
		filesContainer.style.display = 'flex';
		filesContainer.style.flexDirection = 'column';
		filesContainer.style.gap = '4px';

		const updateDetails = (seq: number) => {
			const preview = this.previewSnapshot(seq);
			if (!preview) return;

			seqBadge.textContent = `#${seq}/${this._snapshots.length}`;
			summaryEl.textContent = `${preview.summary} (${new Date(preview.timestamp).toLocaleTimeString()})`;
			filesContainer.textContent = '';

			for (const file of preview.previewFiles) {
				const fileRow = dom.append(filesContainer, dom.$('.float-file-row'));
				fileRow.style.display = 'flex';
				fileRow.style.justifyContent = 'space-between';
				fileRow.style.alignItems = 'center';

				const fileName = dom.append(fileRow, dom.$('span.float-file-name'));
				fileName.textContent = file.filePath;
				fileName.style.color = 'var(--vscode-textLink-foreground, #3794ff)';

				const fileActions = dom.append(fileRow, dom.$('span.float-file-actions'));
				fileActions.style.display = 'flex';
				fileActions.style.alignItems = 'center';
				fileActions.style.gap = '6px';

				const diffStats = dom.append(fileActions, dom.$('span.float-diff-stats'));
				diffStats.textContent = `+${file.additions} / -${file.deletions}`;
				diffStats.style.fontSize = '10px';
				diffStats.style.color = 'var(--vscode-descriptionForeground, #888888)';

				const cherryPickBtn = dom.append(fileActions, dom.$<HTMLButtonElement>('button.float-cherry-btn'));
				cherryPickBtn.textContent = 'Cherry-pick';
				cherryPickBtn.style.fontSize = '10px';
				cherryPickBtn.style.padding = '1px 6px';
				cherryPickBtn.style.cursor = 'pointer';
				cherryPickBtn.style.backgroundColor = 'var(--vscode-button-secondaryBackground, #3a3d41)';
				cherryPickBtn.style.color = 'var(--vscode-button-secondaryForeground, #ffffff)';
				cherryPickBtn.style.border = 'none';
				cherryPickBtn.style.borderRadius = '2px';
				cherryPickBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					options?.onCherryPick?.(seq, file.filePath);
				});
			}

			options?.onScrub?.(seq);
		};

		slider.addEventListener('input', () => {
			updateDetails(Number(slider.value));
		});

		// Action Buttons
		const actionRow = dom.append(container, dom.$('.float-timeline-action-row'));
		actionRow.style.display = 'flex';
		actionRow.style.justifyContent = 'flex-end';
		actionRow.style.gap = '8px';

		const rollbackBtn = dom.append(actionRow, dom.$<HTMLButtonElement>('button.float-rollback-btn'));
		rollbackBtn.textContent = 'Rollback Workspace (Enter)';
		rollbackBtn.style.fontSize = '11px';
		rollbackBtn.style.padding = '5px 12px';
		rollbackBtn.style.cursor = 'pointer';
		rollbackBtn.style.backgroundColor = 'var(--vscode-button-background, #007acc)';
		rollbackBtn.style.color = 'var(--vscode-button-foreground, #ffffff)';
		rollbackBtn.style.border = 'none';
		rollbackBtn.style.borderRadius = '3px';
		rollbackBtn.addEventListener('click', () => {
			const seq = Number(slider.value);
			options?.onRollback?.(seq);
		});

		// Keyboard controls
		container.tabIndex = 0;
		container.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'ArrowLeft') {
				e.preventDefault();
				const current = Number(slider.value);
				if (current > 1) {
					slider.value = String(current - 1);
					updateDetails(current - 1);
				}
			} else if (e.key === 'ArrowRight') {
				e.preventDefault();
				const current = Number(slider.value);
				if (current < this._snapshots.length) {
					slider.value = String(current + 1);
					updateDetails(current + 1);
				}
			} else if (e.key === 'Enter') {
				e.preventDefault();
				options?.onRollback?.(Number(slider.value));
			} else if (e.key === 'Escape') {
				e.preventDefault();
				options?.onClose?.();
			}
		});

		updateDetails(Number(slider.value));
		return container;
	}

	public dispose(): void {
		this._snapshots.length = 0;
	}
}
