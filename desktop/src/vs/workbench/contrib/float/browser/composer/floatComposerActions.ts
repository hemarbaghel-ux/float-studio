/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { IFloatService } from '../../common/floatService.js';
import { FloatComposer } from './floatComposer.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';

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
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);
		const floatService = accessor.get(IFloatService);
		const textFileService = accessor.get(ITextFileService);

		const composer = new FloatComposer(floatService, notificationService, textFileService);

		const prompt = await quickInputService.input({
			prompt: `FLOAT Composer (${floatService.getActiveModel().name}): Describe multi-file feature or fix`,
			placeHolder: 'e.g. Add rate limiting middleware to express server and update test assertions'
		});

		if (!prompt || !prompt.trim()) {
			return;
		}

		notificationService.info(`FLOAT Composer generating proposal with ${floatService.getActiveModel().name}...`);
		const proposal = await composer.generateComposerProposal(prompt.trim());

		if (proposal && proposal.files.length > 0) {
			const choice = await quickInputService.pick([
				{ id: 'apply', label: `$(check) Apply Proposal (${proposal.files.length} files modified)`, description: proposal.summary },
				{ id: 'reject', label: '$(x) Reject Proposal', description: 'Discard all proposed file changes' }
			], {
				placeHolder: `Proposal generated: ${proposal.files.length} file changes. Select action:`
			});

			if (choice?.id === 'apply') {
				const success = await composer.applyProposal(proposal.id);
				if (success) {
					notificationService.info(`Applied FLOAT Composer proposal: ${proposal.summary}`);
				}
			} else {
				await composer.rejectProposal(proposal.id);
				notificationService.info('FLOAT Composer proposal discarded.');
			}
		} else {
			notificationService.warn('No structured multi-file proposal returned by model.');
		}
	}
}
