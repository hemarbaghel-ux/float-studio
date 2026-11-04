/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
	IShadowSession,
	IShadowValidationOptions,
	IShadowValidationResult,
	IShadowDiagnostic,
	IFloatShadowWorkspaceService,
	ICreateShadowSessionOptions
} from './floatShadowTypes.js';
import { FloatShadowCompiler } from './floatShadowCompiler.js';

export class FloatShadowWorkspaceService implements IFloatShadowWorkspaceService {
	private static _instance: FloatShadowWorkspaceService | null = null;

	public static getInstance(): FloatShadowWorkspaceService {
		if (!this._instance) {
			this._instance = new FloatShadowWorkspaceService();
		}
		return this._instance;
	}

	private readonly _sessions = new Map<string, IShadowSession>();
	private _sessionCounter = 0;

	createSession(options: ICreateShadowSessionOptions = {}): IShadowSession {
		const id = options.sessionId || `shadow-session-${Date.now()}-${++this._sessionCounter}`;
		const baseFiles = new Map<string, string>();

		if (options.baseFiles) {
			for (const [k, v] of Object.entries(options.baseFiles)) {
				const norm = k.replace(/\\/g, '/').replace(/^\.\//, '');
				baseFiles.set(norm, v);
			}
		}

		const session: IShadowSession = {
			id,
			createdAt: Date.now(),
			baseWorkspacePath: options.baseWorkspacePath || '',
			baseFiles,
			speculativeOverlays: new Map<string, string>(),
			deletedFiles: new Set<string>()
		};

		this._sessions.set(id, session);
		return session;
	}

	getSession(sessionId: string): IShadowSession | undefined {
		return this._sessions.get(sessionId);
	}

	setFileOverlay(sessionId: string, filePath: string, proposedContent: string): void {
		const session = this._sessions.get(sessionId);
		if (!session) {
			throw new Error(`Shadow session not found: ${sessionId}`);
		}
		const norm = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
		session.speculativeOverlays.set(norm, proposedContent);
		session.deletedFiles.delete(norm);
	}

	removeFileOverlay(sessionId: string, filePath: string): void {
		const session = this._sessions.get(sessionId);
		if (!session) return;
		const norm = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
		session.speculativeOverlays.delete(norm);
	}

	markFileDeleted(sessionId: string, filePath: string): void {
		const session = this._sessions.get(sessionId);
		if (!session) return;
		const norm = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
		session.speculativeOverlays.delete(norm);
		session.deletedFiles.add(norm);
	}

	getShadowFileContent(sessionId: string, filePath: string): string | undefined {
		const session = this._sessions.get(sessionId);
		if (!session) return undefined;
		const norm = filePath.replace(/\\/g, '/').replace(/^\.\//, '');

		if (session.deletedFiles.has(norm)) {
			return undefined;
		}
		if (session.speculativeOverlays.has(norm)) {
			return session.speculativeOverlays.get(norm);
		}
		return session.baseFiles.get(norm);
	}

	getShadowFiles(sessionId: string): Map<string, string> {
		const session = this._sessions.get(sessionId);
		if (!session) return new Map();

		const merged = new Map<string, string>();

		// Base files
		for (const [k, v] of session.baseFiles.entries()) {
			if (!session.deletedFiles.has(k)) {
				merged.set(k, v);
			}
		}

		// Overlays take precedence
		for (const [k, v] of session.speculativeOverlays.entries()) {
			merged.set(k, v);
		}

		return merged;
	}

	async validateSession(
		sessionId: string,
		options: IShadowValidationOptions = {}
	): Promise<IShadowValidationResult> {
		const session = this._sessions.get(sessionId);
		if (!session) {
			throw new Error(`Shadow session not found: ${sessionId}`);
		}

		const startTime = Date.now();
		const files = this.getShadowFiles(sessionId);
		const mergedOptions: IShadowValidationOptions = {
			baseWorkspacePath: session.baseWorkspacePath || undefined,
			...options
		};
		const diagnostics = FloatShadowCompiler.checkVirtualFiles(files, mergedOptions);

		const errorCount = diagnostics.filter(d => d.severity === 'error').length;
		const warningCount = diagnostics.filter(d => d.severity === 'warning').length;

		const status: 'clean' | 'has_errors' | 'has_warnings' =
			errorCount > 0 ? 'has_errors' : warningCount > 0 ? 'has_warnings' : 'clean';

		const durationMs = Date.now() - startTime;
		const summary = status === 'clean'
			? `Speculative compilation clean: ${files.size} file(s) checked with 0 errors`
			: `Speculative compilation detected ${errorCount} error(s) and ${warningCount} warning(s)`;

		const result: IShadowValidationResult = {
			sessionId,
			status,
			errorCount,
			warningCount,
			diagnostics,
			durationMs,
			summary,
			validatedFiles: Array.from(files.keys())
		};

		session.lastValidationResult = result;
		return result;
	}

	async validateSnippet(
		filePath: string,
		content: string,
		options: IShadowValidationOptions = {}
	): Promise<IShadowValidationResult> {
		const virtualFiles = new Map<string, string>();
		const norm = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
		virtualFiles.set(norm, content);

		const startTime = Date.now();
		const diagnostics = FloatShadowCompiler.checkVirtualFiles(virtualFiles, options);

		const errorCount = diagnostics.filter(d => d.severity === 'error').length;
		const warningCount = diagnostics.filter(d => d.severity === 'warning').length;

		const status: 'clean' | 'has_errors' | 'has_warnings' =
			errorCount > 0 ? 'has_errors' : warningCount > 0 ? 'has_warnings' : 'clean';

		return {
			sessionId: `ephemeral-snippet-${Date.now()}`,
			status,
			errorCount,
			warningCount,
			diagnostics,
			durationMs: Date.now() - startTime,
			summary: status === 'clean'
				? `Snippet clean: 0 errors`
				: `Snippet has ${errorCount} error(s)`,
			validatedFiles: [norm]
		};
	}

	formatDiagnosticsForPrompt(diagnostics: IShadowDiagnostic[]): string {
		return FloatShadowCompiler.formatDiagnosticsForPrompt(diagnostics);
	}

	disposeSession(sessionId: string): void {
		const session = this._sessions.get(sessionId);
		if (session) {
			session.baseFiles.clear();
			session.speculativeOverlays.clear();
			session.deletedFiles.clear();
			this._sessions.delete(sessionId);
		}
	}

	disposeAllSessions(): void {
		for (const id of this._sessions.keys()) {
			this.disposeSession(id);
		}
	}
}