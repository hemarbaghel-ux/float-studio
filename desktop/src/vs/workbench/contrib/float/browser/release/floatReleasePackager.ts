/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { StringSHA1 } from '../../../../../base/common/hash.js';

function getNodeCrypto(): any | null {
	try {
		if (typeof process !== 'undefined') {
			if (typeof (process as any).getBuiltinModule === 'function') {
				return (process as any).getBuiltinModule('crypto');
			}
			const req = (globalThis as any).require;
			if (typeof req === 'function') {
				return req('crypto');
			}
		}
	} catch {}
	return null;
}

export type PlatformTarget = 'windows-x64' | 'macos-arm64' | 'linux-x64';

export interface IReleaseAsset {
	name: string;
	platform: PlatformTarget;
	size: number;
	sha256: string;
	downloadUrl: string;
}

export interface IReleaseManifest {
	version: string;
	releaseDate: string;
	channel: 'stable' | 'insiders';
	assets: IReleaseAsset[];
	checksums: string;
}

export class FloatReleasePackager {
	public static readonly SUPPORTED_PLATFORMS: PlatformTarget[] = [
		'windows-x64',
		'macos-arm64',
		'linux-x64'
	];

	public static readonly ARTIFACT_NAMES: Record<PlatformTarget, { installer: string; archive: string }> = {
		'windows-x64': {
			installer: 'FLOAT-Setup-x64.exe',
			archive: 'FLOAT-win32-x64.zip'
		},
		'macos-arm64': {
			installer: 'FLOAT-arm64.dmg',
			archive: 'FLOAT-darwin-arm64.zip'
		},
		'linux-x64': {
			installer: 'float-studio_amd64.deb',
			archive: 'FLOAT-linux-x64.tar.gz'
		}
	};

	public computeSha256(content: string | Buffer): string {
		const nodeCrypto = getNodeCrypto();
		if (nodeCrypto) {
			return nodeCrypto.createHash('sha256').update(content).digest('hex');
		}
		const sha1 = new StringSHA1();
		sha1.update(typeof content === 'string' ? content : content.toString('utf8'));
		return sha1.digest();
	}

	public verifyChecksum(content: string | Buffer, expectedSha256: string): boolean {
		const computed = this.computeSha256(content);
		return computed.toLowerCase() === expectedSha256.toLowerCase();
	}

	public generateSha256SumsManifest(assets: { name: string; content: string | Buffer }[]): string {
		const lines = assets.map(asset => {
			const hash = this.computeSha256(asset.content);
			return `${hash}  ${asset.name}`;
		});
		return lines.join('\n') + '\n';
	}

	public parseSha256SumsManifest(manifestContent: string): Map<string, string> {
		const map = new Map<string, string>();
		const lines = manifestContent.trim().split(/\r?\n/);
		for (const line of lines) {
			const match = line.match(/^([a-fA-F0-9]{64})\s+(.+)$/);
			if (match) {
				map.set(match[2].trim(), match[1].toLowerCase());
			}
		}
		return map;
	}

	public buildReleaseManifest(
		version: string,
		assets: { name: string; platform: PlatformTarget; content: string | Buffer; downloadUrl: string }[],
		channel: 'stable' | 'insiders' = 'stable'
	): IReleaseManifest {
		const checksumManifest = this.generateSha256SumsManifest(assets);
		const releaseAssets: IReleaseAsset[] = assets.map(a => {
			const buf = Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content);
			return {
				name: a.name,
				platform: a.platform,
				size: buf.length,
				sha256: this.computeSha256(buf),
				downloadUrl: a.downloadUrl
			};
		});

		return {
			version,
			releaseDate: new Date().toISOString(),
			channel,
			assets: releaseAssets,
			checksums: checksumManifest
		};
	}

	public validatePlatformCompleteness(assets: IReleaseAsset[]): { isComplete: boolean; missingPlatforms: PlatformTarget[] } {
		const covered = new Set(assets.map(a => a.platform));
		const missing: PlatformTarget[] = [];

		for (const p of FloatReleasePackager.SUPPORTED_PLATFORMS) {
			if (!covered.has(p)) {
				missing.push(p);
			}
		}

		return {
			isComplete: missing.length === 0,
			missingPlatforms: missing
		};
	}
}
