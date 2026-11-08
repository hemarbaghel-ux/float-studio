/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { FloatMultiAgentTeamOrchestrator } from './floatMultiAgentTeamOrchestrator.js';

export const CONTEXT_FLOAT_AGENT_ACTIVE = new RawContextKey<boolean>('floatAgentTaskActive', false);
export const CONTEXT_FLOAT_AGENT_STATE = new RawContextKey<string>('floatAgentTaskState', 'idle');

let _globalOrchestrator: FloatMultiAgentTeamOrchestrator | null = null;

export function getOrCreateGlobalOrchestrator(): FloatMultiAgentTeamOrchestrator {
	if (!_globalOrchestrator) {
		_globalOrchestrator = new FloatMultiAgentTeamOrchestrator();
	}
	return _globalOrchestrator;
}

export class FloatAgentStartGoalAction extends Action2 {
	static readonly ID = 'float.agent.startGoal';

	constructor() {
		super({
			id: FloatAgentStartGoalAction.ID,
			title: { value: 'FLOAT: Start Autonomous Multi-Agent Goal', original: 'FLOAT: Start Autonomous Multi-Agent Goal' },
			category: 'FLOAT',
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	override async run(accessor: ServicesAccessor, goal?: string): Promise<any> {
		const orchestrator = getOrCreateGlobalOrchestrator();
		const effectiveGoal = goal || 'Implement autonomous multi-agent task orchestration';
		return orchestrator.startSession(effectiveGoal);
	}
}

export class FloatAgentCancelTaskAction extends Action2 {
	static readonly ID = 'float.agent.cancelTask';

	constructor() {
		super({
			id: FloatAgentCancelTaskAction.ID,
			title: { value: 'FLOAT: Cancel Autonomous Multi-Agent Task', original: 'FLOAT: Cancel Autonomous Multi-Agent Task' },
			category: 'FLOAT',
			precondition: CONTEXT_FLOAT_AGENT_ACTIVE
		});
	}

	override async run(): Promise<void> {
		const orchestrator = getOrCreateGlobalOrchestrator();
		orchestrator.cancelSession();
	}
}
