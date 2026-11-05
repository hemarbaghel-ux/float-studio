/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IFloatOrchestratedFile } from '../../common/composer/floatMultiFileDiffOrchestrator.js';

export interface IFloatComposerSession {
	id: string;
	title: string;
	mode: 'agent' | 'normal';
	modelId: string;
	createdAt: number;
	files: IFloatOrchestratedFile[];
	isExecuting: boolean;
	status: 'idle' | 'generating' | 'evaluating_shadow' | 'ready_for_review' | 'applied' | 'rejected';
}

export class FloatComposerViewPane extends Disposable {
	static readonly ID = 'workbench.view.floatComposer';
	static readonly TITLE = 'FLOAT Composer';

	private readonly _sessions = new Map<string, IFloatComposerSession>();
	private _activeSessionId: string | null = null;

	private readonly _onDidChangeActiveSession = this._register(new Emitter<IFloatComposerSession | null>());
	public readonly onDidChangeActiveSession: Event<IFloatComposerSession | null> = this._onDidChangeActiveSession.event;

	private readonly _onDidChangeSessions = this._register(new Emitter<void>());
	public readonly onDidChangeSessions: Event<void> = this._onDidChangeSessions.event;

	constructor() {
		super();
		this.createSession('New Composer Session', 'agent');
	}

	public getSessions(): IFloatComposerSession[] {
		return Array.from(this._sessions.values());
	}

	public getActiveSession(): IFloatComposerSession | null {
		return this._activeSessionId ? (this._sessions.get(this._activeSessionId) || null) : null;
	}

	public createSession(title: string = 'Composer Session', mode: 'agent' | 'normal' = 'agent'): IFloatComposerSession {
		const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
		const session: IFloatComposerSession = {
			id,
			title,
			mode,
			modelId: 'gpt-6-astra',
			createdAt: Date.now(),
			files: [],
			isExecuting: false,
			status: 'idle'
		};

		this._sessions.set(id, session);
		this._activeSessionId = id;
		this._onDidChangeSessions.fire();
		this._onDidChangeActiveSession.fire(session);
		return session;
	}

	public setActiveSession(sessionId: string): void {
		if (this._sessions.has(sessionId) && this._activeSessionId !== sessionId) {
			this._activeSessionId = sessionId;
			this._onDidChangeActiveSession.fire(this.getActiveSession());
		}
	}

	public setSessionMode(sessionId: string, mode: 'agent' | 'normal'): void {
		const session = this._sessions.get(sessionId);
		if (session) {
			session.mode = mode;
			this._onDidChangeSessions.fire();
			if (this._activeSessionId === sessionId) {
				this._onDidChangeActiveSession.fire(session);
			}
		}
	}

	public closeSession(sessionId: string): void {
		this._sessions.delete(sessionId);
		if (this._activeSessionId === sessionId) {
			const remaining = Array.from(this._sessions.keys());
			this._activeSessionId = remaining.length > 0 ? remaining[0] : null;
			this._onDidChangeActiveSession.fire(this.getActiveSession());
		}
		this._onDidChangeSessions.fire();
	}

	public updateSessionFiles(sessionId: string, files: IFloatOrchestratedFile[]): void {
		const session = this._sessions.get(sessionId);
		if (session) {
			session.files = [...files];
			session.status = files.length > 0 ? 'ready_for_review' : 'idle';
			this._onDidChangeSessions.fire();
			if (this._activeSessionId === sessionId) {
				this._onDidChangeActiveSession.fire(session);
			}
		}
	}

	public setSessionStatus(sessionId: string, status: IFloatComposerSession['status']): void {
		const session = this._sessions.get(sessionId);
		if (session) {
			session.status = status;
			session.isExecuting = status === 'generating' || status === 'evaluating_shadow';
			this._onDidChangeSessions.fire();
			if (this._activeSessionId === sessionId) {
				this._onDidChangeActiveSession.fire(session);
			}
		}
	}

	/**
	 * Renders mock DOM structure for headless and workbench environments
	 */
	public renderContainer(): any {
		return {
			id: FloatComposerViewPane.ID,
			title: FloatComposerViewPane.TITLE,
			activeSessionId: this._activeSessionId,
			totalSessions: this._sessions.size,
			activeSession: this.getActiveSession()
		};
	}
}
