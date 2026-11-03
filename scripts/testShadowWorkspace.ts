/**
 * FLOAT STUDIO: Step 1 Shadow Workspace & Speculative Compilation Test Suite
 *
 * Verifies:
 * 1. Shadow session lifecycle, in-memory virtual file layering & isolation from physical disk
 * 2. In-memory TypeScript AST & semantic compiler diagnostics (TS2304, TS2322, syntax errors)
 * 3. Cross-file speculative module and type resolution in virtual workspace
 * 4. Autonomous Composer Agent self-healing loop under speculative compiler error feedback
 * 5. Inline diff speculative validation and diagnostic hunk metadata
 */

import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { FloatShadowWorkspaceService } from '../desktop/src/vs/workbench/contrib/float/common/shadow/floatShadowWorkspaceService.ts';
import { FloatShadowCompiler } from '../desktop/src/vs/workbench/contrib/float/common/shadow/floatShadowCompiler.ts';
import { FloatComposerToolRegistry } from '../desktop/src/vs/workbench/contrib/float/common/composer/floatComposerTools.ts';
import { FloatMultiFileDiffOrchestrator } from '../desktop/src/vs/workbench/contrib/float/common/composer/floatMultiFileDiffOrchestrator.ts';
import { FloatComposerAgent, IComposerAgentStep } from '../desktop/src/vs/workbench/contrib/float/common/composer/floatComposerAgent.ts';
import { FloatCheckpointService } from '../desktop/src/vs/workbench/contrib/float/common/checkpoints/floatCheckpointService.ts';
import { FloatProposalSession } from '../desktop/src/vs/workbench/contrib/float/common/proposals/floatProposal.ts';

const disposableDir = path.resolve(process.cwd(), 'tmp', `step1-shadow-${Date.now()}`);
fs.mkdirSync(disposableDir, { recursive: true });

