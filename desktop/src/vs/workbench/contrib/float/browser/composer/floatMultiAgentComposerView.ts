/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { FloatComposerViewPane } from './floatComposerViewPane.js';
import { FloatMultiAgentTeamOrchestrator, IAgentMessage, IAgentSessionResult } from '../agent/floatMultiAgentTeamOrchestrator.js';
import { FloatAgentTaskDag } from '../agent/floatAgentTaskDag.js';

export interface IAgentTimelineCard {
	id: string;
	role: string;
	title: string;
	status: string;
	message?: string;
	timestamp: number;
}

export class FloatMultiAgentComposerView extends Disposable {
	private readonly _composerPane: FloatComposerViewPane;
	private readonly _orchestrator: FloatMultiAgentTeamOrchestrator;
	private readonly _timelineCards: IAgentTimelineCard[] = [];

	private readonly _onDidUpdateTimeline = this._register(new Emitter<IAgentTimelineCard[]>());
	public readonly onDidUpdateTimeline: Event<IAgentTimelineCard[]> = this._onDidUpdateTimeline.event;

	constructor(composerPane?: FloatComposerViewPane, orchestrator?: FloatMultiAgentTeamOrchestrator) {
		super();
		this._composerPane = composerPane || new FloatComposerViewPane();
		this._orchestrator = orchestrator || new FloatMultiAgentTeamOrchestrator();

		this._wireOrchestratorEvents();
	}

	public getComposerPane(): FloatComposerViewPane {
		return this._composerPane;
	}

	public getOrchestrator(): FloatMultiAgentTeamOrchestrator {
		return this._orchestrator;
	}

	public getTimeline(): IAgentTimelineCard[] {
		return [...this._timelineCards];
	}

	private _wireOrchestratorEvents(): void {
		// 1. On agent message, add timeline card
		this._register(this._orchestrator.onDidAgentMessage((msg: IAgentMessage) => {
			const card: IAgentTimelineCard = {
				id: msg.id,
				role: msg.senderRole,
				title: `[${msg.senderRole.toUpperCase()}] ${msg.type}`,
				status: 'delivered',
				message: msg.content,
				timestamp: msg.timestamp
			};
			this._timelineCards.push(card);
			this._onDidUpdateTimeline.fire(this.getTimeline());

			// If coder proposed changes, update composer files
			if (msg.type === 'code_proposal' && msg.payload?.filesModified) {
				const active = this._composerPane.getActiveSession();
				if (active) {
					const orchestratedFiles = msg.payload.filesModified.map((f: string) => ({
						path: f,
						originalContent: '// original content',
						modifiedContent: '// modified content by multi-agent coder',
						hunks: [{ id: 'hunk-1', startLine: 1, endLine: 5, status: 'pending' as const }]
					}));
					this._composerPane.updateSessionFiles(active.id, orchestratedFiles);
				}
			}
		}));

		// 2. On DAG update, update composer session status
		this._register(this._orchestrator.onDidUpdateDag(({ dag }: { dag: FloatAgentTaskDag }) => {
			const active = this._composerPane.getActiveSession();
			if (active) {
				const stats = dag.getGraphStats();
				if (stats.running > 0) {
					this._composerPane.setSessionStatus(active.id, 'generating');
				} else if (stats.completed === stats.total) {
					this._composerPane.setSessionStatus(active.id, 'ready_for_review');
				}
			}
		}));
	}

	public async triggerGoal(goal: string): Promise<IAgentSessionResult> {
		this._timelineCards.length = 0;
		const session = this._composerPane.createSession(`Agent Goal: ${goal}`, 'agent');
		this._composerPane.setSessionStatus(session.id, 'generating');

		const result = await this._orchestrator.startSession(goal);
		this._composerPane.setSessionStatus(session.id, result.status === 'success' ? 'ready_for_review' : 'idle');
		return result;
	}

	public cancelGoal(): void {
		this._orchestrator.cancelSession();
		const active = this._composerPane.getActiveSession();
		if (active) {
			this._composerPane.setSessionStatus(active.id, 'rejected');
		}
	}
}
