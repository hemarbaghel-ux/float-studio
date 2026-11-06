/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IUtilityProcessWorkerWorkbenchService, IUtilityProcessWorker } from '../../../services/utilityProcess/electron-sandbox/utilityProcessWorkerWorkbenchService.js';
import { FloatDaemonClient } from '../common/daemon/floatDaemonClient.js';
import { FloatDaemonRuntimeState, IFloatDaemonRuntimeService, IFloatDaemonRuntimeStatus } from '../common/daemon/floatDaemonRuntimeService.js';

interface IFloatDaemonRuntimeControlChannel {
  call<T>(command: string, arg?: unknown): Promise<T>;
}

interface IFloatDaemonWorkerStartResult {
  status: 'running';
  pipeName: string;
  pid: number;
}

const FLOAT_DAEMON_WORKER_MODULE = 'vs/workbench/contrib/float/electron-sandbox/floatDaemonWorkerMain';
const FLOAT_DAEMON_WORKER_TYPE = 'float-daemon';
const MAX_RESTART_DELAY_MS = 30_000;

export class FloatDaemonRuntimeService extends Disposable implements IFloatDaemonRuntimeService {
  declare readonly _serviceBrand: undefined;

  private readonly _onDidChangeState = this._register(new Emitter<IFloatDaemonRuntimeStatus>());
  public readonly onDidChangeState: Event<IFloatDaemonRuntimeStatus> = this._onDidChangeState.event;

  private _state: FloatDaemonRuntimeState = 'stopped';
  private _worker: IUtilityProcessWorker | undefined;
  private _controlChannel: IFloatDaemonRuntimeControlChannel | undefined;
  private _client: FloatDaemonClient | undefined;
  private _runtimeDirectory: string | undefined;
  private _storageDirectory: string | undefined;
  private _restartTimer: ReturnType<typeof setTimeout> | undefined;
  private _startPromise: Promise<void> | undefined;
  private _restartAttempt = 0;
  private _stopping = false;
  private _disposed = false;

