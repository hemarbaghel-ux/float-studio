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
import { FloatComposerToolRegistry, IComposerFileSystem, IComposerCommandRunner, IFloatCommandApprovalHandler } from '../../common/composer/floatComposerTools.js';
import { FloatComposerAgent, IComposerAgentGoal, IComposerAgentExecution, IComposerAgentStep } from '../../common/composer/floatComposerAgent.js';
import { FloatShadowWorkspaceService } from '../../common/shadow/floatShadowWorkspaceService.js';
import { ProductionComposerFileSystem, ProductionComposerCommandRunner } from '../../common/composer/floatProductionAdapters.js';
import { IFloatDaemonRuntimeService } from '../../common/daemon/floatDaemonRuntimeService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { FloatDaemonContextResolver } from '../context/floatDaemonContextResolver.js';

export class FloatComposer extends Disposable {
	private _activeProposal: IFloatProposal | null = null;
	private _activeMultiFileProposal: IFloatMultiFileProposal | null = null;
	private readonly _orchestrator: FloatMultiFileDiffOrchestrator;
	private readonly _toolRegistry: FloatComposerToolRegistry;
	private readonly _agent: FloatComposerAgent;
	private readonly _shadowWorkspace: FloatShadowWorkspaceService = FloatShadowWorkspaceService.getInstance();
	private readonly _contextResolver: FloatDaemonContextResolver;

