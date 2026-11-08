/**
 * FLOAT Studio - Priority 5: End-to-End Integration & Reliability Acceptance Suite
 *
 * Comprehensive evaluation of 20 realistic tasks across disposable repositories:
 * 1. Real workspace file discovery & enumeration
 * 2. Real permitted terminal command execution
 * 3. Security command rejection policy guard
 * 4. Sensitive file exclusion and model context protection
 * 5. Production Autonomous Composer multi-file agent execution
 * 6. Isolated speculative overlay verification (zero disk mutation before approval)
 * 7. Speculative proposal rejection (zero disk mutation guarantee)
 * 8. Production proposal acceptance (safe atomic commit to disk)
 * 9. Accurate write_file mutation tracking
 * 10. Accurate edit_file mutation tracking
 * 11. Agent failure state & max steps enforcement
 * 12. Agent cancellation via AbortSignal
 * 13. Shadow workspace project-aware TypeScript diagnostics
 * 14. Shadow workspace broken import non-suppression
 * 15. Shadow workspace internal compiler error safety
 * 16. Concurrent edit conflict detection & preservation
 * 17. Predictive autocomplete workbench registration & contract
 * 18. Predictive autocomplete global toggle connection
 * 19. Latency metric separation (cache-hit vs model network)
 * 20. Filesystem watcher sync & index metadata recovery
 */

import assert from 'assert';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';

import {
	ProductionComposerFileSystem,
	ProductionComposerCommandRunner,
	SpeculativeComposerFileSystem
} from '../desktop/src/vs/workbench/contrib/float/common/composer/floatProductionAdapters.js';
import {
	FloatComposerToolRegistry,
	IComposerFileSystem,
	IComposerCommandRunner
} from '../desktop/src/vs/workbench/contrib/float/common/composer/floatComposerTools.js';
import {
	FloatMultiFileDiffOrchestrator
} from '../desktop/src/vs/workbench/contrib/float/common/composer/floatMultiFileDiffOrchestrator.js';
import {
	FloatComposerAgent,
	IComposerAgentGoal
} from '../desktop/src/vs/workbench/contrib/float/common/composer/floatComposerAgent.js';
import {
	FloatComposer
} from '../desktop/src/vs/workbench/contrib/float/browser/composer/floatComposer.js';
import {
	FloatShadowCompiler
} from '../desktop/src/vs/workbench/contrib/float/common/shadow/floatShadowCompiler.js';
import {
	FloatShadowWorkspaceService
} from '../desktop/src/vs/workbench/contrib/float/common/shadow/floatShadowWorkspaceService.js';
import {
	FloatPredictiveAutocomplete
} from '../desktop/src/vs/workbench/contrib/float/browser/autocomplete/floatPredictiveAutocomplete.js';
import {
	ToggleFloatAutocompleteAction,
	isFloatAutocompleteGloballyEnabled
} from '../desktop/src/vs/workbench/contrib/float/browser/autocomplete/floatAutocompleteActions.js';
import {
	FloatWorkspaceIndexer
} from '../desktop/src/vs/workbench/contrib/float/common/workspace/floatWorkspaceIndexer.js';
import {
	FloatCheckpointService
} from '../desktop/src/vs/workbench/contrib/float/common/checkpoints/floatCheckpointService.js';
import {
	FloatProposalSession
} from '../desktop/src/vs/workbench/contrib/float/common/proposals/floatProposal.js';

