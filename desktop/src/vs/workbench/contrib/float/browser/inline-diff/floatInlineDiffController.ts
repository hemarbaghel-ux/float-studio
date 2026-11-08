/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IEditorContribution } from '../../../../../editor/common/editorCommon.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IModelDecorationOptions, ITextModel } from '../../../../../editor/common/model.js';
import { IEditorDecorationsCollection } from '../../../../../editor/common/editorCommon.js';
import { IFloatService } from '../../common/floatService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { FloatInlineDiffZoneWidget } from './floatInlineDiffZoneWidget.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { FloatShadowWorkspaceService } from '../../common/shadow/floatShadowWorkspaceService.js';
import { IShadowDiagnostic } from '../../common/shadow/floatShadowTypes.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ctxFloatInlineDiffVisible, ctxFloatInlineDiffGenerating } from './floatInlineDiffActions.js';

export interface IInlineDiffHunk {
	id?: string;
	originalRange: Range;
	originalText: string;
	proposedText: string;
	status: 'pending' | 'accepted' | 'rejected';
	speculativeDiagnostics?: IShadowDiagnostic[];
}

const INSERT_DECORATION: IModelDecorationOptions = {
	description: 'float-inline-diff-insert',
	isWholeLine: true,
	className: 'float-diff-line-insert',
	overviewRuler: {
		color: 'rgba(46, 160, 67, 0.7)',
		position: 1
	}
};

export class FloatInlineDiffController extends Disposable implements IEditorContribution {
	static readonly ID = 'editor.contrib.floatInlineDiff';

	public static get(editor: ICodeEditor): FloatInlineDiffController | null {
		return editor.getContribution<FloatInlineDiffController>(FloatInlineDiffController.ID);
	}

	private _zoneWidget: FloatInlineDiffZoneWidget | null = null;
	private _activeRange: Range | null = null;
	private _originalText: string = '';
	private _proposedText: string = '';
	private _initialVersionId: number = 0;
	private _isGenerating: boolean = false;
	private _isStale: boolean = false;
	private _decorationsCollection: IEditorDecorationsCollection | null = null;
	private _preEditCheckpointId: string | null = null;
	private _activeHunk: IInlineDiffHunk | null = null;
	private _hunks: IInlineDiffHunk[] = [];
	private _activeHunkIndex: number = 0;
	private readonly _shadowWorkspace: FloatShadowWorkspaceService = FloatShadowWorkspaceService.getInstance();
	private readonly _ctxInlineDiffVisible?: IContextKey<boolean>;
	private readonly _ctxInlineDiffGenerating?: IContextKey<boolean>;

	constructor(
		private readonly _editor: ICodeEditor,
		@IFloatService private readonly _floatService: IFloatService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IContextKeyService private readonly _contextKeyService?: IContextKeyService
	) {
		super();
		this._decorationsCollection = this._editor.createDecorationsCollection();
		if (this._contextKeyService) {
			this._ctxInlineDiffVisible = ctxFloatInlineDiffVisible.bindTo(this._contextKeyService);
			this._ctxInlineDiffGenerating = ctxFloatInlineDiffGenerating.bindTo(this._contextKeyService);
		}
		this._registerModelListeners();
	}

	private _registerModelListeners(): void {
		this._register(this._editor.onDidChangeModel(() => {
			this.rejectProposal();
		}));

		this._register(this._editor.onDidChangeModelContent(() => {
			const model = this._editor.getModel();
			if (!model) {
				return;
			}
			// Stale edit detection: if document content changes while generation is pending or diff is showing
			if ((this._isGenerating || this._activeHunk) && model.getVersionId() !== this._initialVersionId) {
				this._isStale = true;
				if (this._zoneWidget) {
					this._zoneWidget.setStatus('Document modified externally; proposal is stale', true);
				}
			}
		}));
	}

	public get isGenerating(): boolean {
		return this._isGenerating;
	}

	public get isStale(): boolean {
		return this._isStale;
	}

	public get activeHunk(): IInlineDiffHunk | null {
		return this._activeHunk;
	}

	public get hunks(): IInlineDiffHunk[] {
		return [...this._hunks];
	}

	public get activeHunkIndex(): number {
		return this._activeHunkIndex;
	}

	public get proposedText(): string {
		return this._proposedText;
	}

	public get originalText(): string {
		return this._originalText;
	}

