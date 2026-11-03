/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IEditorContribution } from '../../../../../editor/common/editorCommon.js';
import { IFloatService } from '../../common/floatService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';

export class FloatInlineDiffController extends Disposable implements IEditorContribution {
	static readonly ID = 'editor.contrib.floatInlineDiff';

	public static get(editor: ICodeEditor): FloatInlineDiffController | null {
		return editor.getContribution<FloatInlineDiffController>(FloatInlineDiffController.ID);
	}

	constructor(
		private readonly _editor: ICodeEditor,
		@IFloatService private readonly _floatService: IFloatService,
		@INotificationService private readonly _notificationService: INotificationService
	) {
		super();
	}

	public async triggerInlineDiff(prompt?: string): Promise<void> {
		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		const selection = this._editor.getSelection();
		const originalText = selection ? model.getValueInRange(selection) : model.getValue();

		this._notificationService.info(`FLOAT Ctrl+K inline diff activated: "${prompt || 'Reviewing selection'}"`);

		// Create pre-turn rollback checkpoint
		this._floatService.getCheckpointService().createCheckpoint(
			`Inline Edit in ${model.uri.path}`,
			{ [model.uri.path]: model.getValue() }
		);
	}
}
