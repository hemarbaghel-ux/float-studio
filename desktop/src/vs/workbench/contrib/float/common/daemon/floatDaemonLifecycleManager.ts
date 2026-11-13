/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as path from '../../../../../base/common/path.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { FloatDaemonClient } from './floatDaemonClient.js';

function getNodeRuntime(): { cp: any; fs: any } | null {
	try {
		if (typeof process !== 'undefined') {
			const getBuiltin = (process as any).getBuiltinModule;
			if (typeof getBuiltin === 'function') {
				return { cp: getBuiltin('child_process'), fs: getBuiltin('fs') };
			}
			const req = (globalThis as any).require;
			if (typeof req === 'function') {
				return { cp: req('child_process'), fs: req('fs') };
			}
		}
	} catch {}
	return null;
}

export interface IFloatDaemonHealthStatus {
	isAlive: boolean;
	pid?: number;
	uptimeSec?: number;
	activeClients?: number;
	pipePath: string;
	lastChecked: number;
}

export class FloatDaemonLifecycleManager extends Disposable {
	private _client: FloatDaemonClient;
	private _daemonProcess: any = null;
	private _healthCheckTimer: NodeJS.Timeout | null = null;
	private _isStarting: boolean = false;
	private _lastHealthStatus: IFloatDaemonHealthStatus;

	private readonly _onDidChangeHealth = this._register(new Emitter<IFloatDaemonHealthStatus>());
	public readonly onDidChangeHealth: Event<IFloatDaemonHealthStatus> = this._onDidChangeHealth.event;

	constructor(pipeName?: string) {
		super();
		this._client = this._register(new FloatDaemonClient({ pipeName }));
		this._lastHealthStatus = {
			isAlive: false,
			pipePath: this._client.getPipePath(),
			lastChecked: Date.now()
		};
	}

	public get client(): FloatDaemonClient {
		return this._client;
	}

	public get healthStatus(): IFloatDaemonHealthStatus {
		return this._lastHealthStatus;
	}

	public async ensureDaemonRunning(): Promise<boolean> {
		if (this._client.isConnected()) {
			return true;
		}

		// 1. Try connecting to already running daemon
		try {
			await this._client.connect(1500);
			await this.checkHealth();
			this._startHealthMonitor();
			return true;
		} catch {
			// Not running yet, proceed to spawn
		}

		if (this._isStarting) {
			return false;
		}

		this._isStarting = true;

		try {
			await this._spawnDaemonProcess();
			// Retry connect up to 5 times (100ms apart)
			let connected = false;
			for (let i = 0; i < 15; i++) {
				await new Promise(r => setTimeout(r, 200));
				try {
					await this._client.connect(1500);
					connected = true;
					break;
				} catch {}
			}

			if (connected) {
				await this.checkHealth();
				this._startHealthMonitor();
				this._isStarting = false;
				return true;
			}
		} catch (err) {
			console.error('[FloatDaemonLifecycleManager] Failed to launch daemon process:', err);
		} finally {
			this._isStarting = false;
		}

		return false;
	}

	private async _spawnDaemonProcess(): Promise<void> {
		const runtime = getNodeRuntime();
		if (!runtime) {
			console.warn('[FloatDaemonLifecycleManager] Node runtime unavailable in browser sandbox');
			return;
		}

		const cwd = typeof process !== 'undefined' && process.cwd ? process.cwd() : '.';
		const candidates = [
			path.resolve(cwd, 'daemon/src/index.js'),
			path.resolve(cwd, 'daemon/src/index.ts')
		];

		let daemonScript: string | null = null;
		for (const c of candidates) {
			if (runtime.fs.existsSync(c)) {
				daemonScript = c;
				break;
			}
		}

		if (!daemonScript) {
			throw new Error('FLOAT Daemon entrypoint not found in candidates: ' + candidates.join(', '));
		}

		const isTs = daemonScript.endsWith('.ts');
		const execCmd = process.execPath || 'node';
		const args = isTs
			? ['node_modules/tsx/dist/cli.mjs', daemonScript]
			: [daemonScript];

		const proc = runtime.cp.spawn(execCmd, args, {
			detached: false,
			stdio: 'pipe',
			env: {
				...process.env,
				FLOAT_DAEMON_PIPE: this._client.getPipePath()
			}
		});

		proc.on('error', (err: Error) => {
			console.error('[FloatDaemonLifecycleManager] Daemon process spawn error:', err);
		});

		proc.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
			console.warn(`[FloatDaemonLifecycleManager] Daemon process exited with code ${code}, signal ${signal}`);
			this._daemonProcess = null;
			this._updateHealth(false);
		});

		this._daemonProcess = proc;
	}

	public async checkHealth(): Promise<IFloatDaemonHealthStatus> {
		try {
			const res = await this._client.ping();
			return this._updateHealth(true, res.pid, res.uptimeSec, res.activeClients);
		} catch {
			return this._updateHealth(false);
		}
	}

	private _updateHealth(isAlive: boolean, pid?: number, uptimeSec?: number, activeClients?: number): IFloatDaemonHealthStatus {
		this._lastHealthStatus = {
			isAlive,
			pid,
			uptimeSec,
			activeClients,
			pipePath: this._client.getPipePath(),
			lastChecked: Date.now()
		};
		this._onDidChangeHealth.fire(this._lastHealthStatus);
		return this._lastHealthStatus;
	}

	private _startHealthMonitor(): void {
		if (this._healthCheckTimer) return;
		this._healthCheckTimer = setInterval(async () => {
			if (this._client.isConnected()) {
				await this.checkHealth();
			} else {
				this._updateHealth(false);
			}
		}, 10000);
	}

	public override dispose(): void {
		if (this._healthCheckTimer) {
			clearInterval(this._healthCheckTimer);
			this._healthCheckTimer = null;
		}

		this._client.disconnect();

		if (this._daemonProcess && !this._daemonProcess.killed) {
			try {
				this._daemonProcess.kill('SIGTERM');
			} catch {}
			this._daemonProcess = null;
		}

		super.dispose();
	}
}
