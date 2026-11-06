/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { FloatDockerSandboxRunner } from './floatDockerSandboxRunner.js';
import { copyComposerWorkspace, isComposerSandboxExcludedDirectory, isComposerSandboxSensitivePath } from './floatSandboxWorkspaceCopy.js';
import { IComposerFileSystem, IComposerCommandRunner } from './floatComposerTools.js';
import { sanitizeProposalPath } from '../proposals/floatProposalValidator.js';
import { FloatSecurityGuard } from '../../electron-sandbox/security/floatSecurityGuard.js';

/**
 * Resolve a proposal-relative path beneath a workspace while rejecting
 * existing symlink/junction components and hard-linked target files.
 * This is path hardening, not a substitute for OS-level isolation.
 */
export function resolveComposerWorkspacePath(workspaceRoot: string, relPath: string): string {
	const clean = relPath === '.' || relPath === '' ? '.' : sanitizeProposalPath(relPath);
	const rootResolved = fs.realpathSync(workspaceRoot);
	const resolved = path.resolve(rootResolved, clean);
	const relative = path.relative(rootResolved, resolved);
	if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
		throw new Error('[SECURITY] Path traversal escape attempt blocked: ' + relPath);
	}

	let current = rootResolved;
	const segments = relative ? relative.split(path.sep).filter(Boolean) : [];
	for (let index = 0; index < segments.length; index++) {
		current = path.join(current, segments[index]);
		try {
			const stat = fs.lstatSync(current);
			if (stat.isSymbolicLink()) {
				throw new Error('[SECURITY] Symlink traversal blocked: ' + relPath);
			}
			if (index < segments.length - 1 && !stat.isDirectory()) {
				throw new Error('[SECURITY] Non-directory path component blocked: ' + relPath);
			}
			if (index === segments.length - 1 && stat.isFile() && stat.nlink > 1) {
				throw new Error('[SECURITY] Hard-linked workspace file blocked: ' + relPath);
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				break;
			}
			throw error;
		}
	}
	return resolved;
}

export class ProductionComposerFileSystem implements IComposerFileSystem {
	constructor(private readonly _workspaceRoot: string) {}

	public get workspaceRoot(): string {
		return this._workspaceRoot;
	}

	private _resolve(relPath: string): string {
		return resolveComposerWorkspacePath(this._workspaceRoot, relPath);
	}

	public isSensitiveFile(relPath: string): boolean {
		return isComposerSandboxSensitivePath(relPath);
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
			throw new Error('[SECURITY] Writing to sensitive file prohibited: ' + relPath);
		}
		const full = this._resolve(relPath);
		await fsp.mkdir(path.dirname(full), { recursive: true });
		const safeFull = this._resolve(relPath);
		const noFollow = (fs.constants as any).O_NOFOLLOW || 0;
		const handle = await fsp.open(
			safeFull,
			fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | noFollow,
			0o666
		);
		try {
			await handle.writeFile(content, 'utf8');
		} finally {
			await handle.close();
		}
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
		if (isComposerSandboxSensitivePath(relPath)) return [];
		const targetDir = this._resolve(relPath);
		if (!fs.existsSync(targetDir)) {
			return [];
		}

		const results: string[] = [];
		const scan = async (dir: string, base: string) => {
			const entries = await fsp.readdir(dir, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
					continue;
				}
				if (isComposerSandboxExcludedDirectory(entry.name)) {
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
		protected readonly _timeoutMs: number = 30000
	) {}

	public get workspaceRoot(): string {
		return this._workspaceRoot;
	}

	public async runCommand(command: string, cwd?: string): Promise<{
		exitCode: number;
		stdout: string;
		stderr: string;
	}> {
		if (!FloatSecurityGuard.isCommandSafe(command)) {
			return { exitCode: 1, stdout: '', stderr: '[SECURITY REJECTION] Command refused by FLOAT Security Policy.' };
		}

		const safeCwd = !cwd || cwd === '.' || cwd === '' ? '.' : sanitizeProposalPath(cwd);
		const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'float-composer-command-'));
		const scratchWorkspace = path.join(scratchRoot, 'workspace');