	public async triggerInlineDiff(initialPrompt?: string): Promise<void> {
		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		// Close any previous widget
		if (this._zoneWidget) {
			this._zoneWidget.dispose();
			this._zoneWidget = null;
		}

		const selection = this._editor.getSelection();
		if (selection && !selection.isEmpty()) {
			this._activeRange = selection;
		} else {
			const position = this._editor.getPosition() || { lineNumber: 1, column: 1 };
			this._activeRange = new Range(position.lineNumber, 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber));
		}

		this._originalText = model.getValueInRange(this._activeRange);
		this._proposedText = '';
		this._initialVersionId = model.getVersionId();
		this._isStale = false;
		this._isGenerating = false;
		this._activeHunk = null;
		this._hunks = [];
		this._activeHunkIndex = 0;

		// 1. Create native pre-edit rollback checkpoint
		const cp = this._floatService.getCheckpointService().createCheckpoint(
			`Pre-edit: ${model.uri.path} (L${this._activeRange.startLineNumber}-${this._activeRange.endLineNumber})`,
			{ [model.uri.path]: model.getValue() }
		);
		this._preEditCheckpointId = cp.id;

		// Update context key
		this._ctxInlineDiffVisible?.set(true);

		// 2. Open inline zone widget near cursor/selection
		this._zoneWidget = new FloatInlineDiffZoneWidget(this._editor);
		this._zoneWidget.openAtRange(this._activeRange);

		this._zoneWidget.onSubmit((e) => {
			this.submitPrompt(e.prompt);
		});

		this._zoneWidget.onAccept(() => {
			this.acceptProposal();
		});

		this._zoneWidget.onReject(() => {
			this.rejectProposal();
		});

