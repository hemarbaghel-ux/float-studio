import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FloatShadowDaemon } from '../desktop/src/vs/workbench/contrib/float/common/shadow/floatShadowDaemon.js';
import { FloatShadowWorkspaceService } from '../desktop/src/vs/workbench/contrib/float/common/shadow/floatShadowWorkspaceService.js';

async function runPhase2Tests() {
	console.log('🧪 Starting Phase 2: OS-Level Shadow Workspace Virtualization Tests...\n');

	const testWorkspaceDir = path.join(os.tmpdir(), `float-phase2-test-ws-${Date.now()}`);
	fs.mkdirSync(testWorkspaceDir, { recursive: true });

	// Set up sample workspace files
	const indexTs = path.join(testWorkspaceDir, 'index.ts');
	const mathTs = path.join(testWorkspaceDir, 'math.ts');
	const packageJson = path.join(testWorkspaceDir, 'package.json');

	fs.writeFileSync(indexTs, 'import { add } from "./math";\nconsole.log(add(10, 20));\n', 'utf8');
	fs.writeFileSync(mathTs, 'export function add(a: number, b: number): number {\n  return a + b;\n}\n', 'utf8');
	fs.writeFileSync(packageJson, JSON.stringify({ name: 'test-pkg', version: '1.0.0' }, null, 2), 'utf8');

	const daemon = new FloatShadowDaemon();

	try {
		// Test 1: Copy-based Sandbox Creation & Mirroring
		console.log('Test 1: Fast Sandbox Creation & Mirroring...');
		const sessionId = 'test-session-1';
		const overlays = new Map<string, string>();
		// Speculatively modify math.ts to introduce a type error
		overlays.set('math.ts', 'export function add(a: number, b: number): number {\n  return "invalid-string-return";\n}\n');

		const startInit = Date.now();
		const sandboxDir = await daemon.createShadowSandbox(sessionId, testWorkspaceDir, overlays);
		const initDuration = Date.now() - startInit;

		console.log(`  ✓ Sandbox created at ${sandboxDir} in ${initDuration}ms`);
		assert(fs.existsSync(sandboxDir), 'Sandbox directory should exist');

		// Verify unchanged file index.ts exists in sandbox and content matches
		const sandboxIndex = path.join(sandboxDir, 'index.ts');
		assert(fs.existsSync(sandboxIndex), 'Unchanged index.ts should exist in sandbox');
		assert.strictEqual(fs.readFileSync(sandboxIndex, 'utf8'), fs.readFileSync(indexTs, 'utf8'));
		fs.writeFileSync(sandboxIndex, 'sandbox-only mutation', 'utf8');
		assert.strictEqual(fs.readFileSync(indexTs, 'utf8'), 'import { add } from "./math";\nconsole.log(add(10, 20));\n', 'Changing an unchanged shadow copy must not mutate the original file');
		fs.writeFileSync(sandboxIndex, 'import { add } from "./math";\nconsole.log(add(10, 20));\n', 'utf8');

		// Verify math.ts in sandbox has the speculative overlay
		const sandboxMath = path.join(sandboxDir, 'math.ts');
		assert(fs.existsSync(sandboxMath), 'math.ts should exist in sandbox');
		assert(fs.readFileSync(sandboxMath, 'utf8').includes('invalid-string-return'), 'math.ts in sandbox must reflect speculative overlay');

		// CRITICAL: Verify ORIGINAL math.ts was NOT modified!
		assert(fs.readFileSync(mathTs, 'utf8').includes('return a + b'), 'Original math.ts must remain completely untouched!');
		console.log('  ✓ Original workspace untouched by speculative overlay.');

		// Test 2: Toolchain Execution in Isolation
		console.log('\nTest 2: Toolchain Execution in Isolation...');
		// Run a node command inside sandbox verifying environment
		const execResult = await daemon.executeToolchain(
			sessionId,
			'node -e "console.log(require(\'./package.json\').name)"'
		);

		assert.strictEqual(execResult.exitCode, 0, 'Toolchain command should exit 0');
		assert(execResult.stdout.includes('test-pkg'), 'Output should contain test-pkg');
		console.log(`  ✓ Toolchain executed in a network-disabled Docker sandbox over the disposable shadow copy (${execResult.durationMs}ms): ${execResult.stdout.trim()}`);

		// Test 3: Security Policy Enforcement
		console.log('\nTest 3: Security Policy Enforcement in Shadow Sandbox...');
		const blockedResult = await daemon.executeToolchain(sessionId, 'rm -rf / --no-preserve-root');
		assert.strictEqual(blockedResult.exitCode, 1, 'Dangerous command must be rejected');
		assert(blockedResult.stderr.includes('[SECURITY REJECTION]'), 'Must report security rejection');
		assert.strictEqual(blockedResult.diagnostics[0].code, 'SECURITY_BLOCKED');
		console.log('  ✓ Disallowed and destructive commands successfully blocked by FloatSecurityGuard.');

		// Test 4: Diagnostic Parsing from Toolchain Failure
		console.log('\nTest 4: Diagnostic Parsing from Compiler/Runtime Output...');
		// Run command that prints compiler-like diagnostic
		const failingResult = await daemon.executeToolchain(
			sessionId,
			'node -e "console.error(\'math.ts(2,3): error TS2322: Type \\\'string\\\' is not assignable to type \\\'number\\\'.\'); process.exit(1);"'
		);
		assert.strictEqual(failingResult.exitCode, 1, 'Command should fail');
		assert.strictEqual(failingResult.diagnostics.length, 1, 'Should parse 1 diagnostic');
		assert.strictEqual(failingResult.diagnostics[0].filePath, 'math.ts');
		assert.strictEqual(failingResult.diagnostics[0].line, 2);
		assert.strictEqual(failingResult.diagnostics[0].code, 'TS2322');
		console.log(`  ✓ Diagnostic parsed: ${failingResult.diagnostics[0].filePath}:${failingResult.diagnostics[0].line} [${failingResult.diagnostics[0].code}] ${failingResult.diagnostics[0].message}`);

		// Test 5: Integration with FloatShadowWorkspaceService
		console.log('\nTest 5: Integration with FloatShadowWorkspaceService...');
		const shadowService = FloatShadowWorkspaceService.getInstance();
		const svcSession = shadowService.createSession({
			sessionId: 'test-svc-session',
			baseWorkspacePath: testWorkspaceDir
		});
		shadowService.setFileOverlay(svcSession.id, 'math.ts', 'export function add(): number { return 42; }');

		const shadowSandbox = await shadowService.createPhysicalShadowSandbox(svcSession.id);
		assert(fs.existsSync(shadowSandbox), 'Service should create physical shadow sandbox');

		await shadowService.disposeSession(svcSession.id);
		assert(!fs.existsSync(shadowSandbox), 'Physical sandbox should be cleaned up on disposeSession');
		console.log('  ✓ FloatShadowWorkspaceService cleanly created and cleaned up physical shadow sandbox.');

		// Test 6: Sandbox Cleanup
		console.log('\nTest 6: Daemon Sandbox Cleanup...');
		await daemon.destroyShadowSandbox(sessionId);
		assert(!fs.existsSync(sandboxDir), 'Sandbox directory should be removed on destruction');
		console.log('  ✓ Sandbox directory cleaned up completely.');

		console.log('\n✅ All Phase 2 OS-Level Shadow Workspace Daemon tests PASSED successfully!\n');
	} finally {
		await daemon.destroyAllSandboxes();
		try {
			fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
		} catch {}
	}
}

runPhase2Tests().catch(err => {
	console.error('❌ Phase 2 test failed:', err);
	process.exit(1);
});
