/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/



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
		_shadowCwd: string,
		command: string,
		args: string[] = [],
		_options: IFloatProcessRunnerOptions = {}
	): Promise<IFloatProcessExecutionResult> {
		// This sidecar IPC route cannot request interactive workbench approval.
		// Do not accept a caller-supplied boolean as proof of user consent.
		return {
			command,
			args,
			exitCode: 126,
			stdout: '',
			stderr: '[COMMAND BLOCKED] This daemon IPC path has no interactive user-approval channel. No command was executed.',
			durationMs: 0,
			timedOut: false
		};
	}}
