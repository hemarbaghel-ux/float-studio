/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { spawn, ChildProcess } from 'child_process';

export interface IFloatProcessExecutionResult {
	command: string;
	args: string[];
	exitCode: number | null;
	stdout: string;
	stderr: string;
	durationMs: number;
	timedOut: boolean;
}

export interface IFloatProcessRunnerOptions {
	timeoutMs?: number;
	maxOutputChars?: number;
	env?: Record<string, string>;
}

export class FloatSandboxedProcessRunner {
	private static readonly PERMITTED_COMMANDS = new Set([
		'npm', 'npm.cmd',
		'npx', 'npx.cmd',
		'node', 'node.exe',
		'tsc', 'tsc.cmd',
		'pytest',
		'python', 'python.exe',
		'cargo', 'cargo.exe',
		'go', 'go.exe',
		'git', 'git.exe'
	]);

	public static isCommandPermitted(cmd: string): boolean {
		const baseCmd = cmd.trim().split(/[\/\\]/).pop()?.toLowerCase() || '';
		return this.PERMITTED_COMMANDS.has(baseCmd);
	}

	public async runInShadowWorkspace(
		shadowCwd: string,
		command: string,
		args: string[] = [],
		options: IFloatProcessRunnerOptions = {}
	): Promise<IFloatProcessExecutionResult> {
		const timeoutMs = options.timeoutMs || 15000;
		const maxOutputChars = options.maxOutputChars || 500000;
		const startTime = Date.now();

		if (!FloatSandboxedProcessRunner.isCommandPermitted(command)) {
			throw new Error(`Command "${command}" is not permitted in sandboxed shadow workspace`);
		}

		return new Promise<IFloatProcessExecutionResult>((resolve) => {
			let stdout = '';
			let stderr = '';
			let timedOut = false;

			const isCmd = process.platform === 'win32' && (command.endsWith('.cmd') || command.endsWith('.bat'));
			const child: ChildProcess = spawn(command, args, {
				cwd: shadowCwd,
				env: { ...process.env, ...options.env, CI: 'true', FLOAT_SHADOW: 'true' },
				shell: isCmd
			});

			const timer = setTimeout(() => {
				timedOut = true;
				try {
					child.kill('SIGTERM');
				} catch {}
			}, timeoutMs);

			child.stdout?.on('data', (data: Buffer) => {
				if (stdout.length < maxOutputChars) {
					stdout += data.toString('utf8');
				}
			});

			child.stderr?.on('data', (data: Buffer) => {
				if (stderr.length < maxOutputChars) {
					stderr += data.toString('utf8');
				}
			});

			child.on('close', (code: number | null) => {
				clearTimeout(timer);
				const durationMs = Date.now() - startTime;
				resolve({
					command,
					args,
					exitCode: code,
					stdout: stdout.trim(),
					stderr: stderr.trim(),
					durationMs,
					timedOut
				});
			});

			child.on('error', (err: Error) => {
				clearTimeout(timer);
				const durationMs = Date.now() - startTime;
				resolve({
					command,
					args,
					exitCode: 1,
					stdout,
					stderr: `${stderr}\n${err.message}`.trim(),
					durationMs,
					timedOut
				});
			});
		});
	}
}
