import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import {
  verifyProjectOwnership,
  setProjectLookupForTests,
  resetEphemeralWorkspacesForTests
} from '../src/server/projectOwnership';
import { setGooglePublicKeysForTests } from '../src/server/authMiddleware';
import firebaseConfig from '../firebase-applet-config.json';
import { createApp } from '../src/server/app';
import { ModelRouter } from '../src/server/providers/router';
import { OpenAIAdapter } from '../src/server/providers/openai';
import { VERIFIED_MODELS } from '../src/data/verifiedModels';
import { DASHBOARD_MODELS } from '../src/features/dashboard/dashboardModels';
import { INITIAL_MODELS, FLOAT_BASIC_MODEL } from '../src/features/ai/registry';
import { useAIStore, VALID_FLOAT_MODELS } from '../src/store/aiStore';
import { useIDEStore } from '../src/store/index';
import { ToolRegistry } from '../src/server/agent/toolRegistry';
import { ProposalService } from '../src/server/agent/proposalService';
import { EvalEngine } from '../src/server/evalEngine';
import { MultiAgentCoordinator } from '../src/server/agent/subagents';
import {
  getUserSubscription,
  updateUserSubscription,
  resetSubscriptionMemoryState
} from '../src/server/subscription/subscriptionPersistence';

let passed = 0;
let failed = 0;

function check(condition: boolean, name: string) {
  if (condition) {
    console.log(`[PASS] ${name}`);
    passed++;
  } else {
    console.error(`[FAIL] ${name}`);
    failed++;
  }
}

