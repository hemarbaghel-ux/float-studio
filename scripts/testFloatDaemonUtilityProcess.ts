/**
 * FLOAT Studio - Real Daemon Utility Process Integration Test
 *
 * Directly exercises FloatDaemonWorkerChannel (the Electron utility-process IPC channel)
 * with real lifecycle management, IPC message routing, semantic file indexing,
 * AST chunk generation, symbol queries, and clean shutdown.
 */

import assert from 'node:assert';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { FloatDaemonWorkerChannel } from '../daemon/src/server/floatDaemonWorkerChannel.js';

const REPO_ROOT = process.cwd();

async function runDaemonUtilityProcessTest(): Promise<void> {
  console.log('================================================================');
  console.log('   FLOAT STUDIO: DAEMON UTILITY-PROCESS INTEGRATION TEST       ');
  console.log('================================================================\n');

  let passedChecks = 0;
  function reportPass(step: string, detail: string): void {
    console.log(`[PASS] ${step}: ${detail}`);
    passedChecks++;
  }

  const workspaceId = `smoke-ws-${Date.now()}`;
  const instanceId = `inst-${Date.now()}`;
  const testWorkspaceDir = path.resolve(REPO_ROOT, 'tmp', `daemon-test-${Date.now()}`);
  await fsp.mkdir(path.join(testWorkspaceDir, 'src'), { recursive: true });

  const sampleFileRelPath = 'src/mathUtils.ts';
  const sampleFilePath = path.join(testWorkspaceDir, sampleFileRelPath);
  const sampleSourceCode = `export class MathUtils {
  public static add(a: number, b: number): number {
    return a + b;
  }
  public static multiply(a: number, b: number): number {
    return a * b;
  }
}
`;
  await fsp.writeFile(sampleFilePath, sampleSourceCode, 'utf8');

  // Step 1: Instantiate FloatDaemonWorkerChannel
  console.log('--- Step 1: Initializing Utility Worker Channel ---');
  const channel = new FloatDaemonWorkerChannel();
  assert.ok(channel, 'FloatDaemonWorkerChannel must instantiate');
  reportPass('Channel Initialization', 'FloatDaemonWorkerChannel created successfully');

  // Step 2: Start worker daemon
  console.log('\n--- Step 2: Starting Daemon Server via Worker Channel ---');
  const startResult = await channel.call<{ status: string; pid: number }>('', 'start', {
    workspaceId,
    instanceId
  });
  assert.strictEqual(startResult.status, 'running', 'Worker channel start must return running status');
  assert.ok(typeof startResult.pid === 'number' && startResult.pid > 0, `Worker must report valid PID (was ${startResult.pid})`);
  reportPass('Worker Daemon Start', `Daemon running with PID ${startResult.pid}`);

  // Step 3: Query worker status
  console.log('\n--- Step 3: Querying Worker Daemon Status ---');
  const statusResult = await channel.call<{ status: string; pid?: number }>('', 'status');
  assert.strictEqual(statusResult.status, 'running', 'Status query must return running');
  assert.strictEqual(statusResult.pid, startResult.pid, 'Status PID must match started PID');
  reportPass('Worker Status Query', `Status: ${statusResult.status}, PID: ${statusResult.pid}`);

  // Step 4: Health ping via callDaemon
  console.log('\n--- Step 4: Verifying Health Ping via IPC ---');
  const pingResult = await channel.call<{ status?: string }>('', 'callDaemon', { method: 'ping' });
  assert.strictEqual(pingResult?.status, 'ok', 'Ping must return status ok');
  reportPass('IPC Health Ping', 'Ping succeeded with status: ok');

  // Step 5: Semantic indexing via callDaemon
  console.log('\n--- Step 5: Semantic File Indexing via Worker IPC ---');
  const indexResult = await channel.call<{ chunksCount: number; status: string }>('', 'callDaemon', {
    method: 'semantic_index_file',
    params: {
      filePath: sampleFileRelPath,
      content: sampleSourceCode
    }
  });
  assert.ok(indexResult.chunksCount >= 1, `Semantic indexer must produce chunks (got ${indexResult.chunksCount})`);
  reportPass('Semantic Indexing', `Indexed ${sampleFileRelPath} into ${indexResult.chunksCount} AST chunk(s)`);

  // Step 6: Symbol retrieval via callDaemon
  console.log('\n--- Step 6: Symbol Retrieval via Worker IPC ---');
  const symbolsResult = await channel.call<{ symbols: Array<{ name: string; kind?: string }> }>('', 'callDaemon', {
    method: 'semantic_get_symbols',
    params: {
      query: 'MathUtils'
    }
  });
  assert.ok(Array.isArray(symbolsResult.symbols), 'semantic_get_symbols must return array');
  assert.ok(symbolsResult.symbols.length > 0, 'Must find MathUtils symbol');
  assert.strictEqual(symbolsResult.symbols[0].name, 'MathUtils', 'Symbol name must match MathUtils');
  reportPass('Symbol Retrieval', `Found symbol: ${symbolsResult.symbols[0].name}`);

  // Step 7: List indexed files
  console.log('\n--- Step 7: Listing Indexed Files via Worker IPC ---');
  const listResult = await channel.call<{ files: string[] }>('', 'callDaemon', {
    method: 'semantic_list_indexed_files'
  });
  assert.ok(Array.isArray(listResult.files), 'semantic_list_indexed_files must return array');
  assert.ok(listResult.files.includes(sampleFileRelPath), `List must include ${sampleFileRelPath}`);
  reportPass('Indexed Files Verification', `Indexed files list contains ${listResult.files.length} file(s)`);

  // Step 8: Clean shutdown via call('stop')
  console.log('\n--- Step 8: Stopping Worker Daemon ---');
  const stopResult = await channel.call<{ stopped: boolean }>('', 'stop');
  assert.strictEqual(stopResult.stopped, true, 'Stop must return stopped: true');
  reportPass('Worker Daemon Stop', 'Daemon stopped cleanly');

  // Step 9: Verify status after stop
  console.log('\n--- Step 9: Verifying Post-Stop Status ---');
  const postStopStatus = await channel.call<{ status: string }>('', 'status');
  assert.strictEqual(postStopStatus.status, 'stopped', 'Status after stop must be stopped');
  reportPass('Post-Stop Verification', `Status verified as: ${postStopStatus.status}`);

  // Clean up test workspace
  await fsp.rm(testWorkspaceDir, { recursive: true, force: true });
  reportPass('Workspace Cleanup', 'Temporary test directory cleaned up');

  console.log('\n================================================================');
  console.log(`   DAEMON UTILITY PROCESS TEST PASSED: ${passedChecks} CHECKS VERIFIED   `);
  console.log('================================================================\n');
}

runDaemonUtilityProcessTest().catch(err => {
  console.error('\n[DAEMON UTILITY PROCESS TEST FAILED]', err);
  process.exit(1);
});
