/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDebugService, State } from '../../../debug/common/debug.js';
import type { FloatDebugAutoRepairService } from './floatDebugAutoRepairService.js';

export interface IFloatDebugStackFrame {
	sourceUri?: string;
	fileName?: string;
	lineNumber: number;
	column: number;
	functionName: string;
}

export interface IFloatDebugVariable {
	name: string;
	value: string;
	type?: string;
}

export interface IFloatDebugBreakContext {
	sessionId: string;
	sessionName: string;
	threadId?: number;
	reason: 'exception' | 'breakpoint' | 'step' | 'pause';
	exceptionDetails?: {
		id?: string;
		description?: string;
		stackTrace?: string;
	};
	focusedFrame?: IFloatDebugStackFrame;
	callStack: IFloatDebugStackFrame[];
	variables: IFloatDebugVariable[];
	timestamp: number;
}

export class FloatDebugAdapterBridge extends Disposable {
	static readonly ID = 'workbench.contrib.floatDebugAdapterBridge';

	private _lastBreakContext: IFloatDebugBreakContext | null = null;

	private readonly _onDidCaptureBreak = this._register(new Emitter<IFloatDebugBreakContext>());
	public readonly onDidCaptureBreak: Event<IFloatDebugBreakContext> = this._onDidCaptureBreak.event;

	constructor(
		private readonly _debugService?: IDebugService,
		private readonly _autoRepairService?: FloatDebugAutoRepairService
	) {
		super();
		if (this._debugService) {
			this._register(
				this._debugService.onDidChangeState(state => {
					if (state === State.Stopped) {
						this.captureActiveRuntimeState();
					}
				})
			);
		}
	}

	public getLastBreakContext(): IFloatDebugBreakContext | null {
		return this._lastBreakContext;
	}

	public async captureActiveRuntimeState(): Promise<IFloatDebugBreakContext | null> {
		if (!this._debugService) {
			return null;
		}

		const viewModel = this._debugService.getViewModel();
		const focusedSession = viewModel.focusedSession;
		const focusedThread = viewModel.focusedThread;
		const focusedStackFrame = viewModel.focusedStackFrame;

		if (!focusedSession) {
			return null;
		}

		const callStack: IFloatDebugStackFrame[] = [];
		const variables: IFloatDebugVariable[] = [];

		if (focusedThread) {
			const frames = focusedThread.getCallStack();
			for (const frame of frames.slice(0, 10)) {
				callStack.push({
					sourceUri: frame.source?.uri?.toString(),
					fileName: frame.source?.name,
					lineNumber: frame.range?.startLineNumber ?? 0,
					column: frame.range?.startColumn ?? 0,
					functionName: frame.name
				});
			}
		}

		if (focusedStackFrame) {
			try {
				const scopes = await focusedStackFrame.getScopes();
				const localScope = scopes.find(s => s.name.toLowerCase().includes('local')) || scopes[0];
				if (localScope) {
					const children = await localScope.getChildren();
					for (const child of children.slice(0, 20)) {
						variables.push({
							name: child.name,
							value: child.value,
							type: child.type
						});
					}
				}
			} catch {
				// Non-fatal if scopes fail to resolve in test mocks
			}
		}

		const stoppedDetails = focusedThread?.stoppedDetails;
		const reason = (stoppedDetails?.reason === 'exception' ? 'exception' : 'breakpoint') as 'exception' | 'breakpoint';

		const context: IFloatDebugBreakContext = {
			sessionId: focusedSession.getId(),
			sessionName: focusedSession.name,
			threadId: focusedThread?.threadId,
			reason,
			exceptionDetails: stoppedDetails?.description ? {
				description: stoppedDetails.description,
				stackTrace: stoppedDetails.text
			} : undefined,
			focusedFrame: focusedStackFrame ? {
				sourceUri: focusedStackFrame.source?.uri?.toString(),
				fileName: focusedStackFrame.source?.name,
				lineNumber: focusedStackFrame.range?.startLineNumber ?? 0,
				column: focusedStackFrame.range?.startColumn ?? 0,
				functionName: focusedStackFrame.name
			} : (callStack[0] || undefined),
			callStack,
			variables,
			timestamp: Date.now()
		};

		this._lastBreakContext = context;
		this._onDidCaptureBreak.fire(context);
		if (this._autoRepairService) {
			this._autoRepairService.handleBreakContext(context);
		}
		return context;
	}

	public formatDebugPromptForComposer(context?: IFloatDebugBreakContext): string {
		const ctx = context || this._lastBreakContext;
		if (!ctx) {
			return 'Debug context unavailable.';
		}

		let prompt = `## Debugger Runtime Inspection (${ctx.reason.toUpperCase()})\n\n`;
		prompt += `- **Debug Session**: ${ctx.sessionName} (ID: ${ctx.sessionId})\n`;

		if (ctx.exceptionDetails?.description) {
			prompt += `- **Exception**: ${ctx.exceptionDetails.description}\n`;
			if (ctx.exceptionDetails.stackTrace) {
				prompt += `\`\`\`\n${ctx.exceptionDetails.stackTrace}\n\`\`\`\n`;
			}
		}

		if (ctx.focusedFrame) {
			prompt += `- **Paused Location**: ${ctx.focusedFrame.fileName || 'file'}:${ctx.focusedFrame.lineNumber}:${ctx.focusedFrame.column} in \`${ctx.focusedFrame.functionName}\`\n`;
		}

		if (ctx.variables.length > 0) {
			prompt += `\n### Local Variables at Breakpoint\n`;
			for (const v of ctx.variables) {
				prompt += `- \`${v.name}\` (${v.type || 'unknown'}): \`${v.value}\`\n`;
			}
		}

		if (ctx.callStack.length > 0) {
			prompt += `\n### Call Stack\n`;
			for (let i = 0; i < ctx.callStack.length; i++) {
				const frame = ctx.callStack[i];
				prompt += `${i + 1}. \`${frame.functionName}\` at ${frame.fileName || 'file'}:${frame.lineNumber}\n`;
			}
		}

		prompt += `\n**Goal**: Diagnose the runtime error at this stack frame and propose an atomic patch to fix the bug.`;
		return prompt;
	}
}