async function runMasterAuditRegressionTests() {
  console.log('=== FLOAT AI — MASTER AUDIT & REGRESSION TEST SUITE ===\n');

  // 1. Server-side Project Ownership & Cross-Tenant Isolation
  console.log('--- 1. Server-Side Project Ownership & Tenant Isolation ---');
  resetEphemeralWorkspacesForTests();
  const mockDb = new Map<string, { exists: boolean; data?: Record<string, any> }>();
  setProjectLookupForTests(async (id: string) => mockDb.get(id) ?? { exists: false });

  try {
    const aliceClaim = await verifyProjectOwnership('proj-alice-1', 'user-alice', { allowMissing: true });
    check(aliceClaim.allowed === true && aliceClaim.isEphemeral === true, 'Owner (user-alice) is permitted to claim ephemeral workspace');

    const bobIntrusion = await verifyProjectOwnership('proj-alice-1', 'user-bob', { allowMissing: true });
    check(bobIntrusion.allowed === false && bobIntrusion.status === 403, 'Second user (user-bob) is blocked with HTTP 403 from accessing user-alice ephemeral workspace');

    const unpersistedExec = await verifyProjectOwnership('proj-never-saved', 'user-alice', {
      allowMissing: false
    });
    check(unpersistedExec.allowed === false && unpersistedExec.status === 404, 'Unpersisted project returns 404 when allowMissing is false');

    mockDb.set('proj-saved-cloud', {
      exists: true,
      data: {
        ownerId: 'user-alice',
        name: 'Cloud Project',
        files: JSON.stringify([{ path: 'src/app.ts', content: 'export const x = 1;' }])
      }
    });
    const aliceSaved = await verifyProjectOwnership('proj-saved-cloud', 'user-alice', { allowMissing: false });
    check(aliceSaved.allowed === true && aliceSaved.persisted === true && Boolean(aliceSaved.projectData), 'Persisted project resolves projectData for owner');

    const bobSavedIntrusion = await verifyProjectOwnership('proj-saved-cloud', 'user-bob', { allowMissing: false });
    check(bobSavedIntrusion.allowed === false && bobSavedIntrusion.status === 403, 'Persisted project rejects non-owner with 403');
  } finally {
    setProjectLookupForTests(null);
    resetEphemeralWorkspacesForTests();
  }

  // 2. Model Catalog Reconciliation: Verified Upstream IDs vs Internal FLOAT Aliases
  console.log('\n--- 2. Model Catalog, Alias Reconciliation & AI Store Integrity ---');
  const router = new ModelRouter();
  check(DASHBOARD_MODELS.length === 10, 'DASHBOARD_MODELS has all 10 dashboard selector models');
  check(VERIFIED_MODELS.length === 12, 'VERIFIED_MODELS has all 12 catalog entries (8 upstream OpenAI + 4 internal FLOAT aliases)');
  check(INITIAL_MODELS.length === 12 && VALID_FLOAT_MODELS.length === 12, 'INITIAL_MODELS and VALID_FLOAT_MODELS agree on all 12 catalog entries');
  check(Boolean(FLOAT_BASIC_MODEL && FLOAT_BASIC_MODEL.id === 'float-basic'), 'FLOAT_BASIC_MODEL is exported and defined');

  const upstreamModels = ['gpt-4o', 'o3-mini', 'gpt-4o-mini', 'o1', 'o1-mini', 'gpt-4.5-preview', 'gpt-4-turbo', 'chatgpt-4o-latest'];
  for (const modelId of upstreamModels) {
    useAIStore.getState().setSelectedModel(modelId);
    check(useAIStore.getState().selectedModel === modelId, `useAIStore preserves upstream model "${modelId}" without silent overwrite`);
    const resolved = router.resolveRoute(modelId);
    check(
      resolved.route.provider === 'openai' &&
      resolved.route.isInternalAlias === false &&
      resolved.route.upstreamModelId === modelId,
      `ModelRouter marks "${modelId}" as verified upstream OpenAI model (${resolved.route.upstreamModelId})`
    );
  }

  const internalAliases: Array<{ id: string; expectedUpstream: string }> = [
    { id: 'auto', expectedUpstream: 'gpt-4o' },
    { id: 'float-basic', expectedUpstream: 'gpt-4o-mini' },
    { id: 'gpt-6-astra', expectedUpstream: 'gpt-4o' },
    { id: 'gpt-6.1-sol', expectedUpstream: 'gpt-4o' }
  ];
  for (const { id, expectedUpstream } of internalAliases) {
    useAIStore.getState().setSelectedModel(id);
    check(useAIStore.getState().selectedModel === id, `useAIStore preserves internal alias "${id}"`);
    const resolved = router.resolveRoute(id);
    const vmEntry = VERIFIED_MODELS.find(m => m.id === id);
    check(
      resolved.route.isInternalAlias === true &&
      resolved.route.upstreamModelId === expectedUpstream &&
      vmEntry?.isInternalAlias === true &&
      vmEntry?.upstreamModelId === expectedUpstream,
      `Alias "${id}" is explicitly marked isInternalAlias=true with upstreamModelId="${expectedUpstream}" in Router and VERIFIED_MODELS`
    );
  }

  // 3. OpenAIAdapter Exact Model Preservation & Explicit Alias Mapping
  console.log('\n--- 3. OpenAIAdapter Upstream Model ID Preservation ---');
  const adapter = new OpenAIAdapter();
  check((adapter as any).resolveApiModel('o1') === 'o1', 'OpenAIAdapter preserves o1 model ID');
  check((adapter as any).resolveApiModel('o3-mini') === 'o3-mini', 'OpenAIAdapter preserves o3-mini model ID');
  check((adapter as any).resolveApiModel('gpt-4o-mini') === 'gpt-4o-mini', 'OpenAIAdapter preserves gpt-4o-mini model ID');
  check((adapter as any).resolveApiModel('float-basic') === 'gpt-4o-mini', 'OpenAIAdapter maps float-basic alias to gpt-4o-mini');
  check((adapter as any).resolveApiModel('gpt-6-astra') === 'gpt-4o', 'OpenAIAdapter maps gpt-6-astra preview alias to gpt-4o');
  check((adapter as any).resolveApiModel('gpt-6.1-sol') === 'gpt-4o', 'OpenAIAdapter maps gpt-6.1-sol preview alias to gpt-4o');

  // 4. IDE Store File & Folder Lifecycle (Create, Update, Rename, Delete, Tab Sync)
  console.log('\n--- 4. IDE Store File & Folder Lifecycle & Editor State Sync ---');
  useIDEStore.getState().clearProject();
  const folderId = 'test-folder-1';
  const nestedFileId = 'test-nested-file-1';
  useIDEStore.getState().addFile(null, {
    id: folderId,
    name: 'components',
    type: 'folder',
    children: []
  });
  useIDEStore.getState().addFile(folderId, {
    id: nestedFileId,
    name: 'Button.tsx',
    type: 'file',
    content: 'export const Button = () => null;\n'
  });
  check(useIDEStore.getState().activeFileId === nestedFileId, 'addFile opens and activates nested file Button.tsx');

  useIDEStore.getState().renameFile(nestedFileId, '../evil.ts');
  useIDEStore.getState().renameFile(nestedFileId, 'sub\\evil.ts');
  check(
    useIDEStore.getState().files.find(f => f.id === folderId)?.children?.[0]?.name === 'Button.tsx',
    'renameFile rejects forward-slash and backslash path traversal names'
  );

  useIDEStore.getState().renameFile(nestedFileId, 'PrimaryButton.tsx');
  check(
    useIDEStore.getState().files.find(f => f.id === folderId)?.children?.[0]?.name === 'PrimaryButton.tsx',
    'renameFile updates nested file name to PrimaryButton.tsx'
  );
  check(useIDEStore.getState().openTabs.some(t => t.fileId === nestedFileId), 'renameFile preserves open editor tab');

  // Deleting parent folder closes open tabs for all descendant files inside the folder
  useIDEStore.getState().deleteFile(folderId);
  check(!useIDEStore.getState().files.some(f => f.id === folderId), 'deleteFile removes folder and its children from workspace');
  check(!useIDEStore.getState().openTabs.some(t => t.fileId === nestedFileId), 'deleteFile on folder closes descendant file editor tabs');
  check(useIDEStore.getState().activeFileId !== nestedFileId, 'deleteFile on folder updates activeFileId away from deleted descendant file');

  // 5. Subscription Persistence Memory Reset Fix
  console.log('\n--- 5. Subscription Persistence State Reset ---');
  resetSubscriptionMemoryState();
  const sub = await getUserSubscription('user-sub-test');
  await updateUserSubscription({ ...sub, planId: 'pro' });
  const updatedSub = await getUserSubscription('user-sub-test');
  check(updatedSub.planId === 'pro', 'Subscription update persisted in memory');
  resetSubscriptionMemoryState();
  const resetSub = await getUserSubscription('user-sub-test');
  check(resetSub.planId === 'free', 'resetSubscriptionMemoryState clears memorySubscriptions map properly');

  // 6. Genuine Git Diffs (Unchanged, Modified, Newly Created, Deleted & Sensitive File Exclusion)
  console.log('\n--- 6. Genuine Git Diffs & Multi-Edit Baseline Hash Integrity ---');
  const vFiles = new Map<string, { path: string; name?: string; content?: string; type: string }>();
  vFiles.set('src/index.ts', { path: 'src/index.ts', name: 'index.ts', content: 'export const v = 1;\nconst deadCode = true;\n', type: 'file' });
  vFiles.set('src/helper.ts', { path: 'src/helper.ts', name: 'helper.ts', content: 'export const h = "old";\n', type: 'file' });
  vFiles.set('src/obsolete.ts', { path: 'src/obsolete.ts', name: 'obsolete.ts', content: 'export const legacy = true;\n', type: 'file' });
  vFiles.set('.env', { path: '.env', name: '.env', content: 'OPENAI_API_KEY=secret', type: 'file' });

  const ctx: any = { userId: 'user-sec', projectId: 'proj-sec', projectName: 'SecTest', virtualFiles: vFiles };
  const secretRead = await ToolRegistry.execute('read_file', { path: '.env' }, ctx);
  check(!secretRead.success, 'ToolRegistry blocks reading .env file');

  const secretDiff = await ToolRegistry.execute('get_git_diff', { path: '.env' }, ctx);
  check(!secretDiff.success, 'get_git_diff blocks inspecting sensitive .env path');

  const traversalDiff = await ToolRegistry.execute('get_git_diff', { path: '../../etc/passwd' }, ctx);
  check(!traversalDiff.success, 'get_git_diff blocks path traversal');

  // Clean git diff before edits (also automatically captures untouched baselineFiles)
  const cleanDiff = await ToolRegistry.execute('get_git_diff', {}, ctx);
  check(
    cleanDiff.success &&
    cleanDiff.output.hasChanges === false &&
    cleanDiff.output.totalModified === 0 &&
    cleanDiff.output.filesChecked === 3,
    'get_git_diff reports 0 changes across 3 non-sensitive files on untouched workspace'
  );

  // First edit_file: delete deadCode using empty string new_str: ""
  const edit1 = await ToolRegistry.execute('edit_file', {
    path: 'src/index.ts',
    old_str: 'const deadCode = true;\n',
    new_str: ''
  }, ctx);
  check(edit1.success, 'edit_file supports empty string new_str="" to delete lines of code');

  // Second edit_file on a second file in the same session
  const edit2 = await ToolRegistry.execute('edit_file', {
    path: 'src/helper.ts',
    old_str: 'export const h = "old";',
    new_str: 'export const h = "new";'
  }, ctx);
  check(edit2.success, 'Second edit_file succeeds in same agent session');
  check(edit2.output.proposal.changes.length === 2, 'Consolidated proposal preserves both edited files across sequential edit_file calls');

  // Add a newly created file and delete src/obsolete.ts in working tree
  vFiles.set('src/newFeature.ts', { path: 'src/newFeature.ts', name: 'newFeature.ts', content: 'export const feature = "v2";\n', type: 'file' });
  vFiles.delete('src/obsolete.ts');

  const fullDiff = await ToolRegistry.execute('get_git_diff', {}, ctx);
  check(
    fullDiff.success &&
    fullDiff.output.totalModified === 4 &&
    fullDiff.output.addedCount === 1 &&
    fullDiff.output.modifiedCount === 2 &&
    fullDiff.output.deletedCount === 1,
    'get_git_diff accurately reports 1 added, 2 modified, and 1 deleted file against untouched baseline'
  );

  const singleFileDiff = await ToolRegistry.execute('get_git_diff', { path: 'src/newFeature.ts' }, ctx);
  check(
    singleFileDiff.success &&
    singleFileDiff.output.diffs.length === 1 &&
    singleFileDiff.output.diffs[0].status === 'added',
    'get_git_diff path filter returns exact added diff for src/newFeature.ts'
  );

  // Verify baseline hashes in consolidated proposal match untouched baseline files
  const baselineCheckMap = new Map<string, string>([
    ['src/index.ts', 'export const v = 1;\nconst deadCode = true;\n'],
    ['src/helper.ts', 'export const h = "old";\n'],
    ['src/obsolete.ts', 'export const legacy = true;\n']
  ]);
  const validation = ProposalService.checkConflicts(edit2.output.proposal, baselineCheckMap);
  check(validation.isStale === false && validation.conflicts.length === 0, 'Consolidated multi-edit proposal validates cleanly against untouched baseline hashes');

  // 7. Real Command Execution (All 5 Distinct Outcomes)
  console.log('\n--- 7. Real Command Execution (5 Distinct Outcomes) ---');
  // Outcome 4: Command unavailable when sandbox is disabled/unconfigured
  for (const cmd of ['npm run lint', 'tsc --noEmit', 'npm test', 'npm run build']) {
    const res = await ToolRegistry.execute('run_command', { command: cmd }, ctx);
    check(
      res.success === false &&
      res.output?.outcome === 'command_unavailable' &&
      res.output?.status === 'command_unavailable' &&
      res.output?.executed === false &&
      res.output?.exitCode === null,
      `run_command("${cmd}") never masquerades syntax validation as command execution when sandbox is unavailable`
    );
  }

  // Outcome 3: Lightweight syntax validation only
  const syntaxRes = await ToolRegistry.execute('run_command', { command: 'syntax-check' }, ctx);
  check(
    syntaxRes.success === true &&
    syntaxRes.output?.outcome === 'syntax_validation_only' &&
    syntaxRes.output?.status === 'syntax_validation_only' &&
    syntaxRes.output?.executed === false &&
    syntaxRes.output?.syntaxValidationOnly === true &&
    syntaxRes.output?.exitCode === null,
    'run_command("syntax-check") reports outcome=syntax_validation_only with executed=false and exitCode=null'
  );

  // Outcome 5: Command requires approval
  const approvalPolicyRes = await ToolRegistry.execute('run_command', { command: 'npm test' }, {
    ...ctx,
    executionPolicy: 'ask'
  });
  check(
    approvalPolicyRes.success === false &&
    approvalPolicyRes.output?.outcome === 'requires_approval' &&
    approvalPolicyRes.output?.status === 'requires_approval' &&
    approvalPolicyRes.output?.executed === false &&
    approvalPolicyRes.output?.exitCode === null,
    'run_command under "ask" policy returns outcome=requires_approval'
  );

  const unallowlistedRes = await ToolRegistry.execute('run_command', { command: 'node scripts/custom.js' }, ctx);
  check(
    unallowlistedRes.success === false &&
    unallowlistedRes.output?.outcome === 'requires_approval',
    'Non-allowlisted command returns outcome=requires_approval'
  );

  // Outcome 1: Actual command executed in isolated sandbox and passed
  const sandboxPassRes = await ToolRegistry.execute('run_command', { command: 'npm test' }, {
    ...ctx,
    enableSandboxExecution: true,
    sandboxExecutor: async (req) => ({
      status: 'succeeded',
      exitCode: 0,
      durationMs: 85,
      stdout: `Executed ${req.command} across ${req.files.length} sandboxed files: PASS`,
      stderr: ''
    })
  });
  check(
    sandboxPassRes.success === true &&
    sandboxPassRes.output?.outcome === 'sandbox_passed' &&
    sandboxPassRes.output?.status === 'succeeded' &&
    sandboxPassRes.output?.executed === true &&
    sandboxPassRes.output?.sandboxExecuted === true &&
    sandboxPassRes.output?.exitCode === 0,
    'run_command in isolated sandbox reports outcome=sandbox_passed and exitCode=0 on pass'
  );

  // Outcome 2: Actual command executed in isolated sandbox and failed
  const sandboxFailRes = await ToolRegistry.execute('run_command', { command: 'npm run build' }, {
    ...ctx,
    enableSandboxExecution: true,
    sandboxExecutor: async () => ({
      status: 'failed',
      exitCode: 2,
      durationMs: 110,
      stdout: '',
      stderr: 'error TS2322: Type string is not assignable to number'
    })
  });
  check(
    sandboxFailRes.success === false &&
    sandboxFailRes.output?.outcome === 'sandbox_failed' &&
    sandboxFailRes.output?.status === 'failed' &&
    sandboxFailRes.output?.executed === true &&
    sandboxFailRes.output?.sandboxExecuted === true &&
    sandboxFailRes.output?.exitCode === 2,
    'run_command in isolated sandbox reports outcome=sandbox_failed and exact non-zero exitCode on failure'
  );

  // 8. Subagent Real Workspace Inspection & EvalEngine Scoring
  console.log('\n--- 8. Subagent Workspace Analysis & Honest EvalEngine Scoring ---');
  const coordPlan = await MultiAgentCoordinator.coordinate(
    'Review and verify src/index.ts',
    [
      { role: 'explorer', instructions: 'Map workspace symbols', contextFiles: ['src/index.ts'] },
      { role: 'reviewer', instructions: 'Audit code quality', contextFiles: ['src/index.ts'] },
      { role: 'tester', instructions: 'Verify diagnostics', contextFiles: ['src/index.ts'] }
    ],
    { userId: 'user-sec', projectId: 'proj-sec' }
  );
  check(coordPlan.results.length === 3 && coordPlan.results.every(r => r.success), 'MultiAgentCoordinator completes all 3 subagent roles with real workspace analysis');
  check(coordPlan.summary.includes('EXPLORER') && coordPlan.summary.includes('REVIEWER'), 'Subagent synthesis includes structured role findings');

  const evalEngine = new EvalEngine();
  (evalEngine as any).modelRouter = {
    getAdapterForModel: () => ({
      name: 'openai',
      isConfigured: () => true,
      generateContent: async () => ({
        text: '```ts\n// src/index.ts\nexport function sum(a: number, b: number): number { return a + b; }\n```',
        usage: { promptTokens: 25, completionTokens: 20, totalTokens: 45 }
      })
    })
  };
  const tasks = evalEngine.getTasks();
  if (tasks.length > 0) {
    const run = await evalEngine.runEval(tasks[0].id, 'gpt-4o', 'openai', 'agent-1');
    await new Promise(r => setTimeout(r, 150));
    check(typeof run.finalScore === 'number' && run.finalScore >= 0, 'EvalEngine computes numeric finalScore via ScoringEngine');
    check(Boolean(run.scoreBreakdown), 'EvalEngine attaches structured scoreBreakdown');
    check(run.typecheckPassed === undefined && run.lintPassed === undefined && run.buildPassed === undefined, 'EvalEngine leaves buildPassed/typecheckPassed/lintPassed undefined when sandboxed checks did not execute');
  }

  // 9. Runtime HTTP Smoke Test (Authenticated Chat, SSE, Project Ownership, Validation & Clear Error Reporting)
  console.log('\n--- 9. Runtime HTTP Smoke Test (Express Server + Real Fetch) ---');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const kid = 'smoke-test-kid-1';
  setGooglePublicKeysForTests({ [kid]: publicKey });

  const signToken = (uid: string) => {
    const now = Math.floor(Date.now() / 1000);
    const h = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })).toString('base64url');
    const p = Buffer.from(JSON.stringify({
      iss: `https://securetoken.google.com/${firebaseConfig.projectId}`,
      aud: firebaseConfig.projectId,
      sub: uid,
      user_id: uid,
      email: `${uid}@float.ai`,
      iat: now - 10,
      exp: now + 3600
    })).toString('base64url');
    const data = `${h}.${p}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(data);
    return `${data}.${signer.sign(privateKey, 'base64url')}`;
  };

  const smokeDb = new Map<string, { exists: boolean; data?: Record<string, any> }>();
  smokeDb.set('proj-smoke-1', {
    exists: true,
    data: {
      ownerId: 'user-smoke-alice',
      name: 'Smoke Test Project',
      files: JSON.stringify([{ path: 'src/app.ts', content: 'export const ready = true;\n' }])
    }
  });
  setProjectLookupForTests(async (id: string) => smokeDb.get(id) ?? { exists: false });

  const mockRouter = {
    getProviderStatus: () => ({ openai: { name: 'OpenAI', configured: true } }),
    checkAllProvidersHealth: async () => ({
      openai: { provider: 'OpenAI', configured: true, authenticated: true, modelAvailable: true }
    }),
    resolveModelId: (m: string) => (m === 'auto' ? 'gpt-4o' : m),
    validateModelAvailability: () => {},
    resolveRoute: (m: string) => ({
      adapter: {} as any,
      route: { provider: 'openai', apiModelId: m === 'float-basic' ? 'gpt-4o-mini' : 'gpt-4o' }
    }),
    getAdapterForModel: () => ({
      id: 'openai',
      name: 'OpenAI',
      isConfigured: () => true,
      generateContent: async () => ({
        text: 'Smoke response from gpt-4o',
        usage: { inputTokens: 12, outputTokens: 8 }
      }),
      generateContentStream: async (_req: any, onChunk: (d: string) => void) => {
        onChunk('Smoke ');
        onChunk('stream');
        return { text: 'Smoke stream', usage: { inputTokens: 10, outputTokens: 5 } };
      }
    }),
    generateContent: async () => ({
      text: 'Smoke response from gpt-4o',
      usage: { inputTokens: 12, outputTokens: 8 }
    }),
    generateContentStream: async (_req: any, onChunk: (d: string) => void) => {
      onChunk('Smoke ');
      onChunk('stream');
      return { text: 'Smoke stream', usage: { inputTokens: 10, outputTokens: 5 } };
    }
  };

  const app = await createApp({ skipVite: true, modelRouterOverride: mockRouter as any });
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const aliceToken = signToken('user-smoke-alice');

  try {
    // A. Health check
    const healthRes = await fetch(`${baseUrl}/api/health`);
    check(healthRes.status === 200, 'Runtime smoke: GET /api/health returns 200 OK');

    // B. Authenticated Chat (JSON + real usage)
    const chatRes = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        projectId: 'proj-smoke-1',
        messages: [{ role: 'user', content: 'Verify smoke test' }],
        stream: false
      })
    });
    const chatJson: any = await chatRes.json();
    check(
      chatRes.status === 200 && chatJson.text === 'Smoke response from gpt-4o' && chatJson.usage?.inputTokens === 12,
      'Runtime smoke: POST /api/ai/chat returns authenticated provider response and usage'
    );

    // C. Authenticated Chat SSE Streaming
    const sseRes = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        projectId: 'proj-smoke-1',
        messages: [{ role: 'user', content: 'Stream smoke test' }],
        stream: true
      })
    });
    const sseText = await sseRes.text();
    check(
      sseRes.status === 200 && sseText.includes('Smoke ') && sseText.includes('"type":"done"'),
      'Runtime smoke: POST /api/ai/chat streams SSE chunks and [DONE] marker'
    );

    // D. Multi-file Proposal Creation & Conflict Check via HTTP route
    const propHttpRes = await fetch(`${baseUrl}/api/projects/proj-smoke-1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({
        description: 'Smoke multi-file update',
        changes: [
          { path: 'src/app.ts', operation: 'modify', proposedContent: 'export const ready = true;\nexport const v = 2;\n' },
          { path: 'src/util.ts', operation: 'create', proposedContent: 'export const util = 1;\n' }
        ],
        virtualFiles: [{ path: 'src/app.ts', content: 'export const ready = true;\n' }]
      })
    });
    const propHttpJson: any = await propHttpRes.json();
    check(
      propHttpRes.status === 201 && propHttpJson.proposal?.changes?.length === 2,
      'Runtime smoke: POST /api/projects/:projectId/proposals creates multi-file proposal'
    );

    // E. Validation endpoint & clear error when external sandbox execution is unavailable
    const valHttpRes = await fetch(`${baseUrl}/api/projects/proj-smoke-1/validation/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({
        requestedChecks: ['syntax'],
        files: [{ path: 'src/app.ts', content: 'export const ready: boolean = true;\n' }]
      })
    });
    const valHttpJson: any = await valHttpRes.json();
    check(
      valHttpRes.status === 200 && (valHttpJson.status === 'passed' || valHttpJson.run?.status === 'passed'),
      'Runtime smoke: POST /api/projects/:projectId/validation/run validates syntax'
    );

    const execHttpRes = await fetch(`${baseUrl}/api/projects/proj-smoke-1/executions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({
        command: 'npm test',
        files: [{ path: 'src/app.ts', content: 'export const ready = true;\n' }]
      })
    });
    const execSseText = await execHttpRes.text();
    check(
      execHttpRes.status === 200 && execSseText.includes('Isolated project execution is not configured'),
      'Runtime smoke: POST /api/projects/:projectId/executions emits clear error event when Docker sandbox runtime is unavailable'
    );
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    setProjectLookupForTests(null);
    setGooglePublicKeysForTests(null);
    resetEphemeralWorkspacesForTests();
  }

  console.log(`\n======================================================`);
  console.log(`Master Audit Regression Summary: ${passed} passed, ${failed} failed.`);
  console.log(`======================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

void runMasterAuditRegressionTests();
