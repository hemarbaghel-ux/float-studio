/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import type { IFloatDebugBreakContext } from './floatDebugAdapterBridge.js';
import type { IComposerAgentGoal, IComposerAgentExecution, FloatComposerAgent } from '../composer/floatComposerAgent.js';

export interface IFloatDebugStackFrame {
	frameId?: number;
	functionName: string;
	filePath: string;
	lineNumber: number;
	column: number;
}

export interface IFloatDebugVariable {
	name: string;
	value: string;
	type?: string;
}

export interface IFloatDebugExceptionEvent {
	sessionId: string;
	exceptionName: string;
	message: string;
	stackFrames: IFloatDebugStackFrame[];
	variables: IFloatDebugVariable[];
	sourceSnippet?: string;
}

export interface IFloatDebugRepairGoal {
	goalId: string;
	goalTitle: string;
	promptPayload: string;
	suggestedFiles: string[];
	timestamp: number;
	exceptionName?: string;
	targetLocation?: { filePath: string; line: number; column: number };
}

export const IFloatDebugAutoRepairService = createDecorator<IFloatDebugAutoRepairService>('floatDebugAutoRepairService');

export interface IFloatDebugAutoRepairService {
	readonly _serviceBrand: undefined;
	readonly onDidCreateRepairGoal: Event<IFloatDebugRepairGoal>;
	readonly onDidCompleteRepair: Event<{ goal: IFloatDebugRepairGoal; execution: IComposerAgentExecution }>;
	handleDebugException(event: IFloatDebugExceptionEvent): IFloatDebugRepairGoal;
	handleBreakContext(context: IFloatDebugBreakContext): IFloatDebugRepairGoal;
	dispatchRepairToComposer(
		goal: IFloatDebugRepairGoal,
		composerAgent: FloatComposerAgent,
		options?: { maxSteps?: number; enableShadowValidation?: boolean }
	): Promise<IComposerAgentExecution>;
	getRecentExceptions(): IFloatDebugExceptionEvent[];
	getRepairGoals(): IFloatDebugRepairGoal[];
	clear(): void;
	dispose(): void;
}

/**
 * Production DAP Debug Exception Auto-Repair Service.
 *
 * Bridges Code-OSS Debug Adapter Protocol runtime pause states (uncaught exceptions,
 * assertion failures, breakpoints) directly into the Autonomous Composer DAG Agent
 * to drive zero-touch self-healing code repair loops.
 */
export class FloatDebugAutoRepairService implements IFloatDebugAutoRepairService, IDisposable {
	declare readonly _serviceBrand: undefined;

	private readonly _recentExceptions: IFloatDebugExceptionEvent[] = [];
	private readonly _repairGoals: IFloatDebugRepairGoal[] = [];
	private readonly _maxHistory = 50;

	private readonly _onDidCreateRepairGoal = new Emitter<IFloatDebugRepairGoal>();
	public readonly onDidCreateRepairGoal: Event<IFloatDebugRepairGoal> = this._onDidCreateRepairGoal.event;

	private readonly _onDidCompleteRepair = new Emitter<{ goal: IFloatDebugRepairGoal; execution: IComposerAgentExecution }>();
	public readonly onDidCompleteRepair: Event<{ goal: IFloatDebugRepairGoal; execution: IComposerAgentExecution }> = this._onDidCompleteRepair.event;

	constructor() {}

