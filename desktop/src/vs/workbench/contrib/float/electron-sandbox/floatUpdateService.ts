/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

export interface IFloatReleaseAsset {
	name: string;
	browser_download_url: string;
	size: number;
}

export interface IFloatUpdateInfo {
	currentVersion: string;
	latestVersion: string;
	hasUpdate: boolean;
	releaseNotes: string;
	downloadUrl?: string;
	publishedAt: string;
	assets: IFloatReleaseAsset[];
}

export type FloatUpdateState = 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'ready-to-restart' | 'error';

export class FloatUpdateService extends Disposable {
	static readonly REPO_OWNER = 'hemarbaghel-ux';
	static readonly REPO_NAME = 'float-studio';

	private _state: FloatUpdateState = 'idle';
	private _updateInfo: IFloatUpdateInfo | null = null;

	private readonly _onDidChangeState = this._register(new Emitter<FloatUpdateState>());
	public readonly onDidChangeState: Event<FloatUpdateState> = this._onDidChangeState.event;

	public getState(): FloatUpdateState {
		return this._state;
	}

	public getUpdateInfo(): IFloatUpdateInfo | null {
		return this._updateInfo;
	}

	public async checkForUpdates(
		currentVersion: string = '1.0.0',
		platform: string = process.platform
	): Promise<IFloatUpdateInfo> {
		this._setState('checking');

		try {
			const apiUrl = `https://api.github.com/repos/${FloatUpdateService.REPO_OWNER}/${FloatUpdateService.REPO_NAME}/releases/latest`;
			const response = await fetch(apiUrl, {
				headers: {
					'Accept': 'application/vnd.github.v3+json',
					'User-Agent': 'FLOAT-Studio-Updater'
				}
			});

			if (!response.ok) {
				if (response.status === 404) {
					// No release published yet
					const info: IFloatUpdateInfo = {
						currentVersion,
						latestVersion: currentVersion,
						hasUpdate: false,
						releaseNotes: 'No releases published yet.',
						publishedAt: new Date().toISOString(),
						assets: []
					};
					this._updateInfo = info;
					this._setState('up-to-date');
					return info;
				}
				throw new Error(`GitHub Releases API responded with status ${response.status}`);
			}

			const data = (await response.json()) as any;
			const tagName: string = data.tag_name || 'v1.0.0';
			const latestVersion = tagName.replace(/^v/, '');

			const hasUpdate = this.compareSemver(latestVersion, currentVersion) > 0;
			const rawAssets = Array.isArray(data.assets) ? data.assets : [];

			const assets: IFloatReleaseAsset[] = rawAssets.map((a: any) => ({
				name: a.name,
				browser_download_url: a.browser_download_url,
				size: a.size
			}));

			// Select best asset for user OS platform
			let downloadUrl: string | undefined;
			if (platform === 'win32') {
				downloadUrl = assets.find(a => a.name.endsWith('.exe') || a.name.endsWith('-win32-x64.zip'))?.browser_download_url;
			} else if (platform === 'darwin') {
				downloadUrl = assets.find(a => a.name.endsWith('.dmg') || a.name.endsWith('-darwin-arm64.zip'))?.browser_download_url;
			} else {
				downloadUrl = assets.find(a => a.name.endsWith('.deb') || a.name.endsWith('.AppImage') || a.name.endsWith('.tar.gz'))?.browser_download_url;
			}

			if (!downloadUrl && assets.length > 0) {
				downloadUrl = assets[0].browser_download_url;
			}

			const info: IFloatUpdateInfo = {
				currentVersion,
				latestVersion,
				hasUpdate,
				releaseNotes: data.body || '',
				downloadUrl,
				publishedAt: data.published_at || new Date().toISOString(),
				assets
			};

			this._updateInfo = info;
			this._setState(hasUpdate ? 'available' : 'up-to-date');
			return info;
		} catch (err: any) {
			this._setState('error');
			throw err;
		}
	}

	/**
	 * Compares two semantic version strings (e.g. "1.1.0" vs "1.0.0").
	 * Returns 1 if v1 > v2, -1 if v1 < v2, and 0 if equal.
	 */
	public compareSemver(v1: string, v2: string): number {
		const clean1 = v1.replace(/^v/, '').split('-')[0];
		const clean2 = v2.replace(/^v/, '').split('-')[0];

		const p1 = clean1.split('.').map(n => parseInt(n, 10) || 0);
		const p2 = clean2.split('.').map(n => parseInt(n, 10) || 0);

		for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
			const n1 = p1[i] || 0;
			const n2 = p2[i] || 0;
			if (n1 > n2) {
				return 1;
			}
			if (n1 < n2) {
				return -1;
			}
		}

		return 0;
	}

	private _setState(state: FloatUpdateState): void {
		if (this._state !== state) {
			this._state = state;
			this._onDidChangeState.fire(state);
		}
	}
}
