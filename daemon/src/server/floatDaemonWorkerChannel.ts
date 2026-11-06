/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Event } from '../../../desktop/src/vs/base/common/event.js';
import { IServerChannel } from '../../../desktop/src/vs/base/parts/ipc/common/ipc.js';
import { FloatDaemonClient } from '../../../desktop/src/vs/workbench/contrib/float/common/daemon/floatDaemonClient.js';
import { FloatDaemonServer, IFloatDaemonOptions } from './floatDaemonServer.js';

export interface IFloatDaemonWorkerStartOptions {
  workspaceId: string;
  instanceId: string;
}

export interface IFloatDaemonWorkerStatus {
  status: 'running' | 'stopped';
  pid?: number;
}

export interface IFloatDaemonWorkerServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getPipePath(): string;
}

export interface IFloatDaemonWorkerClient {
  connect(timeoutMs?: number): Promise<void>;
  ping(): Promise<{ status?: string }>;
  call<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
  dispose(): void;
}

export type FloatDaemonServerFactory = (options: IFloatDaemonOptions) => IFloatDaemonWorkerServer;
export type FloatDaemonClientFactory = (pipeName: string) => IFloatDaemonWorkerClient;

const ALLOWED_DAEMON_METHODS = new Set([
  'ping',
  'semantic_index_file',
  'semantic_remove_file',
  'semantic_search',
  'semantic_get_symbols',
  'semantic_chunk_file',

]);

/**
 * Control channel hosted in the Electron utility process. All filesystem,
 * named-pipe and TCP operations remain in this Node-capable process.
 */
export class FloatDaemonWorkerChannel implements IServerChannel<string> {
  private _server: IFloatDaemonWorkerServer | undefined;
  private _client: IFloatDaemonWorkerClient | undefined;
  private _storageDir: string | undefined;
  private _runtimeDirectory: string | undefined;
  private _workspaceId: string | undefined;

  constructor(
    private readonly _createServer: FloatDaemonServerFactory = options => new FloatDaemonServer(options),
    private readonly _createClient: FloatDaemonClientFactory = pipeName => new FloatDaemonClient({ pipeName })
  ) {
    // Best-effort removal if the utility process exits unexpectedly before the
    // workbench can issue an orderly stop command.
    process.once('exit', () => this._cleanupRuntimeDirectorySync());
  }

  private _cleanupRuntimeDirectorySync(): void {
    if (this._runtimeDirectory) {
      try {
        fs.rmSync(this._runtimeDirectory, { recursive: true, force: true });
      } catch {
        // Process shutdown must not be blocked by best-effort temp cleanup.
      }
      this._runtimeDirectory = undefined;
    }
  }

  public async call<T>(_context: string, command: string, arg?: unknown): Promise<T> {
    switch (command) {
      case 'start':
        return await this._start(arg) as T;
      case 'status':
        return this._status() as T;
      case 'callDaemon':
        return await this._callDaemon(arg) as T;
      case 'stop':
        await this._stop();
        return { stopped: true } as T;
      default:
        throw new Error('Unknown FLOAT daemon worker command: ' + command);
    }
  }

  public listen<T>(): Event<T> {
    return Event.None;
  }

  private async _start(arg: unknown): Promise<{ status: 'running'; pid: number }> {
    if (!arg || typeof arg !== 'object') {
      throw new Error('FLOAT daemon start options are required.');
    }

    const options = arg as Partial<IFloatDaemonWorkerStartOptions>;
    if (
      typeof options.workspaceId !== 'string' ||
      options.workspaceId.trim().length === 0 ||
      options.workspaceId.length > 2048 ||
      options.workspaceId.includes('\0')
    ) {
      throw new Error('FLOAT daemon workspaceId must be a non-empty workspace identity.');
    }
    if (
      typeof options.instanceId !== 'string' ||
      !/^[a-zA-Z0-9-]{8,128}$/.test(options.instanceId)
    ) {
      throw new Error('FLOAT daemon instanceId must be a valid opaque identifier.');
    }

    const storageDir = this._resolveStorageDirectory(options.workspaceId);
    if (this._server && this._client && this._workspaceId === options.workspaceId && this._storageDir === storageDir) {
      return { status: 'running', pid: process.pid };
    }

    await this._stop();

    const runtimeDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'float-daemon-'));
    let server: IFloatDaemonWorkerServer | undefined;
    let client: IFloatDaemonWorkerClient | undefined;

    try {
      if (process.platform !== 'win32') {
        await fs.promises.chmod(runtimeDirectory, 0o700);
      }

      const pipeName = process.platform === 'win32'
        ? `\\\\.\\pipe\\float-daemon-${options.instanceId}`
        : path.join(runtimeDirectory, 'daemon.sock');

      server = this._createServer({
        pipeName,
        storageDir,
        allowSandboxExecution: false
      });

      await server.start();
      client = this._createClient(pipeName);
      await client.connect(5_000);
      const health = await client.ping();
      if (!health || health.status !== 'ok') {
        throw new Error('FLOAT daemon health check failed inside the utility process.');
      }

      this._server = server;
      this._client = client;
      this._workspaceId = options.workspaceId;
      this._storageDir = storageDir;
      this._runtimeDirectory = runtimeDirectory;
      return { status: 'running', pid: process.pid };
    } catch (error) {
      client?.dispose();
      await server?.stop().catch(() => undefined);
      await fs.promises.rm(runtimeDirectory, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  private _resolveStorageDirectory(workspaceId: string): string {
    const workspaceKey = crypto.createHash('sha256').update(workspaceId, 'utf8').digest('hex');
    return path.join(os.homedir(), '.float-studio', 'daemon-index', workspaceKey);
  }

  private async _callDaemon(arg: unknown): Promise<unknown> {
    if (!arg || typeof arg !== 'object') {
      throw new Error('FLOAT daemon request must be an object.');
    }
    const request = arg as { method?: unknown; params?: unknown; timeoutMs?: unknown };
    if (typeof request.method !== 'string' || !ALLOWED_DAEMON_METHODS.has(request.method)) {
      throw new Error('FLOAT daemon method is not available through the workbench runtime.');
    }
    const timeoutMs = request.timeoutMs === undefined ? 30_000 : request.timeoutMs;
    if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
      throw new Error('FLOAT daemon timeoutMs must be between 1 and 120000.');
    }
    if (!this._client) {
      throw new Error('FLOAT daemon is not running.');
    }
    return this._client.call(request.method, request.params ?? {}, timeoutMs);
  }

  private _status(): IFloatDaemonWorkerStatus {
    return this._server && this._client
      ? { status: 'running', pid: process.pid }
      : { status: 'stopped' };
  }

  private async _stop(): Promise<void> {
    const client = this._client;
    const server = this._server;
    const runtimeDirectory = this._runtimeDirectory;

    this._client = undefined;
    this._server = undefined;
    this._runtimeDirectory = undefined;
    this._workspaceId = undefined;
    this._storageDir = undefined;

    client?.dispose();
    if (server) {
      await server.stop();
    }
    if (runtimeDirectory) {
      await fs.promises.rm(runtimeDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
