/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IFloatDaemonRuntimeService } from '../common/daemon/floatDaemonRuntimeService.js';
import { FloatDaemonWorkspaceIndexSynchronizer } from '../common/daemon/floatDaemonWorkspaceIndexSynchronizer.js';

export class FloatDaemonWorkspaceIndexContribution extends Disposable implements IWorkbenchContribution {
  public static readonly ID = 'workbench.contrib.floatDaemonWorkspaceIndex';

  private readonly _synchronizer: FloatDaemonWorkspaceIndexSynchronizer;
  private _requestedRoots: string | undefined;

  constructor(
    @IFloatDaemonRuntimeService private readonly _runtimeService: IFloatDaemonRuntimeService,
    @IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
    @IFileService fileService: IFileService,
    @ILogService private readonly _logService: ILogService
  ) {
    super();

    this._synchronizer = new FloatDaemonWorkspaceIndexSynchronizer(
      fileService,
      () => this._runtimeService.getClient(),
      error => this._logService.warn('[FLOAT] Daemon workspace indexing failed:', error)
    );

    this._register(fileService.onDidFilesChange(event => {
      // IFileService events are scoped to the roots by the synchronizer,
      // which also checks URI scheme and authority before deriving a relative path.
      void this._synchronizer.handleFileChanges({
        added: event.rawAdded,
        updated: event.rawUpdated,
        deleted: event.rawDeleted
      });
    }));

    this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._activateWorkspace()));
    this._register(this._workspaceContextService.onDidChangeWorkbenchState(() => this._activateWorkspace()));
    this._register(this._runtimeService.onDidChangeState(status => {
      if (status.state === 'running') {
        void this._synchronizer.scanWorkspace();
      }
    }));

    this._activateWorkspace();
  }

  private _activateWorkspace(): void {
    const folders = this._workspaceContextService.getWorkspace().folders;
    const roots = folders.map(folder => folder.uri);
    const rootKey = roots.map(root => root.toString()).join('|');

    if (rootKey === this._requestedRoots) {
      if (this._runtimeService.state === 'running') {
        void this._synchronizer.scanWorkspace();
      }
      return;
    }

    this._requestedRoots = rootKey;
    if (roots.length > 0) {
      this._logService.info('[FLOAT] Activating daemon indexing for', roots.length, 'workspace folder(s) using Code-OSS file providers.');
    }

    void this._synchronizer.setWorkspaceRoots(roots).then(() => {
      if (roots.length > 0 && this._runtimeService.state === 'running') {
        return this._synchronizer.scanWorkspace();
      }
    }).catch(error => this._logService.warn('[FLOAT] Failed to activate daemon workspace indexing:', error));
  }
}

registerWorkbenchContribution2(
  FloatDaemonWorkspaceIndexContribution.ID,
  FloatDaemonWorkspaceIndexContribution,
  WorkbenchPhase.AfterRestored
);
