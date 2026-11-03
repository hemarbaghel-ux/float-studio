import assert from 'assert';
import { useIDEStore, WorkspaceCheckpoint } from '../src/store';
import { getConfiguredProviders } from '../src/server/integrationsRouter';
import type { FileNode } from '../src/types';

console.log('=== FLOAT AI Phase 7: Integrations Honesty & Workspace Checkpoints Regression ===\n');

async function runTests() {
  let passedCount = 0;

  // -------------------------------------------------------------------------
  // Test 1: Workspace Checkpoint Creation and Storage Bounds
  // -------------------------------------------------------------------------
  console.log('--- Test 1: Workspace Checkpoint Creation and Bounds ---');
  const store = useIDEStore.getState();

  const initialFiles: FileNode[] = [
    {
      id: 'f1',
      name: 'index.ts',
      type: 'file',
      content: 'console.log("Initial checkpoint");\n'
    },
    {
      id: 'f2',
      name: 'math.ts',
      type: 'file',
      content: 'export const PI = 3.14;\n'
    }
  ];

  store.setProject('Checkpoint Test Proj', initialFiles, 'proj-ckpt-1');
  const ckptId1 = store.createCheckpoint('Initial baseline');

  assert.ok(ckptId1.startsWith('ckpt-'), 'Generated valid checkpoint ID');
  const checkpoints = useIDEStore.getState().checkpoints;
  assert.strictEqual(checkpoints.length >= 1, true, 'Checkpoint stored in history');
  assert.strictEqual(checkpoints[0].id, ckptId1, 'Most recent checkpoint is at index 0');
  assert.strictEqual(checkpoints[0].files.length, 2, 'Snapshot contains 2 files');
  assert.strictEqual(checkpoints[0].files[0].content, 'console.log("Initial checkpoint");\n');

  console.log('[PASS] Checkpoint created and stored in workspace state');
  passedCount++;

  // -------------------------------------------------------------------------
  // Test 2: File Modification and One-Click Rollback
  // -------------------------------------------------------------------------
  console.log('\n--- Test 2: File Mutation and One-Click Rollback ---');
  // Mutate file
  store.updateFileContent('f1', 'console.log("Mutated corrupted code");\n');
  assert.strictEqual(
    useIDEStore.getState().files[0].content,
    'console.log("Mutated corrupted code");\n',
    'File was mutated'
  );

  // Restore checkpoint
  const restored = store.restoreCheckpoint(ckptId1);
  assert.strictEqual(restored, true, 'restoreCheckpoint returned true');

  const filesAfterRollback = useIDEStore.getState().files;
  assert.strictEqual(
    filesAfterRollback[0].content,
    'console.log("Initial checkpoint");\n',
    'File content was cleanly rolled back to pre-mutation state'
  );
  console.log('[PASS] Checkpoint rollback restored workspace file tree accurately');
  passedCount++;

  // -------------------------------------------------------------------------
  // Test 3: restoreLastCheckpoint helper
  // -------------------------------------------------------------------------
  console.log('\n--- Test 3: restoreLastCheckpoint helper ---');
  store.updateFileContent('f2', 'export const PI = 3.1415926535;\n');
  const ckptId2 = store.createCheckpoint('Before third mutation');

  store.updateFileContent('f2', 'export const PI = 0;\n');
  assert.strictEqual(useIDEStore.getState().files[1].content, 'export const PI = 0;\n');

  const restoredLast = store.restoreLastCheckpoint();
  assert.strictEqual(restoredLast, true, 'restoreLastCheckpoint succeeded');
  assert.strictEqual(
    useIDEStore.getState().files[1].content,
    'export const PI = 3.1415926535;\n',
    'Restored last recorded state'
  );
  console.log('[PASS] restoreLastCheckpoint restored the immediately preceding snapshot');
  passedCount++;

  // -------------------------------------------------------------------------
  // Test 4: Integrations Honesty - Zero Mock Providers when Unconfigured
  // -------------------------------------------------------------------------
  console.log('\n--- Test 4: Integrations Honesty - Unconfigured Provider Detection ---');
  // Ensure that absent environment secrets report empty configured providers
  const prevGithubId = process.env.GITHUB_CLIENT_ID;
  const prevGithubSecret = process.env.GITHUB_CLIENT_SECRET;
  delete process.env.GITHUB_CLIENT_ID;
  delete process.env.GITHUB_CLIENT_SECRET;

  try {
    const configured = getConfiguredProviders();
    assert.strictEqual(Array.isArray(configured), true, 'Returns array of configured providers');
    assert.strictEqual(
      configured.includes('github'),
      false,
      'GitHub is NOT reported as configured when credentials are missing'
    );
    console.log('[PASS] Integrations status truthfully reflects missing credentials with zero mocks');
    passedCount++;
  } finally {
    if (prevGithubId !== undefined) process.env.GITHUB_CLIENT_ID = prevGithubId;
    if (prevGithubSecret !== undefined) process.env.GITHUB_CLIENT_SECRET = prevGithubSecret;
  }

  // -------------------------------------------------------------------------
  // Test 5: Checkpoint Capacity Cap
  // -------------------------------------------------------------------------
  console.log('\n--- Test 5: Checkpoint Capacity Budget (Max 25) ---');
  for (let i = 0; i < 30; i++) {
    store.createCheckpoint(`Churn ${i}`);
  }
  const boundedCheckpoints = useIDEStore.getState().checkpoints;
  assert.strictEqual(
    boundedCheckpoints.length,
    25,
    'Checkpoints stack is strictly capped at 25 to prevent memory exhaustion'
  );
  console.log('[PASS] Checkpoint storage strictly respects capacity bounds');
  passedCount++;

  console.log('\n==================================================');
  console.log(`Phase 7 Regression: All ${passedCount}/${passedCount} suites passed!`);
  console.log('==================================================\n');
}

runTests().catch((err) => {
  console.error('\n[FAIL] Phase 7 Regression failed:', err);
  process.exit(1);
});
