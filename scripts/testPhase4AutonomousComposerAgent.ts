import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FloatMultiFileDiffOrchestrator } from '../desktop/src/vs/workbench/contrib/float/common/composer/floatMultiFileDiffOrchestrator.js';
import { FloatMultiDiffController } from '../desktop/src/vs/workbench/contrib/float/common/composer/floatMultiDiffController.js';
import { FloatComposerAgent, IComposerAgentGoal } from '../desktop/src/vs/workbench/contrib/float/common/composer/floatComposerAgent.js';
import { FloatComposerToolRegistry, IComposerFileSystem } from '../desktop/src/vs/workbench/contrib/float/common/composer/floatComposerTools.js';

class MockInMemoryComposerFileSystem implements IComposerFileSystem {
	public readonly workspaceRoot: string;

	constructor(public files: Record<string, string> = {}) {
		this.workspaceRoot = path.join(os.tmpdir(), `mock-ws-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`);
		fs.mkdirSync(this.workspaceRoot, { recursive: true });
	}

	async readFile(p: string): Promise<string> {
		const val = this.files[p] ?? this.files['./' + p] ?? this.files[p.replace(/^\.\//, '')];
		if (val === undefined) throw new Error(`File not found: ${p}`);
		return val;
	}

	async writeFile(p: string, content: string): Promise<void> {
		this.files[p.replace(/^\.\//, '')] = content;
	}

	async fileExists(p: string): Promise<boolean> {
		const clean = p.replace(/^\.\//, '');
		return this.files[clean] !== undefined;
	}

	async listDirectory(_p: string, _recursive?: boolean): Promise<string[]> {
		return Object.keys(this.files);
	}

	async findFiles(_pattern: string): Promise<string[]> {
		return Object.keys(this.files);
	}

	cleanup(): void {
		try {
			fs.rmSync(this.workspaceRoot, { recursive: true, force: true });
		} catch {}
	}
}

async function runPhase4Tests() {
	console.log('🧪 Starting Phase 4: Autonomous Multi-File Composer & Terminal Agent Tests...\n');

	const orchestrator = new FloatMultiFileDiffOrchestrator();
	const controller = new FloatMultiDiffController(orchestrator);

	// Test 1: Multi-File Diff Cards Representation & Hunk Extraction
	console.log('Test 1: Multi-File Diff Cards & Hunk Tracking...');
	const proposal = orchestrator.createProposal(
		'Refactor Auth Subsystem',
		'Adds token refresh and rotates encryption secrets',
		[
			{
				path: 'src/auth/jwt.ts',
				originalContent: 'export function sign(payload) { return "token"; }\n',
				proposedContent: 'export function sign(payload, secret) { return "token-" + secret; }\nexport function verify(token) { return true; }\n'
			},
			{
				path: 'src/auth/middleware.ts',
				originalContent: 'import { sign } from "./jwt";\nsign(user);\n',
				proposedContent: 'import { sign, verify } from "./jwt";\nsign(user, "s3cr3t");\n'
			}
		]
	);

	const cardState = controller.getCardState(proposal.id);
	assert(cardState !== undefined, 'Card state should exist');
	assert.strictEqual(cardState.totalFiles, 2, 'Should track 2 files');
	assert.strictEqual(cardState.files[0].path, 'src/auth/jwt.ts');
	assert(cardState.files[0].hunkCount >= 1, 'Should extract diff hunks');
	assert.strictEqual(cardState.overallStatus, 'pending');
	console.log(`  ✓ Multi-diff card generated with ${cardState.totalFiles} files and ${cardState.additions} additions.`);

	// Test 2: Granular Per-File & Per-Hunk Actions
	console.log('\nTest 2: Granular Per-File Acceptance & Rejection...');
	const appliedFiles: Record<string, string> = {};
	const applyOk = await controller.acceptFile(proposal.id, 'src/auth/jwt.ts', async (p, content) => {
		appliedFiles[p] = content;
	});
	assert(applyOk, 'File acceptance should succeed');
	assert(appliedFiles['src/auth/jwt.ts'] !== undefined, 'File content should be written');

	// Reject second file
	const rejectOk = controller.rejectFile(proposal.id, 'src/auth/middleware.ts');
	assert(rejectOk, 'File rejection should succeed');

	const updatedState = controller.getCardState(proposal.id);
	assert.strictEqual(updatedState?.files[0].status, 'accepted');
	assert.strictEqual(updatedState?.files[1].status, 'rejected');
	assert.strictEqual(updatedState?.overallStatus, 'partially_accepted');
	console.log('  ✓ Granular per-file acceptance and rejection verified (overall: partially_accepted).');

	// Test 3: Transactional Multi-File Apply with Atomic Rollback on Failure
	console.log('\nTest 3: Transactional Multi-File Apply with Atomic Rollback...');
	const txProposal = orchestrator.createProposal(
		'5-File Database Migration',
		'Touches 5 schema and service files',
		[
			{ path: 'db/schema.sql', originalContent: '-- v1\n', proposedContent: '-- v2\n' },
			{ path: 'db/migrate.ts', originalContent: '// mig1\n', proposedContent: '// mig2\n' },
			{ path: 'src/models/user.ts', originalContent: 'class User {}\n', proposedContent: 'class UserV2 {}\n' },
			{ path: 'src/models/post.ts', originalContent: 'class Post {}\n', proposedContent: 'class PostV2 {}\n' },
			{ path: 'src/server.ts', originalContent: '// server\n', proposedContent: '// server v2\n' }
		]
	);

	const diskState: Record<string, string> = {
		'db/schema.sql': '-- v1\n',
		'db/migrate.ts': '// mig1\n',
		'src/models/user.ts': 'class User {}\n',
		'src/models/post.ts': 'class Post {}\n',
		'src/server.ts': '// server\n'
	};

	let writeCount = 0;
	// Inject failure on 3rd file write
	const commitResult = await controller.commitTransactional(
		txProposal.id,
		async (filePath, content) => {
			writeCount++;
			if (writeCount === 3) {
				throw new Error('Disk write I/O error on file 3!');
			}
			diskState[filePath] = content;
		},
		undefined,
		diskState
	);

	assert.strictEqual(commitResult.success, false, 'Transaction should fail');
	assert.strictEqual(commitResult.rolledBack, true, 'Transaction must trigger atomic rollback');
	assert.strictEqual(commitResult.failedFile, 'src/models/user.ts');
	assert.strictEqual(commitResult.committedFiles.length, 0, 'No files should remain committed after rollback');

	// Verify on-disk contents were rolled back to their original state
	assert.strictEqual(diskState['db/schema.sql'], '-- v1\n', 'db/schema.sql must be restored to original');
	assert.strictEqual(diskState['db/migrate.ts'], '// mig1\n', 'db/migrate.ts must be restored to original');
	console.log('  ✓ Injected failure after 2 writes triggered full atomic rollback with zero corrupt state.');

	// Test 4: Concurrent Edit Conflict Detection
	console.log('\nTest 4: Concurrent Edit Conflict Detection...');
	const conflictProposal = orchestrator.createProposal(
		'Edit file with concurrent user typing',
		'Test conflict',
		[{ path: 'main.ts', originalContent: 'console.log("hello");\n', proposedContent: 'console.log("hello world");\n' }]
	);

	// User types into main.ts on disk while proposal was pending
	const concurrentDisk: Record<string, string> = {
		'main.ts': 'console.log("user concurrently typed this!");\n'
	};

	const conflictRes = await controller.commitTransactional(
		conflictProposal.id,
		async () => {},
		undefined,
		concurrentDisk
	);

	assert.strictEqual(conflictRes.success, false, 'Conflict should prevent commit');
	assert(conflictRes.conflictedFiles.includes('main.ts'), 'Should identify main.ts as conflicted');
	console.log('  ✓ Concurrent disk edit detected: commit aborted to protect user typing.');

	// Test 5: Terminal Error Auto-Remediation Goal Builder
	console.log('\nTest 5: Terminal PTY Error Auto-Remediation Goal...');
	const errorLogs = [
		'yarn run build',
		'src/index.ts(10,5): error TS2304: Cannot find name "ConfigService".',
		'error Command failed with exit code 1.'
	].join('\n');

	const repairGoal = controller.buildTerminalErrorRepairGoal('build-task', 1, errorLogs, 'src/index.ts');
	assert(repairGoal.prompt.includes('Cannot find name "ConfigService"'), 'Goal prompt should contain compiler error');
	assert.strictEqual(repairGoal.enableShadowValidation, true, 'Should enable shadow validation');
	assert.strictEqual(repairGoal.isolateWorkspaceMutations, true, 'Must isolate workspace mutations');
	assert.strictEqual(repairGoal.maxSpeculativeRepairs, 3);
	console.log('  ✓ Autonomous terminal error repair goal successfully constructed with isolation & diagnostics.');

	// Test 6: Composer Agent Execution with Shadow Self-Repair Loop
	console.log('\nTest 6: Composer Agent Execution with Shadow Self-Repair...');
	const memFs = new MockInMemoryComposerFileSystem({
		'src/index.ts': 'export function run() { return 1; }\n'
	});
	const toolRegistry = new FloatComposerToolRegistry(memFs);

	let modelTurn = 0;
	const mockFloatService: any = {
		getCheckpointService: () => ({
			createCheckpoint: (name: string, snapshot: any) => ({ id: 'ckpt-1', name, snapshot })
		}),
		generateAgentStep: async (messages: any[]) => {
			modelTurn++;
			if (modelTurn === 1) {
				return {
					text: 'I will update src/index.ts with a deliberate type error.',
					toolCalls: [{
						id: 'write-invalid',
						name: 'write_file',
						arguments: {
							path: 'src/index.ts',
							content: 'export function run(): number { return "string-not-number"; }'
						}
					}]
				};
			} else if (modelTurn === 2) {
				const lastMessage = messages[messages.length - 1].content;
				assert(lastMessage.includes('SHADOW WORKSPACE SPECULATIVE COMPILATION REPORT') ||
					lastMessage.includes('Type') || lastMessage.includes('error'),
					'Agent should receive shadow-validation diagnostics');
				return {
					text: 'I will fix the reported return type mismatch.',
					toolCalls: [{
						id: 'write-fixed',
						name: 'write_file',
						arguments: {
							path: 'src/index.ts',
							content: 'export function run(): number { return 42; }'
						}
					}]
				};
			}
			return { text: 'All changes fixed and validated.', toolCalls: [] };
		}
	};

	try {
		const agent = new FloatComposerAgent(mockFloatService, toolRegistry, orchestrator);
		const agentExecution = await agent.executeGoal({
			prompt: 'Fix return type in src/index.ts',
			maxSteps: 5,
			enableShadowValidation: true,
			maxSpeculativeRepairs: 2,
			isolateWorkspaceMutations: true
		});

		assert.strictEqual(agentExecution.status, 'completed', 'Agent should complete');
		console.log(`  ✓ Composer Agent executed with shadow gate (${modelTurn} turns). Status: ${agentExecution.status}`);

		console.log('\n✅ All Phase 4 Autonomous Multi-File Composer tests PASSED successfully!\n');
	} finally {
		memFs.cleanup();
	}
}

runPhase4Tests().catch(err => {
	console.error('❌ Phase 4 test failed:', err);
	process.exit(1);
});
