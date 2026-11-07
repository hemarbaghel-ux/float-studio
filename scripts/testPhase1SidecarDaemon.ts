/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { FloatDaemonServer } from '../daemon/src/server/floatDaemonServer.js';
import { FloatDaemonClient } from '../desktop/src/vs/workbench/contrib/float/common/daemon/floatDaemonClient.js';

console.log('🧪 Starting Phase 1: High-Performance Sidecar Daemon & IPC Subsystem Tests...\n');

async function runTests() {
	const isWindows = process.platform === 'win32';
	const testPipeName = isWindows
		? `\\\\.\\pipe\\float-test-daemon-${Date.now()}`
		: path.join(os.tmpdir(), `float-test-daemon-${Date.now()}.sock`);

	const testWorkspace = path.join(os.tmpdir(), `float-daemon-ws-${Date.now()}`);
	fs.mkdirSync(testWorkspace, { recursive: true });
	fs.writeFileSync(path.join(testWorkspace, 'package.json'), JSON.stringify({ name: 'daemon-test' }), 'utf8');

	// This legacy integration fixture explicitly opts in to the old shadow execution
	// handlers. The production workbench runtime always passes allowSandboxExecution:false.
	const server = new FloatDaemonServer({ pipeName: testPipeName, allowSandboxExecution: true });
	const client = new FloatDaemonClient({ pipeName: testPipeName });

	try {
		// =========================================================================
		// Test 1: Daemon Server Startup & Named Pipe Binding
		// =========================================================================
		console.log('Test 1: Daemon Server Startup & Named Pipe Binding...');
		await server.start();
		console.log(`  ✓ FloatDaemonServer listening on ${testPipeName}`);

		// =========================================================================
		// Test 2: Daemon Client Connection & Ping Latency
		// =========================================================================
		console.log('\nTest 2: Daemon Client Connection & Ping Latency...');
		await client.connect();
		assert.strictEqual(client.isConnected(), true, 'Client must be connected');

		const t0 = performance.now();
		const pingRes = await client.ping();
		const latencyMs = performance.now() - t0;

		assert.strictEqual(pingRes.status, 'ok');
		assert.strictEqual(pingRes.version, '1.0.0-daemon');
		assert.strictEqual(pingRes.activeClients, 1);
		console.log(`  ✓ Ping response received in ${latencyMs.toFixed(2)}ms (PID ${pingRes.pid}, clients: ${pingRes.activeClients}).`);

		// =========================================================================
		// Test 3: Shadow Sandbox Virtualization over Daemon IPC
		// =========================================================================
		console.log('\nTest 3: Shadow Sandbox Virtualization over Daemon IPC...');
		const sandboxRes = await client.createShadowSandbox('daemon-session-1', testWorkspace);
		assert.strictEqual(sandboxRes.sessionId, 'daemon-session-1');
		assert(fs.existsSync(sandboxRes.sandboxRoot), 'Physical sandbox must exist on disk');
		console.log(`  ✓ Shadow sandbox created via Daemon IPC in ${sandboxRes.durationMs}ms at ${sandboxRes.sandboxRoot}`);

		// Toolchain execution through daemon
		const toolchainRes = await client.runShadowToolchain('daemon-session-1', 'node', ['-v'], 10000);
		assert.strictEqual(toolchainRes.exitCode, 0);
		assert(toolchainRes.stdout.includes('v'));
		console.log(`  ✓ Toolchain executed in isolated daemon sandbox: ${toolchainRes.stdout.trim()}`);

		// Sandbox cleanup
		const cleanupRes = await client.cleanupShadowSandbox('daemon-session-1');
		assert.strictEqual(cleanupRes.success, true);
		assert(!fs.existsSync(sandboxRes.sandboxRoot), 'Sandbox root must be cleanly deleted');
		console.log('  ✓ Shadow sandbox cleanly dismantled via Daemon IPC.');

		// =========================================================================
		// Test 4: Speculative Next-Edit Prediction over IPC
		// =========================================================================
		console.log('\nTest 4: Speculative Next-Edit Prediction over IPC...');
		const specRes = await client.predictNextEdit({
			currentFile: 'src/app.ts',
			cursorPosition: { line: 10, column: 5 },
			activePrefix: 'function calculateTotal(items: Item[]): number {\n  return items.',
			activeSuffix: '\n}',
			recentDiffs: [
				{
					file: 'src/types.ts',
					patch: '@@ -1,3 +1,4 @@\n export interface Item {\n   price: number;\n+  discount: number;\n }'
				}
			],
			openFiles: ['src/types.ts', 'src/app.ts']
		});

		assert(specRes);
		assert(Array.isArray(specRes.suggestedEdits));
		console.log(`  ✓ Speculative next-edit prediction delivered via Daemon IPC in ${specRes.durationMs}ms.`);

		// =========================================================================
		// Test 5: Multiplexed Streaming Progress over IPC
		// =========================================================================
		console.log('\nTest 5: Multiplexed Streaming Progress over IPC...');
		const chunksReceived: any[] = [];
		let streamSummary: any = null;

		await new Promise<void>((resolve, reject) => {
			client.stream(
				'stream_agent_task',
				{ steps: 4 },
				{
					onChunk: (chunk) => chunksReceived.push(chunk),
					onEnd: (summary) => {
						streamSummary = summary;
						resolve();
					},
					onError: (err) => reject(err)
				}
			);
		});

		assert.strictEqual(chunksReceived.length, 4);
		assert.strictEqual(chunksReceived[0].step, 1);
		assert.strictEqual(chunksReceived[3].step, 4);
		assert.strictEqual(streamSummary.status, 'completed');
		assert.strictEqual(streamSummary.stepsExecuted, 4);
		console.log('  ✓ 4 multiplexed binary/JSON-RPC stream chunks successfully received.');

		// A normal RPC error response must terminate a stream with onError;
		// it must not leave an unreachable listener in the client map.
		let streamErrorMessage = '';
		await new Promise<void>((resolve, reject) => {
			void client.stream(
				'float_method_that_does_not_exist',
				{},
				{
					onChunk: () => reject(new Error('Unknown stream unexpectedly emitted a chunk.')),
					onEnd: () => reject(new Error('Unknown stream unexpectedly ended successfully.')),
					onError: error => {
						streamErrorMessage = error.message;
						resolve();
					}
				},
				5_000
			);
		});
		assert.match(streamErrorMessage, /Method not found/);


		console.log('\n✅ All Phase 1 Sidecar Daemon & IPC Subsystem tests PASSED successfully!\n');
	} finally {
		client.dispose();
		await server.stop();

		try {
			fs.rmSync(testWorkspace, { recursive: true, force: true });
		} catch {}
	}
}

runTests().catch((err) => {
	console.error('❌ Test failed with error:', err);
	process.exit(1);
});
