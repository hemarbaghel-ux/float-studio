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
  private _requestedRoot: string | undefined;

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
      void this._synchronizer.handleFileChanges({
        added: event.rawAdded.filter(resource => resource.scheme === 'file'),
        updated: event.rawUpdated.filter(resource => resource.scheme === 'file'),
        deleted: event.rawDeleted.filter(resource => resource.scheme === 'file')
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
    const firstFolder = folders[0];
    const root = firstFolder?.uri.scheme === 'file' ? firstFolder.uri : undefined;
    const rootKey = root?.toString();

    if (rootKey === this._requestedRoot) {
      if (this._runtimeService.state === 'running') {
        void this._synchronizer.scanWorkspace();
      }
      return;
    }

    this._requestedRoot = rootKey;
    if (folders.length > 1) {
      this._logService.warn('[FLOAT] Daemon semantic indexing currently uses the first workspace folder only.');
    }
    if (firstFolder && firstFolder.uri.scheme !== 'file') {
      this._logService.warn('[FLOAT] Daemon semantic indexing currently supports local file workspaces only.');
    }

    void this._synchronizer.setWorkspaceRoot(root).then(() => {
      if (root && this._runtimeService.state === 'running') {
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
