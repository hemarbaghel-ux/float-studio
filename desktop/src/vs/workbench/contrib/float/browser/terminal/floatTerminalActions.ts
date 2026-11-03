/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';

export class FixWithFloatTerminalAction extends Action2 {
	static readonly ID = 'float.composer.openWithTerminalError';

	constructor() {
		super({
			id: FixWithFloatTerminalAction.ID,
			title: { value: 'Fix Terminal Error with FLOAT', original: 'Fix Terminal Error with FLOAT' },
			f1: true
		});
	}

	public override async run(accessor: ServicesAccessor, args?: { exitCode?: number; title?: string }): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		notificationService.info(`FLOAT AI analyzing failed terminal task (${args?.title || 'process'} - exit code ${args?.exitCode ?? 1})...`);
	}
}