  constructor(
    @IUtilityProcessWorkerWorkbenchService private readonly _utilityProcessService: IUtilityProcessWorkerWorkbenchService,
    @IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
    @ILogService private readonly _logService: ILogService
  ) {
    super();
    this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._handleWorkspaceChange()));
    this._register(this._workspaceContextService.onDidChangeWorkbenchState(() => this._handleWorkspaceChange()));
  }

  public get state(): FloatDaemonRuntimeState {
    return this._state;
  }

  public getClient(): FloatDaemonClient | undefined {
    return this._state === 'running' ? this._client : undefined;
  }

  public start(): Promise<void> {
    if (this._disposed) {
      return Promise.resolve();
    }
    if (this._state === 'running') {
      return Promise.resolve();
    }
    if (this._startPromise) {
      return this._startPromise;
    }

    this._stopping = false;
    this._cancelRestart();
    this._startPromise = this._startWorker()
      .catch(error => {
        this._releaseWorkerResources(true);
        this._setState('failed', error instanceof Error ? error.message : String(error));
        this._logService.error('[FLOAT] Daemon startup failed:', error);
        if (!this._stopping && !this._disposed) {
          this._scheduleRestart();
        }
        throw error;
      })
      .finally(() => {
        this._startPromise = undefined;
      });

    return this._startPromise;
  }

  public async stop(): Promise<void> {
    this._stopping = true;
    this._cancelRestart();

    if (this._startPromise) {
      await this._startPromise.catch(() => undefined);
    }

    const controlChannel = this._controlChannel;
    try {
      await controlChannel?.call('stop', {});
    } catch (error) {
      this._logService.trace('[FLOAT] Daemon stop request did not complete:', error);
    }

    this._releaseWorkerResources(true);
    this._setState('stopped');
    this._stopping = false;
  }

  public override dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    void this.stop();
    super.dispose();
  }

  private async _startWorker(): Promise<void> {
    this._setState('starting');

    const runtimeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'float-daemon-'));
    this._runtimeDirectory = runtimeDirectory;
    if (process.platform !== 'win32') {
      fs.chmodSync(runtimeDirectory, 0o700);
    }

    const pipeName = process.platform === 'win32'
      ? '\\\\.\\pipe\\float-daemon-' + generateUuid()
      : path.join(runtimeDirectory, 'daemon.sock');

    const storageDir = this._resolveStorageDirectory(runtimeDirectory);
    this._storageDirectory = storageDir;
    const worker = await this._utilityProcessService.createWorker({
      moduleId: FLOAT_DAEMON_WORKER_MODULE,
      type: FLOAT_DAEMON_WORKER_TYPE
    });

    this._worker = worker;
    this._controlChannel = worker.client.getChannel('floatDaemonRuntime') as IFloatDaemonRuntimeControlChannel;

    void worker.onDidTerminate.then(({ reason }) => this._handleWorkerTermination(worker, reason));

    const startResult = await this._controlChannel.call<IFloatDaemonWorkerStartResult>('start', {
      pipeName,
      storageDir
    });
    if (startResult.status !== 'running' || startResult.pipeName !== pipeName) {
      throw new Error('FLOAT daemon worker did not confirm the requested pipe path.');
    }

    const client = new FloatDaemonClient({ pipeName });
    this._client = client;
    await client.connect(5_000);

    const health = await client.ping();
    if (!health || health.status !== 'ok') {
      throw new Error('FLOAT daemon health check failed.');
    }

    if (this._worker !== worker || this._stopping || this._disposed) {
      client.dispose();
      throw new Error('FLOAT daemon worker terminated during startup.');
    }

    this._restartAttempt = 0;
    this._setState('running');
    this._logService.info('[FLOAT] Daemon utility process ready; PID:', startResult.pid);
  }

  private _handleWorkspaceChange(): void {
    if (this._disposed || this._stopping || (this._state !== 'running' && this._state !== 'starting')) {
      return;
    }

    const activeStorageDirectory = this._resolveStorageDirectory(this._runtimeDirectory || os.tmpdir());
    const currentStorageDirectory = this._storageDirectory;
    if (activeStorageDirectory === currentStorageDirectory) {
      return;
    }

    this._logService.info('[FLOAT] Active workspace changed; restarting the daemon against the new workspace index.');
    void this.stop()
      .then(() => this.start())
      .catch(error => this._logService.warn('[FLOAT] Daemon restart after workspace change failed:', error));
  }

  private _resolveStorageDirectory(runtimeDirectory: string): string {
    const folder = this._workspaceContextService.getWorkspace().folders[0];
    if (folder?.uri.scheme === 'file') {
      return path.join(folder.uri.fsPath, '.float', 'daemon-index');
    }
    return path.join(runtimeDirectory, 'index');
  }

  private _handleWorkerTermination(worker: IUtilityProcessWorker, reason: { code?: number; signal?: string }): void {
    if (this._worker !== worker) {
      return;
    }

    this._logService.warn('[FLOAT] Daemon utility process exited:', reason);
    const expected = this._stopping || this._disposed;
    this._releaseWorkerResources(false);

    if (expected) {
      this._setState('stopped');
      return;
    }

    this._setState('failed', 'Daemon utility process exited unexpectedly.');
    this._scheduleRestart();
  }

  private _scheduleRestart(): void {
    if (this._restartTimer || this._disposed || this._stopping) {
      return;
    }

    const delayMs = Math.min(1_000 * (2 ** this._restartAttempt), MAX_RESTART_DELAY_MS);
    this._restartAttempt++;
    this._logService.warn('[FLOAT] Restarting daemon utility process in', delayMs, 'ms.');
    this._restartTimer = setTimeout(() => {
      this._restartTimer = undefined;
      void this.start().catch(() => undefined);
    }, delayMs);
  }

  private _cancelRestart(): void {
    if (this._restartTimer) {
      clearTimeout(this._restartTimer);
      this._restartTimer = undefined;
    }
  }

  private _releaseWorkerResources(disposeWorker: boolean): void {
    this._client?.dispose();
    this._client = undefined;

    const worker = this._worker;
    this._worker = undefined;
    this._controlChannel = undefined;
    this._storageDirectory = undefined;
    if (disposeWorker) {
      worker?.dispose();
    }

    const runtimeDirectory = this._runtimeDirectory;
    this._runtimeDirectory = undefined;
    if (runtimeDirectory && fs.existsSync(runtimeDirectory)) {
      try {
        fs.rmSync(runtimeDirectory, { recursive: true, force: true });
      } catch (error) {
        this._logService.warn('[FLOAT] Failed to clean daemon runtime directory:', error);
      }
    }
  }

  private _setState(state: FloatDaemonRuntimeState, message?: string): void {
    if (this._state === state && !message) {
      return;
    }
    this._state = state;
    this._onDidChangeState.fire({ state, message });
  }
}
