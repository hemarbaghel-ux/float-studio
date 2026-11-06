/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IFloatService } from '../../common/floatService.js';
import { FloatContextProvider } from '../context/floatContextProvider.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import * as path from 'node:path';
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
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);
		const floatService = accessor.get(IFloatService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);

		const prompt = await quickInputService.input({
			prompt: `FLOAT Chat (${floatService.getActiveModel().name}): Ask about your codebase`,
			placeHolder: 'e.g. Where is authentication token verification implemented?'
		});

		if (!prompt || !prompt.trim()) {
			return;
		}

		const contextItems: Array<{ path: string; content: string }> = [];
		if (/@codebase\b|@symbol\b/i.test(prompt)) {
			const workspaceFolder = workspaceContextService.getWorkspace().folders[0];
			if (workspaceFolder) {
				try {
					const indexer = floatService.getWorkspaceIndexer();
					const metadataPath = path.join(workspaceFolder.uri.fsPath, '.float', 'index-meta.json');
					await indexer.loadIndexMetadata(metadataPath);
					await indexer.discoverAndIndexWorkspace(workspaceFolder.uri.fsPath);
					const resolved = new FloatContextProvider(floatService).resolveContext(prompt);
					contextItems.push(...resolved.files.map(file => ({ path: file.path, content: file.excerpt })));
					await indexer.saveIndexMetadata(metadataPath);
				} catch (error) {
					notificationService.warn(`[FLOAT Chat] Codebase context unavailable: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		}

		notificationService.info(`[FLOAT Chat] Requesting answer using ${floatService.getActiveModel().name}...`);
		let accumulatedText = '';

		await floatService.streamChat(
			[{
				id: `msg-${Date.now()}`,
				role: 'user',
				content: prompt.trim(),
				timestamp: Date.now()
			}],
			{
				onChunk: delta => { accumulatedText += delta; },
				onError: err => { notificationService.error(`[FLOAT Chat] Error: ${err.message}`); },
				onComplete: (fullText) => {
					const result = fullText || accumulatedText;
					notificationService.prompt(
						Severity.Info,
						`FLOAT Chat (${floatService.getActiveModel().name}): ${result.slice(0, 160)}${result.length > 160 ? '...' : ''}`,
						[
							{
								label: 'Dismiss',
								run: () => {}
							}
						]
					);
				}
			},
			undefined,
			undefined,
			contextItems
		);
	}
}
