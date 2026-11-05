/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';

export type FloatAgentState = 'idle' | 'planning' | 'executing_tool' | 'verifying_gate' | 'self_repairing' | 'completed' | 'error';

export interface IFloatAgentTurn {
	turnNumber: number;
	thought: string;
	toolCall?: { name: string; args: Record<string, any> };
	toolResult?: any;
	gatePassed?: boolean;
	timestamp: number;
}

export interface IFloatAgentSession {
	sessionId: string;
	goal: string;
	state: FloatAgentState;
	turns: IFloatAgentTurn[];
	maxTurns: number;
	activeFiles: string[];
}

export class FloatAutonomousAgentController implements IDisposable {
	private _activeSession: IFloatAgentSession | null = null;
	private readonly _onStateChange = new Emitter<{ sessionId: string; state: FloatAgentState }>();
	public readonly onStateChange: Event<{ sessionId: string; state: FloatAgentState }> = this._onStateChange.event;

	public startSession(goal: string, maxTurns: number = 5): IFloatAgentSession {
		const session: IFloatAgentSession = {
			sessionId: `agent-sess-${Date.now()}`,
			goal,
			state: 'planning',
			turns: [],
			maxTurns,
			activeFiles: []
		};

		this._activeSession = session;
		this._onStateChange.fire({ sessionId: session.sessionId, state: 'planning' });
		return session;
	}

	public getActiveSession(): IFloatAgentSession | null {
		return this._activeSession;
	}

	public async recordTurn(thought: string, toolCall?: { name: string; args: Record<string, any> }, toolResult?: any): Promise<IFloatAgentTurn> {
		if (!this._activeSession) {
			throw new Error('No active agent session');
		}

		const turnNumber = this._activeSession.turns.length + 1;
		const turn: IFloatAgentTurn = {
			turnNumber,
			thought,
			toolCall,
			toolResult,
			timestamp: Date.now()
		};

		this._activeSession.turns.push(turn);
		return turn;
	}

	public verifyGate(diagnosticsErrorCount: number): boolean {
		if (!this._activeSession) return false;

		const isGateClean = diagnosticsErrorCount === 0;
		if (isGateClean) {
			this._activeSession.state = 'completed';
			this._onStateChange.fire({ sessionId: this._activeSession.sessionId, state: 'completed' });
		} else {
			if (this._activeSession.turns.length >= this._activeSession.maxTurns) {
				this._activeSession.state = 'error';
				this._onStateChange.fire({ sessionId: this._activeSession.sessionId, state: 'error' });
			} else {
				this._activeSession.state = 'self_repairing';
				this._onStateChange.fire({ sessionId: this._activeSession.sessionId, state: 'self_repairing' });
			}
		}

		const lastTurn = this._activeSession.turns[this._activeSession.turns.length - 1];
		if (lastTurn) {
			lastTurn.gatePassed = isGateClean;
		}

		return isGateClean;
	}

	public dispose(): void {
		this._activeSession = null;
		this._onStateChange.dispose();
	}
}
