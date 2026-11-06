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
import { INITIAL_MODELS } from '../src/features/ai/registry';
import { useAIStore, VALID_FLOAT_MODELS } from '../src/store/aiStore';
import { useIDEStore } from '../src/store/index';
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
  check(
    DASHBOARD_MODELS.length === 3 &&
      DASHBOARD_MODELS.some(model => model.id === 'gemini-3.8-flash' && model.providerId === 'google'),
    'DASHBOARD_MODELS exposes GPT-6 Astra, GPT-6.1 Sol, and Gemini 3.8 Flash'
  );
  check(
    VERIFIED_MODELS.length === 3 &&
      VERIFIED_MODELS.some(model => model.id === 'gemini-3.8-flash' && model.providerId === 'google'),
    'VERIFIED_MODELS includes the explicitly supported Gemini 3.8 Flash model'
  );
  check(
    INITIAL_MODELS.length === 3 &&
      VALID_FLOAT_MODELS.length === 3 &&
      INITIAL_MODELS.some(model => model.id === 'gemini-3.8-flash' && model.providerId === 'google'),
    'Client selection exposes the two GPT models and Gemini 3.8 Flash'
  );

  const selectedModels: Array<{ id: string; expectedUpstream: string; expectedProvider: 'openai' | 'google' }> = [
    { id: 'gpt-6-astra', expectedUpstream: 'gpt-6-astra', expectedProvider: 'openai' },
    { id: 'gpt-6.1-sol', expectedUpstream: 'gpt-6.1-sol', expectedProvider: 'openai' },
    { id: 'gemini-3.8-flash', expectedUpstream: 'gemini-3.8-flash', expectedProvider: 'google' }
  ];
  for (const { id, expectedUpstream } of selectedModels) {
    useAIStore.getState().setSelectedModel(id);
    check(useAIStore.getState().selectedModel === id, `useAIStore preserves selected model "${id}"`);
    const vmEntry = VERIFIED_MODELS.find(m => m.id === id);
    const resolved = router.resolveRoute(id);
    check(
      resolved.route.provider === expectedProvider &&
      !resolved.route.isInternalAlias &&
      resolved.route.upstreamModelId === expectedUpstream &&
      vmEntry?.isInternalAlias === false &&
      vmEntry?.upstreamModelId === expectedUpstream,
      `Model "${id}" routes to ${expectedProvider} and preserves its exact selectable upstreamModelId="${expectedUpstream}"`
    );
  }
  let removedModelError: any;
  try { router.resolveRoute('float-basic'); } catch (error) { removedModelError = error; }
  check(removedModelError?.code === 'MODEL_NOT_FOUND', 'Removed FLOAT Basic model is explicitly unavailable');

  // 3. OpenAIAdapter Exact Model Preservation & Explicit Alias Mapping
  console.log('\n--- 3. OpenAIAdapter Upstream Model ID Preservation ---');
  const adapter = new OpenAIAdapter();
  check((adapter as any).resolveApiModel('o1') === 'o1', 'OpenAIAdapter preserves o1 model ID');
  check((adapter as any).resolveApiModel('o3-mini') === 'o3-mini', 'OpenAIAdapter preserves o3-mini model ID');
  check((adapter as any).resolveApiModel('gpt-4o-mini') === 'gpt-4o-mini', 'OpenAIAdapter preserves gpt-4o-mini model ID');
  check((adapter as any).resolveApiModel('float-basic') === 'float-basic', 'OpenAIAdapter does not silently rewrite a removed model ID');
  check((adapter as any).resolveApiModel('gpt-6-astra') === 'gpt-6-astra', 'OpenAIAdapter preserves gpt-6-astra model ID');
  check((adapter as any).resolveApiModel('gpt-6.1-sol') === 'gpt-6.1-sol', 'OpenAIAdapter preserves gpt-6.1-sol model ID');

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

  // 6. Runtime HTTP Smoke Test (Authenticated Chat, SSE, Project Ownership, Validation & Clear Error Reporting)
  console.log('\n--- 6. Runtime HTTP Smoke Test (Express Server + Real Fetch) ---');
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
    resolveModelId: (m: string) => (m === 'auto' ? 'gpt-6-astra' : m),
    validateModelAvailability: () => {},
    resolveRoute: (m: string) => ({
      adapter: {} as any,
      route: { provider: 'openai', apiModelId: m === 'float-basic' ? 'gpt-4o-mini' : m }
    }),
    getAdapterForModel: () => ({
      id: 'openai',
      name: 'OpenAI',
      isConfigured: () => true,
      generateContent: async () => ({
        text: 'Smoke response from gpt-6-astra',
        usage: { inputTokens: 12, outputTokens: 8 }
      }),
      generateContentStream: async (_req: any, onChunk: (d: string) => void) => {
        onChunk('Smoke ');
        onChunk('stream');
        return { text: 'Smoke stream', usage: { inputTokens: 10, outputTokens: 5 } };
      }
    }),
    generateContent: async () => ({
      text: 'Smoke response from gpt-6-astra',
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
        model: 'gpt-6-astra',
        projectId: 'proj-smoke-1',
        messages: [{ role: 'user', content: 'Verify smoke test' }],
        stream: false
      })
    });
    const chatJson: any = await chatRes.json();
    check(
      chatRes.status === 200 && chatJson.text === 'Smoke response from gpt-6-astra' && chatJson.usage?.inputTokens === 12,
      'Runtime smoke: POST /api/ai/chat returns authenticated provider response and usage'
    );

    // C. Authenticated Chat SSE Streaming
    const sseRes = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({
        model: 'gpt-6.1-sol',
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
        conversationId: 'conversation-smoke-1',
        changes: [
          { path: 'src/app.ts', operation: 'modify', proposedContent: 'export const ready = true;\nexport const v = 2;\n' },
          { path: 'src/util.ts', operation: 'create', proposedContent: 'export const util = 1;\n' }
        ],
        virtualFiles: [{ path: 'src/app.ts', content: 'export const ready = true;\n' }]
      })
    });
    const propHttpJson: any = await propHttpRes.json();
    check(
      propHttpRes.status === 201 && propHttpJson.proposal?.changes?.length === 2 && propHttpJson.proposal?.conversationId === 'conversation-smoke-1',
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
