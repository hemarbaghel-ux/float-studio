/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

class FloatShadowDaemon {
	async runShadowValidation(_task: any) {
		return { passed: true, diagnostics: [] };
	}
}

export interface IFloatBenchmarkTask {
	id: string;
	title: string;
	problemStatement: string;
	files: { [relativePath: string]: string };
	patchInstruction: string;
	expectedContains: string[];
	validationCommand?: string;
	timeoutMs?: number;
}

export interface IFloatBenchmarkTaskResult {
	taskId: string;
	passed: boolean;
	durationMs: number;
	outputDiagnostics: string[];
	patchSummary: string;
	error?: string;
}

export interface IFloatBenchmarkReport {
	suiteName: string;
	timestamp: number;
	totalTasks: number;
	passedTasks: number;
	failedTasks: number;
	passRatePercent: number;
	totalDurationMs: number;
	results: IFloatBenchmarkTaskResult[];
}

export class FloatBenchmarkHarness {
	private readonly _shadowDaemon: FloatShadowDaemon;
	private readonly _workspaceRoot: string;

	constructor(baseDir?: string) {
		this._workspaceRoot = baseDir || path.resolve(process.cwd(), '.benchmark_workspace');
		if (!fs.existsSync(this._workspaceRoot)) {
			fs.mkdirSync(this._workspaceRoot, { recursive: true });
		}
		this._shadowDaemon = new FloatShadowDaemon();
	}

	public async runTask(task: IFloatBenchmarkTask): Promise<IFloatBenchmarkTaskResult> {
		const startTime = Date.now();
		const sessionId = `bench-${task.id}-${Date.now()}`;
		const taskDir = path.join(this._workspaceRoot, task.id);

		try {
			// 1. Initialize task workspace
			if (fs.existsSync(taskDir)) {
				fs.rmSync(taskDir, { recursive: true, force: true });
			}
			fs.mkdirSync(taskDir, { recursive: true });

			for (const [relPath, content] of Object.entries(task.files)) {
				const fullPath = path.join(taskDir, relPath);
				const dir = path.dirname(fullPath);
				if (!fs.existsSync(dir)) {
					fs.mkdirSync(dir, { recursive: true });
				}
				fs.writeFileSync(fullPath, content, 'utf8');
			}

			// 2. Spawn isolated copy-on-write shadow sandbox
			const sandboxDir = await this._shadowDaemon.createShadowSandbox(sessionId, taskDir);

			// 3. Apply benchmark task patch / edit
			// Simulate agent solving the problem statement
			const targetRelPath = Object.keys(task.files)[0];
			const originalContent = task.files[targetRelPath];
			const patchedContent = originalContent.includes('// TODO: fix')
				? originalContent.replace('// TODO: fix', task.patchInstruction)
				: `${originalContent}\n${task.patchInstruction}`;

			const destFile = path.join(sandboxDir, targetRelPath);
			if (fs.existsSync(destFile)) {
				fs.unlinkSync(destFile); // Break hardlink for copy-on-write isolation
			}
			fs.writeFileSync(destFile, patchedContent, 'utf8');

			// 4. Run validation command in sandbox if provided
			const diagnostics: string[] = [];
			let validationPassed = true;

			if (task.validationCommand) {
				const execResult = await this._shadowDaemon.executeToolchain(
					sessionId,
					task.validationCommand,
					task.timeoutMs || 10000
				);
				diagnostics.push(`Exit Code: ${execResult.exitCode}`);
				if (execResult.exitCode !== 0) {
					validationPassed = false;
					diagnostics.push(execResult.stderr || execResult.stdout);
				}
			}

			// 5. Verify expected content matches
			const modifiedSnapshot = fs.existsSync(destFile) ? fs.readFileSync(destFile, 'utf8') : '';
			const containsPassed = task.expectedContains.every(expected => modifiedSnapshot.includes(expected));

			const passed = validationPassed && containsPassed;
			const durationMs = Date.now() - startTime;

			return {
				taskId: task.id,
				passed,
				durationMs,
				outputDiagnostics: diagnostics,
				patchSummary: `Modified ${targetRelPath} (+${task.patchInstruction.length} bytes)`
			};
		} catch (err: any) {
			return {
				taskId: task.id,
				passed: false,
				durationMs: Date.now() - startTime,
				outputDiagnostics: [],
				patchSummary: '',
				error: err.message
			};
		} finally {
			await this._shadowDaemon.destroyShadowSandbox(sessionId);
			if (fs.existsSync(taskDir)) {
				fs.rmSync(taskDir, { recursive: true, force: true });
			}
		}
	}

	public async runSuite(suiteName: string, tasks: IFloatBenchmarkTask[]): Promise<IFloatBenchmarkReport> {
		const suiteStartTime = Date.now();
		const results: IFloatBenchmarkTaskResult[] = [];

		for (const task of tasks) {
			const res = await this.runTask(task);
			results.push(res);
		}

		const passedTasks = results.filter(r => r.passed).length;
		const totalTasks = tasks.length;
		const passRatePercent = totalTasks > 0 ? (passedTasks / totalTasks) * 100 : 0;
		const totalDurationMs = Date.now() - suiteStartTime;

		return {
			suiteName,
			timestamp: Date.now(),
			totalTasks,
			passedTasks,
			failedTasks: totalTasks - passedTasks,
			passRatePercent,
			totalDurationMs,
			results
		};
	}

	public generateMarkdownReport(report: IFloatBenchmarkReport): string {
		let md = `# FLOAT Benchmark Evaluation Report: ${report.suiteName}\n\n`;
		md += `- **Date**: ${new Date(report.timestamp).toISOString()}\n`;
		md += `- **Pass Rate**: **${report.passRatePercent.toFixed(1)}%** (${report.passedTasks}/${report.totalTasks} tasks)\n`;
		md += `- **Total Duration**: ${report.totalDurationMs} ms\n\n`;
		md += `| Task ID | Status | Duration (ms) | Patch Summary |\n`;
		md += `| --- | --- | --- | --- |\n`;

		for (const res of report.results) {
			const statusBadge = res.passed ? '✅ PASS' : '❌ FAIL';
			md += `| ${res.taskId} | ${statusBadge} | ${res.durationMs} | ${res.patchSummary || res.error || 'N/A'} |\n`;
		}

		return md;
	}

	public dispose(): void {
		this._shadowDaemon.destroyAllSandboxes();
		if (fs.existsSync(this._workspaceRoot)) {
			try {
				fs.rmSync(this._workspaceRoot, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors
			}
		}
	}
}
