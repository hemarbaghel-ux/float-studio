/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFloatDebugRepairGoal } from '../../common/debug/floatDebugAutoRepairService.js';

let _debugExceptionActive = false;
let _repairInProgress = false;
let _lastActiveGoal: IFloatDebugRepairGoal | null = null;

/**
 * ContextKey active when an unhandled runtime debug exception or break state is paused.
 */
export const ctxFloatDebugExceptionActive = new RawContextKey<boolean>('floatDebugExceptionActive', false);

/**
 * ContextKey active while an autonomous Composer self-repair turn is executing.
 */
export const ctxFloatDebugRepairInProgress = new RawContextKey<boolean>('floatDebugRepairInProgress', false);

/**
 * Action triggered by developer (Ctrl+Shift+D or Alt+F5) to initiate automated self-repair.
 */
export class FloatTriggerDebugAutoRepairAction extends Action2 {
	static readonly ID = 'float.debug.autoRepair';

	constructor() {
		super({
			id: FloatTriggerDebugAutoRepairAction.ID,
			title: { value: 'FLOAT: Fix Debug Exception with Composer', original: 'FLOAT: Fix Debug Exception with Composer' },
			f1: true,
			precondition: ctxFloatDebugExceptionActive,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyD,
				secondary: [KeyMod.Alt | KeyCode.F5],
				weight: KeybindingWeight.WorkbenchContrib + 150
			},
			menu: {
				id: MenuId.CommandPalette
			}
		});
	}

	public run(accessor: ServicesAccessor): void {
		const notificationService = accessor.get(INotificationService);
		if (!_lastActiveGoal) {
			notificationService.info('FLOAT: No active debug exception context to repair.');
			return;
		}

		_repairInProgress = true;
		notificationService.info(`FLOAT: Initiating autonomous self-repair for ${_lastActiveGoal.goalTitle}...`);
	}
}

/**
 * Action to dismiss the active debug repair notification/banner.
 */
export class FloatDismissDebugRepairAction extends Action2 {
	static readonly ID = 'float.debug.dismissRepair';

	constructor() {
		super({
			id: FloatDismissDebugRepairAction.ID,
			title: { value: 'FLOAT: Dismiss Debug Exception Auto-Repair', original: 'FLOAT: Dismiss Debug Exception Auto-Repair' },
			f1: true,
			precondition: ctxFloatDebugExceptionActive,
			keybinding: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.WorkbenchContrib + 50
			},
			menu: {
				id: MenuId.CommandPalette
			}
		});
	}

	public run(accessor: ServicesAccessor): void {
		_debugExceptionActive = false;
		_lastActiveGoal = null;
		const notificationService = accessor.get(INotificationService);
		notificationService.info('FLOAT: Debug auto-repair prompt dismissed.');
	}
}

/**
 * Action to inspect captured DAP stack frames and local variables in Composer prompt format.
 */
export class FloatInspectLastDebugContextAction extends Action2 {
	static readonly ID = 'float.debug.inspectContext';

	constructor() {
		super({
			id: FloatInspectLastDebugContextAction.ID,
			title: { value: 'FLOAT: Inspect Last Debug Breakpoint Context', original: 'FLOAT: Inspect Last Debug Breakpoint Context' },
			f1: true,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyD,
				weight: KeybindingWeight.WorkbenchContrib
			},
			menu: {
				id: MenuId.CommandPalette
			}
		});
	}

	public run(accessor: ServicesAccessor): void {
		const notificationService = accessor.get(INotificationService);
		if (!_lastActiveGoal) {
			notificationService.info('FLOAT: No debug break context captured yet.');
			return;
		}
		notificationService.info(`FLOAT Debug Inspection: ${_lastActiveGoal.goalTitle}`);
	}
}

export function isFloatDebugExceptionActive(): boolean {
	return _debugExceptionActive;
}

export function setFloatDebugExceptionActive(active: boolean): void {
	_debugExceptionActive = active;
}

export function isFloatDebugRepairInProgress(): boolean {
	return _repairInProgress;
}

export function setFloatDebugRepairInProgress(inProgress: boolean): void {
	_repairInProgress = inProgress;
}

export function getLastActiveRepairGoal(): IFloatDebugRepairGoal | null {
	return _lastActiveGoal;
}

export function setLastActiveRepairGoal(goal: IFloatDebugRepairGoal | null): void {
	_lastActiveGoal = goal;
	_debugExceptionActive = goal !== null;
}
