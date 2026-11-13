/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IFloatService } from '../floatService.js';
import { FloatComposerToolRegistry, IComposerToolCall, IComposerToolResult, IComposerToolDefinition } from './floatComposerTools.js';
import { FloatMultiFileDiffOrchestrator, IFloatMultiFileProposal } from './floatMultiFileDiffOrchestrator.js';
import { parseModelProposals } from '../proposals/floatProposalValidator.js';
import { FloatShadowWorkspaceService } from '../shadow/floatShadowWorkspaceService.js';
import { IShadowValidationResult } from '../shadow/floatShadowTypes.js';
import { SpeculativeComposerFileSystem, IsolatedShadowWorkspaceCommandRunner } from './floatProductionAdapters.js';
import { FloatDagTaskPlanner, IFloatDagExecutionSummary } from '../planner/floatDagTaskPlanner.js';

export interface IComposerAgentStep {
	stepIndex: number;
	thought: string;
	toolCall?: IComposerToolCall;
	toolResult?: IComposerToolResult;
	timestamp: number;
}

export interface IComposerAgentGoal {
	prompt: string;
	maxSteps?: number;
	activeFilePath?: string;
	enableShadowValidation?: boolean;
	maxSpeculativeRepairs?: number;
	isolateWorkspaceMutations?: boolean;
}

export interface IComposerAgentExecution {
	id: string;
	goal: IComposerAgentGoal;
	steps: IComposerAgentStep[];
	status: 'running' | 'completed' | 'failed' | 'cancelled';
	proposal?: IFloatMultiFileProposal;
	checkpointId?: string;
	validationResult?: IShadowValidationResult;
	error?: string;
}

function validateComposerToolArguments(
	definition: IComposerToolDefinition | undefined,
	parameters: Record<string, any>
): string | undefined {
	if (!definition) return 'The model requested a tool that is not registered in this workspace.';
	if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) return 'Tool arguments must be a JSON object.';
	const properties = definition.parameters.properties;
	for (const required of definition.parameters.required) {
		if (!Object.prototype.hasOwnProperty.call(parameters, required)) return `Missing required argument "${required}" for tool ${definition.name}.`;
	}
	for (const [key, value] of Object.entries(parameters)) {
		const property = properties[key];
		if (!property) return `Unexpected argument "${key}" for tool ${definition.name}.`;
		const matchesType = property.type === 'string' ? typeof value === 'string'
			: property.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
			: property.type === 'integer' ? Number.isSafeInteger(value)
			: property.type === 'boolean' ? typeof value === 'boolean'
			: property.type === 'array' ? Array.isArray(value)
			: property.type === 'object' ? typeof value === 'object' && value !== null && !Array.isArray(value)
			: false;
		if (!matchesType) return `Argument "${key}" for tool ${definition.name} must be ${property.type}.`;
		if (property.enum && !property.enum.includes(value)) return `Argument "${key}" for tool ${definition.name} is not allowed.`;
	}
	return undefined;
}

export class FloatComposerAgent {
	private readonly _dagPlanner: FloatDagTaskPlanner = new FloatDagTaskPlanner();
	constructor(
		private readonly _floatService: IFloatService,
		private readonly _toolRegistry: FloatComposerToolRegistry,
		private readonly _orchestrator: FloatMultiFileDiffOrchestrator,
		private readonly _shadowWorkspace: FloatShadowWorkspaceService = FloatShadowWorkspaceService.getInstance()
	) {}

