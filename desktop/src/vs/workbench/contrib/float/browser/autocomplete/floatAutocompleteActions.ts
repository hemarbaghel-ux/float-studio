/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';

let _autocompleteEnabled = true;

/**
 * ContextKey managing visibility and keyboard interaction for the Cursor Tab Jump Pill.
 */
export const ctxFloatCursorJumpVisible = new RawContextKey<boolean>('floatCursorJumpVisible', false);

export class ToggleFloatAutocompleteAction extends Action2 {
	static readonly ID = 'float.autocomplete.toggle';

	constructor() {
		super({
			id: ToggleFloatAutocompleteAction.ID,
			title: { value: 'FLOAT: Toggle Predictive Autocomplete (Cursor Tab)', original: 'FLOAT: Toggle Predictive Autocomplete (Cursor Tab)' },
			f1: true,
			keybinding: {
				primary: KeyMod.Alt | KeyMod.Shift | KeyCode.KeyA,
				weight: KeybindingWeight.WorkbenchContrib
			},
			menu: {
				id: MenuId.CommandPalette
			}
		});
	}

	public run(accessor: ServicesAccessor): void {
		const notificationService = accessor.get(INotificationService);
		_autocompleteEnabled = !_autocompleteEnabled;
		notificationService.info(
			`FLOAT Predictive Autocomplete (Cursor Tab): ${_autocompleteEnabled ? 'ENABLED' : 'DISABLED'}`
		);
	}
}

/**
 * Action triggered by pressing Tab when a speculative cursor jump recommendation is active.
 */
export class FloatAcceptCursorJumpAction extends Action2 {
	static readonly ID = 'float.autocomplete.acceptJump';

	constructor() {
		super({
			id: FloatAcceptCursorJumpAction.ID,
			title: { value: 'FLOAT: Accept Cursor Tab Speculative Jump', original: 'FLOAT: Accept Cursor Tab Speculative Jump' },
			f1: true,
			precondition: ctxFloatCursorJumpVisible,
			keybinding: {
				primary: KeyCode.Tab,
				secondary: [KeyMod.Alt | KeyCode.Enter, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyJ],
				weight: KeybindingWeight.WorkbenchContrib + 100
			},
			menu: {
				id: MenuId.CommandPalette
			}
		});
	}

	public run(accessor: ServicesAccessor): void {
		const notificationService = accessor.get(INotificationService);
		notificationService.info('FLOAT: Navigating to speculated next-action edit location...');
	}
}

/**
 * Action triggering manual next-action AST speculation for the active editor cursor symbol.
 */
export class FloatTriggerNextActionSpeculationAction extends Action2 {
	static readonly ID = 'float.autocomplete.triggerSpeculation';

	constructor() {
		super({
			id: FloatTriggerNextActionSpeculationAction.ID,
			title: { value: 'FLOAT: Trigger Next-Action Speculation (Copilot++)', original: 'FLOAT: Trigger Next-Action Speculation (Copilot++)' },
			f1: true,
			keybinding: {
				primary: KeyMod.Alt | KeyCode.Slash,
				secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space],
				weight: KeybindingWeight.WorkbenchContrib
			},
			menu: {
				id: MenuId.CommandPalette
			}
		});
	}

	public run(accessor: ServicesAccessor): void {
		const notificationService = accessor.get(INotificationService);
		notificationService.info('FLOAT: Computing AST next-action speculation & call-graph blast radius...');
	}
}

export function isFloatAutocompleteGloballyEnabled(): boolean {
	return _autocompleteEnabled;
}

export function setFloatAutocompleteGloballyEnabled(enabled: boolean): void {
	_autocompleteEnabled = enabled;
}