async function runSuite(): Promise<void> {
	console.log('================================================================');
	console.log('  FLOAT STUDIO: STEP 1 SHADOW WORKSPACE SPECULATIVE COMPILATION  ');
	console.log('================================================================');
	console.log(`[WORKSPACE] Disposable test workspace: ${disposableDir}\n`);

	const shadowService = FloatShadowWorkspaceService.getInstance();

	// -------------------------------------------------------------
	// Suite 1: Session Lifecycle & Virtual File Isolation
	// -------------------------------------------------------------
	console.log('--- Suite 1: Shadow Session Lifecycle & Isolation ---');
	{
		const session = shadowService.createSession({
			baseWorkspacePath: disposableDir,
			baseFiles: {
				'src/app.ts': 'export const version = "1.0.0";',
				'src/config.json': '{"name": "float", "port": 3000}'
			}
		});

		assert.strictEqual(shadowService.getShadowFileContent(session.id, 'src/app.ts'), 'export const version = "1.0.0";');

		// Apply speculative overlay
		shadowService.setFileOverlay(session.id, 'src/app.ts', 'export const version = "2.0.0";');
		assert.strictEqual(shadowService.getShadowFileContent(session.id, 'src/app.ts'), 'export const version = "2.0.0";');

		// Verify physical disk was never touched
		assert.strictEqual(fs.existsSync(path.join(disposableDir, 'src', 'app.ts')), false, 'Physical disk must remain untouched');

		// Remove overlay, reverts to base
		shadowService.removeFileOverlay(session.id, 'src/app.ts');
		assert.strictEqual(shadowService.getShadowFileContent(session.id, 'src/app.ts'), 'export const version = "1.0.0";');

		// Clean up session
		shadowService.disposeSession(session.id);
		assert.strictEqual(shadowService.getSession(session.id), undefined);
		console.log('  -> PASS: Virtual file layering, disk isolation, and lifecycle verified');
	}

	// -------------------------------------------------------------
	// Suite 2: Speculative TypeScript AST & Type Diagnostics
	// -------------------------------------------------------------
	console.log('\n--- Suite 2: Speculative TypeScript AST & Type Diagnostics ---');
	{
		// 1. Syntax Error
		const syntaxBrokenCode = 'const x = ;';
		const syntaxDiags = FloatShadowCompiler.checkSyntax('src/broken.ts', syntaxBrokenCode);
		assert(syntaxDiags.length > 0, 'Expected syntax error for broken token');
		assert.strictEqual(syntaxDiags[0].severity, 'error');
		assert(syntaxDiags[0].code.toString().startsWith('TS'), 'Expected TS error code');
		console.log('  -> PASS: In-memory syntax error caught with line/column diagnostic');

		// 2. Semantic Type Mismatch (TS2322)
		const typeBrokenCode = `
			const port: number = "not_a_number";
		`;
		const virtualFiles = new Map<string, string>();
		virtualFiles.set('src/typeError.ts', typeBrokenCode);
		const typeDiags = FloatShadowCompiler.checkVirtualFiles(virtualFiles);
		const mismatch = typeDiags.find(d => d.code === 'TS2322');
		assert(mismatch !== undefined, 'Expected TS2322 type mismatch diagnostic');
		assert.strictEqual(mismatch.severity, 'error');
		console.log('  -> PASS: Semantic typecheck caught TS2322 Type mismatch in virtual buffer');

		// 3. Missing Identifier (TS2304)
		const missingVarCode = `
			function run() {
				return nonExistentVariable + 10;
			}
		`;
		virtualFiles.clear();
		virtualFiles.set('src/missingVar.ts', missingVarCode);
		const missingDiags = FloatShadowCompiler.checkVirtualFiles(virtualFiles);
		const missing = missingDiags.find(d => d.code === 'TS2304');
		assert(missing !== undefined, 'Expected TS2304 Cannot find name diagnostic');
		console.log('  -> PASS: Semantic typecheck caught TS2304 Unresolved symbol in virtual buffer');

		// 4. JSON Syntax Error
		const jsonDiags = FloatShadowCompiler.checkSyntax('config.json', '{"invalid": json');
		assert(jsonDiags.length > 0);
		assert.strictEqual(jsonDiags[0].code, 'JSON_SYNTAX_ERROR');
		console.log('  -> PASS: JSON syntax parser caught malformed JSON');
	}

	// -------------------------------------------------------------
	// Suite 3: Cross-File Speculative Resolution
	// -------------------------------------------------------------
	console.log('\n--- Suite 3: Cross-File Speculative Resolution ---');
	{
		const session = shadowService.createSession({
			baseFiles: {
				'src/math.ts': 'export function addNumbers(a: number, b: number): number { return a + b; }'
			}
		});

		// Valid cross-file consumer
		shadowService.setFileOverlay(
			session.id,
			'src/consumer.ts',
			'import { addNumbers } from "./math";\nexport const res: number = addNumbers(5, 10);'
		);

		const validRes = await shadowService.validateSession(session.id);
		assert.strictEqual(validRes.status, 'clean', `Expected clean status, got: ${JSON.stringify(validRes.diagnostics)}`);
		assert.strictEqual(validRes.errorCount, 0);
		console.log('  -> PASS: Cross-file import & invocation cleanly verified across virtual files');

		// Invalid cross-file consumer (type mismatch on imported return value)
		shadowService.setFileOverlay(
			session.id,
			'src/consumer.ts',
			'import { addNumbers } from "./math";\nexport const res: string = addNumbers(5, 10);'
		);

		const invalidRes = await shadowService.validateSession(session.id);
		assert.strictEqual(invalidRes.status, 'has_errors');
		assert(invalidRes.diagnostics.some(d => d.code === 'TS2322'), 'Expected TS2322 cross-file return type mismatch');
		console.log('  -> PASS: Cross-file type inconsistency correctly flagged in shadow workspace');

		shadowService.disposeSession(session.id);
	}

	// -------------------------------------------------------------
	// Suite 4: Autonomous Composer Agent Self-Healing Gate
	// -------------------------------------------------------------
	console.log('\n--- Suite 4: Autonomous Composer Agent Self-Healing Gate ---');
	{
		const initialCode = 'export const initial = 1;';
		fs.writeFileSync(path.join(disposableDir, 'calculator.ts'), initialCode);

		const fsAdapter = {
			readFile: async (p: string) => fs.readFileSync(path.resolve(disposableDir, p), 'utf8'),
			writeFile: async (p: string, c: string) => {
				const full = path.resolve(disposableDir, p);
				fs.mkdirSync(path.dirname(full), { recursive: true });
				fs.writeFileSync(full, c, 'utf8');
			},
			fileExists: async (p: string) => fs.existsSync(path.resolve(disposableDir, p)),
			listDirectory: async () => fs.readdirSync(disposableDir),
			findFiles: async () => ['calculator.ts']
		};

		const runnerAdapter = {
			runCommand: async (_cmd: string) => ({ exitCode: 0, stdout: 'ok', stderr: '' })
		};

		const toolRegistry = new FloatComposerToolRegistry(fsAdapter, runnerAdapter, disposableDir);
		const orchestrator = new FloatMultiFileDiffOrchestrator();
		const sharedCheckpointService = new FloatCheckpointService();

		let mockTurn = 0;
		const mockFloatService: any = {
			getCheckpointService: () => sharedCheckpointService,
			getProposalSession: () => new FloatProposalSession(),
			getActiveModel: () => ({ id: 'gpt-6-astra', name: 'GPT-6 Astra' }),
			streamChat: async (messages: any[], callbacks: any) => {
				mockTurn++;
				if (mockTurn === 1) {
					// Turn 1: Model proposes code with a deliberate type error (TS2322)
					callbacks.onChunk('I will update the calculator with a new multiplier.\n');
					callbacks.onChunk('```ts path=calculator.ts\nexport const multiplier: number = "INVALID_STRING";\n```');
					callbacks.onComplete();
				} else if (mockTurn === 2) {
					// Turn 2: Model receives Shadow Workspace error and self-corrects!
					const lastMsg = messages[messages.length - 1].content;
					assert(lastMsg.includes('SHADOW WORKSPACE SPECULATIVE COMPILATION REPORT'), 'Model must receive shadow diagnostic report');
					callbacks.onChunk('Fixing the type error in multiplier as reported by the compiler.\n');
					callbacks.onChunk('```ts path=calculator.ts\nexport const multiplier: number = 42;\n```');
					callbacks.onComplete();
				}
			}
		};

		const agent = new FloatComposerAgent(mockFloatService, toolRegistry, orchestrator, shadowService);
		const execution = await agent.executeGoal({
			prompt: 'Add multiplier constant',
			activeFilePath: 'calculator.ts',
			enableShadowValidation: true,
			maxSpeculativeRepairs: 2
		});

		assert.strictEqual(execution.status, 'completed');
		assert(execution.proposal !== undefined, 'Proposal must be generated');
		assert.strictEqual(execution.proposal.validationStatus, 'clean', 'Final proposal must be clean after self-correction');
		assert.strictEqual(execution.proposal.speculativeDiagnostics?.length, 0);

		// Verify the step history records the shadow workspace gate intervention
		const gateStep = execution.steps.find(s => s.thought.includes('[Shadow Workspace Gate]'));
		assert(gateStep !== undefined, 'Agent steps must record Shadow Workspace Gate intervention');
		console.log('  -> PASS: Autonomous agent detected compiler error, triggered self-repair, and verified clean proposal');
	}

	// -------------------------------------------------------------
	// Suite 5: Inline Diff Speculative Validation & Diagnostic Badging
	// -------------------------------------------------------------
	console.log('\n--- Suite 5: Inline Diff Speculative Validation & Badging ---');
	{
		const validSnippet = 'export function greet(name: string): string { return `Hello ${name}`; }';
		const validVal = await shadowService.validateSnippet('src/greet.ts', validSnippet);
		assert.strictEqual(validVal.status, 'clean');
		assert.strictEqual(validVal.errorCount, 0);

		const brokenSnippet = 'export function greet(name: string): string { return 12345; }';
		const brokenVal = await shadowService.validateSnippet('src/greet.ts', brokenSnippet);
		assert.strictEqual(brokenVal.status, 'has_errors');
		assert(brokenVal.diagnostics.some(d => d.code === 'TS2322'), 'Expected TS2322 return type error');
		console.log('  -> PASS: Inline diff snippet validation correctly distinguishes clean vs broken snippets');
	}

	// Clean up disposable directory
	try {
		fs.rmSync(disposableDir, { recursive: true, force: true });
	} catch {}

	console.log('\n================================================================');
	console.log('  ALL STEP 1 SHADOW WORKSPACE SUITES PASSED (100%)              ');
	console.log('================================================================');
}

runSuite().catch(err => {
	console.error('\nFAILED Suite:', err);
	process.exit(1);
});
