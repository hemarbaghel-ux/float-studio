/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { exec, ChildProcess } from 'node:child_process';
import { IComposerFileSystem, IComposerCommandRunner } from './floatComposerTools.js';
import { sanitizeProposalPath } from '../proposals/floatProposalValidator.js';
import { FloatSecurityGuard } from '../../electron-sandbox/security/floatSecurityGuard.js';
import { IFloatCommandApprovalHandler, IFloatCommandApprovalRequest } from '../shadow/floatShadowTypes.js';

const SENSITIVE_OR_IGNORED_DIRS = new Set([
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
	/(^|[\\/])\.env(\..+)?$/i,
	/(^|[\\/]).*\.(pem|key|pfx|p12)$/i,
	/(^|[\\/])id_(rsa|ed25519|ecdsa|dsa)/i,
	/(^|[\\/])(credentials|client_secret.*|service-account.*|serviceAccount.*|token|auth)\.json$/i
];

export class ProductionComposerFileSystem implements IComposerFileSystem {
	constructor(private readonly _workspaceRoot: string) {}

	public get workspaceRoot(): string {
		return this._workspaceRoot;
	}

	private _resolve(relPath: string): string {
		const clean = relPath === '.' || relPath === '' ? '.' : sanitizeProposalPath(relPath);
		const resolved = path.resolve(this._workspaceRoot, clean);
		const rootResolved = path.resolve(this._workspaceRoot);

		// Path traversal escape guard
		if (!resolved.startsWith(rootResolved)) {
			throw new Error(`[SECURITY] Path traversal escape attempt blocked: ${relPath}`);
		}

		// Symlink escape guard
		if (fs.existsSync(resolved)) {
			try {
				const real = fs.realpathSync(resolved);
				if (!real.startsWith(rootResolved)) {
					throw new Error(`[SECURITY] Symlink traversal escape attempt blocked: ${relPath}`);
				}
			} catch (e: any) {
				if (e.message.includes('[SECURITY]')) throw e;
			}
		}

		return resolved;
	}

	public isSensitiveFile(relPath: string): boolean {
		const normalized = relPath.replace(/\\/g, '/');
		return SENSITIVE_FILE_PATTERNS.some(pat => pat.test(normalized));
	}

	public async readFile(relPath: string): Promise<string> {
		if (this.isSensitiveFile(relPath)) {
			throw new Error(`[SECURITY] Access denied to sensitive file: ${relPath}`);
		}
		const full = this._resolve(relPath);
		return await fsp.readFile(full, 'utf8');
	}

	public async writeFile(relPath: string, content: string): Promise<void> {
		if (this.isSensitiveFile(relPath)) {
			throw new Error(`[SECURITY] Writing to sensitive file prohibited: ${relPath}`);
		}
		const full = this._resolve(relPath);
		await fsp.mkdir(path.dirname(full), { recursive: true });
		await fsp.writeFile(full, content, 'utf8');
	}

	public async fileExists(relPath: string): Promise<boolean> {
		if (this.isSensitiveFile(relPath)) {
			return false;
		}
		try {
			const full = this._resolve(relPath);
			return fs.existsSync(full);
		} catch {
			return false;
		}
	}

	public async listDirectory(relPath: string, recursive: boolean = false): Promise<string[]> {
		const targetDir = this._resolve(relPath);
		if (!fs.existsSync(targetDir)) {
			return [];
		}

		const results: string[] = [];
		const scan = async (dir: string, base: string) => {
			const entries = await fsp.readdir(dir, { withFileTypes: true });
			for (const entry of entries) {
				if (SENSITIVE_OR_IGNORED_DIRS.has(entry.name)) {
					continue;
				}
				const rel = base ? `${base}/${entry.name}` : entry.name;
				if (this.isSensitiveFile(rel)) {
					continue;
				}
				results.push(rel);
				if (recursive && entry.isDirectory()) {
					await scan(path.join(dir, entry.name), rel);
				}
			}
		};

		await scan(targetDir, relPath === '.' || relPath === '' ? '' : relPath);
		return results;
	}

	public async findFiles(query: string): Promise<string[]> {
		const all = await this.listDirectory('.', true);
		const q = query.toLowerCase().replace(/[*?]/g, '');
		return all.filter(f => f.toLowerCase().includes(q));
	}
}

/**
 * Isolated Speculative Overlay FileSystem for Composer turns.
 * Intercepts all agent writes and edits into in-memory overlays so the physical
 * workspace files on disk remain 100% UNTOUCHED until explicit user acceptance.
 */
export class SpeculativeComposerFileSystem implements IComposerFileSystem {
	private readonly _overlays = new Map<string, string>();
	private readonly _originalBaselines = new Map<string, string>();
	private readonly _deletedFiles = new Set<string>();

	constructor(private readonly _baseFs: IComposerFileSystem) {}

	public get workspaceRoot(): string {
		return (this._baseFs as any).workspaceRoot || process.cwd();
	}

	public get baseFs(): IComposerFileSystem {
		return this._baseFs;
	}

	public get overlays(): Map<string, string> {
		return new Map(this._overlays);
	}

	public get originalBaselines(): Map<string, string> {
		return new Map(this._originalBaselines);
	}

	public async readFile(relPath: string): Promise<string> {
		const norm = sanitizeProposalPath(relPath);
		if (this._deletedFiles.has(norm)) {
			throw new Error(`File not found (marked deleted): ${norm}`);
		}
		if (this._overlays.has(norm)) {
			return this._overlays.get(norm)!;
		}
		const baseContent = await this._baseFs.readFile(norm);
		if (!this._originalBaselines.has(norm)) {
			this._originalBaselines.set(norm, baseContent);
		}
		return baseContent;
	}

	public async writeFile(relPath: string, content: string): Promise<void> {
		const norm = sanitizeProposalPath(relPath);
		if (!this._originalBaselines.has(norm)) {
			try {
				const existing = await this._baseFs.readFile(norm);
				this._originalBaselines.set(norm, existing);
			} catch {
				this._originalBaselines.set(norm, '');
			}
		}
		this._overlays.set(norm, content);
		this._deletedFiles.delete(norm);
	}

	public async fileExists(relPath: string): Promise<boolean> {
		const norm = sanitizeProposalPath(relPath);
		if (this._deletedFiles.has(norm)) {
			return false;
		}
		if (this._overlays.has(norm)) {
			return true;
		}
		return await this._baseFs.fileExists(norm);
	}

	public async listDirectory(relPath: string, recursive: boolean = false): Promise<string[]> {
		const baseList = await this._baseFs.listDirectory(relPath, recursive);
		const resultSet = new Set<string>();

		for (const item of baseList) {
			const norm = sanitizeProposalPath(item);
			if (!this._deletedFiles.has(norm)) {
				resultSet.add(norm);
			}
		}

		for (const ovPath of this._overlays.keys()) {
			if (relPath === '.' || relPath === '' || ovPath.startsWith(relPath)) {
				resultSet.add(ovPath);
			}
		}

		return Array.from(resultSet).sort();
	}

	public async findFiles(query: string): Promise<string[]> {
		const all = await this.listDirectory('.', true);
		const q = query.toLowerCase().replace(/[*?]/g, '');
		return all.filter(f => f.toLowerCase().includes(q));
	}
}

export class ProductionComposerCommandRunner implements IComposerCommandRunner {
	constructor(
		protected readonly _workspaceRoot: string,
		protected readonly _timeoutMs: number = 30000,
		private readonly _approvalHandler?: IFloatCommandApprovalHandler
	) {}

	public get workspaceRoot(): string {
		return this._workspaceRoot;
	}

	public async requestExecutionApproval(request: IFloatCommandApprovalRequest): Promise<boolean> {
		if (!this._approvalHandler) return false;
		try { return await this._approvalHandler(request) === true; } catch { return false; }
	}

	public async runCommand(command: string, cwd?: string): Promise<{
		exitCode: number;
		stdout: string;
		stderr: string;
	}> {
		if (!FloatSecurityGuard.isCommandSafe(command)) {
			return {
				exitCode: 1,
				stdout: '',
				stderr: `[SECURITY REJECTION] Command refused by FLOAT Security Policy: "${command}"`
			};
		}

		let execCwd: string;
		try {
			execCwd = cwd ? path.resolve(this._workspaceRoot, sanitizeProposalPath(cwd)) : this._workspaceRoot;
			const root = path.resolve(this._workspaceRoot);
			if (execCwd !== root && !execCwd.startsWith(root + path.sep)) throw new Error('Command working directory escaped the workspace.');
		} catch (error: any) {
			return { exitCode: 1, stdout: '', stderr: `[SECURITY REJECTION] ${error.message || 'Invalid command working directory.'}` };
		}
		const approved = await this.requestExecutionApproval({
			command, workingDirectory: execCwd, workspaceRoot: path.resolve(this._workspaceRoot)
		});
		if (!approved) {
			return { exitCode: 126, stdout: '', stderr: '[COMMAND BLOCKED] User approval is required before Composer can run a command. No command was executed.' };
		}

		// Sanitize environment
		const safeEnv: Record<string, string | undefined> = { ...process.env };
		delete safeEnv['AIzaSy_KEY'];
		delete safeEnv['OPENAI_API_KEY'];
		delete safeEnv['ANTHROPIC_API_KEY'];
		delete safeEnv['GITHUB_TOKEN'];
		delete safeEnv['GEMINI_API_KEY'];

		return new Promise((resolve) => {
			exec(command, {
				cwd: execCwd,
				timeout: this._timeoutMs,
				maxBuffer: 4 * 1024 * 1024,
				env: safeEnv
			}, (error, stdout, stderr) => {
				const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
				resolve({
					exitCode,
					stdout: stdout ? stdout.toString() : '',
					stderr: stderr ? stderr.toString() : (error ? error.message : '')
				});
			});
		});
	}
}

/**
 * Speculative Shadow Workspace Command Runner.
 * Commands run as the current OS user in a temporary workspace copy.
 * This copy is NOT an OS-level sandbox: it does not isolate processes, filesystem access, network access,
 * or host privileges. Interactive user approval is required before every command.
 */
export class IsolatedShadowWorkspaceCommandRunner implements IComposerCommandRunner {
	private readonly _shadowDir: string;
	private _activeChild: ChildProcess | null = null;
	private _disposed: boolean = false;

	constructor(
		private readonly _originalWorkspaceRoot: string,
		speculativeOverlays?: Map<string, string>,
		private readonly _timeoutMs: number = 30000,
		private readonly _approvalHandler?: IFloatCommandApprovalHandler
	) {
		this._shadowDir = path.join(
			os.tmpdir(),
			`float-shadow-cmd-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
		);
		this._initShadowWorkspace(speculativeOverlays);
	}

	public get shadowDir(): string {
		return this._shadowDir;
	}

	public get originalWorkspaceRoot(): string {
		return this._originalWorkspaceRoot;
	}

	public async requestExecutionApproval(request: IFloatCommandApprovalRequest): Promise<boolean> {
		if (!this._approvalHandler) return false;
		try { return await this._approvalHandler(request) === true; } catch { return false; }
	}

	private _initShadowWorkspace(overlays?: Map<string, string>): void {
		fs.mkdirSync(this._shadowDir, { recursive: true });

		// Mirror original files into shadow workspace (excluding heavy node_modules/.git)
		if (fs.existsSync(this._originalWorkspaceRoot)) {
			const mirrorDir = (src: string, dest: string) => {
				const entries = fs.readdirSync(src, { withFileTypes: true });
				for (const entry of entries) {
					if (SENSITIVE_OR_IGNORED_DIRS.has(entry.name)) {
						if (entry.name === 'node_modules' && process.platform === 'win32') {
							// Link node_modules via junction on Windows for instant dependency access
							try {
								fs.symlinkSync(path.join(src, entry.name), path.join(dest, entry.name), 'junction');
							} catch {}
						}
						continue;
					}
					const srcPath = path.join(src, entry.name);
					const destPath = path.join(dest, entry.name);

					if (entry.isDirectory()) {
						fs.mkdirSync(destPath, { recursive: true });
						mirrorDir(srcPath, destPath);
					} else if (entry.isFile()) {
						fs.copyFileSync(srcPath, destPath);
					}
				}
			};

			mirrorDir(this._originalWorkspaceRoot, this._shadowDir);
		}

		// Apply speculative overlays into shadow directory
		if (overlays) {
			for (const [relPath, content] of overlays.entries()) {
				const target = path.join(this._shadowDir, sanitizeProposalPath(relPath));
				fs.mkdirSync(path.dirname(target), { recursive: true });
				fs.writeFileSync(target, content, 'utf8');
			}
		}
	}

	public updateOverlay(relPath: string, content: string): void {
		if (this._disposed) return;
		const target = path.join(this._shadowDir, sanitizeProposalPath(relPath));
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, content, 'utf8');
	}

	public async runCommand(command: string, cwd?: string): Promise<{
		exitCode: number;
		stdout: string;
		stderr: string;
	}> {
		if (this._disposed) {
			return { exitCode: 1, stdout: '', stderr: 'Command runner disposed.' };
		}

		if (!FloatSecurityGuard.isCommandSafe(command)) {
			return {
				exitCode: 1,
				stdout: '',
				stderr: `[SECURITY REJECTION] Command refused by FLOAT Security Policy: "${command}"`
			};
		}

		let execCwd: string;
		try {
			execCwd = cwd ? path.resolve(this._shadowDir, sanitizeProposalPath(cwd)) : this._shadowDir;
			if (execCwd !== this._shadowDir && !execCwd.startsWith(this._shadowDir + path.sep)) {
				throw new Error('Command working directory escaped the speculative workspace copy.');
			}
		} catch (error: any) {
			return { exitCode: 1, stdout: '', stderr: `[SECURITY REJECTION] ${error.message || 'Invalid command working directory.'}` };
		}
		const approved = await this.requestExecutionApproval({
			command, workingDirectory: execCwd, workspaceRoot: this._originalWorkspaceRoot
		});
		if (!approved) {
			return { exitCode: 126, stdout: '', stderr: '[COMMAND BLOCKED] User approval is required before Composer can run a command. No command was executed.' };
		}

		const safeEnv: Record<string, string | undefined> = { ...process.env };
		delete safeEnv['AIzaSy_KEY'];
		delete safeEnv['OPENAI_API_KEY'];
		delete safeEnv['ANTHROPIC_API_KEY'];
		delete safeEnv['GITHUB_TOKEN'];
		delete safeEnv['GEMINI_API_KEY'];

		return new Promise((resolve) => {
			const child = exec(command, {
				cwd: execCwd,
				timeout: this._timeoutMs,
				maxBuffer: 4 * 1024 * 1024,
				env: safeEnv
			}, (error, stdout, stderr) => {
				this._activeChild = null;
				const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
				resolve({
					exitCode,
					stdout: stdout ? stdout.toString() : '',
					stderr: stderr ? stderr.toString() : (error ? error.message : '')
				});
			});

			this._activeChild = child;
		});
	}

	public abort(): void {
		if (this._activeChild) {
			try {
				this._activeChild.kill('SIGTERM');
			} catch {}
			this._activeChild = null;
		}
	}

	public dispose(): void {
		this.abort();
		this._disposed = true;
		try {
			if (fs.existsSync(this._shadowDir)) {
				fs.rmSync(this._shadowDir, { recursive: true, force: true });
			}
		} catch {}
	}
}