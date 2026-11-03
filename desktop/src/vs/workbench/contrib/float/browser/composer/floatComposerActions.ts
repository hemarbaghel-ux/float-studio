/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';

export class OpenFloatComposerAction extends Action2 {
	static readonly ID = 'float.composer.open';

	constructor() {
		super({
			id: OpenFloatComposerAction.ID,
			title: { value: 'FLOAT: Open Composer (Ctrl+I)', original: 'FLOAT: Open Composer (Ctrl+I)' },
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyI
			}
		});
	}

	public override async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		notificationService.info('FLOAT Multi-File Composer opened (Ctrl+I)');
	}
}
