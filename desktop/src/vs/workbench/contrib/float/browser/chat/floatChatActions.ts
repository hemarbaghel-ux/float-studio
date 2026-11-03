/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';

export class OpenFloatChatAction extends Action2 {
	static readonly ID = 'float.chat.open';

	constructor() {
		super({
			id: OpenFloatChatAction.ID,
			title: { value: 'FLOAT: Open AI Chat (Ctrl+L)', original: 'FLOAT: Open AI Chat (Ctrl+L)' },
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyL
			}
		});
	}

	public override async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		notificationService.info('FLOAT AI Chat Assistant opened (Ctrl+L)');
	}
}