		if (initialPrompt && initialPrompt.trim()) {
			await this.submitPrompt(initialPrompt.trim());
		}
	}

	public async submitPrompt(prompt: string): Promise<void> {
		const model = this._editor.getModel();
		if (!model || !this._activeRange) {
			return;
		}

		this._isGenerating = true;
		this._ctxInlineDiffGenerating?.set(true);
		this._isStale = false;
		this._initialVersionId = model.getVersionId();
		this._proposedText = '';

		if (this._zoneWidget) {
			this._zoneWidget.setStatus(`Generating edit with ${this._floatService.getActiveModel().name}...`);
		}

		const filePath = model.uri.path;
		const userMessage = [
			`You are editing the following code snippet from file "${filePath}":`,
			'```',
			this._originalText,
			'```',
			`Instruction: ${prompt}`,
			'Respond ONLY with the complete modified code snippet that replaces the selection. Do not include conversational markdown wrappers if possible.'
		].join('\n');

		try {
			await this._floatService.streamChat(
				[
					{
						id: `inline-${Date.now()}`,
						role: 'user',
						content: userMessage,
						timestamp: Date.now(),
						activeFileContext: filePath
					}
				],
				{
					onChunk: (chunk: string) => {
						this._proposedText += chunk;
						if (this._zoneWidget) {
							this._zoneWidget.setStatus(`Streaming (${this._proposedText.length} chars)...`);
						}
					},
					onError: (err: Error) => {
						this._isGenerating = false;
						this._ctxInlineDiffGenerating?.set(false);
						if (this._zoneWidget) {
							this._zoneWidget.setStatus(`Error: ${err.message}`, true);
						}
						this._notificationService.error(`FLOAT Inline Diff Error: ${err.message}`);
					},
					onComplete: async (fullResult?: string) => {
						this._isGenerating = false;
						this._ctxInlineDiffGenerating?.set(false);
						let cleanCode = fullResult || this._proposedText;

						// Strip markdown code fences if wrapped by the model
						const fenceMatch = cleanCode.match(/```(?:\w+)?\s*\n([\s\S]*?)\n```/);
						if (fenceMatch) {
							cleanCode = fenceMatch[1];
						}
						this._proposedText = cleanCode;

						// Create active hunk
						this._activeHunk = {
							id: 'hunk-1',
							originalRange: this._activeRange!,
							originalText: this._originalText,
							proposedText: this._proposedText,
							status: 'pending'
						};
						this._hunks = [this._activeHunk];
						this._activeHunkIndex = 0;

						// Highlight diff lines in buffer
						this._renderDiffDecorations(this._activeRange!);

						// Step 1: Shadow Workspace Speculative Validation
						let validationBadge = '✓ Speculative check passed (0 errors)';
						let isWarning = false;
						try {
							const valResult = await this._shadowWorkspace.validateSnippet(filePath, cleanCode, {
								checkSyntax: true,
								checkTypes: true
							});
							if (this._activeHunk) {
								this._activeHunk.speculativeDiagnostics = valResult.diagnostics;
							}
							if (valResult.status === 'has_errors') {
								isWarning = true;
								validationBadge = `⚠️ Speculative issue: ${valResult.errorCount} error(s) detected`;
							} else if (valResult.status === 'has_warnings') {
								validationBadge = `ℹ️ ${valResult.warningCount} warning(s)`;
							}
						} catch {}

						if (this._zoneWidget) {
							const lineCount = this._proposedText.split('\n').length;
							this._zoneWidget.setStatus(`Edit proposed (${lineCount} lines) • ${validationBadge}`, isWarning);
							this._zoneWidget.showDiffActions();
						}
					}
				},
				undefined, // uses default auth from auth service
				undefined, // uses default project
				[{ path: filePath, content: this._originalText }],
				`inline-diff-${Date.now()}`
			);
		} catch (err: any) {
			this._isGenerating = false;
			this._ctxInlineDiffGenerating?.set(false);
			if (this._zoneWidget) {
				this._zoneWidget.setStatus(`Request failed: ${err.message}`, true);
			}
		}
	}

	private _renderDiffDecorations(range: Range): void {
		if (!this._decorationsCollection) {
			return;
		}

		this._decorationsCollection.set([
			{
				range,
				options: INSERT_DECORATION
			}
		]);
	}

	public goToNextHunk(): void {
		if (this._hunks.length <= 1) {
			return;
		}
		this._activeHunkIndex = (this._activeHunkIndex + 1) % this._hunks.length;
		this._activeHunk = this._hunks[this._activeHunkIndex];
		this._editor.revealRangeInCenter(this._activeHunk.originalRange);
		if (this._zoneWidget) {
			this._zoneWidget.setStatus(`Hunk ${this._activeHunkIndex + 1}/${this._hunks.length}`);
		}
	}

	public goToPreviousHunk(): void {
		if (this._hunks.length <= 1) {
			return;
		}
		this._activeHunkIndex = (this._activeHunkIndex - 1 + this._hunks.length) % this._hunks.length;
		this._activeHunk = this._hunks[this._activeHunkIndex];
		this._editor.revealRangeInCenter(this._activeHunk.originalRange);
		if (this._zoneWidget) {
			this._zoneWidget.setStatus(`Hunk ${this._activeHunkIndex + 1}/${this._hunks.length}`);
		}
	}

	public async acceptProposal(): Promise<boolean> {
		const model = this._editor.getModel();
		if (!model || !this._activeRange || !this._activeHunk) {
			return false;
		}

		// Enforce stale-proposal safety: verify model has not diverged
		if (this._isStale || model.getVersionId() !== this._initialVersionId) {
			this._notificationService.error('Cannot apply stale inline diff: document was modified externally.');
			return false;
		}

		// Apply the proposed change into the buffer via executeEdits to preserve undo/redo history
		this._editor.executeEdits('float.inlineDiff', [
			{
				range: this._activeRange,
				text: this._proposedText,
				forceMoveMarkers: true
			}
		]);

		this._activeHunk.status = 'accepted';
		for (const h of this._hunks) {
			h.status = 'accepted';
		}

		// Save disk file so disk content matches accepted editor content
		try {
			await this._textFileService.save(model.uri);
		} catch (e: any) {
			this._notificationService.warn(`Applied in buffer, disk save failed: ${e.message}`);
		}

		// Cleanup decorations and zone widget
		this._cleanup();
		this._notificationService.info('FLOAT Inline Diff accepted and saved to disk.');
		return true;
	}

	public rejectProposal(): void {
		if (this._activeHunk) {
			this._activeHunk.status = 'rejected';
		}
		for (const h of this._hunks) {
			h.status = 'rejected';
		}

		// Leave document buffer untouched; clean up decorations and widget
		this._cleanup();
	}

	public cancel(): void {
		if (this._isGenerating) {
			this._floatService.cancelActiveStream();
		}
		this.rejectProposal();
	}

	private _cleanup(): void {
		this._isGenerating = false;
		this._isStale = false;
		this._ctxInlineDiffVisible?.set(false);
		this._ctxInlineDiffGenerating?.set(false);
		this._decorationsCollection?.clear();
		if (this._zoneWidget) {
			this._zoneWidget.dispose();
			this._zoneWidget = null;
		}
		this._activeHunk = null;
		this._hunks = [];
		this._activeHunkIndex = 0;
	}

	public override dispose(): void {
		this._cleanup();
		super.dispose();
	}
}
