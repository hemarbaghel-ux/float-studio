/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { FloatDockerSandboxRunner } from '../composer/floatDockerSandboxRunner.js';
import { copyComposerWorkspace } from '../composer/floatSandboxWorkspaceCopy.js';
import { IShadowDiagnostic, IShadowValidationResult } from './floatShadowTypes.js';
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

/**
 * Copy-based Shadow Workspace Daemon with containerized toolchain execution.
 *
 * It creates disposable copies of the source workspace, then asks Docker to run
 * toolchain commands with networking disabled and dependencies mounted read-only.
 */
export class FloatShadowDaemon {
	private readonly _shadowRootDir: string;
	private readonly _activeSandboxes = new Map<string, string>(); // sessionId -> shadowDirPath
	private readonly _dependenciesBySession = new Map<string, string>();
	private readonly _activeRunners = new Map<string, FloatDockerSandboxRunner>();

	constructor(customRootDir?: string) {
		this._shadowRootDir = customRootDir || path.join(os.tmpdir(), `float-shadow-daemon-${process.pid}`);
		fs.mkdirSync(this._shadowRootDir, { recursive: true });
	}

	public get shadowRootDir(): string {
		return this._shadowRootDir;
	}

	/**
	 * Creates an independent, copy-based shadow workspace. Hard links are never used.
	 */
	public async createShadowSandbox(
		sessionId: string,
		workspaceRoot: string,
		speculativeOverlays: Map<string, string> = new Map(),
		deletedFiles: Set<string> = new Set()
	): Promise<string> {
		const sandboxDir = path.join(this._shadowRootDir, `sandbox-${sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
		this._activeRunners.get(sessionId)?.abort();
		this._activeRunners.delete(sessionId);
		this._dependenciesBySession.delete(sessionId);
		if (fs.existsSync(sandboxDir)) {
			await fsp.rm(sandboxDir, { recursive: true, force: true });
		}
		fs.mkdirSync(sandboxDir, { recursive: true });

		// 1. Copy permitted workspace files; symlinks and credential paths are excluded.
		if (fs.existsSync(workspaceRoot)) {
			copyComposerWorkspace(workspaceRoot, sandboxDir, deletedFiles);
		}

		// Do not link host dependencies into the writable shadow directory.
		// Docker mounts the original node_modules directory read-only at execution time.
		const nodeModulesSrc = path.join(workspaceRoot, 'node_modules');
		if (fs.existsSync(nodeModulesSrc)) {
			const dependencyStat = fs.lstatSync(nodeModulesSrc);
			if (dependencyStat.isDirectory() && !dependencyStat.isSymbolicLink()) {
				this._dependenciesBySession.set(sessionId, nodeModulesSrc);
			}
		}

		// 2. Apply speculative overlays to the disposable copy.
		for (const [relPath, content] of speculativeOverlays.entries()) {
			const norm = sanitizeProposalPath(relPath);
			if (deletedFiles.has(norm)) continue;

			const destFile = path.join(sandboxDir, norm);
			fs.mkdirSync(path.dirname(destFile), { recursive: true });
			fs.writeFileSync(destFile, content, 'utf8');
		}

		this._activeSandboxes.set(sessionId, sandboxDir);
		return sandboxDir;
	}

	/**
	 * Executes a permitted toolchain command inside the isolated shadow sandbox
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

		const runner = new FloatDockerSandboxRunner(
			sandboxDir,
			this._dependenciesBySession.get(sessionId),
			timeoutMs
		);
		this._activeRunners.set(sessionId, runner);

		const commandResult = await runner.run(command, { cwd: '.', timeoutMs });
		if (this._activeRunners.get(sessionId) === runner) {
			this._activeRunners.delete(sessionId);
		}

		const diagnostics = this._parseToolchainDiagnostics(commandResult.stdout, commandResult.stderr, sandboxDir);
		return {
			exitCode: commandResult.exitCode,
			stdout: commandResult.stdout,
			stderr: commandResult.stderr,
			durationMs: commandResult.durationMs,
			diagnostics,
			success: commandResult.exitCode === 0,
			shadowDirectory: sandboxDir
		};

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
		this._activeRunners.get(sessionId)?.abort();
		this._activeRunners.delete(sessionId);
		this._dependenciesBySession.delete(sessionId);
		if (sandboxDir && fs.existsSync(sandboxDir)) {
			try {
				await fsp.rm(sandboxDir, { recursive: true, force: true });
			} catch {}
			this._activeSandboxes.delete(sessionId);
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
