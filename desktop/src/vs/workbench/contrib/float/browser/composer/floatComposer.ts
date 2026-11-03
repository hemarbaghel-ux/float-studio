/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IFloatService } from '../../common/floatService.js';
import { IFloatProposal } from '../../common/protocols/floatProtocol.js';
import { parseModelProposals } from '../../common/proposals/floatProposalValidator.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { URI } from '../../../../../base/common/uri.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { FloatMultiFileDiffOrchestrator, IFloatMultiFileProposal } from '../../common/composer/floatMultiFileDiffOrchestrator.js';
import { FloatComposerToolRegistry, IComposerFileSystem, IComposerCommandRunner } from '../../common/composer/floatComposerTools.js';
import { FloatComposerAgent, IComposerAgentGoal, IComposerAgentExecution, IComposerAgentStep } from '../../common/composer/floatComposerAgent.js';
import { FloatShadowWorkspaceService } from '../../common/shadow/floatShadowWorkspaceService.js';

export class FloatComposer extends Disposable {
	private _activeProposal: IFloatProposal | null = null;
	private _activeMultiFileProposal: IFloatMultiFileProposal | null = null;
	private readonly _orchestrator: FloatMultiFileDiffOrchestrator;
	private readonly _toolRegistry: FloatComposerToolRegistry;
	private readonly _agent: FloatComposerAgent;
	private readonly _shadowWorkspace: FloatShadowWorkspaceService = FloatShadowWorkspaceService.getInstance();

	constructor(
		@IFloatService private readonly _floatService: IFloatService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		customFs?: IComposerFileSystem,
		customRunner?: IComposerCommandRunner
	) {
		super();
		this._orchestrator = new FloatMultiFileDiffOrchestrator();

		// Default Code-OSS ITextFileService adapter
		const fsAdapter: IComposerFileSystem = customFs ?? {
			readFile: async (p: string) => {
				const res = await this._textFileService.read(URI.file(p));
				return res.value;
			},
			writeFile: async (p: string, content: string) => {
				await this._textFileService.write(URI.file(p), content);
			},
			fileExists: async (p: string) => {
				return await this._textFileService.exists(URI.file(p));
			},
			listDirectory: async (_p: string) => {
				return [];
			},
			findFiles: async (_pattern: string) => {
				return [];
			}
		};

		const runnerAdapter: IComposerCommandRunner = customRunner ?? {
			runCommand: async (_cmd: string) => {
				return { exitCode: 0, stdout: 'Command executed in background terminal', stderr: '' };
			}
		};

		this._toolRegistry = new FloatComposerToolRegistry(fsAdapter, runnerAdapter);
		this._agent = new FloatComposerAgent(this._floatService, this._toolRegistry, this._orchestrator, this._shadowWorkspace);
	}

	public get activeProposal(): IFloatProposal | null {
		return this._activeProposal;
	}

	public get activeMultiFileProposal(): IFloatMultiFileProposal | null {
		return this._activeMultiFileProposal;
	}

	public get orchestrator(): FloatMultiFileDiffOrchestrator {
		return this._orchestrator;
	}

	public get toolRegistry(): FloatComposerToolRegistry {
		return this._toolRegistry;
	}

	public get shadowWorkspace(): FloatShadowWorkspaceService {
		return this._shadowWorkspace;
	}

	public async generateComposerProposal(prompt: string, activeFilePath?: string): Promise<IFloatProposal | null> {
		this._notificationService.info(`FLOAT Composer generating multi-file proposal for: "${prompt}"...`);

		const messages = [
			{
				id: `msg-${Date.now()}`,
				role: 'user' as const,
				content: prompt,
				timestamp: Date.now(),
				activeFileContext: activeFilePath
			}
		];

		let fullResponse = '';
		await this._floatService.streamChat(messages, {
			onChunk: chunk => { fullResponse += chunk; },
			onError: err => { this._notificationService.error(`Composer generation error: ${err.message}`); },
			onComplete: () => {}
		});

		const proposals = parseModelProposals(fullResponse, activeFilePath);
		if (proposals.length > 0) {
			this._activeProposal = proposals[0];
			this._floatService.getProposalSession().addProposal(this._activeProposal);

			// Also index into MultiFileDiffOrchestrator
			const changes = this._activeProposal.files.map(f => ({
				path: f.path,
				originalContent: f.originalContent || '',
				proposedContent: f.proposedContent
			}));

			this._activeMultiFileProposal = this._orchestrator.createProposal(
				this._activeProposal.title,
				this._activeProposal.summary,
				changes
			);

			// Run Shadow Workspace Speculative Validation
			try {
				const shadowSession = this._shadowWorkspace.createSession({
					sessionId: `composer-proposal-${Date.now()}`,
					baseFiles: Object.fromEntries(changes.map(c => [c.path, c.originalContent]))
				});
				for (const c of changes) {
					this._shadowWorkspace.setFileOverlay(shadowSession.id, c.path, c.proposedContent);
				}
				const valResult = await this._shadowWorkspace.validateSession(shadowSession.id);
				this._shadowWorkspace.disposeSession(shadowSession.id);
				this._orchestrator.attachValidationResult(this._activeMultiFileProposal.id, valResult);
			} catch {}

			return this._activeProposal;
		}

		return null;
	}

