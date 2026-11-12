/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import {
	CodeActionProvider,
	CodeActionContext,
	CodeActionList,
	CodeAction
} from '../../../../../editor/common/languages.js';
import { IMarkerService, MarkerSeverity, IMarkerData } from '../../../../../platform/markers/common/markers.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';

export class FloatQuickFixProvider extends Disposable implements CodeActionProvider {
	public static readonly KIND_QUICKFIX = 'quickfix.float';
	public static readonly KIND_EXPLAIN = 'explain.float';
	public static readonly KIND_REFACTOR = 'refactor.float';

	readonly providedCodeActionKinds: ReadonlyArray<string> = [
		FloatQuickFixProvider.KIND_QUICKFIX,
		FloatQuickFixProvider.KIND_EXPLAIN,
		FloatQuickFixProvider.KIND_REFACTOR
	];

	constructor(
		private readonly _markerService?: IMarkerService,
		private readonly _languageFeaturesService?: ILanguageFeaturesService
	) {
		super();
		if (this._languageFeaturesService) {
			this._register(
				this._languageFeaturesService.codeActionProvider.register(
					{ scheme: '*', pattern: '**' },
					this
				)
			);
		}
	}

	public provideCodeActions(
		model: ITextModel,
		range: Range | Selection,
		context: CodeActionContext,
		token: CancellationToken
	): CodeActionList {
		const actions: CodeAction[] = [];

		if (token.isCancellationRequested) {
			return { actions: [], dispose: () => {} };
		}

		// 1. Gather diagnostics on current range
		const diagnostics = this.getDiagnosticsInRange(model, range);

		if (diagnostics.length > 0) {
			const primary = diagnostics[0];
			const messageSummary = primary.message.split('\n')[0].slice(0, 80);

			actions.push({
				title: `✨ Fix error with FLOAT Composer: "${messageSummary}"`,
				kind: FloatQuickFixProvider.KIND_QUICKFIX,
				isAI: true,
				isPreferred: true,
				diagnostics: [primary],
				command: {
					id: 'float.composer.quickfix',
					title: 'Fix with FLOAT Composer',
					arguments: [{
						uri: model.uri,
						range: {
							startLineNumber: primary.startLineNumber,
							startColumn: primary.startColumn,
							endLineNumber: primary.endLineNumber,
							endColumn: primary.endColumn
						},
						message: primary.message,
						source: primary.source
					}]
				}
			});

			actions.push({
				title: `💬 Explain with FLOAT Chat: "${messageSummary}"`,
				kind: FloatQuickFixProvider.KIND_EXPLAIN,
				isAI: true,
				isPreferred: false,
				diagnostics: [primary],
				command: {
					id: 'float.chat.explainDiagnostic',
					title: 'Explain with FLOAT Chat',
					arguments: [{
						uri: model.uri,
						diagnostic: primary
					}]
				}
			});
		}

		// 2. If range is a multi-line or significant selection, offer refactor / composer prompt
		if (!range.isEmpty()) {
			actions.push({
				title: '✨ Edit selection with FLOAT Composer (Ctrl+I)',
				kind: FloatQuickFixProvider.KIND_REFACTOR,
				isAI: true,
				isPreferred: false,
				command: {
					id: 'float.composer.openWithSelection',
					title: 'Edit selection with FLOAT Composer',
					arguments: [{
						uri: model.uri,
						range
					}]
				}
			});

			actions.push({
				title: '💬 Ask FLOAT about this code (Ctrl+L)',
				kind: FloatQuickFixProvider.KIND_EXPLAIN,
				isAI: true,
				isPreferred: false,
				command: {
					id: 'float.chat.openWithSelection',
					title: 'Ask FLOAT about this code',
					arguments: [{
						uri: model.uri,
						range
					}]
				}
			});
		}

		return {
			actions,
			dispose: () => {}
		};
	}

	private getDiagnosticsInRange(model: ITextModel, range: Range | Selection): IMarkerData[] {
		if (!this._markerService) {
			return [];
		}

		const markers = this._markerService.read({ resource: model.uri });
		const matched: IMarkerData[] = [];

		for (const marker of markers) {
			// Check if marker intersects or is on the same line as the cursor range
			const markerRange = new Range(
				marker.startLineNumber,
				marker.startColumn,
				marker.endLineNumber,
				marker.endColumn
			);

			if (Range.areIntersectingOrTouching(range, markerRange) || marker.startLineNumber === range.startLineNumber) {
				matched.push({
					severity: marker.severity,
					message: marker.message,
					startLineNumber: marker.startLineNumber,
					startColumn: marker.startColumn,
					endLineNumber: marker.endLineNumber,
					endColumn: marker.endColumn,
					source: marker.source,
					code: typeof marker.code === 'string' ? marker.code : marker.code?.value
				});
			}
		}

		// Sort by severity (Error first, then Warning)
		return matched.sort((a, b) => {
			const sevA = a.severity ?? MarkerSeverity.Info;
			const sevB = b.severity ?? MarkerSeverity.Info;
			return sevB - sevA;
		});
	}
}