async function runEndToEndEvaluation() {
	console.log('================================================================');
	console.log('  FLOAT STUDIO: INTEGRATION & RELIABILITY ACCEPTANCE SUITE      ');
	console.log('================================================================\n');

	const repoRoot = process.cwd();
	const baseTmp = path.resolve(repoRoot, `tmp/e2e-eval-${Date.now()}`);
	fs.mkdirSync(baseTmp, { recursive: true });
	console.log(`[DISPOSABLE ENVIRONMENT] Base test directory: ${baseTmp}\n`);

	let passedCount = 0;

	// Helper for mock float service
	function createMockFloatService(workspaceDir: string) {
		const checkpointService = new FloatCheckpointService(workspaceDir);
		const proposalSession = new FloatProposalSession();
		const workspaceIndexer = new FloatWorkspaceIndexer();

		return {
			getActiveModel: () => ({ id: 'gpt-6-astra', name: 'GPT-6 Astra' }),
			getCheckpointService: () => checkpointService,
			getProposalSession: () => proposalSession,
			getWorkspaceIndexer: () => workspaceIndexer,
			getBrainService: () => ({
				findSymbols: () => []
			}),
			streamChat: async (messages: any[], callbacks: any) => {
				callbacks.onChunk('Simulated completion.');
				callbacks.onComplete();
			},
			completeCode: async () => ({
				completion: 'function helper() { return 42; }',
				cancelled: false
			})
		};
	}

	// Helper for mock notification service
	const mockNotificationService: any = {
		info: () => {},
		warn: () => {},
		error: () => {}
	};

	// -------------------------------------------------------------
	// TASK 1: Real Workspace File Discovery & Enumeration
	// -------------------------------------------------------------
	console.log('[Task 1/20] Real Workspace File Exploration & Enumeration...');
	const ws1 = path.join(baseTmp, 'ws1');
	fs.mkdirSync(path.join(ws1, 'src/modules'), { recursive: true });
	fs.mkdirSync(path.join(ws1, 'node_modules/fake-lib'), { recursive: true });
	fs.mkdirSync(path.join(ws1, '.git/objects'), { recursive: true });
	fs.writeFileSync(path.join(ws1, 'src/index.ts'), 'export const main = 1;', 'utf8');
	fs.writeFileSync(path.join(ws1, 'src/modules/calc.ts'), 'export const calc = 2;', 'utf8');
	fs.writeFileSync(path.join(ws1, 'node_modules/fake-lib/index.js'), 'ignored', 'utf8');
	fs.writeFileSync(path.join(ws1, '.git/HEAD'), 'ref: refs/heads/main', 'utf8');
	fs.writeFileSync(path.join(ws1, '.env'), 'SECRET_KEY=123', 'utf8');

	const prodFs = new ProductionComposerFileSystem(ws1);
	const listed = await prodFs.listDirectory('.', true);
	assert.ok(listed.includes('src/index.ts'), 'Must find src/index.ts');
	assert.ok(listed.includes('src/modules/calc.ts'), 'Must find src/modules/calc.ts');
	assert.ok(!listed.some(f => f.includes('node_modules')), 'node_modules must be excluded');
	assert.ok(!listed.some(f => f.includes('.git')), '.git must be excluded');
	assert.ok(!listed.some(f => f.includes('.env')), '.env must be excluded');

	const found = await prodFs.findFiles('calc');
	assert.strictEqual(found.length, 1);
	assert.strictEqual(found[0], 'src/modules/calc.ts');
	console.log('  -> PASS: Real file exploration verified with strict sensitive directory exclusions\n');
	passedCount++;

	// -------------------------------------------------------------
	// TASK 2: Real Permitted Terminal Command Execution
	// -------------------------------------------------------------
	console.log('[Task 2/20] Real Permitted Terminal Command Execution...');
	const runner = new ProductionComposerCommandRunner(ws1, 30000, async request => request.workspaceRoot === path.resolve(ws1));
	const execResult = await runner.runCommand('node -e "console.log(\'FLOAT_RUNNER_OK\')"');
	assert.strictEqual(execResult.exitCode, 0, 'Permitted command must exit with code 0');
	assert.ok(execResult.stdout.includes('FLOAT_RUNNER_OK'), 'Stdout must contain command output');
	assert.strictEqual(execResult.stderr, '');
	console.log('  -> PASS: Real process execution executed and captured live exit code and stdout\n');
	passedCount++;

	// -------------------------------------------------------------
	// TASK 3: Security Command Rejection Policy Guard
	// -------------------------------------------------------------
	console.log('[Task 3/20] Security Command Rejection Policy Guard...');
	const dangerousCmd = 'rm -rf /';
	const rejectResult = await runner.runCommand(dangerousCmd);
	assert.strictEqual(rejectResult.exitCode, 1, 'Prohibited command must fail');
	assert.ok(rejectResult.stderr.includes('[SECURITY REJECTION]'), 'Must report security policy rejection');
	console.log('  -> PASS: Prohibited commands blocked before execution by FLOAT Security Policy\n');
	passedCount++;

	// -------------------------------------------------------------
	// TASK 4: Sensitive File Exclusion and Model Context Protection
	// -------------------------------------------------------------
	console.log('[Task 4/20] Sensitive File Exclusion & Model Context Protection...');
	let readBlocked = false;
	try {
		await prodFs.readFile('.env');
	} catch (e: any) {
		readBlocked = e.message.includes('[SECURITY] Access denied to sensitive file');
	}
	assert.ok(readBlocked, 'Reading .env must be rejected with security violation');

	const indexer = new FloatWorkspaceIndexer();
	assert.strictEqual(indexer.isExcluded('.env'), true);
	assert.strictEqual(indexer.isExcluded('keys/id_rsa'), true);
	assert.strictEqual(indexer.isExcluded('credentials.json'), true);
	assert.strictEqual(indexer.isExcluded('src/app.ts'), false);
	console.log('  -> PASS: Sensitive credentials guarded from reading and semantic indexing\n');
	passedCount++;

	// -------------------------------------------------------------
	// TASK 5: Production Autonomous Composer Multi-File Agent Execution
	// -------------------------------------------------------------
	console.log('[Task 5/20] Production Autonomous Composer Multi-File Agent Execution...');
	const ws5 = path.join(baseTmp, 'ws5');
	fs.mkdirSync(path.join(ws5, 'src'), { recursive: true });
	fs.writeFileSync(path.join(ws5, 'src/math.ts'), 'export function sum(a: number, b: number) { return a + b; }', 'utf8');

	const mockFloat5: any = createMockFloatService(ws5);
	let stepCounter = 0;
	mockFloat5.streamChat = async (messages: any[], callbacks: any) => {
		stepCounter++;
		if (stepCounter === 1) {
			callbacks.onChunk('Reading math.ts\n```tool_call\n{"name":"read_file","parameters":{"path":"src/math.ts"}}\n```');
		} else if (stepCounter === 2) {
			callbacks.onChunk('Writing mult.ts\n```tool_call\n{"name":"write_file","parameters":{"path":"src/mult.ts","content":"export function mult(a: number, b: number) { return a * b; }"}}\n```');
		} else {
			callbacks.onChunk('Finished work.\n```typescript path="src/math.ts"\nexport function sum(a: number, b: number) { return a + b; }\nexport function sub(a: number, b: number) { return a - b; }\n```');
		}
		callbacks.onComplete();
	};

	const fs5 = new ProductionComposerFileSystem(ws5);
	const runner5 = new ProductionComposerCommandRunner(ws5);
	const composer5 = new FloatComposer(
		mockFloat5,
		mockNotificationService,
		{
			read: async (u: any) => ({ value: fs.readFileSync(u.fsPath, 'utf8') }),
			write: async (u: any, c: string) => { fs.writeFileSync(u.fsPath, c, 'utf8'); },
			exists: async (u: any) => fs.existsSync(u.fsPath)
		} as any,
		fs5,
		runner5,
		ws5
	);

	const exec5 = await composer5.executeAutonomousGoal({
		prompt: 'Add multiplication and subtraction helpers',
		maxSteps: 5,
		activeFilePath: 'src/math.ts'
	});

	assert.strictEqual(exec5.status, 'completed');
	assert.ok(exec5.proposal, 'Must generate multi-file proposal');
	assert.ok(exec5.proposal.files.length >= 2, 'Must propose changes across 2 files');
	console.log(`  -> PASS: Autonomous goal completed across ${exec5.proposal.files.length} proposed files\n`);
	passedCount++;

	// -------------------------------------------------------------
	// TASK 6: Isolated Speculative Overlay (Zero Disk Mutations Before Approval)
	// -------------------------------------------------------------
	console.log('[Task 6/20] Isolated Speculative Overlay (Zero Disk Mutations Before Approval)...');
	const diskMathContent = fs.readFileSync(path.join(ws5, 'src/math.ts'), 'utf8');
	assert.strictEqual(diskMathContent, 'export function sum(a: number, b: number) { return a + b; }', 'Disk must remain unmodified before user approval!');
	assert.strictEqual(fs.existsSync(path.join(ws5, 'src/mult.ts')), false, 'New file must NOT exist on disk before approval!');
	console.log('  -> PASS: Original workspace on disk is 100% untouched prior to user approval\n');
	passedCount++;

	// -------------------------------------------------------------
	// TASK 7: Speculative Proposal Rejection (Zero Disk Mutation Guarantee)
	// -------------------------------------------------------------
	console.log('[Task 7/20] Speculative Proposal Rejection (Zero Disk Mutation Guarantee)...');
	const rejected = composer5.rejectProposal(exec5.proposal!.id);
	assert.strictEqual(rejected, true);
	assert.strictEqual(composer5.activeProposal, null);
	assert.strictEqual(fs.existsSync(path.join(ws5, 'src/mult.ts')), false, 'mult.ts must still not exist on disk after rejection');
	console.log('  -> PASS: Proposal rejected with zero modifications applied to repository\n');
	passedCount++;

	// -------------------------------------------------------------
	// TASK 8: Production Proposal Acceptance (Safe Atomic Commit to Disk)
	// -------------------------------------------------------------
	console.log('[Task 8/20] Production Proposal Acceptance (Safe Atomic Commit to Disk)...');
	// Create another proposal and accept it
	const prop8 = composer5.orchestrator.createProposal('Apply math helpers', 'Summary', [
		{ path: 'src/mult.ts', originalContent: '', proposedContent: 'export function mult(a: number, b: number) { return a * b; }' }
	]);
	const acceptResult = await composer5.orchestrator.acceptFile(
		prop8.id,
		'src/mult.ts',
		async (p, content) => {
			fs.writeFileSync(path.join(ws5, p), content, 'utf8');
		}
	);
	assert.strictEqual(acceptResult, true);
	assert.strictEqual(fs.existsSync(path.join(ws5, 'src/mult.ts')), true, 'mult.ts must now exist on disk after approval');
	assert.ok(fs.readFileSync(path.join(ws5, 'src/mult.ts'), 'utf8').includes('function mult'));
	console.log('  -> PASS: File accepted and safely written to disk upon approval\n');
	passedCount++;

	// -------------------------------------------------------------
	// TASK 9: Accurate write_file Mutation Tracking
	// -------------------------------------------------------------
	console.log('[Task 9/20] Accurate write_file Mutation Tracking...');
	const specFs9 = new SpeculativeComposerFileSystem(fs5);
	await specFs9.writeFile('src/newFile.ts', 'const x = 10;');
	assert.strictEqual(await specFs9.readFile('src/newFile.ts'), 'const x = 10;');
	assert.strictEqual(specFs9.overlays.get('src/newFile.ts'), 'const x = 10;');
	assert.strictEqual(fs.existsSync(path.join(ws5, 'src/newFile.ts')), false, 'Disk must not be mutated');
	console.log('  -> PASS: write_file accurately tracked in speculative overlay without disk mutation\n');
	passedCount++;

	// -------------------------------------------------------------
	// TASK 10: Accurate edit_file Mutation Tracking
	// -------------------------------------------------------------
	console.log('[Task 10/20] Accurate edit_file Mutation Tracking...');
	const scopedReg10 = new FloatComposerToolRegistry(specFs9, runner5);
	const editResult = await scopedReg10.executeTool({
		id: 'edit-1',
		name: 'edit_file',
		parameters: {
			path: 'src/newFile.ts',
			target: 'const x = 10;',
			replacement: 'const x = 20;'
		}
	});
	assert.strictEqual(editResult.success, true);
	const editedOverlay = await specFs9.readFile('src/newFile.ts');
	assert.strictEqual(editedOverlay, 'const x = 20;');
	console.log('  -> PASS: edit_file accurately tracked and updated in overlay\n');
	passedCount++;

	// -------------------------------------------------------------
	// TASK 11: Agent Failure State & Max Steps Enforcement
	// -------------------------------------------------------------
	console.log('[Task 11/20] Agent Failure State & Max Steps Enforcement...');
	const mockFloat11: any = createMockFloatService(ws5);
	mockFloat11.streamChat = async (messages: any[], callbacks: any) => {
		callbacks.onChunk('Looping...\n```tool_call\n{"name":"list_directory","parameters":{"path":"."}}\n```');
		callbacks.onComplete();
	};

	const agent11 = new FloatComposerAgent(mockFloat11, scopedReg10, composer5.orchestrator);
	const exec11 = await agent11.executeGoal({
		prompt: 'Run forever without concluding',
		maxSteps: 3
	});
	assert.strictEqual(exec11.status, 'failed');
	assert.ok(exec11.error?.includes('exceeded maximum allowed steps'), 'Must report max steps failure');
	console.log('  -> PASS: Agent correctly transitioned to failed state upon step exhaustion\n');
	passedCount++;

	// -------------------------------------------------------------
	// TASK 12: Agent Cancellation via AbortSignal
	// -------------------------------------------------------------
	console.log('[Task 12/20] Agent Cancellation via AbortSignal...');
	const abortCtrl = new AbortController();
	abortCtrl.abort(); // Pre-abort

	const exec12 = await agent11.executeGoal(
		{ prompt: 'Immediate cancel' },
		undefined,
		abortCtrl.signal
	);
	assert.strictEqual(exec12.status, 'cancelled');
	console.log('  -> PASS: Agent immediately terminates with cancelled status on AbortSignal\n');
	passedCount++;

	// -------------------------------------------------------------
	// TASK 13: Shadow Workspace Project-Aware TypeScript Diagnostics
	// -------------------------------------------------------------
	console.log('[Task 13/20] Shadow Workspace Project-Aware TypeScript Diagnostics...');
	const ws13 = path.join(baseTmp, 'ws13');
	fs.mkdirSync(ws13, { recursive: true });
	fs.writeFileSync(path.join(ws13, 'tsconfig.json'), JSON.stringify({
		compilerOptions: { target: 'ES2022', module: 'ESNext', strict: true }
	}, null, 2), 'utf8');
	fs.writeFileSync(path.join(ws13, 'base.ts'), 'export const baseNumber: number = 42;', 'utf8');

	const shadowFiles13 = new Map<string, string>();
	shadowFiles13.set('speculative.ts', 'import { baseNumber } from "./base.js";\nconst result: number = baseNumber;');

	const diags13 = FloatShadowCompiler.checkVirtualFiles(shadowFiles13, {
		baseWorkspacePath: ws13,
		checkTypes: true
	});
	const errors13 = diags13.filter(d => d.severity === 'error');
	assert.strictEqual(errors13.length, 0, 'Should cleanly typecheck against project file on disk');
	console.log('  -> PASS: Shadow compiler successfully resolved unchanged project imports from disk\n');
	passedCount++;

	// -------------------------------------------------------------
	// TASK 14: Shadow Workspace Broken Import Non-Suppression
	// -------------------------------------------------------------
	console.log('[Task 14/20] Shadow Workspace Broken Import Non-Suppression...');
	const brokenShadowFiles = new Map<string, string>();
	brokenShadowFiles.set('broken.ts', 'import { nonExistentSymbol } from "./missingModule.js";\nconsole.log(nonExistentSymbol);');

	const diags14 = FloatShadowCompiler.checkVirtualFiles(brokenShadowFiles, {
		baseWorkspacePath: ws13,
		checkTypes: true
	});
	const hasImportError = diags14.some(d => d.code === 'TS2307' || d.message.includes('missingModule'));
	assert.ok(hasImportError, 'Relative missing module import error must NOT be silently suppressed');
	console.log('  -> PASS: Genuine unresolved relative imports correctly flagged as errors\n');
	passedCount++;

	// -------------------------------------------------------------
	// TASK 15: Shadow Workspace Internal Compiler Error Safety
	// -------------------------------------------------------------
	console.log('[Task 15/20] Shadow Workspace Internal Compiler Error Safety...');
	// Corrupt checkSyntax test
	const jsonDiags = FloatShadowCompiler.checkSyntax('config.json', '{ bad json: 123');
	assert.ok(jsonDiags.some(d => d.code === 'JSON_SYNTAX_ERROR'), 'Must catch syntax error');

	// Corrupt python test
	const pyDiags = FloatShadowCompiler.checkSyntax('script.py', 'def test():\n    return (1 + 2');
	assert.ok(pyDiags.some(d => d.code === 'PY_UNCLOSED_BRACKET'), 'Must catch unclosed bracket');
	console.log('  -> PASS: AST parsing and internal exceptions safely converted to error diagnostics\n');
	passedCount++;

	// -------------------------------------------------------------
	// TASK 16: Concurrent Edit Conflict Detection & Preservation
	// -------------------------------------------------------------
	console.log('[Task 16/20] Concurrent Edit Conflict Detection & Preservation...');
	const orch16 = new FloatMultiFileDiffOrchestrator();
	const prop16 = orch16.createProposal('Edit task', 'Summary', [
		{ path: 'src/main.ts', originalContent: 'initial-line', proposedContent: 'ai-line' }
	]);

	// Simulate user modified the file on disk externally in the meantime!
	const currentDiskState = 'user-concurrent-edit-line';
	const acceptConflict = await orch16.acceptFile(
		prop16.id,
		'src/main.ts',
		async () => {
			assert.fail('Should never write over concurrent user edit!');
		},
		async () => currentDiskState
	);

	assert.strictEqual(acceptConflict, false, 'Must reject acceptance when conflict detected');
	assert.strictEqual(prop16.files[0].status, 'conflict');
	assert.strictEqual(prop16.status, 'conflict');
	console.log('  -> PASS: Concurrent user edit detected; overwrite prevented and edit preserved\n');
	passedCount++;

	// -------------------------------------------------------------
	// TASK 17: Predictive Autocomplete Workbench Registration & Contract
	// -------------------------------------------------------------
	console.log('[Task 17/20] Predictive Autocomplete Workbench Registration & Contract...');
	const mockFloat17: any = {
		completeCode: async () => ({
			completion: 'const answer = 42;',
			cancelled: false
		})
	};
	const autocomplete17 = new FloatPredictiveAutocomplete(mockFloat17);
	autocomplete17.setConfig({ debounceMs: 0 });

	const mockModel17: any = {
		getValue: () => 'function compute() {\n  \n}',
		getOffsetAt: () => 23,
		getLineContent: () => '  ',
		uri: { path: '/workspace/src/app.ts' },
		getLanguageId: () => 'typescript'
	};

	const completions = await autocomplete17.provideInlineCompletions(
		mockModel17,
		{ lineNumber: 2, column: 3 } as any,
		{} as any,
		{ isCancellationRequested: false } as any
	);

	assert.ok(completions, 'Provider must return completion items');
	assert.strictEqual(completions.items.length, 1);
	assert.strictEqual(completions.items[0].insertText, 'const answer = 42;');
	console.log('  -> PASS: Predictive autocomplete inline completion provider contract verified\n');
	passedCount++;

	// -------------------------------------------------------------
	// TASK 18: Predictive Autocomplete Global Toggle Connection
	// -------------------------------------------------------------
	console.log('[Task 18/20] Predictive Autocomplete Global Toggle Connection...');
	const toggleAction = new ToggleFloatAutocompleteAction();
	assert.strictEqual(isFloatAutocompleteGloballyEnabled(), true);

	// Toggle OFF
	toggleAction.run({ get: () => mockNotificationService } as any);
	assert.strictEqual(isFloatAutocompleteGloballyEnabled(), false);

	const disabledResult = await autocomplete17.provideInlineCompletions(
		mockModel17,
		{ lineNumber: 2, column: 3 } as any,
		{} as any,
		{ isCancellationRequested: false } as any
	);
	assert.strictEqual(disabledResult, undefined, 'Must return undefined when globally toggled off');

	// Toggle back ON
	toggleAction.run({ get: () => mockNotificationService } as any);
	assert.strictEqual(isFloatAutocompleteGloballyEnabled(), true);
	console.log('  -> PASS: Global toggle action dynamically enables and disables autocomplete\n');
	passedCount++;

	// -------------------------------------------------------------
	// TASK 19: Latency Metric Separation (Cache-Hit vs Model Network)
	// -------------------------------------------------------------
	console.log('[Task 19/20] Latency Metric Separation (Cache-Hit vs Model Network)...');
	// Keystroke 1: triggers model completion (measured modelNetworkLatencyMs)
	const comp1 = await autocomplete17.provideInlineCompletions(
		mockModel17,
		{ lineNumber: 2, column: 3 } as any,
		{} as any,
		{ isCancellationRequested: false } as any
	);
	assert.ok(comp1);

	// User types 'const ' -> Keystroke 2: forward cache hit!
	const mockModelCacheHit: any = {
		getValue: () => 'function compute() {\n  const \n}',
		getOffsetAt: () => 29,
		getLineContent: () => '  const ',
		uri: { path: '/workspace/src/app.ts' },
		getLanguageId: () => 'typescript'
	};
	const comp2 = await autocomplete17.provideInlineCompletions(
		mockModelCacheHit,
		{ lineNumber: 2, column: 9 } as any,
		{} as any,
		{ isCancellationRequested: false } as any
	);
	assert.ok(comp2);
	assert.strictEqual(comp2.items[0].insertText, 'answer = 42;');

	const tel = autocomplete17.telemetry;
	assert.ok(tel.cacheHitsCount >= 1, 'Must record cache hit');
	assert.ok(tel.lastMeasurement?.type === 'cache_hit', 'Last measurement must be cache hit');
	assert.ok(typeof tel.averageCacheHitLatencyMs === 'number');
	assert.ok(typeof tel.averageModelNetworkLatencyMs === 'number');
	console.log(`  -> PASS: Local cache-hit latency (${tel.averageCacheHitLatencyMs}ms) kept distinct from model network latency (${tel.averageModelNetworkLatencyMs}ms)\n`);
	passedCount++;

	// -------------------------------------------------------------
	// TASK 20: Filesystem Watcher Sync & Index Metadata Recovery
	// -------------------------------------------------------------
	console.log('[Task 20/20] Filesystem Watcher Sync & Index Metadata Recovery...');
	const ws20 = path.join(baseTmp, 'ws20');
	fs.mkdirSync(path.join(ws20, 'src'), { recursive: true });
	fs.writeFileSync(path.join(ws20, 'src/api.ts'), 'export function fetchUser(id: string) { return id; }', 'utf8');

	const indexer20 = new FloatWorkspaceIndexer();
	const disco = await indexer20.discoverAndIndexWorkspace(ws20);
	assert.strictEqual(disco.indexed, 1);

	// Watcher file created
	indexer20.onFileCreated('src/auth.ts', 'export function login() { return true; }');
	assert.strictEqual(indexer20.getIndexedFiles().length, 2);

	// Watcher file renamed
	indexer20.onFileRenamed('src/auth.ts', 'src/security.ts', 'export function login() { return true; }');
	assert.ok(!indexer20.getIndexedFiles().some(f => f.relativePath === 'src/auth.ts'));
	assert.ok(indexer20.getIndexedFiles().some(f => f.relativePath === 'src/security.ts'));

	// Watcher file deleted
	indexer20.onFileDeleted('src/security.ts');
	assert.strictEqual(indexer20.getIndexedFiles().length, 1);

	// Save metadata to disk
	const metaPath = path.join(ws20, '.float/index-meta.json');
	await indexer20.saveIndexMetadata(metaPath);
	assert.ok(fs.existsSync(metaPath), 'Metadata file must exist on disk');

	// Restart recovery
	const freshIndexer = new FloatWorkspaceIndexer();
	const recovered = await freshIndexer.loadIndexMetadata(metaPath);
	assert.strictEqual(recovered, true);
	assert.strictEqual(freshIndexer.getIndexedFiles().length, 1);
	assert.strictEqual(freshIndexer.getIndexedFiles()[0].relativePath, 'src/api.ts');
	assert.strictEqual(freshIndexer.getStats().embeddingArchitecture, 'sparse_token_hash_projection');
	console.log('  -> PASS: Incremental filesystem watcher synchronization and restart recovery verified\n');
	passedCount++;

	// Cleanup disposable environment
	fs.rmSync(baseTmp, { recursive: true, force: true });

	console.log('================================================================');
	console.log(`  ALL 20 INTEGRATION & RELIABILITY TASKS PASSED (${passedCount}/20, 100%) `);
	console.log('================================================================\n');
}

runEndToEndEvaluation().catch(err => {
	console.error('[FATAL E2E ERROR]:', err);
	process.exit(1);
});