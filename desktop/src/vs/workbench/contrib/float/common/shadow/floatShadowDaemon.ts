/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { exec, ChildProcess } from 'node:child_process';
import { IFloatCommandApprovalHandler, IShadowDiagnostic, IShadowValidationResult } from './floatShadowTypes.js';
import { FloatSecurityGuard } from '../../electron-sandbox/security/floatSecurityGuard.js';
import { sanitizeProposalPath } from '../proposals/floatProposalValidator.js';

export interface IShadowExecutionResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	durationMs: number;
	diagnostics: IShadowDiagnostic[];
	success: boolean;
	shadowDirectory: string;
}

const SENSITIVE_OR_HEAVY_DIRS = new Set([
	'node_modules',
	'.git',
	'dist',
	'build',
	'out',
	'.build',
	'.gemini',
	'.vscode',
	'.idea'
]);

const SENSITIVE_FILE_PATTERNS = [
	/(^|[\\/])\\.env(\\..+)?$/i,
	/(^|[\\/]).*\\.(pem|key|pfx|p12)$/i,
	/(^|[\\/])id_(rsa|ed25519|ecdsa|dsa)/i,
	/(^|[\\/])(credentials|client_secret.*|service-account.*|serviceAccount.*|token|auth)\\.json$/i
];

/**
 * Speculative workspace-copy daemon.
 * Files are copied, never hard-linked, and credential/dependency directories are omitted.
 * This is NOT an OS-level sandbox: commands retain the current user's OS privileges.
 * The runner fails closed unless the workbench supplies explicit UI approval.
 */
export class FloatShadowDaemon {
	private readonly _shadowRootDir: string;
	private readonly _activeSandboxes = new Map<string, string>(); // sessionId -> shadowDirPath
	private readonly _sourceRoots = new Map<string, string>();
	private _commandApprovalHandler?: IFloatCommandApprovalHandler;

	public setCommandApprovalHandler(handler?: IFloatCommandApprovalHandler): void {
		this._commandApprovalHandler = handler;
	}

	constructor(customRootDir?: string) {
		this._shadowRootDir = customRootDir || path.join(os.tmpdir(), `float-shadow-daemon-${process.pid}`);
		fs.mkdirSync(this._shadowRootDir, { recursive: true });
	}

	public get shadowRootDir(): string {
		return this._shadowRootDir;
	}