	constructor(
		@IFloatService private readonly _floatService: IFloatService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		customFs?: IComposerFileSystem,
		customRunner?: IComposerCommandRunner,
		workspaceRoot?: string,
		private readonly _daemonRuntimeService?: IFloatDaemonRuntimeService,
		workspaceContextService?: IWorkspaceContextService,
		commandApprovalHandler?: IFloatCommandApprovalHandler
	) {
		super();
		this._orchestrator = new FloatMultiFileDiffOrchestrator();
		this._contextResolver = new FloatDaemonContextResolver(this._floatService, this._daemonRuntimeService, workspaceContextService);

		const rootDir = workspaceRoot || (typeof process !== 'undefined' && process.cwd ? process.cwd() : '.');

		// Production file system adapter backed by real filesystem with safety guards
		const fsAdapter: IComposerFileSystem = customFs ?? new ProductionComposerFileSystem(rootDir);

		// Production command runner backed by real process execution with safety policy
		const runnerAdapter: IComposerCommandRunner = customRunner ?? new ProductionComposerCommandRunner(rootDir, 30000, commandApprovalHandler);

		// Semantic code searcher bridging workspace indexer to composer tools
		const codeSearcher = async (query: string): Promise<string> => {
			const daemonClient = this._daemonRuntimeService?.getClient();
			if (daemonClient) {
				try {
					const result = await daemonClient.searchSemantics(query, 5) as {
						matches?: Array<{ filePath?: string; startLine?: number; endLine?: number; snippet?: string }>;
					};
					const matches = result.matches?.filter(match => typeof match.filePath === 'string' && typeof match.snippet === 'string') ?? [];
					if (matches.length > 0) {
						return matches.map(match =>
							`File: ${match.filePath} (lines ${match.startLine ?? 1}-${match.endLine ?? match.startLine ?? 1})\n${match.snippet}`
						).join('\n\n---\n\n');
					}
				} catch {
					// Fall back to local search if the daemon is restarting or unavailable.
				}
			}

			const indexer = this._floatService.getWorkspaceIndexer();
			const ranked = indexer.searchCodebase(query, 5);
			if (ranked.length > 0) {
				return ranked.map(r => `File: ${r.chunk.filePath} (lines ${r.chunk.startLine}-${r.chunk.endLine})\n${r.chunk.content}`).join('\n\n---\n\n');
			}
			const files = await fsAdapter.findFiles(query);
			return files.length > 0 ? files.join('\n') : 'No matching files or symbols found.';
		};

		this._toolRegistry = new FloatComposerToolRegistry(fsAdapter, runnerAdapter, codeSearcher);
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

		const resolvedContext = await this._contextResolver.resolveContext(prompt, activeFilePath);
		const contextItems = resolvedContext.files.map(file => ({ path: file.path, content: file.excerpt }));

		let fullResponse = '';
		await this._floatService.streamChat(messages, {
			onChunk: chunk => { fullResponse += chunk; },
			onError: err => { this._notificationService.error(`Composer generation error: ${err.message}`); },
			onComplete: () => {}
		}, undefined, undefined, contextItems, `composer-proposal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);

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
				this._activeProposal.summary || this._activeProposal.explanation,
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

	private _activeRemoteProposal: { proposalId: string; projectId: string; approvedPaths: string[]; pathByRelative: Map<string, string> } | null = null;

	private _workspaceFileUri(filePath: string): URI {
		const isAbsolute = filePath.startsWith('/') ||
			(filePath.length > 2 && filePath[1] === ':' && (filePath[2] === '\\' || filePath[2] === '/'));
		if (isAbsolute) return URI.file(filePath);
		const workspaceRoot = (this._toolRegistry.fileSystem as any).workspaceRoot || process.cwd();
		const normalized = filePath.split(String.fromCharCode(92)).join('/');
		const segments = normalized.split('/').filter(Boolean);
		return URI.joinPath(URI.file(workspaceRoot), ...segments);
	}

	private _remoteComposerBaseUrl(): string {
		const endpoint = this._floatService.getModelClient().getEndpoint();
		const base = endpoint.replace(/\/api\/ai\/chat\/?$/, '');
		if (!base || base === endpoint) {
			throw new Error('FLOAT Composer API endpoint is not configured. Expected an endpoint ending in /api/ai/chat.');
		}
		return base;
	}

	private async _collectWorkspaceSnapshot(): Promise<Array<{ path: string; content: string }>> {
		const fsAdapter = this._toolRegistry.fileSystem;
		const entries = await fsAdapter.listDirectory('.', true);
		if (entries.length > 4000) {
			throw new Error('Workspace contains too many entries for one Composer request. Exclude generated folders and retry.');
		}

		const snapshot: Array<{ path: string; content: string }> = [];
		let totalBytes = 0;
		for (const rawPath of entries) {
			const filePath = rawPath.replace(/\\/g, '/').replace(/^\.\//, '');
			if (!filePath || filePath === '.') continue;

			let content: string;
			try {
				content = await fsAdapter.readFile(filePath);
			} catch (error: any) {
				// listDirectory intentionally includes directory entries. readFile on
				// those entries returns EISDIR; every other read failure is material.
				if (error?.code === 'EISDIR' || error?.code === 'ENOENT') continue;
				throw new Error(`Could not read workspace file "${filePath}": ${error?.message || String(error)}`);
			}

			if (content.includes(String.fromCharCode(0))) continue; // binary data is not sent as text context
			const bytes = new TextEncoder().encode(content).byteLength;
			if (bytes > 500 * 1024) {
				throw new Error(`Workspace file "${filePath}" exceeds the 500 KB Composer context limit.`);
			}
			totalBytes += bytes;
			if (totalBytes > 10 * 1024 * 1024) {
				throw new Error('Workspace text exceeds the 10 MB Composer context limit. Exclude large files and retry.');
			}
			snapshot.push({ path: filePath, content });
			if (snapshot.length > 500) {
				throw new Error('Workspace contains more than 500 text files. Exclude generated folders and retry.');
			}
		}

		if (snapshot.length === 0) {
			throw new Error('No readable text files were found in the local workspace.');
		}
		return snapshot;
	}

	private async _finalizeRemoteProposal(proposalId: string): Promise<boolean> {
		const remote = this._activeRemoteProposal;
		if (!remote || remote.proposalId !== proposalId) return true;

		const localProposal = this._orchestrator.getProposal(proposalId);
		if (!localProposal) return false;
		const acceptedPaths = localProposal.files
			.filter(file => file.status === 'accepted')
			.map(file => {
				for (const [relative, absolute] of remote.pathByRelative.entries()) {
					if (absolute === file.path) return relative;
				}
				return undefined;
			})
			.filter((value): value is string => typeof value === 'string');

		if (acceptedPaths.length === 0) return true;

		try {
			const token = this._floatService.getAuthService().getAuthToken();
			if (!token) throw new Error('Your FLOAT session expired before the proposal could sync to cloud storage.');
			const workspaceFiles = await this._collectWorkspaceSnapshot();
			const response = await fetch(
				`${this._remoteComposerBaseUrl()}/api/projects/${encodeURIComponent(remote.projectId)}/proposals/${encodeURIComponent(remote.proposalId)}/apply`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${token}`
					},
					body: JSON.stringify({ approvedPaths: acceptedPaths, workspaceFiles })
				}
			);
			if (!response.ok) {
				const body = await response.json().catch(() => ({}));
				throw new Error(body?.error || `Cloud proposal sync failed (HTTP ${response.status}).`);
			}
			this._activeRemoteProposal = null;
			this._notificationService.info('FLOAT Composer: approved changes and proposal state are synced to your cloud project.');
			return true;
		} catch (error: any) {
			this._notificationService.error(
				`Changes are saved locally, but cloud proposal sync did not complete: ${error?.message || String(error)}. The cloud proposal remains pending review.`
			);
			return false;
		}
	}

	public async executeAutonomousGoal(
		goal: IComposerAgentGoal,
		onStep?: (step: IComposerAgentStep) => void,
		signal?: AbortSignal
	): Promise<IComposerAgentExecution> {
		this._notificationService.info('FLOAT Composer: preparing a bounded local workspace snapshot for the server-side agent...');
		const goalWithIsolation: IComposerAgentGoal = { ...goal, isolateWorkspaceMutations: true };
		const projectId = this._floatService.getAuthService().getActiveProjectId();
		const token = this._floatService.getAuthService().getAuthToken();

		if (!this._floatService.getAuthService().isAuthenticated() || !token) {
			throw new Error('Sign in to FLOAT before using server-side Composer Agent mode.');
		}
		if (!projectId || projectId === 'default-project') {
			throw new Error('Save this workspace as a FLOAT cloud project and select it before using Composer Agent mode.');
		}

		const workspaceFiles = await this._collectWorkspaceSnapshot();
		const controller = new AbortController();
		const abortFromCaller = () => controller.abort();
		if (signal?.aborted) controller.abort();
		else signal?.addEventListener('abort', abortFromCaller, { once: true });

		const baseUrl = this._remoteComposerBaseUrl();
		const response = await fetch(
			`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/composer/run`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'text/event-stream',
					'Authorization': `Bearer ${token}`
				},
				body: JSON.stringify({
					prompt: goal.prompt,
					mode: 'agent',
					model: this._floatService.getActiveModel().id,
					maxIterations: goal.maxSteps,
					workspaceFiles
				}),
				signal: controller.signal
			}
		);

		if (!response.ok) {
			const body = await response.json().catch(() => ({}));
			throw new Error(body?.error || `Composer API request failed (HTTP ${response.status}).`);
		}
		if (!response.body) throw new Error('Composer API did not return an event stream.');

		let streamBuffer = '';
		let remoteExecution: any = null;
		const streamedStepKeys = new Set<string>();
		const decoder = new TextDecoder();
		const processFrame = (frame: string) => {
			const data = frame.split(/\r?\n/)
				.filter(line => line.startsWith('data:'))
				.map(line => line.slice(5).trimStart())
				.join('\n');
			if (!data) return;
			let payload: any;
			try { payload = JSON.parse(data); } catch { return; }
			if (payload?.execution) remoteExecution = payload.execution;
			if (payload?.type === 'tool_result') {
				streamedStepKeys.add(`${payload.iteration || 0}:${payload.toolName || 'unknown'}`);
				const step: IComposerAgentStep = {
					stepIndex: payload.iteration || 0,
					thought: payload.result?.summary || payload.result?.error || `Executed ${payload.toolName || 'tool'}`,
					toolCall: {
						id: `remote-${payload.iteration || 0}-${payload.toolName || 'tool'}`,
						name: payload.toolName || 'unknown',
						parameters: {}
					},
					toolResult: {
						callId: `remote-${payload.iteration || 0}-${payload.toolName || 'tool'}`,
						toolName: payload.toolName || 'unknown',
						success: payload.result?.success === true,
						output: payload.result?.summary || '',
						error: payload.result?.error
					},
					timestamp: Date.now()
				};
				onStep?.(step);
			}
		};

		const reader = response.body.getReader();
		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				streamBuffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
				let boundary = streamBuffer.indexOf('\n\n');
				while (boundary >= 0) {
					processFrame(streamBuffer.slice(0, boundary));
					streamBuffer = streamBuffer.slice(boundary + 2);
					boundary = streamBuffer.indexOf('\n\n');
				}
			}
			streamBuffer += decoder.decode();
			if (streamBuffer.trim()) processFrame(streamBuffer);
		} finally {
			reader.releaseLock();
			signal?.removeEventListener('abort', abortFromCaller);
		}

		if (!remoteExecution) {
			if (controller.signal.aborted) {
				return { id: 'cancelled', goal: goalWithIsolation, steps: [], status: 'cancelled', error: 'Composer task was cancelled.' };
			}
			throw new Error('Composer event stream ended without a final execution result.');
		}

		const steps: IComposerAgentStep[] = (remoteExecution.steps || []).map((step: any) => ({
			stepIndex: step.iteration || 0,
			thought: step.summary || '',
			toolCall: {
				id: step.toolCallId || '',
				name: step.toolName || 'unknown',
				parameters: {}
			},
			toolResult: {
				callId: step.toolCallId || '',
				toolName: step.toolName || 'unknown',
				success: step.success === true,
				output: step.summary || '',
				error: step.error
			},
			timestamp: step.timestamp || Date.now()
		}));
		for (const step of steps) {
			const key = `${step.stepIndex}:${step.toolCall?.name || 'unknown'}`;
			if (!streamedStepKeys.has(key)) onStep?.(step);
		}

		let proposal: IFloatMultiFileProposal | undefined;
		let checkpointId: string | undefined;
		const remoteProposalId = Array.isArray(remoteExecution.proposalsGenerated)
			? remoteExecution.proposalsGenerated[0]
			: undefined;
		if (remoteProposalId) {
			const proposalResponse = await fetch(
				`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/proposals/${encodeURIComponent(remoteProposalId)}`,
				{ headers: { 'Authorization': `Bearer ${token}` } }
			);
			if (!proposalResponse.ok) {
				const body = await proposalResponse.json().catch(() => ({}));
				throw new Error(body?.error || 'Composer created a proposal but the review details could not be loaded.');
			}
			const payload = await proposalResponse.json();
			const remoteProposal = payload?.proposal;
			if (!remoteProposal || !Array.isArray(remoteProposal.changes)) {
				throw new Error('Composer returned an invalid proposal record.');
			}

			const pathMap = new Map<string, string>();
			const changes = remoteProposal.changes.map((change: any) => {
				if (change.operation !== 'create' && change.operation !== 'modify') {
					throw new Error(`Composer proposed unsupported operation "${change.operation}" for ${change.path}.`);
				}
				const relativePath = String(change.path || '');
				pathMap.set(relativePath, relativePath);
				return {
					path: relativePath,
					originalContent: String(change.originalContent || ''),
					proposedContent: String(change.proposedContent || '')
				};
			});
			const checkpointContents = Object.fromEntries(changes.map((change: any) => [change.path, change.originalContent]));
			checkpointId = this._floatService.getCheckpointService().createCheckpoint(
				`Remote Composer: ${remoteProposal.description || goal.prompt.slice(0, 40)}`,
					checkpointContents
			).id;
			proposal = this._orchestrator.createProposal(
				remoteProposal.description || 'FLOAT Composer proposal',
				`Server-side structured-tool proposal ${remoteProposal.id}.`,
				changes,
				checkpointId
			);
			this._activeMultiFileProposal = proposal;
			this._activeRemoteProposal = {
				proposalId: remoteProposal.id,
				projectId,
				approvedPaths: remoteProposal.affectedFiles || remoteProposal.changes.map((change: any) => change.path),
				absolutePathByRelative: pathMap
			};

			try {
				const shadowSession = this._shadowWorkspace.createSession({
					sessionId: `remote-composer-${remoteProposal.id}`,
					baseFiles: Object.fromEntries(changes.map((change: any) => [change.path, change.originalContent]))
				});
				for (const change of changes) this._shadowWorkspace.setFileOverlay(shadowSession.id, change.path, change.proposedContent);
				const validation = await this._shadowWorkspace.validateSession(shadowSession.id);
				this._shadowWorkspace.disposeSession(shadowSession.id);
				this._orchestrator.attachValidationResult(proposal.id, validation);
			} catch {
				// The native diff remains reviewable when the optional shadow compiler is unavailable.
			}
		}

		const status = remoteExecution.status === 'completed'
			? 'completed'
			: remoteExecution.status === 'cancelled'
				? 'cancelled'
				: 'failed';
		return {
			id: remoteExecution.taskId || 'remote-composer',
			goal: goalWithIsolation,
			steps,
			status,
			proposal,
			checkpointId,
			error: status === 'completed'
				? undefined
				: remoteExecution.error || `Composer stopped with status ${remoteExecution.status}.`
		};
	}

	public async applyProposal(proposalId: string): Promise<boolean> {
		const proposal = this._floatService.getProposalSession().getProposal(proposalId);
		const multiProp = this._orchestrator.getProposal(proposalId);
		if (!proposal && !multiProp) {
			return false;
		}

		// Create rollback checkpoint
		const snapshot: Record<string, string> = {};
		if (proposal) {
			for (const file of proposal.files) {
				snapshot[file.path] = file.originalContent;
			}
		} else if (multiProp) {
			for (const file of multiProp.files) {
				snapshot[file.path] = file.originalContent;
			}
		}
		this._floatService.getCheckpointService().createCheckpoint(`Apply ${proposal?.title || multiProp?.title}`, snapshot);

		// Apply via orchestrator with concurrent edit conflict verification
		const diskReader = async (p: string) => {
			try {
				const res = await this._textFileService.read(this._workspaceFileUri(p));
				return res.value;
			} catch {
				return undefined;
			}
		};

		const diskWriter = async (p: string, content: string) => {
			await this._textFileService.write(this._workspaceFileUri(p), content);
		};

		if (multiProp) {
			const res = await this._orchestrator.acceptAll(proposalId, diskWriter, diskReader);
			if (!res.success) {
				if (res.rolledBack) {
					this._notificationService.error(`Transaction failed on ${res.failedFile || 'file'}: ${res.error}. Rolled back all changes to baseline state.`);
				} else {
					this._notificationService.warn(`FLOAT Composer detected concurrent conflicts in ${res.conflictedFiles.join(', ')}. Conflicted files preserved.`);
				}
				return false;
			}
			if (this._activeRemoteProposal?.proposalId) {
				const synced = await this._finalizeRemoteProposal(proposalId);
				if (!synced) return false;
			}
		} else if (proposal) {
			for (const file of proposal.files) {
				this._floatService.getProposalSession().applyFileChange(proposalId, file.path);
				try {
					await this._textFileService.write(this._workspaceFileUri(file.path), file.proposedContent);
				} catch (e: any) {
					this._notificationService.error(`Failed to write file ${file.path}: ${e.message}`);
				}
			}
		}

		this._notificationService.info(`FLOAT Composer applied proposal: ${proposal?.title || multiProp?.title}`);
		return true;
	}

	public async acceptFile(proposalId: string, filePath: string): Promise<boolean> {
		const diskReader = async (p: string) => {
			try {
				const res = await this._textFileService.read(URI.file(p));
				return res.value;
			} catch {
				return undefined;
			}
		};

		const diskWriter = async (p: string, content: string) => {
			await this._textFileService.write(URI.file(p), content);
		};

		const success = await this._orchestrator.acceptFile(proposalId, filePath, diskWriter, diskReader);

		if (success) {
			this._floatService.getProposalSession().applyFileChange(proposalId, filePath);
			this._notificationService.info(`Accepted file modification: ${filePath}`);
		} else {
			this._notificationService.warn(`Could not accept ${filePath}: File was modified concurrently or already accepted.`);
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
		const multiProp = this._orchestrator.getProposal(proposalId);
		if (!proposal && !multiProp) {
			return false;
		}

		if (proposal) {
			for (const file of proposal.files) {
				this._floatService.getProposalSession().rejectFileChange(proposalId, file.path);
			}
		}

		if (multiProp) {
			this._orchestrator.rejectAll(proposalId);
		}

		if (this._activeRemoteProposal) {
			const remote = this._activeRemoteProposal;
			const token = this._floatService.getAuthService().getAuthToken();
			if (token) {
				void fetch(
					`${this._remoteComposerBaseUrl()}/api/projects/${encodeURIComponent(remote.projectId)}/proposals/${encodeURIComponent(remote.proposalId)}/reject`,
						{ method: 'POST', headers: { 'Authorization': `Bearer ${token}` } }
					).catch(() => undefined);
			}
			this._activeRemoteProposal = null;
		}

		this._activeProposal = null;
		this._activeMultiFileProposal = null;
		this._notificationService.info(`FLOAT Composer rejected proposal: ${proposal?.title || multiProp?.title}`);
		return true;
	}

	public async rollbackTurn(checkpointId: string, currentWorkspaceFiles?: Record<string, string>): Promise<boolean> {
		this._notificationService.info(`Rolling back Composer turn checkpoint: ${checkpointId}...`);
		const result = this._floatService.getCheckpointService().restoreCheckpoint(checkpointId, currentWorkspaceFiles || {});
		if (result.success) {
			for (const action of result.actions) {
				if (action.action === 'modified_restored' || action.action === 'deleted_recreated') {
					if (action.content !== undefined) {
						await this._textFileService.write(this._workspaceFileUri(action.path), action.content);
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