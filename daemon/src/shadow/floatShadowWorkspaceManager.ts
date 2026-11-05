/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

export interface IFloatShadowSession {
	sessionId: string;
	sourceRoot: string;
	shadowRoot: string;
	createdAt: number;
	trackedFiles: Map<string, string>; // relativePath -> originalContentHash
	modifiedFiles: Set<string>;
}

export interface IFloatShadowDiff {
	sessionId: string;
	modifiedFiles: string[];
	addedFiles: string[];
	deletedFiles: string[];
	totalChanges: number;
}

export class FloatShadowWorkspaceManager {
	private readonly _sessions = new Map<string, IFloatShadowSession>();
	private readonly _baseShadowDir: string;

	constructor(baseShadowDir?: string) {
		this._baseShadowDir = baseShadowDir || path.join(os.tmpdir(), 'float-shadow-workspaces');
	}

	public async createShadowWorkspace(sourceRoot: string, sessionId?: string): Promise<IFloatShadowSession> {
		const sid = sessionId || `shadow-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
		const shadowRoot = path.join(this._baseShadowDir, sid);

		await fs.promises.mkdir(shadowRoot, { recursive: true });

		const session: IFloatShadowSession = {
			sessionId: sid,
			sourceRoot,
			shadowRoot,
			createdAt: Date.now(),
			trackedFiles: new Map(),
			modifiedFiles: new Set()
		};

		// Mirror source root into shadowRoot using CoW hard links
		await this._mirrorTreeCoW(sourceRoot, shadowRoot, session);

		this._sessions.set(sid, session);
		return session;
	}

	public getSession(sessionId: string): IFloatShadowSession | undefined {
		return this._sessions.get(sessionId);
	}

	public async applyShadowEdit(sessionId: string, relativePath: string, newContent: string): Promise<boolean> {
		const session = this._sessions.get(sessionId);
		if (!session) {
			throw new Error(`Shadow session not found: ${sessionId}`);
		}

		const normalizedRel = relativePath.replace(/\\/g, '/');
		const targetPath = path.join(session.shadowRoot, normalizedRel);

		// Ensure parent directory exists
		await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

		// Break hard link if existing (CoW)
		if (fs.existsSync(targetPath)) {
			await fs.promises.unlink(targetPath);
		}

		// Write modified shadow copy
		await fs.promises.writeFile(targetPath, newContent, 'utf8');
		session.modifiedFiles.add(normalizedRel);

		return true;
	}

	public getShadowDiff(sessionId: string): IFloatShadowDiff {
		const session = this._sessions.get(sessionId);
		if (!session) {
			throw new Error(`Shadow session not found: ${sessionId}`);
		}

		const modifiedFiles: string[] = [];
		const addedFiles: string[] = [];

		for (const rel of session.modifiedFiles) {
			if (session.trackedFiles.has(rel)) {
				modifiedFiles.push(rel);
			} else {
				addedFiles.push(rel);
			}
		}

		return {
			sessionId,
			modifiedFiles,
			addedFiles,
			deletedFiles: [],
			totalChanges: modifiedFiles.length + addedFiles.length
		};
	}

	public async teardownSession(sessionId: string): Promise<boolean> {
		const session = this._sessions.get(sessionId);
		if (!session) {
			return false;
		}

		try {
			if (fs.existsSync(session.shadowRoot)) {
				await fs.promises.rm(session.shadowRoot, { recursive: true, force: true });
			}
		} catch {}

		return this._sessions.delete(sessionId);
	}

	private async _mirrorTreeCoW(sourceDir: string, destDir: string, session: IFloatShadowSession): Promise<void> {
		if (!fs.existsSync(sourceDir)) return;

		const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });

		for (const entry of entries) {
			const srcPath = path.join(sourceDir, entry.name);
			const dstPath = path.join(destDir, entry.name);

			// Exclude heavy or dynamic paths
			if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build') {
				continue;
			}

			if (entry.isDirectory()) {
				await fs.promises.mkdir(dstPath, { recursive: true });
				await this._mirrorTreeCoW(srcPath, dstPath, session);
			} else if (entry.isFile()) {
				const relPath = path.relative(session.sourceRoot, srcPath).replace(/\\/g, '/');
				try {
					// Attempt zero-cost hard link
					fs.linkSync(srcPath, dstPath);
				} catch {
					// Fallback to copy if hard link not permitted across volume boundaries
					await fs.promises.copyFile(srcPath, dstPath);
				}

				const fileHash = crypto.createHash('sha256').update(fs.readFileSync(srcPath)).digest('hex');
				session.trackedFiles.set(relPath, fileHash);
			}
		}
	}
}
