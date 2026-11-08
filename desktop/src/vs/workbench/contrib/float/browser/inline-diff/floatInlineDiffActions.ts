/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { EditorAction2 } from '../../../../../editor/browser/editorExtensions.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { FloatInlineDiffController } from './floatInlineDiffController.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';

export const ctxFloatInlineDiffVisible = new RawContextKey<boolean>('floatInlineDiffVisible', false, 'Whether a FLOAT inline diff is active in the editor');
export const ctxFloatInlineDiffGenerating = new RawContextKey<boolean>('floatInlineDiffGenerating', false, 'Whether FLOAT inline diff is currently generating');

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

export class FloatInlineDiffAcceptAction extends EditorAction2 {
	static readonly ID = 'float.inlineDiff.accept';

	constructor() {
		super({
			id: FloatInlineDiffAcceptAction.ID,
			title: { value: 'FLOAT: Accept Inline Edit (Ctrl+Enter)', original: 'FLOAT: Accept Inline Edit (Ctrl+Enter)' },
			f1: true,
			precondition: ctxFloatInlineDiffVisible,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 10,
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				when: ctxFloatInlineDiffVisible
			}
		});
	}

	public override async runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const controller = FloatInlineDiffController.get(editor);
		if (controller) {
			await controller.acceptProposal();
		}
	}
}

export class FloatInlineDiffRejectAction extends EditorAction2 {
	static readonly ID = 'float.inlineDiff.reject';

	constructor() {
		super({
			id: FloatInlineDiffRejectAction.ID,
			title: { value: 'FLOAT: Reject Inline Edit (Ctrl+Backspace)', original: 'FLOAT: Reject Inline Edit (Ctrl+Backspace)' },
			f1: true,
			precondition: ctxFloatInlineDiffVisible,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 10,
				primary: KeyMod.CtrlCmd | KeyCode.Backspace,
				when: ctxFloatInlineDiffVisible
			}
		});
	}

	public override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = FloatInlineDiffController.get(editor);
		if (controller) {
			controller.rejectProposal();
		}
	}
}

export class FloatInlineDiffEscapeAction extends EditorAction2 {
	static readonly ID = 'float.inlineDiff.escape';

	constructor() {
		super({
			id: FloatInlineDiffEscapeAction.ID,
			title: { value: 'FLOAT: Dismiss Inline Edit (Escape)', original: 'FLOAT: Dismiss Inline Edit (Escape)' },
			f1: true,
			precondition: ctxFloatInlineDiffVisible,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 10,
				primary: KeyCode.Escape,
				when: ctxFloatInlineDiffVisible
			}
		});
	}

	public override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = FloatInlineDiffController.get(editor);
		if (controller) {
			controller.rejectProposal();
		}
	}
}

export class FloatInlineDiffNextHunkAction extends EditorAction2 {
	static readonly ID = 'float.inlineDiff.nextHunk';

	constructor() {
		super({
			id: FloatInlineDiffNextHunkAction.ID,
			title: { value: 'FLOAT: Next Inline Diff Hunk (Alt+Down)', original: 'FLOAT: Next Inline Diff Hunk (Alt+Down)' },
			f1: true,
			precondition: ctxFloatInlineDiffVisible,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 5,
				primary: KeyMod.Alt | KeyCode.DownArrow,
				when: ctxFloatInlineDiffVisible
			}
		});
	}

	public override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = FloatInlineDiffController.get(editor);
		if (controller) {
			controller.goToNextHunk();
		}
	}
}

export class FloatInlineDiffPrevHunkAction extends EditorAction2 {
	static readonly ID = 'float.inlineDiff.prevHunk';

	constructor() {
		super({
			id: FloatInlineDiffPrevHunkAction.ID,
			title: { value: 'FLOAT: Previous Inline Diff Hunk (Alt+Up)', original: 'FLOAT: Previous Inline Diff Hunk (Alt+Up)' },
			f1: true,
			precondition: ctxFloatInlineDiffVisible,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 5,
				primary: KeyMod.Alt | KeyCode.UpArrow,
				when: ctxFloatInlineDiffVisible
			}
		});
	}

	public override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = FloatInlineDiffController.get(editor);
		if (controller) {
			controller.goToPreviousHunk();
		}
	}
}
