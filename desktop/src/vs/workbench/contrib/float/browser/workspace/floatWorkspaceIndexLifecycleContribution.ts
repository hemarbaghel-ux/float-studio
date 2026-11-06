/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IFloatService } from '../../common/floatService.js';
import { FloatWorkspaceIndexLifecycle } from '../../common/workspace/floatWorkspaceIndexLifecycle.js';

/**
 * Connects the FLOAT codebase index to the workbench workspace and file events.
 * The current FLOAT context provider uses one active index, so this contribution
 * indexes the first local workspace folder and explicitly reports multi-root limits.
 */
export class FloatWorkspaceIndexLifecycleContribution extends Disposable implements IWorkbenchContribution {
  public static readonly ID = 'workbench.contrib.floatWorkspaceIndexLifecycle';

  private readonly _lifecycle: FloatWorkspaceIndexLifecycle;
  private _requestedRoot: string | undefined;
  private _hasRequestedRoot = false;

  constructor(
    @IFloatService floatService: IFloatService,
    @IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
    @IFileService fileService: IFileService,
    @ILogService private readonly _logService: ILogService
  ) {
    super();

    this._lifecycle = new FloatWorkspaceIndexLifecycle(floatService.getWorkspaceIndexer(), {
      onError: error => this._logService.warn('[FLOAT] Workspace index operation failed:', error)
    });
    this._register(toDisposable(() => this._lifecycle.dispose()));

    this._register(fileService.onDidFilesChange(event => {
      const toLocalPaths = (resources: readonly URI[]) =>
        resources.filter(resource => resource.scheme === 'file').map(resource => resource.fsPath);

      void this._lifecycle.handleFileChanges({
        added: toLocalPaths(event.rawAdded),
        updated: toLocalPaths(event.rawUpdated),
        deleted: toLocalPaths(event.rawDeleted)
      }).catch(error => this._logService.warn('[FLOAT] Failed to process workspace file changes:', error));
    }));

    this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._activateWorkspace()));
    this._register(this._workspaceContextService.onDidChangeWorkbenchState(() => this._activateWorkspace()));

    this._activateWorkspace();
  }

  private _activateWorkspace(): void {
    const folders = this._workspaceContextService.getWorkspace().folders;
    const firstFolder = folders[0];
    const rootPath = firstFolder?.uri.scheme === 'file' ? firstFolder.uri.fsPath : undefined;

    if (this._hasRequestedRoot && rootPath === this._requestedRoot) {
      return;
    }
    this._hasRequestedRoot = true;
    this._requestedRoot = rootPath;

    if (folders.length > 1) {
      this._logService.warn('[FLOAT] Multi-root workspace detected. The current codebase index uses the first workspace folder only.');
    }
    if (firstFolder && firstFolder.uri.scheme !== 'file') {
      this._logService.warn('[FLOAT] Codebase indexing currently supports local file workspaces only; remote/virtual workspace indexing is disabled.');
    }

    void this._lifecycle.activateWorkspace(rootPath).catch(error =>
      this._logService.warn('[FLOAT] Failed to activate the workspace index:', error)
    );
  }
}
