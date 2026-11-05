/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IFloatTerminalRemediation {
	type: 'install_package' | 'fix_conflict' | 'kill_port' | 'auto_patch';
	command?: string;
	description: string;
}

export interface IFloatTerminalAnalysis {
	cleanOutput: string;
	detectedErrors: string[];
	remediation?: IFloatTerminalRemediation;
}

export class FloatTerminalPtyAgent {
	public stripAnsi(rawText: string): string {
		// Strip ANSI escape codes
		return rawText.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
	}

	public analyzeTerminalOutput(rawOutput: string): IFloatTerminalAnalysis {
		const cleanOutput = this.stripAnsi(rawOutput).trim();
		const detectedErrors: string[] = [];
		let remediation: IFloatTerminalRemediation | undefined;

		const lines = cleanOutput.split('\n');

		for (const line of lines) {
			const trimmed = line.trim();

			// 1. Missing Node module
			const nodeModuleMatch = trimmed.match(/Cannot find module ['"]([^'"]+)['"]/);
			if (nodeModuleMatch) {
				const pkg = nodeModuleMatch[1];
				detectedErrors.push(`Missing Node.js module: ${pkg}`);
				if (!remediation) {
					remediation = {
						type: 'install_package',
						command: `npm install ${pkg}`,
						description: `Install missing dependency "${pkg}" with npm`
					};
				}
			}

			// 2. Missing Python package
			const pyModuleMatch = trimmed.match(/ModuleNotFoundError:\s+No module named ['"]([^'"]+)['"]/);
			if (pyModuleMatch) {
				const pkg = pyModuleMatch[1];
				detectedErrors.push(`Missing Python package: ${pkg}`);
				if (!remediation) {
					remediation = {
						type: 'install_package',
						command: `pip install ${pkg}`,
						description: `Install missing Python package "${pkg}" with pip`
					};
				}
			}

			// 3. Port in use
			if (/EADDRINUSE|address already in use/i.test(trimmed)) {
				const portMatch = trimmed.match(/:(\d{2,5})\b/);
				const port = portMatch ? portMatch[1] : 'current';
				detectedErrors.push(`Port ${port} is already in use`);
				if (!remediation) {
					remediation = {
						type: 'kill_port',
						description: `Port ${port} conflict detected; terminate occupying process`
					};
				}
			}

			// 4. Git conflict
			if (/CONFLICT\s+\(content\):\s+Merge conflict in\s+(.+)/i.test(trimmed)) {
				const match = trimmed.match(/Merge conflict in\s+(.+)/i);
				const conflictFile = match ? match[1].trim() : 'files';
				detectedErrors.push(`Git merge conflict in ${conflictFile}`);
				if (!remediation) {
					remediation = {
						type: 'fix_conflict',
						description: `Resolve Git merge conflict markers in ${conflictFile}`
					};
				}
			}

			// 5. Assertion error
			if (/AssertionError/i.test(trimmed)) {
				detectedErrors.push(trimmed);
				if (!remediation) {
					remediation = {
						type: 'auto_patch',
						description: 'Unit test assertion failed; apply code patch'
					};
				}
			}
		}

		return {
			cleanOutput,
			detectedErrors,
			remediation
		};
	}
}