		try {
			copyComposerWorkspace(this._workspaceRoot, scratchWorkspace);
			const runner = new FloatDockerSandboxRunner(
				scratchWorkspace,
				path.join(this._workspaceRoot, 'node_modules'),
				this._timeoutMs
			);
			return await runner.run(command, { cwd: safeCwd, timeoutMs: this._timeoutMs });
		} catch (error) {
			return {
				exitCode: 1,
				stdout: '',
				stderr: '[SANDBOX PREPARATION FAILED] ' + (error instanceof Error ? error.message : String(error))
			};
		} finally {
			try {
				fs.rmSync(scratchRoot, { recursive: true, force: true });
			} catch {
				// Best-effort cleanup; no command is run against the original workspace.
			}
		}
	}
}

/**
 * Isolated Shadow Workspace Command Runner.
 *
 * Composer writes speculative files into a disposable copy. Toolchain commands
 * run in a network-disabled Docker container; the copied workspace is the only
 * writable bind mount and the original node_modules directory is read-only.
 * The temporary directory itself is not an OS sandbox.
 */
export class IsolatedShadowWorkspaceCommandRunner implements IComposerCommandRunner {
	private readonly _shadowDir: string;
	private readonly _sandboxRunner: FloatDockerSandboxRunner;
	private _disposed: boolean = false;

	constructor(
		private readonly _originalWorkspaceRoot: string,
		speculativeOverlays?: Map<string, string>,
		private readonly _timeoutMs: number = 30000
	) {
		this._shadowDir = path.join(
			os.tmpdir(),
			'float-shadow-cmd-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7)
		);
		this._initShadowWorkspace(speculativeOverlays);
		this._sandboxRunner = new FloatDockerSandboxRunner(
			this._shadowDir,
			path.join(this._originalWorkspaceRoot, 'node_modules'),
			this._timeoutMs
		);
	}

	public get shadowDir(): string {
		return this._shadowDir;
	}

	public get originalWorkspaceRoot(): string {
		return this._originalWorkspaceRoot;
	}

	private _initShadowWorkspace(overlays?: Map<string, string>): void {
		fs.mkdirSync(this._shadowDir, { recursive: true });
		copyComposerWorkspace(this._originalWorkspaceRoot, this._shadowDir);

		if (overlays) {
			for (const [relPath, content] of overlays.entries()) {
				const target = resolveComposerWorkspacePath(this._shadowDir, relPath);
				fs.mkdirSync(path.dirname(target), { recursive: true });
				const safeTarget = resolveComposerWorkspacePath(this._shadowDir, relPath);
				const noFollow = (fs.constants as any).O_NOFOLLOW || 0;
				const descriptor = fs.openSync(
					safeTarget,
					fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | noFollow,
					0o666
				);
				try {
					fs.writeFileSync(descriptor, content, 'utf8');
				} finally {
					fs.closeSync(descriptor);
				}
			}
		}
	}

	public updateOverlay(relPath: string, content: string): void {
		if (this._disposed) return;
		const target = resolveComposerWorkspacePath(this._shadowDir, relPath);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		// Re-resolve after creating parent directories and refuse a final symlink.
		const safeTarget = resolveComposerWorkspacePath(this._shadowDir, relPath);
		const noFollow = (fs.constants as any).O_NOFOLLOW || 0;
		const descriptor = fs.openSync(
			safeTarget,
			fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | noFollow,
			0o666
		);
		try {
			fs.writeFileSync(descriptor, content, 'utf8');
		} finally {
			fs.closeSync(descriptor);
		}
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
			return { exitCode: 1, stdout: '', stderr: '[SECURITY REJECTION] Command refused by FLOAT Security Policy.' };
		}
		const safeCwd = !cwd || cwd === '.' || cwd === '' ? '.' : sanitizeProposalPath(cwd);
		return await this._sandboxRunner.run(command, { cwd: safeCwd, timeoutMs: this._timeoutMs });
	}

	public abort(): void {
		this._sandboxRunner.abort();
	}

	public dispose(): void {
		this.abort();
		this._disposed = true;
		try {
			if (fs.existsSync(this._shadowDir)) {
				fs.rmSync(this._shadowDir, { recursive: true, force: true });
			}
		} catch {
			// Best-effort cleanup of the disposable shadow directory.
		}
	}
}
