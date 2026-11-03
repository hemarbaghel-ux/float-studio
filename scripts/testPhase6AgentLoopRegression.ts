import assert from 'assert';
import { BoundedToolExecutor, BoundedToolCall } from '../src/server/agent/boundedToolExecutor';
import { ExecutionPolicyManager } from '../src/server/policy/executionPolicy';
import { setProjectLookupForTests, resetEphemeralWorkspacesForTests } from '../src/server/projectOwnership';
import type { FileNode } from '../src/types';

console.log('=== FLOAT AI Phase 6: Bounded Agent Mode & Policy Regression Suite ===\n');

// Mock project lookup for tests
const OWNER_ID = 'test-owner-agent';
const OTHER_USER_ID = 'unauthorized-user-agent';
const PROJECT_ID = 'proj-bounded-agent-1';

const sampleFiles: FileNode[] = [
  {
    id: 'folder-src',
    name: 'src',
    type: 'folder',
    children: [
      {
        id: 'file-app',
        name: 'App.tsx',
        type: 'file',
        content: 'import React from "react";\nexport function App() {\n  return <div>Hello FLOAT</div>;\n}\n'
      },
      {
        id: 'file-utils',
        name: 'utils.ts',
        type: 'file',
        content: 'export function add(a: number, b: number): number {\n  return a + b;\n}\n'
      }
    ]
  },
  {
    id: 'file-pkg',
    name: 'package.json',
    type: 'file',
    content: '{\n  "name": "sample-proj",\n  "version": "1.0.0"\n}\n'
  },
  {
    id: 'file-env',
    name: '.env',
    type: 'file',
    content: 'OPENAI_API_KEY=sk-supersecretkey123456\nDATABASE_URL=postgres://...\n'
  },
  {
    id: 'file-id_rsa',
    name: 'id_rsa',
    type: 'file',
    content: '-----BEGIN OPENSSH PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n'
  }
];

setProjectLookupForTests(async (id: string) => {
  if (id === PROJECT_ID) {
    return {
      exists: true,
      data: {
        id: PROJECT_ID,
        ownerId: OWNER_ID,
        name: 'Bounded Agent Test Project',
        files: sampleFiles
      }
    };
  }
  return { exists: false };
});

