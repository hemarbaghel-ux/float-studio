/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IFloatShadowDiagnostic {
	filePath: string;
	line: number;
	column: number;
	code?: string;
	message: string;
	severity: 'error' | 'warning';
	rawLine: string;
}

export class FloatShadowDiagnosticDiffCollector {
	public parseDiagnostics(output: string): IFloatShadowDiagnostic[] {
		const diagnostics: IFloatShadowDiagnostic[] = [];
		const lines = output.split('\n');

		for (const line of lines) {
			const trimmed = line.trim();

			// 1. TypeScript (e.g., src/app.ts(42,10): error TS2322: Type 'number' is not assignable to type 'string'.)
			const tsMatch = line.match(/^([^(]+)\((\d+),(\d+)\):\s*(error|warning)\s+([A-Za-z0-9]+):\s*(.+)$/);
			if (tsMatch) {
				diagnostics.push({
					filePath: tsMatch[1].trim().replace(/\\/g, '/'),
					line: parseInt(tsMatch[2], 10),
					column: parseInt(tsMatch[3], 10),
					severity: tsMatch[4] === 'error' ? 'error' : 'warning',
					code: tsMatch[5],
					message: tsMatch[6].trim(),
					rawLine: trimmed
				});
				continue;
			}

			// 2. Rust (e.g., --> src/main.rs:14:5)
			const rustMatch = line.match(/-->\s+([^:]+):(\d+):(\d+)/);
			if (rustMatch) {
				diagnostics.push({
					filePath: rustMatch[1].trim().replace(/\\/g, '/'),
					line: parseInt(rustMatch[2], 10),
					column: parseInt(rustMatch[3], 10),
					severity: 'error',
					message: 'Rust compilation error',
					rawLine: trimmed
				});
				continue;
			}

			// 3. Go (e.g., main.go:12:9: undefined: x)
			const goMatch = line.match(/^([^:]+):(\d+):(\d+):\s*(.+)$/);
			if (goMatch && !line.includes('(')) {
				diagnostics.push({
					filePath: goMatch[1].trim().replace(/\\/g, '/'),
					line: parseInt(goMatch[2], 10),
					column: parseInt(goMatch[3], 10),
					severity: 'error',
					message: goMatch[4].trim(),
					rawLine: trimmed
				});
				continue;
			}

			// 4. Python Traceback (e.g., File "server.py", line 15, in <module>)
			const pyMatch = line.match(/File\s+"([^"]+)",\s*line\s*(\d+)/);
			if (pyMatch) {
				diagnostics.push({
					filePath: pyMatch[1].trim().replace(/\\/g, '/'),
					line: parseInt(pyMatch[2], 10),
					column: 1,
					severity: 'error',
					message: 'Python runtime exception / syntax error',
					rawLine: trimmed
				});
				continue;
			}
		}

		return diagnostics;
	}

	public generateRepairPrompt(diagnostics: IFloatShadowDiagnostic[]): string {
		if (diagnostics.length === 0) {
			return 'All toolchain checks passed cleanly in shadow workspace.';
		}

		const lines: string[] = [
			'## Shadow Workspace Compilation & Toolchain Diagnostics',
			'The following errors were intercepted in the isolated shadow workspace. Resolve them before finalizing proposal:',
			''
		];

		for (let i = 0; i < diagnostics.length; i++) {
			const d = diagnostics[i];
			const codeStr = d.code ? ` [${d.code}]` : '';
			lines.push(`${i + 1}. **${d.filePath}:${d.line}:${d.column}**${codeStr} (${d.severity}): ${d.message}`);
		}

		lines.push('');
		lines.push('Analyze the error messages and produce the minimal patch necessary to restore clean compilation.');
		return lines.join('\n');
	}
}