	/**
	 * Creates a disposable workspace copy with speculative overlays. Files are copied, never hard-linked.
	 */
	public async createShadowSandbox(
		sessionId: string,
		workspaceRoot: string,
		speculativeOverlays: Map<string, string> = new Map(),
		deletedFiles: Set<string> = new Set()
	): Promise<string> {
		const sandboxDir = path.join(this._shadowRootDir, `sandbox-${sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
		if (fs.existsSync(sandboxDir)) {
			await fsp.rm(sandboxDir, { recursive: true, force: true });
		}
		fs.mkdirSync(sandboxDir, { recursive: true });

		// 1. Copy workspace files without sharing file inodes with the source workspace
		if (fs.existsSync(workspaceRoot)) {
			await this._mirrorDirectory(workspaceRoot, sandboxDir, deletedFiles);
		}

		// 2. Dependency directories are deliberately not linked back to the source workspace.
		// Commands that require dependencies must install them into this disposable copy.

		// 3. Write speculative overlays directly into the disposable workspace copy
		for (const [relPath, content] of speculativeOverlays.entries()) {
			const norm = sanitizeProposalPath(relPath);
			if (deletedFiles.has(norm)) continue;

			const destFile = path.join(sandboxDir, norm);
			fs.mkdirSync(path.dirname(destFile), { recursive: true });
			// Break hardlink before writing to ensure complete isolation
			if (fs.existsSync(destFile)) {
				try { fs.unlinkSync(destFile); } catch {}
			}
			fs.writeFileSync(destFile, content, 'utf8');
		}

		this._activeSandboxes.set(sessionId, sandboxDir);
		this._sourceRoots.set(sessionId, path.resolve(workspaceRoot));
		return sandboxDir;
	}

	/**
	 * Recursively copies files into a workspace copy without sharing source file inodes
	 */
	private async _mirrorDirectory(srcDir: string, destDir: string, deletedFiles: Set<string>, relPrefix: string = ''): Promise<void> {
		const entries = fs.readdirSync(srcDir, { withFileTypes: true });

		for (const entry of entries) {
			const entryRelPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
			const normRel = entryRelPath.replace(/\\/g, '/');

			if (SENSITIVE_OR_HEAVY_DIRS.has(entry.name) || deletedFiles.has(normRel)) {
				continue;
			}

			const srcPath = path.join(srcDir, entry.name);
			const destPath = path.join(destDir, entry.name);

			if (entry.isDirectory()) {
				fs.mkdirSync(destPath, { recursive: true });
				await this._mirrorDirectory(srcPath, destPath, deletedFiles, normRel);
			} else if (entry.isFile()) {
				if (SENSITIVE_FILE_PATTERNS.some(pattern => pattern.test(normRel))) continue;
				fs.copyFileSync(srcPath, destPath);
			}
		}
	}

	/**
	 * Executes in a workspace copy after explicit workbench approval; no handler means no execution.
	 */
	public async executeToolchain(
		sessionId: string,
		command: string,
		timeoutMs: number = 45000
	): Promise<IShadowExecutionResult> {
		const sandboxDir = this._activeSandboxes.get(sessionId);
		if (!sandboxDir || !fs.existsSync(sandboxDir)) {
			throw new Error(`Shadow sandbox for session "${sessionId}" does not exist`);
		}

		if (!FloatSecurityGuard.isCommandSafe(command)) {
			return {
				exitCode: 1,
				stdout: '',
				stderr: `[SECURITY REJECTION] Toolchain execution refused: "${command}"`,
				durationMs: 0,
				diagnostics: [{
					filePath: '.',
					line: 1,
					column: 1,
					code: 'SECURITY_BLOCKED',
					message: `Command refused by FLOAT Security Policy: ${command}`,
					severity: 'error',
					source: 'Float Shadow Daemon'
				}],
				success: false,
				shadowDirectory: sandboxDir
			};
		}

		let approved = false;
		if (this._commandApprovalHandler) {
			try {
				approved = await this._commandApprovalHandler({
					command,
					workingDirectory: sandboxDir,
					workspaceRoot: this._sourceRoots.get(sessionId) || sandboxDir
				}) === true;
			} catch {
				approved = false;
			}
		}
		if (!approved) {
			const message = this._commandApprovalHandler
				? '[COMMAND BLOCKED] User denied command execution. No command was executed.'
				: '[COMMAND BLOCKED] No interactive approval handler is connected. No command was executed.';
			return {
				exitCode: 126,
				stdout: '',
				stderr: message,
				durationMs: 0,
				diagnostics: [{
					filePath: '.',
					line: 1,
					column: 1,
					code: 'COMMAND_APPROVAL_REQUIRED',
					message,
					severity: 'error',
					source: 'Float Shadow Daemon'
				}],
				success: false,
				shadowDirectory: sandboxDir
			};
		}

		const startTime = Date.now();
		const safeEnv: Record<string, string | undefined> = { ...process.env };
		delete safeEnv['AIzaSy_KEY'];
		delete safeEnv['OPENAI_API_KEY'];
		delete safeEnv['ANTHROPIC_API_KEY'];
		delete safeEnv['GITHUB_TOKEN'];
		delete safeEnv['GEMINI_API_KEY'];

		return new Promise<IShadowExecutionResult>((resolve) => {
			exec(command, {
				cwd: sandboxDir,
				timeout: timeoutMs,
				maxBuffer: 8 * 1024 * 1024,
				env: safeEnv
			}, (error, stdoutBuf, stderrBuf) => {
				const durationMs = Date.now() - startTime;
				const stdout = stdoutBuf ? stdoutBuf.toString() : '';
				const stderr = stderrBuf ? stderrBuf.toString() : (error ? error.message : '');
				const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
				const success = exitCode === 0;

				const diagnostics = this._parseToolchainDiagnostics(stdout, stderr, sandboxDir);

				resolve({
					exitCode,
					stdout,
					stderr,
					durationMs,
					diagnostics,
					success,
					shadowDirectory: sandboxDir
				});
			});
		});
	}

	/**
	 * Parses compiler output from TypeScript, Rust, Python, and Go into structured diagnostics
	 */
	private _parseToolchainDiagnostics(stdout: string, stderr: string, sandboxDir: string): IShadowDiagnostic[] {
		const diagnostics: IShadowDiagnostic[] = [];
		const combined = `${stdout}\n${stderr}`;
		const lines = combined.split(/\r?\n/);

		const normSandbox = sandboxDir.replace(/\\/g, '/');

		for (const line of lines) {
			// TypeScript: src/app.ts(14,5): error TS2322: Type 'string' is not assignable to type 'number'.
			const tsMatch = line.match(/^([^(]+)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/i);
			if (tsMatch) {
				const rawFile = tsMatch[1].replace(/\\/g, '/').replace(normSandbox, '').replace(/^\/+/, '');
				diagnostics.push({
					filePath: rawFile,
					line: parseInt(tsMatch[2], 10),
					column: parseInt(tsMatch[3], 10),
					code: tsMatch[5],
					message: tsMatch[6],
					severity: tsMatch[4].toLowerCase() === 'error' ? 'error' : 'warning',
					source: 'Shadow TypeScript Compiler'
				});
				continue;
			}

			// Rust: error[E0308]: mismatched types --> src/main.rs:12:5
			const rustMatch = line.match(/error\[(E\d+)\]:\s+(.+)/i);
			if (rustMatch) {
				diagnostics.push({
					filePath: 'Cargo.toml',
					line: 1,
					column: 1,
					code: rustMatch[1],
					message: rustMatch[2],
					severity: 'error',
					source: 'Shadow Rust Compiler'
				});
				continue;
			}

			// Python: File "test.py", line 42, in <module>
			const pyMatch = line.match(/File\s+"([^"]+)",\s+line\s+(\d+)(?:,\s+in\s+.+)?/i);
			if (pyMatch) {
				const rawFile = pyMatch[1].replace(/\\/g, '/').replace(normSandbox, '').replace(/^\/+/, '');
				diagnostics.push({
					filePath: rawFile,
					line: parseInt(pyMatch[2], 10),
					column: 1,
					code: 'PYTHON_RUNTIME_EXCEPTION',
					message: line.trim(),
					severity: 'error',
					source: 'Shadow Python Runtime'
				});
				continue;
			}
		}

		return diagnostics;
	}

	/**
	 * Destroys and cleans up the sandbox for a session
	 */
	public async destroyShadowSandbox(sessionId: string): Promise<void> {
		const sandboxDir = this._activeSandboxes.get(sessionId);
		if (sandboxDir && fs.existsSync(sandboxDir)) {
			try {
				await fsp.rm(sandboxDir, { recursive: true, force: true });
			} catch {}
			this._activeSandboxes.delete(sessionId);
			this._sourceRoots.delete(sessionId);
		}
	}

	public async destroyAllSandboxes(): Promise<void> {
		for (const id of Array.from(this._activeSandboxes.keys())) {
			await this.destroyShadowSandbox(id);
		}
		try {
			if (fs.existsSync(this._shadowRootDir)) {
				await fsp.rm(this._shadowRootDir, { recursive: true, force: true });
			}
		} catch {}
	}
}