async function runTests() {
  let passedCount = 0;

  try {
    // -------------------------------------------------------------------------
    // Test 1: list_project_files excludes sensitive credentials and node_modules
    // -------------------------------------------------------------------------
    console.log('--- Test 1: list_project_files filters sensitive files ---');
    const listOutcome = await BoundedToolExecutor.executeTool(
      { toolName: 'list_project_files', args: {} },
      { userId: OWNER_ID, projectId: PROJECT_ID, files: sampleFiles }
    );

    assert.strictEqual(listOutcome.success, true, 'list_project_files succeeded');
    const listedPaths: string[] = listOutcome.data.files.map((f: any) => f.path);
    assert.ok(listedPaths.includes('src/App.tsx'), 'src/App.tsx is listed');
    assert.ok(listedPaths.includes('src/utils.ts'), 'src/utils.ts is listed');
    assert.ok(listedPaths.includes('package.json'), 'package.json is listed');
    assert.ok(!listedPaths.includes('.env'), '.env is strictly excluded from file listing');
    assert.ok(!listedPaths.includes('id_rsa'), 'id_rsa is strictly excluded from file listing');
    console.log('[PASS] list_project_files returned authorized workspace files and excluded secrets');
    passedCount++;

    // -------------------------------------------------------------------------
    // Test 2: read_project_file permits authorized reads, rejects traversal and secrets
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: read_project_file boundary and credential checks ---');
    // 2a. Legitimate source read
    const readApp = await BoundedToolExecutor.executeTool(
      { toolName: 'read_project_file', args: { path: 'src/App.tsx' } },
      { userId: OWNER_ID, projectId: PROJECT_ID, files: sampleFiles }
    );
    assert.strictEqual(readApp.success, true, 'read_project_file succeeded for App.tsx');
    assert.ok(readApp.data.content.includes('Hello FLOAT'), 'Read correct App.tsx content');

    // 2b. Path traversal attempt
    const readTraversal = await BoundedToolExecutor.executeTool(
      { toolName: 'read_project_file', args: { path: '../../etc/passwd' } },
      { userId: OWNER_ID, projectId: PROJECT_ID, files: sampleFiles }
    );
    assert.strictEqual(readTraversal.success, false, 'Path traversal read rejected');
    assert.ok(readTraversal.error?.includes('traversal') || readTraversal.approvalReason?.includes('outside'), 'Path traversal detected');

    // 2c. Secret file read attempt (.env)
    const readSecret = await BoundedToolExecutor.executeTool(
      { toolName: 'read_project_file', args: { path: '.env' } },
      { userId: OWNER_ID, projectId: PROJECT_ID, files: sampleFiles }
    );
    assert.strictEqual(readSecret.success, false, 'Reading .env is blocked');
    assert.ok(readSecret.error?.includes('sensitive') || readSecret.requiresHumanApproval, 'Sensitive file read guarded');

    console.log('[PASS] read_project_file permitted safe source files and strictly blocked traversal and secrets');
    passedCount++;

    // -------------------------------------------------------------------------
    // Test 3: search_codebase searches project text and ignores secrets
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: search_codebase bounded lexical search ---');
    const searchResult = await BoundedToolExecutor.executeTool(
      { toolName: 'search_codebase', args: { query: 'Hello FLOAT' } },
      { userId: OWNER_ID, projectId: PROJECT_ID, files: sampleFiles }
    );
    assert.strictEqual(searchResult.success, true, 'search_codebase succeeded');
    assert.strictEqual(searchResult.data.matches.length, 1, 'Found exact match in App.tsx');
    assert.strictEqual(searchResult.data.matches[0].path, 'src/App.tsx', 'Match path is src/App.tsx');

    // Secret query should not leak secret file contents
    const searchSecret = await BoundedToolExecutor.executeTool(
      { toolName: 'search_codebase', args: { query: 'sk-supersecretkey123456' } },
      { userId: OWNER_ID, projectId: PROJECT_ID, files: sampleFiles }
    );
    assert.strictEqual(searchSecret.data.matches.length, 0, 'Sensitive files are not returned in search results');
    console.log('[PASS] search_codebase searches workspace text and ignores sensitive files');
    passedCount++;

    // -------------------------------------------------------------------------
    // Test 4: propose_changes generates unapplied proposal without mutating files
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: propose_changes generates unapplied proposal without mutating files ---');
    // Set execution policy to sandboxed so propose_changes can generate proposal
    ExecutionPolicyManager.setPolicyMode(OWNER_ID, 'sandboxed');

    const originalAppContent = (sampleFiles[0].children![0] as any).content;
    const proposalOutcome = await BoundedToolExecutor.executeTool(
      {
        toolName: 'propose_changes',
        args: {
          description: 'Add subtitle to App component',
          changes: [
            {
              path: 'src/App.tsx',
              operation: 'modify',
              proposedContent: 'import React from "react";\nexport function App() {\n  return <div><h1>Hello FLOAT</h1><p>Cursor Parity</p></div>;\n}\n'
            }
          ]
        }
      },
      { userId: OWNER_ID, projectId: PROJECT_ID, files: sampleFiles }
    );

    assert.strictEqual(proposalOutcome.success, true, 'propose_changes created proposal successfully');
    assert.ok(proposalOutcome.data.proposalId, 'Generated proposalId');
    assert.strictEqual(proposalOutcome.data.status, 'pending_review', 'Proposal status is "pending_review"');
    assert.ok(proposalOutcome.data.diffStats.additions > 0, 'Computed diff additions');

    // Verify source files are COMPLETELY UNTOUCHED
    assert.strictEqual(
      (sampleFiles[0].children![0] as any).content,
      originalAppContent,
      'Original App.tsx source file was NOT mutated by the agent'
    );
    console.log('[PASS] propose_changes created proposal card and left original files completely untouched');
    passedCount++;

    // -------------------------------------------------------------------------
    // Test 5: Tenant boundary enforcement
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Project tenant boundary enforcement ---');
    const unauthorizedOutcome = await BoundedToolExecutor.executeTool(
      { toolName: 'list_project_files', args: {} },
      { userId: OTHER_USER_ID, projectId: PROJECT_ID, files: sampleFiles }
    );
    assert.strictEqual(unauthorizedOutcome.success, false, 'Unauthorized user is rejected');
    assert.ok(unauthorizedOutcome.error?.includes('Forbidden') || unauthorizedOutcome.error?.includes('do not own'), 'Access forbidden error');
    console.log('[PASS] Tool execution rejected when user does not own the project');
    passedCount++;

    // -------------------------------------------------------------------------
    // Test 6: Iteration budget enforcement in BoundedAgentLoop
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Iteration budget enforcement in BoundedAgentLoop ---');
    const repeatedCalls: BoundedToolCall[] = [
      { toolName: 'list_project_files', args: {} },
      { toolName: 'read_project_file', args: { path: 'src/App.tsx' } },
      { toolName: 'read_project_file', args: { path: 'src/utils.ts' } },
      { toolName: 'search_codebase', args: { query: 'add' } },
      { toolName: 'search_codebase', args: { query: 'Hello' } },
      { toolName: 'list_project_files', args: {} },
    ];

    const trace = await BoundedToolExecutor.runBoundedAgentLoop(
      repeatedCalls,
      { userId: OWNER_ID, projectId: PROJECT_ID, files: sampleFiles },
      { maxIterations: 3 } // Cap at 3 iterations
    );

    assert.strictEqual(trace.iterations, 3, 'Loop executed exactly 3 iterations before halting');
    assert.strictEqual(trace.status, 'max_iterations_exceeded', 'Status marked as max_iterations_exceeded');
    assert.ok(trace.error?.includes('iteration budget'), 'Clear iteration budget error');
    console.log('[PASS] Bounded agent loop enforced iteration limit budget');
    passedCount++;

    // -------------------------------------------------------------------------
    // Test 7: Cancellation via AbortSignal
    // -------------------------------------------------------------------------
    console.log('\n--- Test 7: Cancellation via AbortSignal ---');
    const abortCtrl = new AbortController();
    abortCtrl.abort(); // Pre-aborted

    const cancelledTrace = await BoundedToolExecutor.runBoundedAgentLoop(
      [{ toolName: 'list_project_files', args: {} }],
      { userId: OWNER_ID, projectId: PROJECT_ID, files: sampleFiles, signal: abortCtrl.signal }
    );

    assert.strictEqual(cancelledTrace.status, 'cancelled', 'Task aborted cleanly on AbortSignal');
    console.log('[PASS] Bounded agent loop responded immediately to AbortSignal');
    passedCount++;

    console.log('\n==================================================');
    console.log(`Phase 6 Regression: All ${passedCount}/${passedCount} suites passed!`);
    console.log('==================================================\n');
  } finally {
    setProjectLookupForTests(null);
    resetEphemeralWorkspacesForTests();
  }
}

runTests().catch((err) => {
  console.error('\n[FAIL] Phase 6 Regression failed:', err);
  process.exit(1);
});
