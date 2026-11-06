/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IFloatDaemonRuntimeService, FloatDaemonRuntimeState } from '../common/daemon/floatDaemonRuntimeService.js';
import { FloatDaemonRuntimeService } from './floatDaemonRuntimeService.js';

registerSingleton(IFloatDaemonRuntimeService, FloatDaemonRuntimeService, InstantiationType.Delayed);

export class FloatDaemonRuntimeContribution extends Disposable implements IWorkbenchContribution {
  public static readonly ID = 'workbench.contrib.floatDaemonRuntime';

  constructor(
    @IFloatDaemonRuntimeService private readonly _runtimeService: IFloatDaemonRuntimeService,
    @ILogService private readonly _logService: ILogService
  ) {
    super();

    this._register(this._runtimeService.onDidChangeState(status => {
      if (status.state === 'failed') {
        this._logService.warn('[FLOAT] Daemon runtime state:', status.message || status.state);
      } else {
        this._logService.trace('[FLOAT] Daemon runtime state:', status.state);
      }
    }));
    this._register(toDisposable(() => {
      void this._runtimeService.stop();
    }));

    void this._runtimeService.start().catch(error => {
      this._logService.warn('[FLOAT] Daemon did not start; local non-daemon features remain available:', error);
    });
  }
}

registerWorkbenchContribution2(
  FloatDaemonRuntimeContribution.ID,
  FloatDaemonRuntimeContribution,
  WorkbenchPhase.AfterRestored
);