	/**
	 * Creates a repair goal from a captured debug exception event
	 */
	public handleDebugException(event: IFloatDebugExceptionEvent): IFloatDebugRepairGoal {
		this._recentExceptions.unshift(event);
		if (this._recentExceptions.length > this._maxHistory) {
			this._recentExceptions.pop();
		}

		const topFrame = event.stackFrames[0] || {
			frameId: 1,
			functionName: 'unknown',
			filePath: 'src/app.ts',
			lineNumber: 1,
			column: 1
		};

		const goalTitle = `🐛 Fix ${event.exceptionName}: ${event.message.substring(0, 80)}`;

		const promptLines = [
			`## Debugger Runtime Exception Report`,
			`**Exception:** \`${event.exceptionName}\``,
			`**Message:** ${event.message}`,
			`**Failure Location:** \`${topFrame.filePath}:${topFrame.lineNumber}:${topFrame.column}\` in function \`${topFrame.functionName}\``,
			``,
			`### Call Stack:`,
			...event.stackFrames.slice(0, 8).map(f => `- \`${f.functionName}\` at ${f.filePath}:${f.lineNumber}:${f.column}`),
			``,
			`### Local Variable State:`,
			...event.variables.map(v => `- \`${v.name}\` (${v.type || 'any'}): \`${v.value}\``),
			``,
			`### Repair Goal:`,
			`Diagnose the root cause of the runtime exception above, apply minimal surgical fixes to eliminate the crash, and ensure all existing unit tests pass.`
		];

		const goalId = `repair-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
		const repairGoal: IFloatDebugRepairGoal = {
			goalId,
			goalTitle,
			promptPayload: promptLines.join('\n'),
			suggestedFiles: [topFrame.filePath],
			timestamp: Date.now(),
			exceptionName: event.exceptionName,
			targetLocation: { filePath: topFrame.filePath, line: topFrame.lineNumber, column: topFrame.column }
		};

		this._repairGoals.unshift(repairGoal);
		if (this._repairGoals.length > this._maxHistory) {
			this._repairGoals.pop();
		}

		this._onDidCreateRepairGoal.fire(repairGoal);
		return repairGoal;
	}

	/**
	 * Bridges an IFloatDebugBreakContext (from FloatDebugAdapterBridge) into an actionable repair goal
	 */
	public handleBreakContext(context: IFloatDebugBreakContext): IFloatDebugRepairGoal {
		const excName = context.exceptionDetails?.description
			? context.exceptionDetails.description.split(/[:\n]/)[0].trim()
			: (context.reason === 'exception' ? 'UnhandledException' : 'DebugBreakpoint');

		const excMsg = context.exceptionDetails?.description || `Execution paused at ${context.reason}`;

		const stackFrames: IFloatDebugStackFrame[] = context.callStack.map((f, i) => ({
			frameId: i + 1,
			functionName: f.functionName,
			filePath: f.sourceUri || f.fileName || 'src/index.ts',
			lineNumber: f.lineNumber,
			column: f.column
		}));

		if (stackFrames.length === 0 && context.focusedFrame) {
			stackFrames.push({
				frameId: 1,
				functionName: context.focusedFrame.functionName,
				filePath: context.focusedFrame.sourceUri || context.focusedFrame.fileName || 'src/index.ts',
				lineNumber: context.focusedFrame.lineNumber,
				column: context.focusedFrame.column
			});
		}

		return this.handleDebugException({
			sessionId: context.sessionId,
			exceptionName: excName,
			message: excMsg,
			stackFrames,
			variables: context.variables
		});
	}

	/**
	 * Dispatches an automated repair goal to the Composer DAG agent
	 */
	public async dispatchRepairToComposer(
		goal: IFloatDebugRepairGoal,
		composerAgent: FloatComposerAgent,
		options?: { maxSteps?: number; enableShadowValidation?: boolean }
	): Promise<IComposerAgentExecution> {
		const composerGoal: IComposerAgentGoal = {
			prompt: goal.promptPayload,
			activeFilePath: goal.suggestedFiles[0],
			maxSteps: options?.maxSteps ?? 8,
			enableShadowValidation: options?.enableShadowValidation ?? true
		};

		const execution = await composerAgent.executeGoal(composerGoal);
		this._onDidCompleteRepair.fire({ goal, execution });
		return execution;
	}

	public getRecentExceptions(): IFloatDebugExceptionEvent[] {
		return [...this._recentExceptions];
	}

	public getRepairGoals(): IFloatDebugRepairGoal[] {
		return [...this._repairGoals];
	}

	public clear(): void {
		this._recentExceptions.length = 0;
		this._repairGoals.length = 0;
	}

	public dispose(): void {
		this._onDidCreateRepairGoal.dispose();
		this._onDidCompleteRepair.dispose();
		this.clear();
	}
}
