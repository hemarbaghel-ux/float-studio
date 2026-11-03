/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IFloatService } from '../floatService.js';
import { FloatComposerToolRegistry, IComposerToolCall, IComposerToolResult } from './floatComposerTools.js';
import { FloatMultiFileDiffOrchestrator, IFloatMultiFileProposal } from './floatMultiFileDiffOrchestrator.js';
import { parseModelProposals } from '../proposals/floatProposalValidator.js';
import { FloatShadowWorkspaceService } from '../shadow/floatShadowWorkspaceService.js';
import { IShadowValidationResult } from '../shadow/floatShadowTypes.js';

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

export class FloatComposerAgent {
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
		let speculativeRepairCount = 0;
		const steps: IComposerAgentStep[] = [];

		// 1. Snapshot initial state via CheckpointService
		const initialSnapshot: Record<string, string> = {};
		if (goal.activeFilePath) {
			try {
				initialSnapshot[goal.activeFilePath] = await this._toolRegistry.executeTool({
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

		// Format initial conversation messages
		const toolListStr = this._toolRegistry.definitions
			.map(t => `- ${t.name}: ${t.description} (params: ${t.parameters.required.join(', ')})`)
			.join('\n');

		const systemInstructions = [
			'You are FLOAT Autonomous Composer Agent with Speculative Shadow Validation.',
			'You have access to the following workspace tools:',
			toolListStr,
			'',
			'To execute a tool call, respond strictly with a tool_call fenced block:',
			'```tool_call',
			'{ "name": "tool_name", "parameters": { "param1": "value1" } }',
			'```',
			'When you have verified all changes and tests pass, summarize your completed work with standard code blocks.'
		].join('\n');

		const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [
			{ role: 'user', content: `${systemInstructions}\n\nTask Goal: ${goal.prompt}` }
		];

		const touchedFiles = new Map<string, { original: string; proposed: string }>();

		// 2. Autonomous Loop
		let stepCount = 0;
		while (stepCount < maxSteps) {
			if (signal?.aborted) {
				execution.status = 'cancelled';
				return execution;
			}

			stepCount++;
			let assistantResponse = '';

			// Call model
			await this._floatService.streamChat(
				conversationHistory.map((m, idx) => ({
					id: `conv-${idx}`,
					role: m.role,
					content: m.content,
					timestamp: Date.now()
				})),
				{
					onChunk: chunk => { assistantResponse += chunk; },
					onError: err => { throw err; },
					onComplete: () => {}
				}
			);

			conversationHistory.push({ role: 'assistant', content: assistantResponse });

			// Check for tool call in assistant response
			const toolCallMatch = assistantResponse.match(/```tool_call\s*\r?\n([\s\S]*?)```/);
			if (toolCallMatch) {
				let parsedCall: { name: string; parameters: any } | null = null;
				try {
					parsedCall = JSON.parse(toolCallMatch[1].trim());
				} catch (e: any) {
					const errorStep: IComposerAgentStep = {
						stepIndex: stepCount,
						thought: assistantResponse.replace(/```tool_call[\s\S]*?```/, '').trim(),
						timestamp: Date.now(),
						toolResult: {
							callId: `call-${stepCount}`,
							toolName: 'unknown',
							success: false,
							output: '',
							error: `Invalid JSON in tool_call block: ${e.message}`
						}
					};
					steps.push(errorStep);
					onStep?.(errorStep);
					conversationHistory.push({
						role: 'user',
						content: `[TOOL ERROR] Failed to parse tool call JSON: ${e.message}. Please retry with valid JSON.`
					});
					continue;
				}

				const toolCall: IComposerToolCall = {
					id: `call-${stepCount}`,
					name: parsedCall.name,
					parameters: parsedCall.parameters || {}
				};

				// Pre-track original file content before mutation
				if (toolCall.name === 'write_file' || toolCall.name === 'edit_file') {
					const filePath = toolCall.parameters.path;
					if (filePath && !touchedFiles.has(filePath)) {
						let original = '';
						try {
							original = await this._toolRegistry.executeTool({
								id: 'pre-read',
								name: 'read_file',
								parameters: { path: filePath }
							}).then(r => r.output);
						} catch {}
						touchedFiles.set(filePath, { original, proposed: '' });
					}
				}

				// Execute tool
				const toolResult = await this._toolRegistry.executeTool(toolCall);

				// Update proposed content tracker
				if (toolCall.name === 'write_file') {
					const filePath = toolCall.parameters.path;
					const tracked = touchedFiles.get(filePath);
					if (tracked) {
						tracked.proposed = toolCall.parameters.content;
					}
				}

				const stepRecord: IComposerAgentStep = {
					stepIndex: stepCount,
					thought: assistantResponse.replace(/```tool_call[\s\S]*?```/, '').trim(),
					toolCall,
					toolResult,
					timestamp: Date.now()
				};
				steps.push(stepRecord);
				onStep?.(stepRecord);

				// Build observation response
				let observationMessage = `[TOOL OBSERVATION for ${toolCall.name}]\n${toolResult.output}`;
				if (!toolResult.success) {
					observationMessage = `[TOOL FAILURE for ${toolCall.name}]\nError: ${toolResult.error}`;
				}

				// Self-healing prompt if terminal command failed
				if (toolCall.name === 'run_terminal_command' && toolResult.output.includes('Exit Code: ') && !toolResult.output.includes('Exit Code: 0')) {
					observationMessage += '\n\n[DIAGNOSTIC WARNING]: The command exited with a non-zero exit code. Please review the error log above and apply necessary fixes.';
				}

				conversationHistory.push({
					role: 'user',
					content: observationMessage
				});
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

				// Add any files directly emitted in markdown code blocks
				for (const p of parsed) {
					for (const f of p.files) {
						if (!touchedFiles.has(f.path)) {
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

		execution.status = 'completed';
		return execution;
	}
}
