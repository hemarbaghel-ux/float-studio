/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { EditorAction2 } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { FloatInlineDiffController } from './floatInlineDiffController.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';

export class FloatInlineDiffAction extends EditorAction2 {
	static readonly ID = 'float.inlineDiff.trigger';

	constructor() {
		super({
			id: FloatInlineDiffAction.ID,
			title: { value: 'FLOAT: Inline Code Edit (Ctrl+K)', original: 'FLOAT: Inline Code Edit (Ctrl+K)' },
			f1: true,
			precondition: EditorContextKeys.writable,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyK,
				when: EditorContextKeys.editorTextFocus
			}
		});
	}

	public override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = FloatInlineDiffController.get(editor);
		if (controller) {
			controller.triggerInlineDiff();
		}
	}
}
