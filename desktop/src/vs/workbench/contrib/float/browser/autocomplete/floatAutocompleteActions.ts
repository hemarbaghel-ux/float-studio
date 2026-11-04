/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IFloatService } from '../../common/floatService.js';

let _autocompleteEnabled = true;

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

export function isFloatAutocompleteGloballyEnabled(): boolean {
	return _autocompleteEnabled;
}

export function setFloatAutocompleteGloballyEnabled(enabled: boolean): void {
	_autocompleteEnabled = enabled;
}
