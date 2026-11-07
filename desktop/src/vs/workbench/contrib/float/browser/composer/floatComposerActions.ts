/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { IFloatService } from '../../common/floatService.js';
import { IFloatDaemonRuntimeService } from '../../common/daemon/floatDaemonRuntimeService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { getFloatComposerWorkspaceRoot } from './floatComposerWorkspaceRoot.js';
import { FloatComposer } from './floatComposer.js';
import { FloatFloatingComposerWidget } from './floatFloatingComposerWidget.js';
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
		const codeEditorService = accessor.get(ICodeEditorService);
		const daemonRuntimeService = accessor.get(IFloatDaemonRuntimeService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const activeEditor = codeEditorService.getFocusedCodeEditor() || codeEditorService.getActiveCodeEditor();
		const workspaceFolders = workspaceContextService.getWorkspace().folders.map(folder => folder.uri);
		const activeResource = activeEditor?.getModel()?.uri;

		let workspaceRoot = getFloatComposerWorkspaceRoot(workspaceFolders, activeResource);
		if (!activeResource && !workspaceRoot) {
			const localFolders = workspaceFolders.filter(folder => folder.scheme === 'file');
			if (localFolders.length === 1 && workspaceFolders.length === 1) {
				workspaceRoot = localFolders[0];
			} else if (localFolders.length > 0) {
				const selected = await quickInputService.pick(
					localFolders.map((folder, index) => ({
						id: String(index),
						label: folder.fsPath,
						description: 'Local workspace folder'
					})),
					{ placeHolder: 'Select the local workspace folder for FLOAT Composer:' }
				);
				if (selected) {
					workspaceRoot = localFolders[Number(selected.id)];
				}
			}
		}

		if (!workspaceRoot) {
			notificationService.warn(
				'FLOAT Composer requires a local workspace folder. Open a local file inside the project or select one folder; remote and virtual workspace editing is not supported by the local command sandbox yet.'
			);
			return;
		}

		const composer = new FloatComposer(
			floatService,
			notificationService,
			textFileService,
			undefined,
			undefined,
			workspaceRoot.fsPath,
			daemonRuntimeService,
			workspaceContextService
		);

		// If an active code editor exists, present the sleek floating Composer widget overlay (Cursor style)
		if (activeEditor) {
			let widget = (activeEditor as any)._floatFloatingComposerWidget as FloatFloatingComposerWidget | undefined;
			if (!widget) {
				widget = new FloatFloatingComposerWidget(activeEditor, floatService.getActiveModel().name);
				(activeEditor as any)._floatFloatingComposerWidget = widget;

				widget.onSubmit(async e => {
					if (e.mode === 'agent') {
						widget!.setStatus('Agent executing tools and verifying with shadow daemon...');
						const execution = await composer.executeAutonomousGoal({
							prompt: e.prompt,
							activeFilePath: activeEditor.getModel()?.uri.path
						}, step => {
							if (step.toolCall) {
								widget!.setStatus(`Tool: ${step.toolCall.name}...`);
							}
						});

						if (execution.validationResult) {
							widget!.setShadowValidation(
								execution.validationResult.status === 'clean',
								execution.validationResult.errorCount,
								execution.validationResult.warningCount
							);
						}

						if (execution.proposal && execution.proposal.files.length > 0) {
							widget!.setProposalReady(
								execution.proposal.files.length,
								execution.proposal.stats.totalAdditions,
								execution.proposal.stats.totalDeletions
							);
						} else {
							widget!.setStatus(execution.status === 'completed' ? 'Agent finished: no file changes needed.' : `Agent error: ${execution.error || 'Failed'}`);
						}
					} else {
						widget!.setStatus('Generating multi-file proposal...');
						const proposal = await composer.generateComposerProposal(e.prompt, activeEditor.getModel()?.uri.path);
						if (proposal && proposal.files.length > 0) {
							const additions = proposal.files.reduce((sum, f) => sum + (f.diff.match(/^\+[^+]/gm) || []).length, 0);
							const deletions = proposal.files.reduce((sum, f) => sum + (f.diff.match(/^-[^-]/gm) || []).length, 0);
							widget!.setProposalReady(proposal.files.length, additions, deletions);
						} else {
							widget!.setStatus('Completed: No code edits proposed.');
						}
					}
				});

				widget.onAccept(async () => {
					if (composer.activeMultiFileProposal) {
						await composer.orchestrator.acceptAll(composer.activeMultiFileProposal.id, async (p, content) => {
							await composer.acceptFile(composer.activeMultiFileProposal!.id, p);
						});
						notificationService.info(`FLOAT Composer: Changes accepted and saved to disk.`);
					} else if (composer.activeProposal) {
						await composer.applyProposal(composer.activeProposal.id);
					}
				});

				widget.onReject(() => {
					if (composer.activeMultiFileProposal) {
						composer.orchestrator.rejectAll(composer.activeMultiFileProposal.id);
					} else if (composer.activeProposal) {
						composer.rejectProposal(composer.activeProposal.id);
					}
					notificationService.info('FLOAT Composer: Proposal rejected.');
				});
			}

			if (widget.isVisible) {
				widget.hide();
			} else {
				widget.resetState();
				widget.show();
			}
			return;
		}

		// Fallback for when no active editor is open (e.g. from terminal or empty workspace)
		const modeChoice = await quickInputService.pick([
			{ id: 'agent', label: '$(sparkle) Autonomous Agent Mode', description: 'Agent executes tools, runs tests, reads/edits files until goal is met' },
			{ id: 'fast', label: '$(diff) Quick Multi-File Edit', description: 'Single-turn multi-file code generation and diff preview' }
		], {
			placeHolder: 'Select FLOAT Composer operating mode:'
		});

		if (!modeChoice) {
			return;
		}

		const prompt = await quickInputService.input({
			prompt: `FLOAT Composer [${modeChoice.id === 'agent' ? 'Autonomous Agent' : 'Multi-File Edit'}] (${floatService.getActiveModel().name})`,
			placeHolder: 'Describe your multi-file feature, refactor, or test repair...'
		});

		if (!prompt || !prompt.trim()) {
			return;
		}

		if (modeChoice.id === 'agent') {
			notificationService.info(`FLOAT Autonomous Composer running: "${prompt.trim()}"...`);
			const execution = await composer.executeAutonomousGoal({
				prompt: prompt.trim()
			}, step => {
				if (step.toolCall) {
					notificationService.info(`Agent executing tool: ${step.toolCall.name}...`);
				}
			});

			if (execution.proposal && execution.proposal.files.length > 0) {
				const prop = execution.proposal;
				const actionChoice = await quickInputService.pick([
					{ id: 'applyAll', label: `$(check) Accept All Changes (${prop.files.length} files)`, description: `+${prop.stats.totalAdditions} / -${prop.stats.totalDeletions} lines across workspace` },
					{ id: 'inspect', label: '$(eye) Inspect Individual Files', description: 'Review and accept/reject files individually' },
					{ id: 'rejectAll', label: '$(x) Reject All Changes', description: 'Discard all staged edits' },
					{ id: 'rollback', label: '$(history) Rollback Turn Checkpoint', description: 'Atomically restore workspace to pre-turn baseline' }
				], {
					placeHolder: `Autonomous Agent completed: ${prop.files.length} files modified. Select action:`
				});

				if (actionChoice?.id === 'applyAll') {
					await composer.orchestrator.acceptAll(prop.id, async (p, content) => {
						await composer.acceptFile(prop.id, p);
					});
					notificationService.info(`FLOAT Composer: All ${prop.files.length} files accepted and written to disk.`);
				} else if (actionChoice?.id === 'rejectAll') {
					composer.orchestrator.rejectAll(prop.id);
					notificationService.info('FLOAT Composer: All proposals rejected.');
				} else if (actionChoice?.id === 'rollback' && execution.checkpointId) {
					await composer.rollbackTurn(execution.checkpointId);
				}
			} else {
				notificationService.info('FLOAT Autonomous Agent finished execution. No files were modified.');
			}
		} else {
			// Fast mode
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
					await composer.applyProposal(proposal.id);
				} else if (choice?.id === 'reject') {
					composer.rejectProposal(proposal.id);
				}
			} else {
				notificationService.info('FLOAT Composer did not detect any code blocks in the model response.');
			}
		}
	}
}

export class RollbackFloatComposerTurnAction extends Action2 {
	static readonly ID = 'float.composer.rollbackTurn';

	constructor() {
		super({
			id: RollbackFloatComposerTurnAction.ID,
			title: { value: 'FLOAT: Rollback Last Composer Turn', original: 'FLOAT: Rollback Last Composer Turn' },
			f1: true
		});
	}

	public override async run(accessor: ServicesAccessor): Promise<void> {
		const floatService = accessor.get(IFloatService);
		const notificationService = accessor.get(INotificationService);

		const checkpoints = floatService.getCheckpointService().listCheckpoints();
		if (checkpoints.length === 0) {
			notificationService.info('No turn checkpoints available for rollback.');
			return;
		}

		const latest = checkpoints[checkpoints.length - 1];
		const result = await floatService.getCheckpointService().restoreCheckpoint(latest.id);
		if (result.success) {
			notificationService.info(`Successfully rolled back to checkpoint: ${latest.description} (${latest.id})`);
		} else {
			notificationService.error(`Rollback failed: ${result.error}`);
		}
	}
}

registerAction2(OpenFloatComposerAction);
registerAction2(RollbackFloatComposerTurnAction);
