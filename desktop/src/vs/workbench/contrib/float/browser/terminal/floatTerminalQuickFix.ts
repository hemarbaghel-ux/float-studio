/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';

export interface IFloatTerminalErrorDiagnostic {
	id: string;
	terminalTitle: string;
	command?: string;
	exitCode?: number;
	rawOutput: string;
	matchedPattern: string;
	summary: string;
	suggestedFix?: string;
	timestamp: number;
}

export class FloatTerminalQuickFix extends Disposable {
	static readonly ID = 'workbench.contrib.floatTerminalQuickFix';

	private readonly _errorHistory: IFloatTerminalErrorDiagnostic[] = [];

	private readonly _onDidDetectError = this._register(new Emitter<IFloatTerminalErrorDiagnostic>());
	public readonly onDidDetectError: Event<IFloatTerminalErrorDiagnostic> = this._onDidDetectError.event;

	private static readonly ERROR_PATTERNS: Array<{
		regex: RegExp;
		type: string;
		formatter: (match: RegExpExecArray, text: string) => { summary: string; fix?: string };
	}> = [
		{
			regex: /(?:ModuleNotFoundError|ImportError):\s*No module named ['"]([^'"]+)['"]/i,
			type: 'python_missing_module',
			formatter: (m) => ({
				summary: `Python module '${m[1]}' is not installed`,
				fix: `pip install ${m[1]}`
			})
		},
		{
			regex: /Cannot find module ['"]([^'"]+)['"]/i,
			type: 'node_missing_module',
			formatter: (m) => ({
				summary: `Node.js module '${m[1]}' not found`,
				fix: `npm install ${m[1]}`
			})
		},
		{
			regex: /npm ERR! missing script:\s*([^\r\n]+)/i,
			type: 'npm_missing_script',
			formatter: (m) => ({
				summary: `npm script '${m[1].trim()}' is not defined in package.json`,
				fix: `Check package.json scripts block for '${m[1].trim()}'`
			})
		},
		{
			regex: /error\[E[0-9]+\]:\s*([^\r\n]+)/i,
			type: 'rust_compiler_error',
			formatter: (m) => ({
				summary: `Rust compiler error: ${m[1].trim()}`
			})
		},
		{
			regex: /error TS[0-9]+:\s*([^\r\n]+)/i,
			type: 'typescript_compiler_error',
			formatter: (m) => ({
				summary: `TypeScript diagnostic error: ${m[1].trim()}`
			})
		},
		{
			regex: /CONFLICT \(content\):\s*Merge conflict in\s*([^\r\n]+)/i,
			type: 'git_merge_conflict',
			formatter: (m) => ({
				summary: `Git merge conflict in '${m[1].trim()}'`,
				fix: `Resolve conflicting markers (<<<<<<<, =======, >>>>>>>) in ${m[1].trim()}`
			})
		},
		{
			regex: /command not found:\s*([^\r\n]+)|'([^']+)' is not recognized as an internal or external command/i,
			type: 'command_not_found',
			formatter: (m) => {
				const cmd = m[1] || m[2];
				return {
					summary: `Command '${cmd?.trim()}' is not recognized or not installed in PATH`
				};
			}
		}
	];

	public parseTerminalBuffer(
		output: string,
		terminalTitle: string = 'Terminal',
		command?: string,
		exitCode?: number
	): IFloatTerminalErrorDiagnostic | null {
		if (!output || !output.trim()) {
			return null;
		}

		for (const pattern of FloatTerminalQuickFix.ERROR_PATTERNS) {
			const match = pattern.regex.exec(output);
			if (match) {
				const { summary, fix } = pattern.formatter(match, output);
				const diagnostic: IFloatTerminalErrorDiagnostic = {
					id: `term-err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
					terminalTitle,
					command,
					exitCode,
					rawOutput: output.slice(-4000), // last 4k characters
					matchedPattern: pattern.type,
					summary,
					suggestedFix: fix,
					timestamp: Date.now()
				};

				this._errorHistory.push(diagnostic);
				if (this._errorHistory.length > 50) {
					this._errorHistory.shift();
				}

				this._onDidDetectError.fire(diagnostic);
				return diagnostic;
			}
		}

		// Fallback for non-zero exit codes with unknown output
		if (typeof exitCode === 'number' && exitCode !== 0) {
			const lines = output.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
			const lastLine = lines[lines.length - 1] || `Exited with code ${exitCode}`;
			const diagnostic: IFloatTerminalErrorDiagnostic = {
				id: `term-err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
				terminalTitle,
				command,
				exitCode,
				rawOutput: output.slice(-4000),
				matchedPattern: 'generic_nonzero_exit',
				summary: lastLine.slice(0, 100),
				timestamp: Date.now()
			};

			this._errorHistory.push(diagnostic);
			this._onDidDetectError.fire(diagnostic);
			return diagnostic;
		}

		return null;
	}

	public getRecentErrors(): IFloatTerminalErrorDiagnostic[] {
		return [...this._errorHistory];
	}

	public clearErrors(): void {
		this._errorHistory.length = 0;
	}
}
