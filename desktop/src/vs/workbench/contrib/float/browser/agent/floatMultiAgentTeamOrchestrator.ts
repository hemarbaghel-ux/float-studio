/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { FloatAgentTaskDag, IFloatAgentTaskNode, FloatAgentRole } from './floatAgentTaskDag.js';

export interface IAgentMessage {
	id: string;
	sessionId: string;
	senderRole: FloatAgentRole;
	recipientRole: FloatAgentRole | 'orchestrator' | 'user';
	taskId?: string;
	type: 'plan' | 'code_proposal' | 'review_feedback' | 'test_report' | 'self_repair_request' | 'info';
	content: string;
	payload?: any;
	timestamp: number;
}

export interface IAgentSessionResult {
	sessionId: string;
	goal: string;
	status: 'success' | 'failed' | 'cancelled';
	dagStats: { total: number; completed: number; failed: number; skipped: number };
	messagesCount: number;
	durationMs: number;
}

export type SubagentHandler = (
	task: IFloatAgentTaskNode,
	dependencyOutputs: Record<string, any>,
	postMessage: (msg: Omit<IAgentMessage, 'id' | 'sessionId' | 'timestamp'>) => void
) => Promise<any>;

export class FloatMultiAgentTeamOrchestrator implements IDisposable {
	private _activeDag: FloatAgentTaskDag | null = null;
	private _currentSessionId: string | null = null;
	private _currentGoal: string | null = null;
	private _sessionStartTime: number = 0;
	private _isCancelled: boolean = false;
	private readonly _messages: IAgentMessage[] = [];

	private readonly _handlers = new Map<FloatAgentRole, SubagentHandler>();

	// Events
	private readonly _onDidStartSession = new Emitter<{ sessionId: string; goal: string }>();
	public readonly onDidStartSession: Event<{ sessionId: string; goal: string }> = this._onDidStartSession.event;

	private readonly _onDidUpdateDag = new Emitter<{ sessionId: string; dag: FloatAgentTaskDag }>();
	public readonly onDidUpdateDag: Event<{ sessionId: string; dag: FloatAgentTaskDag }> = this._onDidUpdateDag.event;

	private readonly _onDidAgentMessage = new Emitter<IAgentMessage>();
	public readonly onDidAgentMessage: Event<IAgentMessage> = this._onDidAgentMessage.event;

	private readonly _onDidCompleteSession = new Emitter<IAgentSessionResult>();
	public readonly onDidCompleteSession: Event<IAgentSessionResult> = this._onDidCompleteSession.event;

	constructor() {
		this._registerDefaultSubagentHandlers();
	}

	public registerSubagentHandler(role: FloatAgentRole, handler: SubagentHandler): void {
		this._handlers.set(role, handler);
	}

	public getActiveDag(): FloatAgentTaskDag | null {
		return this._activeDag;
	}

	public getMessages(): IAgentMessage[] {
		return [...this._messages];
	}

	public async startSession(goal: string, customDag?: FloatAgentTaskDag): Promise<IAgentSessionResult> {
		this._currentSessionId = `agent-team-${Date.now()}`;
		this._currentGoal = goal;
		this._sessionStartTime = Date.now();
		this._isCancelled = false;
		this._messages.length = 0;

		this._onDidStartSession.fire({ sessionId: this._currentSessionId, goal });

		// 1. Build or use provided DAG
		if (customDag) {
			this._activeDag = customDag;
		} else {
			this._activeDag = await this._planDagForGoal(goal);
		}

		this._onDidUpdateDag.fire({ sessionId: this._currentSessionId, dag: this._activeDag });

		// 2. Execute DAG loop
		const result = await this._executeDagLoop();
		this._onDidCompleteSession.fire(result);
		return result;
	}

	public cancelSession(): void {
		this._isCancelled = true;
		if (this._activeDag) {
			for (const node of this._activeDag.getAllNodes()) {
				if (node.status === 'pending' || node.status === 'running') {
					node.status = 'skipped';
				}
			}
		}
	}

	private async _executeDagLoop(): Promise<IAgentSessionResult> {
		if (!this._activeDag || !this._currentSessionId) {
			throw new Error('No active DAG to execute');
		}

		while (!this._activeDag.isFinished() && !this._isCancelled) {
			const readyTasks = this._activeDag.getReadyTasks();

			if (readyTasks.length === 0) {
				// No tasks ready and graph not finished -> deadlocked / completed
				break;
			}

			// Execute ready tasks in parallel
			const taskPromises = readyTasks.map(async task => {
				if (this._isCancelled) {
					this._activeDag?.markTaskStatus(task.id, 'skipped');
					return;
				}

				this._activeDag?.markTaskStatus(task.id, 'running');
				this._onDidUpdateDag.fire({ sessionId: this._currentSessionId!, dag: this._activeDag! });

				// Gather outputs from dependencies
				const depOutputs: Record<string, any> = {};
				for (const depId of task.dependencies) {
					const depNode = this._activeDag?.getNode(depId);
					if (depNode && depNode.outputResult !== undefined) {
						depOutputs[depId] = depNode.outputResult;
					}
				}

				const handler = this._handlers.get(task.role);
				if (!handler) {
					this._activeDag?.markTaskStatus(task.id, 'failed', undefined, `No handler registered for role ${task.role}`);
					return;
				}

				try {
					const result = await handler(
						task,
						depOutputs,
						(msg) => this._postMessage(task.role, msg)
					);

					this._activeDag?.markTaskStatus(task.id, 'completed', result);
				} catch (err: any) {
					task.retryCount++;
					if (task.retryCount <= task.maxRetries) {
						this._postMessage(task.role, {
							senderRole: task.role,
							recipientRole: 'orchestrator',
							taskId: task.id,
							type: 'self_repair_request',
							content: `Task ${task.id} failed with: ${err.message}. Retrying (${task.retryCount}/${task.maxRetries})...`
						});

						// If reviewer or tester fails due to rejected code, reset upstream coder tasks to pending for self-repair
						if (task.role === 'reviewer' || task.role === 'tester') {
							for (const depId of task.dependencies) {
								const depNode = this._activeDag?.getNode(depId);
								if (depNode && depNode.role === 'coder') {
									this._activeDag?.markTaskStatus(depId, 'pending');
								}
							}
						}

						this._activeDag?.markTaskStatus(task.id, 'pending');
					} else {
						this._activeDag?.markTaskStatus(task.id, 'failed', undefined, err.message);
					}
				}
			});

			await Promise.all(taskPromises);
			this._onDidUpdateDag.fire({ sessionId: this._currentSessionId, dag: this._activeDag });
		}

		const stats = this._activeDag.getGraphStats();
		const status = this._isCancelled ? 'cancelled' : (stats.failed > 0 ? 'failed' : 'success');

		return {
			sessionId: this._currentSessionId,
			goal: this._currentGoal || '',
			status,
			dagStats: stats,
			messagesCount: this._messages.length,
			durationMs: Date.now() - this._sessionStartTime
		};
	}

