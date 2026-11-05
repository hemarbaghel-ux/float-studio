/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';

export interface IFloatDebugStackFrame {
	frameId: number;
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
	goalTitle: string;
	promptPayload: string;
	suggestedFiles: string[];
	timestamp: number;
}

export class FloatDebugAutoRepairService implements IDisposable {
	private readonly _recentExceptions: IFloatDebugExceptionEvent[] = [];
	private readonly _repairGoals: IFloatDebugRepairGoal[] = [];

	public handleDebugException(event: IFloatDebugExceptionEvent): IFloatDebugRepairGoal {
		this._recentExceptions.push(event);

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

		const repairGoal: IFloatDebugRepairGoal = {
			goalTitle,
			promptPayload: promptLines.join('\n'),
			suggestedFiles: [topFrame.filePath],
			timestamp: Date.now()
		};

		this._repairGoals.push(repairGoal);
		return repairGoal;
	}

	public getRecentExceptions(): IFloatDebugExceptionEvent[] {
		return [...this._recentExceptions];
	}

	public getRepairGoals(): IFloatDebugRepairGoal[] {
		return [...this._repairGoals];
	}

	public dispose(): void {
		this._recentExceptions.length = 0;
		this._repairGoals.length = 0;
	}
}