	public async executeGoal(
		goal: IComposerAgentGoal,
		onStep?: (step: IComposerAgentStep) => void,
		signal?: AbortSignal
	): Promise<IComposerAgentExecution> {
		const id = `turn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
		const maxSteps = goal.maxSteps ?? 10;
		const enableShadowValidation = goal.enableShadowValidation ?? true;
		const maxSpeculativeRepairs = goal.maxSpeculativeRepairs ?? 2;
		const isolateMutations = goal.isolateWorkspaceMutations ?? false;
		let speculativeRepairCount = 0;
		const steps: IComposerAgentStep[] = [];

		// When isolation is requested, route all tool mutations into speculative in-memory overlays
		// AND run OS commands inside an isolated shadow workspace clone to protect the physical workspace.
		let speculativeFs: SpeculativeComposerFileSystem | null = null;
		let shadowCmdRunner: IsolatedShadowWorkspaceCommandRunner | null = null;
		let scopedRegistry = this._toolRegistry;

		if (isolateMutations) {
			speculativeFs = new SpeculativeComposerFileSystem(this._toolRegistry.fileSystem);
			const workspaceRoot = (this._toolRegistry.fileSystem as any).workspaceRoot || process.cwd();
			shadowCmdRunner = new IsolatedShadowWorkspaceCommandRunner(
				workspaceRoot,
				speculativeFs.overlays,
				30000,
				this._toolRegistry.runner?.requestExecutionApproval?.bind(this._toolRegistry.runner)
			);
			scopedRegistry = this._toolRegistry.createScopedRegistry(speculativeFs, undefined, shadowCmdRunner);
		}

		const abortHandler = () => {
			shadowCmdRunner?.abort();
		};
		signal?.addEventListener('abort', abortHandler);

		try {
			// 1. Snapshot initial state via CheckpointService
		const initialSnapshot: Record<string, string> = {};
		if (goal.activeFilePath) {
			try {
				initialSnapshot[goal.activeFilePath] = await scopedRegistry.executeTool({
					id: 'init-read',
					name: 'read_file',
					parameters: { path: goal.activeFilePath }
				}).then(r => r.output);
			} catch {}
		}
		const checkpoint = this._floatService.getCheckpointService().createCheckpoint(
			`Pre-Composer Turn: ${goal.prompt.slice(0, 40)}`,
			initialSnapshot
		);

		const execution: IComposerAgentExecution = {
			id,
			goal,
			steps,
			status: 'running',
			checkpointId: checkpoint.id
		};

		const toolDefinitions = scopedRegistry.definitions;
		const systemInstructions = [
			'You are FLOAT Autonomous Composer Agent with Speculative Shadow Validation.',
			'Use the supplied native function tools to inspect or modify the workspace.',
			'Never claim a tool ran unless the workbench reports its result.',
			'Prefer small, reviewable file changes. Verify work with the terminal tool before concluding.',
			'When complete, provide a concise summary and include file paths changed.'
		].join(' ');
		const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [
			{ role: 'user', content: `Task Goal: ${goal.prompt}` }
		];
		const touchedFiles = new Map<string, { original: string; proposed: string }>();

		let stepCount = 0;
		while (stepCount < maxSteps) {
			if (signal?.aborted) {
				execution.status = 'cancelled';
				return execution;
			}
			stepCount++;
			let assistantResponse = '';
			let structuredToolCalls: Array<{ id: string; name: string; arguments: Record<string, any> }> = [];
			try {
				const modelStep = await this._floatService.generateAgentStep(
					conversationHistory, toolDefinitions, systemInstructions, signal
				);
				assistantResponse = modelStep.text;
				structuredToolCalls = modelStep.toolCalls;
			} catch (err: any) {
				if (signal?.aborted || err?.name === 'AbortError') {
					execution.status = 'cancelled';
					return execution;
				}
				execution.status = 'failed';
				execution.error = err.message || String(err);
				return execution;
			}
			if (signal?.aborted) {
				execution.status = 'cancelled';
				return execution;
			}
			conversationHistory.push({
				role: 'assistant',
				content: assistantResponse || (structuredToolCalls.length ? 'I requested workspace tools.' : '')
			});

			if (structuredToolCalls.length > 0) {
				for (let callIndex = 0; callIndex < structuredToolCalls.length; callIndex++) {
					if (signal?.aborted) {
						execution.status = 'cancelled';
						return execution;
					}
					const modelCall = structuredToolCalls[callIndex];
					const toolCall: IComposerToolCall = {
						id: modelCall.id || `call-${stepCount}-${callIndex + 1}`,
						name: modelCall.name,
						parameters: modelCall.arguments || {}
					};
					const definition = toolDefinitions.find(tool => tool.name === toolCall.name);
					const invalidArguments = validateComposerToolArguments(definition, toolCall.parameters);
					if (!invalidArguments && (toolCall.name === 'write_file' || toolCall.name === 'edit_file')) {
						const filePath = toolCall.parameters.path;
						if (filePath && !touchedFiles.has(filePath)) {
							let original = '';
							try {
								original = await scopedRegistry.executeTool({
									id: 'pre-read', name: 'read_file', parameters: { path: filePath }
								}).then(result => result.output);
							} catch {}
							touchedFiles.set(filePath, { original, proposed: '' });
						}
					}
					const toolResult: IComposerToolResult = invalidArguments
						? { callId: toolCall.id, toolName: toolCall.name, success: false, output: '', error: invalidArguments }
						: await scopedRegistry.executeTool(toolCall);

					if (toolResult.success) {
						const filePath = toolCall.parameters.path;
						const tracked = touchedFiles.get(filePath);
						if (toolCall.name === 'write_file') {
							if (tracked) tracked.proposed = toolCall.parameters.content;
							shadowCmdRunner?.updateOverlay(filePath, toolCall.parameters.content);
						} else if (toolCall.name === 'edit_file') {
							try {
								const updatedContent = speculativeFs
									? await speculativeFs.readFile(filePath)
									: await scopedRegistry.executeTool({
										id: 'post-read', name: 'read_file', parameters: { path: filePath }
									}).then(result => result.output);
								if (tracked) tracked.proposed = updatedContent;
								shadowCmdRunner?.updateOverlay(filePath, updatedContent);
							} catch {}
						}
					}
					const stepRecord: IComposerAgentStep = {
						stepIndex: stepCount,
						thought: assistantResponse.trim(),
						toolCall,
						toolResult,
						timestamp: Date.now()
					};
					steps.push(stepRecord);
					onStep?.(stepRecord);
					let observationMessage = `[TOOL OBSERVATION for ${toolCall.name}]\n${toolResult.output}`;
					if (!toolResult.success) observationMessage = `[TOOL FAILURE for ${toolCall.name}]\nError: ${toolResult.error}`;
					if (toolCall.name === 'run_terminal_command' &&
						toolResult.output.includes('Exit Code: ') &&
						!toolResult.output.includes('Exit Code: 0')) {
						observationMessage += '\n\n[DIAGNOSTIC WARNING]: The command exited non-zero. Review the diagnostics and repair the failure.';
					}
					conversationHistory.push({ role: 'user', content: observationMessage });
				}
				continue;
			} else {
				// No more tool calls: Agent has reached conclusion
				// Parse any code blocks into multi-file proposal
				const parsed = parseModelProposals(assistantResponse, goal.activeFilePath);
				const proposalChanges: Array<{ path: string; originalContent: string; proposedContent: string }> = [];

				// Add touched files from tool executions
				for (const [p, data] of touchedFiles.entries()) {
					proposalChanges.push({
						path: p,
						originalContent: data.original,
						proposedContent: data.proposed
					});
				}

				// Synchronize any additional overlays that were created
				if (speculativeFs) {
					for (const [p, content] of speculativeFs.overlays.entries()) {
						if (!touchedFiles.has(p)) {
							proposalChanges.push({
								path: p,
								originalContent: speculativeFs.originalBaselines.get(p) || '',
								proposedContent: content
							});
						}
					}
				}

				// Add any files directly emitted in markdown code blocks
				for (const p of parsed) {
					for (const f of p.files) {
						if (!proposalChanges.some(c => c.path === f.path)) {
							proposalChanges.push({
								path: f.path,
								originalContent: f.originalContent || '',
								proposedContent: f.proposedContent
							});
						}
					}
				}

				// 3. Shadow Workspace Speculative Validation Gate
				if (enableShadowValidation && proposalChanges.length > 0) {
					const shadowSession = this._shadowWorkspace.createSession({
						sessionId: `shadow-gate-${id}-${stepCount}`,
						baseFiles: Object.fromEntries(proposalChanges.map(c => [c.path, c.originalContent]))
					});

					for (const change of proposalChanges) {
						this._shadowWorkspace.setFileOverlay(shadowSession.id, change.path, change.proposedContent);
					}

					const validationResult = await this._shadowWorkspace.validateSession(shadowSession.id, {
						checkSyntax: true,
						checkTypes: true
					});

					this._shadowWorkspace.disposeSession(shadowSession.id);

					// If speculative validation failed with compiler errors and we still have repair attempts
					if (validationResult.status === 'has_errors' && speculativeRepairCount < maxSpeculativeRepairs) {
						speculativeRepairCount++;
						const feedbackPrompt = this._shadowWorkspace.formatDiagnosticsForPrompt(validationResult.diagnostics);

						const repairStep: IComposerAgentStep = {
							stepIndex: stepCount,
							thought: `[Shadow Workspace Gate] Speculative validation detected ${validationResult.errorCount} compiler error(s). Intercepting and prompting self-repair (attempt ${speculativeRepairCount}/${maxSpeculativeRepairs}).`,
							timestamp: Date.now()
						};
						steps.push(repairStep);
						onStep?.(repairStep);

						conversationHistory.push({
							role: 'user',
							content: `${feedbackPrompt}\n\nPlease revise your proposed changes to fix these compiler errors.`
						});
						continue; // Resume loop for self-repair
					}

					execution.validationResult = validationResult;
				}

				const finalStep: IComposerAgentStep = {
					stepIndex: stepCount,
					thought: assistantResponse.trim(),
					timestamp: Date.now()
				};
				steps.push(finalStep);
				onStep?.(finalStep);

				if (proposalChanges.length > 0) {
					execution.proposal = this._orchestrator.createProposal(
						`Composer: ${goal.prompt.slice(0, 50)}`,
						`Autonomous agent completed goal across ${proposalChanges.length} files`,
						proposalChanges,
						checkpoint.id
					);

					if (execution.validationResult) {
						this._orchestrator.attachValidationResult(execution.proposal.id, execution.validationResult);
					}
				}

				execution.status = 'completed';
				return execution;
			}
		}

		// If loop exited due to step exhaustion without conclusion
		execution.status = 'failed';
		execution.error = `Agent exceeded maximum allowed steps (${maxSteps}) without completing goal.`;
		return execution;
		} finally {
			signal?.removeEventListener('abort', abortHandler);
			shadowCmdRunner?.dispose();
		}
	}

	public get dagPlanner(): FloatDagTaskPlanner {
		return this._dagPlanner;
	}

	public async executeDagPlan(
		goal: IComposerAgentGoal,
		tasks: Array<{ id: string; title: string; dependencies: string[]; subPrompt: string }>,
		onStep?: (step: IComposerAgentStep) => void,
		signal?: AbortSignal
	): Promise<{ summary: IFloatDagExecutionSummary; execution: IComposerAgentExecution }> {
		const startTime = Date.now();
		const planner = new FloatDagTaskPlanner();
		for (const t of tasks) {
			planner.addTask({ id: t.id, title: t.title, dependencies: t.dependencies });
		}

		const batches = planner.getTopologicalBatches();
		let completed = 0;
		let failed = 0;
		let rolledBack = 0;
		let lastExecution: IComposerAgentExecution | null = null;
		const completedCheckpoints: string[] = [];

		for (const batch of batches) {
			for (const task of batch) {
				if (signal?.aborted) {
					task.status = 'rolled_back';
					rolledBack++;
					continue;
				}

				task.status = 'running';
				const taskItem = tasks.find(t => t.id === task.id);
				const subPrompt = taskItem ? taskItem.subPrompt : task.title;

				try {
					const execution = await this.executeGoal(
						{
							...goal,
							prompt: subPrompt,
							isolateWorkspaceMutations: true
						},
						onStep,
						signal
					);

					lastExecution = execution;
					if (execution.status === 'completed') {
						task.status = 'completed';
						completed++;
						if (execution.checkpointId) {
							completedCheckpoints.push(execution.checkpointId);
							task.checkpointId = execution.checkpointId;
						}
					} else {
						task.status = 'failed';
						failed++;
						// Rollback completed checkpoints on failure
						for (let i = completedCheckpoints.length - 1; i >= 0; i--) {
							try {
								await this._floatService.getCheckpointService().restoreCheckpoint(completedCheckpoints[i]);
							} catch {}
						}
						return {
							summary: {
								goal: goal.prompt,
								totalTasks: tasks.length,
								completed,
								failed,
								rolledBack: tasks.length - completed - failed,
								success: false,
								durationMs: Date.now() - startTime
							},
							execution
						};
					}
				} catch (err: any) {
					task.status = 'failed';
					failed++;
					for (let i = completedCheckpoints.length - 1; i >= 0; i--) {
						try {
							await this._floatService.getCheckpointService().restoreCheckpoint(completedCheckpoints[i]);
						} catch {}
					}
					return {
						summary: {
							goal: goal.prompt,
							totalTasks: tasks.length,
							completed,
							failed,
							rolledBack: tasks.length - completed - failed,
							success: false,
							durationMs: Date.now() - startTime
						},
						execution: {
							id: `dag-fail-${Date.now()}`,
							goal,
							steps: [],
							status: 'failed',
							error: err.message || String(err)
						}
					};
				}
			}
		}

		return {
			summary: {
				goal: goal.prompt,
				totalTasks: tasks.length,
				completed,
				failed,
				rolledBack,
				success: failed === 0 && !signal?.aborted,
				durationMs: Date.now() - startTime
			},
			execution: lastExecution || {
				id: `dag-${Date.now()}`,
				goal,
				steps: [],
				status: 'completed'
			}
		};
	}
}