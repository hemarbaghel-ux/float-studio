/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';

export class FloatTerminalListener extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.floatTerminalListener';

	constructor(
		@ITerminalService private readonly _terminalService: ITerminalService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ICommandService private readonly _commandService: ICommandService
	) {
		super();
		this._registerEvents();
	}

	private _registerEvents(): void {
		this._register(this._terminalService.onDidDisposeInstance(instance => {
			const exitCode = instance.exitCode;
			if (typeof exitCode === 'number' && exitCode !== 0) {
				this._notificationService.prompt(
					Severity.Warning,
					`Terminal command exited with error code ${exitCode}.`,
					[
						{
							label: 'Fix with FLOAT',
							run: () => {
								this._commandService.executeCommand('float.composer.openWithTerminalError', {
									exitCode,
									title: instance.title
								});
							}
						}
					]
				);
			}
		}));
	}
}
