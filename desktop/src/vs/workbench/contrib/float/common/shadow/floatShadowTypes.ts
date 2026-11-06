/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export type ShadowDiagnosticSeverity = 'error' | 'warning' | 'info';

/** Explicit user consent request. This is not an OS sandbox or privilege boundary. */
export interface IFloatCommandApprovalRequest {
	command: string;
	workingDirectory: string;
	workspaceRoot: string;
}
export type IFloatCommandApprovalHandler = (request: IFloatCommandApprovalRequest) => Promise<boolean>;

export interface IShadowDiagnostic {
	filePath: string;
	line: number;
	column: number;
	code: string | number;
	message: string;
	severity: ShadowDiagnosticSeverity;
	source: string;
	raw?: string;
}

export interface IShadowFileSnapshot {
	path: string;
	content: string;
	isNew?: boolean;
	isDeletion?: boolean;
	hash?: string;
	modifiedTimestamp?: number;
}

export interface IShadowValidationOptions {
	checkSyntax?: boolean;
	checkTypes?: boolean;
	checkLint?: boolean;
	crossFileResolution?: boolean;
	maxDiagnostics?: number;
	timeoutMs?: number;
	baseWorkspacePath?: string;
	fileReader?: (relPath: string) => string | undefined;
}

export interface IShadowValidationResult {
	sessionId: string;
	status: 'clean' | 'has_errors' | 'has_warnings';
	errorCount: number;
	warningCount: number;
	diagnostics: IShadowDiagnostic[];
	durationMs: number;
	summary: string;
	validatedFiles: string[];
}

export interface IShadowSession {
	id: string;
	createdAt: number;
	baseWorkspacePath: string;
	baseFiles: Map<string, string>;
	speculativeOverlays: Map<string, string>;
	deletedFiles: Set<string>;
	lastValidationResult?: IShadowValidationResult;
}

export interface ICreateShadowSessionOptions {
	sessionId?: string;
	baseWorkspacePath?: string;
	baseFiles?: Record<string, string>;
}

export interface IFloatShadowWorkspaceService {
	createSession(options?: ICreateShadowSessionOptions): IShadowSession;
	getSession(sessionId: string): IShadowSession | undefined;
	setFileOverlay(sessionId: string, filePath: string, proposedContent: string): void;
	removeFileOverlay(sessionId: string, filePath: string): void;
	getShadowFileContent(sessionId: string, filePath: string): string | undefined;
	getShadowFiles(sessionId: string): Map<string, string>;
	validateSession(sessionId: string, options?: IShadowValidationOptions): Promise<IShadowValidationResult>;
	validateSnippet(filePath: string, content: string, options?: IShadowValidationOptions): Promise<IShadowValidationResult>;
	formatDiagnosticsForPrompt(diagnostics: IShadowDiagnostic[]): string;
	disposeSession(sessionId: string): void;
	disposeAllSessions(): void;
}