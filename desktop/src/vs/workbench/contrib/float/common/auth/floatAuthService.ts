/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISecretStorageService } from '../../../../../platform/secrets/common/secrets.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';

export const IFloatAuthService = createDecorator<IFloatAuthService>('floatAuthService');

export interface IFloatAuthService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeAuthState: Event<boolean>;
	readonly onDidChangeProjectId: Event<string>;

	getAuthToken(): string | null;
	setAuthToken(token: string | null): Promise<void>;
	getSanitizedToken(): string;
	isAuthenticated(): boolean;
	isTokenExpired(): boolean;
	signOut(): Promise<void>;

	getActiveProjectId(): string;
	setActiveProjectId(projectId: string): void;
}

const SECRET_KEY_AUTH_TOKEN = 'float.authToken';

export class FloatAuthService extends Disposable implements IFloatAuthService {
	readonly _serviceBrand: undefined;

	private _authToken: string | null = null;
	private _activeProjectId: string = 'default-project';

	private readonly _onDidChangeAuthState = this._register(new Emitter<boolean>());
	public readonly onDidChangeAuthState: Event<boolean> = this._onDidChangeAuthState.event;

	private readonly _onDidChangeProjectId = this._register(new Emitter<string>());
	public readonly onDidChangeProjectId: Event<string> = this._onDidChangeProjectId.event;

	constructor(
		@ISecretStorageService private readonly _secretStorageService?: ISecretStorageService
	) {
		super();
		this._initializeStorage();
	}

	private async _initializeStorage(): Promise<void> {
		// 1. First priority: Persistent OS-backed secret storage (Keychain/Credential Manager)
		if (this._secretStorageService) {
			try {
				const storedToken = await this._secretStorageService.get(SECRET_KEY_AUTH_TOKEN);
				if (storedToken && typeof storedToken === 'string' && storedToken.trim().length > 0) {
					this._authToken = storedToken.trim();
					this._onDidChangeAuthState.fire(this.isAuthenticated());
					return;
				}
			} catch {
				// Fallback to in-memory/environment if OS keychain service is unavailable
			}
		}

		// 2. Second priority: Optional bootstrap from environment variable (never written back to env)
		if (typeof process !== 'undefined' && process.env) {
			const envToken = process.env['FLOAT_AUTH_TOKEN'];
			if (envToken && typeof envToken === 'string' && envToken.trim().length > 0) {
				this._authToken = envToken.trim();
			}
			const envProject = process.env['FLOAT_PROJECT_ID'];
			if (envProject && typeof envProject === 'string' && envProject.trim().length > 0) {
				this._activeProjectId = envProject.trim();
			}
		}
	}

	public getAuthToken(): string | null {
		if (this.isTokenExpired()) {
			this._authToken = null;
			return null;
		}
		return this._authToken;
	}

	public async setAuthToken(token: string | null): Promise<void> {
		const clean = token && typeof token === 'string' ? token.trim() : null;
		if (this._authToken !== clean) {
			this._authToken = clean;

			// Persist to OS-backed secret storage
			if (this._secretStorageService) {
				try {
					if (clean) {
						await this._secretStorageService.set(SECRET_KEY_AUTH_TOKEN, clean);
					} else {
						await this._secretStorageService.delete(SECRET_KEY_AUTH_TOKEN);
					}
				} catch {
					// In-memory state preserved even if secret storage throws
				}
			}

			this._onDidChangeAuthState.fire(this.isAuthenticated());
		}
	}

	public async signOut(): Promise<void> {
		this._authToken = null;
		if (this._secretStorageService) {
			try {
				await this._secretStorageService.delete(SECRET_KEY_AUTH_TOKEN);
			} catch {}
		}
		this._onDidChangeAuthState.fire(false);
	}

	public isAuthenticated(): boolean {
		return Boolean(this._authToken && this._authToken.length > 0 && !this.isTokenExpired());
	}

	public isTokenExpired(): boolean {
		if (!this._authToken) {
			return false;
		}
		try {
			const parts = this._authToken.split('.');
			if (parts.length === 3) {
				const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
				const payload = JSON.parse(payloadJson);
				if (typeof payload.exp === 'number') {
					const nowInSeconds = Math.floor(Date.now() / 1000);
					return payload.exp <= nowInSeconds;
				}
			}
		} catch {
			// Non-JWT tokens (e.g. opaque API keys) do not expire locally
		}
		return false;
	}

	public getSanitizedToken(): string {
		if (!this._authToken) {
			return '[UNAUTHENTICATED]';
		}
		if (this._authToken.length <= 12) {
			return '***';
		}
		const prefix = this._authToken.slice(0, 4);
		const suffix = this._authToken.slice(-4);
		return `${prefix}...${suffix}`;
	}

	public getActiveProjectId(): string {
		return this._activeProjectId;
	}

	public setActiveProjectId(projectId: string): void {
		const clean = (projectId || '').trim() || 'default-project';
		if (this._activeProjectId !== clean) {
			this._activeProjectId = clean;
			this._onDidChangeProjectId.fire(this._activeProjectId);
		}
	}
}
