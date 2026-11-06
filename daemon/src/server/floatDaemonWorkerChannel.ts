/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../desktop/src/vs/base/common/event.js';
import { IServerChannel } from '../../../desktop/src/vs/base/parts/ipc/common/ipc.js';
import { FloatDaemonServer, IFloatDaemonOptions } from './floatDaemonServer.js';

export interface IFloatDaemonWorkerStartOptions {
  pipeName: string;
  storageDir?: string;
}

export interface IFloatDaemonWorkerStatus {
  status: 'running' | 'stopped';
  pipeName?: string;
  pid?: number;
}

export interface IFloatDaemonWorkerServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getPipePath(): string;
}

export type FloatDaemonServerFactory = (options: IFloatDaemonOptions) => IFloatDaemonWorkerServer;

/**
 * Control channel hosted inside the Electron utility process.
 * The workbench controls start/stop through Code-OSS MessagePort IPC while
 * existing FloatDaemonClient consumers use the daemon's local named pipe/socket.
 */
export class FloatDaemonWorkerChannel implements IServerChannel<string> {
  private _server: IFloatDaemonWorkerServer | undefined;
  private _storageDir: string | undefined;

  constructor(
    private readonly _createServer: FloatDaemonServerFactory = options => new FloatDaemonServer(options)
  ) {}

  public async call<T>(_context: string, command: string, arg?: unknown): Promise<T> {
    switch (command) {
      case 'start':
        return await this._start(arg) as T;
      case 'status':
        return this._status() as T;
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

  private async _start(arg: unknown): Promise<{ status: 'running'; pipeName: string; pid: number }> {
    if (!arg || typeof arg !== 'object') {
      throw new Error('FLOAT daemon start options are required.');
    }

    const options = arg as Partial<IFloatDaemonWorkerStartOptions>;
    if (
      typeof options.pipeName !== 'string' ||
      options.pipeName.trim().length === 0 ||
      options.pipeName.length > 1024 ||
      options.pipeName.includes('\0')
    ) {
      throw new Error('FLOAT daemon pipeName must be a non-empty local pipe/socket path.');
    }
    if (
      options.storageDir !== undefined &&
      (typeof options.storageDir !== 'string' || options.storageDir.length === 0 || options.storageDir.length > 4096 || options.storageDir.includes('\0'))
    ) {
      throw new Error('FLOAT daemon storageDir must be a valid local directory path.');
    }

    if (this._server && this._server.getPipePath() === options.pipeName && this._storageDir === options.storageDir) {
      return { status: 'running', pipeName: this._server.getPipePath(), pid: process.pid };
    }

    await this._stop();

    const server = this._createServer({
      pipeName: options.pipeName,
      storageDir: options.storageDir
    });

    try {
      await server.start();
      this._server = server;
      this._storageDir = options.storageDir;
      return { status: 'running', pipeName: server.getPipePath(), pid: process.pid };
    } catch (error) {
      await server.stop().catch(() => undefined);
      throw error;
    }
  }

  private _status(): IFloatDaemonWorkerStatus {
    if (!this._server) {
      return { status: 'stopped' };
    }
    return { status: 'running', pipeName: this._server.getPipePath(), pid: process.pid };
  }

  private async _stop(): Promise<void> {
    const server = this._server;
    this._server = undefined;
    this._storageDir = undefined;
    if (server) {
      await server.stop();
    }
  }
}