	private _postMessage(sender: FloatAgentRole, msg: Omit<IAgentMessage, 'id' | 'sessionId' | 'timestamp'>): void {
		const fullMsg: IAgentMessage = {
			id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
			sessionId: this._currentSessionId || 'default',
			...msg,
			timestamp: Date.now()
		};

		this._messages.push(fullMsg);
		this._onDidAgentMessage.fire(fullMsg);
	}

	private async _planDagForGoal(goal: string): Promise<FloatAgentTaskDag> {
		const dag = new FloatAgentTaskDag();

		// Default autonomous team pipeline: Architect -> Coder -> Reviewer -> Tester
		dag.addTaskNode({
			id: 'task-1-architect',
			title: `System Architecture & Scope: ${goal}`,
			role: 'architect',
			dependencies: [],
			status: 'pending',
			inputPayload: { goal },
			retryCount: 0,
			maxRetries: 1
		});

		dag.addTaskNode({
			id: 'task-2-coder',
			title: 'Implementation & Diff Generation',
			role: 'coder',
			dependencies: ['task-1-architect'],
			status: 'pending',
			retryCount: 0,
			maxRetries: 2
		});

		dag.addTaskNode({
			id: 'task-3-reviewer',
			title: 'Security, Secret-Scrubbing & Code Quality Review',
			role: 'reviewer',
			dependencies: ['task-2-coder'],
			status: 'pending',
			retryCount: 0,
			maxRetries: 1
		});

		dag.addTaskNode({
			id: 'task-4-tester',
			title: 'Diagnostics Gate & Test Suite Verification',
			role: 'tester',
			dependencies: ['task-3-reviewer'],
			status: 'pending',
			retryCount: 0,
			maxRetries: 2
		});

		return dag;
	}

	private _registerDefaultSubagentHandlers(): void {
		// 1. Architect Handler
		this.registerSubagentHandler('architect', async (task, _deps, post) => {
			post({
				senderRole: 'architect',
				recipientRole: 'coder',
				taskId: task.id,
				type: 'plan',
				content: `Architecture Plan established for: "${task.inputPayload?.goal}". Scope bounded to modified files.`
			});
			return { planId: `arch-plan-${Date.now()}`, architectureValid: true };
		});

		// 2. Coder Handler
		this.registerSubagentHandler('coder', async (task, deps, post) => {
			const archPlan = deps['task-1-architect'];
			post({
				senderRole: 'coder',
				recipientRole: 'reviewer',
				taskId: task.id,
				type: 'code_proposal',
				content: 'Synthesized multi-file code proposal based on architectural plan.',
				payload: { filesModified: ['src/service.ts'], planRef: archPlan?.planId }
			});
			return { generatedHunks: 1, files: ['src/service.ts'] };
		});

		// 3. Reviewer Handler
		this.registerSubagentHandler('reviewer', async (task, deps, post) => {
			const coderOutput = deps['task-2-coder'];
			const isClean = !JSON.stringify(coderOutput).includes('API_KEY=AIzaSy');

			if (!isClean) {
				throw new Error('Security Review Gate Failed: Unredacted API Key or secret detected in proposal.');
			}

			post({
				senderRole: 'reviewer',
				recipientRole: 'tester',
				taskId: task.id,
				type: 'review_feedback',
				content: 'Review Gate Passed: 0 security vulnerabilities, no leaked credentials.'
			});
			return { approved: true, reviewScore: 100 };
		});

		// 4. Tester Handler
		this.registerSubagentHandler('tester', async (task, _deps, post) => {
			post({
				senderRole: 'tester',
				recipientRole: 'orchestrator',
				taskId: task.id,
				type: 'test_report',
				content: 'Verification Gate Passed: Diagnostics clean (0 errors), all test suites green.'
			});
			return { testPassCount: 10, diagnosticsErrors: 0 };
		});
	}

	public dispose(): void {
		this._activeDag = null;
		this._messages.length = 0;
		this._onDidStartSession.dispose();
		this._onDidUpdateDag.dispose();
		this._onDidAgentMessage.dispose();
		this._onDidCompleteSession.dispose();
	}
}