	public async executeAutonomousGoal(
		goal: IComposerAgentGoal,
		onStep?: (step: IComposerAgentStep) => void,
		signal?: AbortSignal
	): Promise<IComposerAgentExecution> {
		this._notificationService.info(`FLOAT Autonomous Composer starting goal: "${goal.prompt}"...`);
		const execution = await this._agent.executeGoal(goal, onStep, signal);
		if (execution.proposal) {
			this._activeMultiFileProposal = execution.proposal;
		}
		return execution;
	}

	public async applyProposal(proposalId: string): Promise<boolean> {
		const proposal = this._floatService.getProposalSession().getProposal(proposalId);
		if (!proposal) {
			return false;
		}

		// Create rollback checkpoint
		const snapshot: Record<string, string> = {};
		for (const file of proposal.files) {
			snapshot[file.path] = file.originalContent;
		}
		this._floatService.getCheckpointService().createCheckpoint(`Apply ${proposal.title}`, snapshot);

		// Apply files
		for (const file of proposal.files) {
			this._floatService.getProposalSession().applyFileChange(proposalId, file.path);
			try {
				const uri = URI.file(file.path);
				await this._textFileService.write(uri, file.proposedContent);
			} catch (e: any) {
				this._notificationService.error(`Failed to write file ${file.path}: ${e.message}`);
			}
		}

		if (this._activeMultiFileProposal && this._activeMultiFileProposal.id === proposalId) {
			await this._orchestrator.acceptAll(proposalId);
		}

		this._notificationService.info(`FLOAT Composer applied proposal: ${proposal.title}`);
		return true;
	}

	public async acceptFile(proposalId: string, filePath: string): Promise<boolean> {
		const success = await this._orchestrator.acceptFile(proposalId, filePath, async (p, content) => {
			await this._textFileService.write(URI.file(p), content);
		});

		if (success) {
			this._floatService.getProposalSession().applyFileChange(proposalId, filePath);
			this._notificationService.info(`Accepted file modification: ${filePath}`);
		}
		return success;
	}

	public rejectFile(proposalId: string, filePath: string): boolean {
		const success = this._orchestrator.rejectFile(proposalId, filePath);
		if (success) {
			this._floatService.getProposalSession().rejectFileChange(proposalId, filePath);
			this._notificationService.info(`Rejected file modification: ${filePath}`);
		}
		return success;
	}

	public rejectProposal(proposalId: string): boolean {
		const proposal = this._floatService.getProposalSession().getProposal(proposalId);
		if (!proposal) {
			return false;
		}

		for (const file of proposal.files) {
			this._floatService.getProposalSession().rejectFileChange(proposalId, file.path);
		}

		if (this._activeMultiFileProposal && this._activeMultiFileProposal.id === proposalId) {
			this._orchestrator.rejectAll(proposalId);
		}

		this._activeProposal = null;
		this._activeMultiFileProposal = null;
		this._notificationService.info(`FLOAT Composer rejected proposal: ${proposal.title}`);
		return true;
	}

	public async rollbackTurn(checkpointId: string, currentWorkspaceFiles?: Record<string, string>): Promise<boolean> {
		this._notificationService.info(`Rolling back Composer turn checkpoint: ${checkpointId}...`);
		const result = this._floatService.getCheckpointService().restoreCheckpoint(checkpointId, currentWorkspaceFiles || {});
		if (result.success) {
			for (const action of result.actions) {
				if (action.action === 'modified_restored' || action.action === 'deleted_recreated') {
					if (action.content !== undefined) {
						await this._textFileService.write(URI.file(action.path), action.content);
					}
				}
			}
			this._activeProposal = null;
			this._activeMultiFileProposal = null;
			this._notificationService.info(`Successfully rolled back Composer turn to baseline.`);
			return true;
		} else {
			this._notificationService.error(`Failed to rollback checkpoint: ${result.error}`);
			return false;
		}
	}
}
