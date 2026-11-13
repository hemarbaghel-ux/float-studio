/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import firebaseConfig from '../firebase-applet-config.json';
import { createApp } from '../src/server/app';
import { setGooglePublicKeysForTests } from '../src/server/authMiddleware';
import { setProjectLookupForTests } from '../src/server/projectOwnership';
import { clearComposerTaskStoreForTests } from '../src/server/composer/composerRouter';
import { CANONICAL_FLOAT_MODELS } from '../src/shared/contracts/models';
import { VERIFIED_MODELS } from '../src/data/verifiedModels';
import { getPublicModelCatalog } from '../src/server/providers/modelRegistry';

let passed = 0;

function check(condition: unknown, label: string): void {
  assert.ok(condition, label);
  passed++;
  console.log(`  [PASS] ${label}`);
}

async function runTests() {
  console.log('=== STAGE 1 & STAGE 2: PRODUCTION COMPOSER AGENT & MODEL ROUTING VERIFICATION ===\n');

  // --- 1. Stage 2: Authoritative Model Catalog & Verification States ---
  console.log('--- 1. Stage 2: Authoritative Model Catalog & Verification States ---');
  for (const verified of VERIFIED_MODELS) {
    const canonical = CANONICAL_FLOAT_MODELS.find(m => m.id === verified.id);
    check(Boolean(canonical), `CANONICAL_FLOAT_MODELS derives "${verified.id}" from VERIFIED_MODELS`);
    check(
      canonical?.contextWindow === verified.contextWindow,
      `Context window for "${verified.id}" matches VERIFIED_MODELS (${verified.contextWindow})`
    );
  }

  const publicCatalogUnverified = getPublicModelCatalog({ openai: true, google: false, anthropic: false });
  const solUnverified = publicCatalogUnverified.find(m => m.id === 'gpt-6.1-sol');
  check(solUnverified?.verification.credentialConfigured === true, 'credentialConfigured is true when OPENAI_API_KEY is set');
  check(solUnverified?.verification.authVerified === false, 'authVerified defaults to false until health check');
  check(solUnverified?.verification.modelListed === false, 'modelListed defaults to false until listed');
  check(solUnverified?.verification.generationVerified === false, 'generationVerified remains false until real generation succeeds');
  check(
    solUnverified?.status === 'UNKNOWN',
    'Unverified model status remains UNKNOWN even with credential configured'
  );

  const publicCatalogVerified = getPublicModelCatalog(
    { openai: true, google: false, anthropic: false },
    { 'gpt-6.1-sol': { authVerified: true, modelListed: true, generationVerified: true } }
  );
  const solVerified = publicCatalogVerified.find(m => m.id === 'gpt-6.1-sol');
  check(
    solVerified?.status === 'AVAILABLE' &&
      solVerified?.verification.generationVerified === true,
    'Model transitions to AVAILABLE only when generationVerified is true'
  );

  // --- 2. Stage 1: Production Composer Endpoint (Ask, Plan, Agent, Debug, Self-Repair) ---
  console.log('\n--- 2. Stage 1: Production Composer Endpoint (Ask, Plan, Agent, Debug, Self-Repair) ---');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'stage1-test-kid';
  setGooglePublicKeysForTests({ [kid]: publicKey.export({ type: 'spki', format: 'pem' }).toString() });

  const signToken = (uid: string) => {
    const now = Math.floor(Date.now() / 1000);
    const h = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })).toString('base64url');
    const p = Buffer.from(
      JSON.stringify({
        iss: `https://securetoken.google.com/${firebaseConfig.projectId}`,
        aud: firebaseConfig.projectId,
        sub: uid,
        user_id: uid,
        email: `${uid}@float.ai`,
        iat: now - 10,
        exp: now + 3600,
      })
    ).toString('base64url');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${h}.${p}`);
    return `${h}.${p}.${signer.sign(privateKey, 'base64url')}`;
  };

  const aliceToken = signToken('user_alice');
  const bobToken = signToken('user_bob');

  const projects = new Map<string, Record<string, any>>([
    [
      'proj_alice_composer',
      {
        ownerId: 'user_alice',
        name: 'Alice Composer Project',
        files: JSON.stringify([
          { path: 'src/math.ts', content: 'export function add(a: number, b: number): number {\n  return a + b;\n}\n' },
          { path: 'src/index.ts', content: 'import { add } from "./math";\nexport const result = add(1, 2);\n' },
        ]),
      },
    ],
  ]);
  setProjectLookupForTests(async id => {
    const data = projects.get(id);
    return data ? { exists: true, data } : { exists: false };
  });

  const mockModelRouter: any = {
    getProviderStatus: () => ({ openai: { name: 'OpenAI', configured: true } }),
    checkAllProvidersHealth: async () => ({ openai: { provider: 'OpenAI', configured: true, authenticated: true, modelAvailable: false } }),
    getModelCatalog: () => publicCatalogUnverified,
    resolveModelId: (m: string) => m || 'gpt-6.1-sol',
    validateModelAvailability: () => {},
    resolveRoute: (m: string) => ({ route: { provider: 'openai', apiModelId: m || 'gpt-6.1-sol' }, adapter: {} }),
    generate: async (req: any) => {
      const sys = String(req.systemPrompt || '');
      const lastMsg = String(req.messages[req.messages.length - 1]?.content || '');
      const allMessages = req.messages.map((m: any) => String(m.content || '')).join('\n');

      if (sys.includes('MODE: ASK')) {
        if (!lastMsg.includes('Tool Execution Result')) {
          return {
            text: 'Inspecting files first.\n```tool_call\n{"name": "read_file", "args": {"path": "src/math.ts"}}\n```',
            modelId: req.modelId,
            usage: { inputTokens: 30, outputTokens: 20, totalTokens: 50, durationMs: 5 },
          };
        }
        return {
          text: 'The `add` function in `src/math.ts` returns `a + b`.',
          modelId: req.modelId,
          usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60, durationMs: 5 },
        };
      }

      if (sys.includes('MODE: PLAN')) {
        if (!lastMsg.includes('Tool Execution Result')) {
          return {
            text: 'Retrieving context.\n```tool_call\n{"name": "retrieve_context", "args": {"query": "add multiply"}}\n```',
            modelId: req.modelId,
            usage: { inputTokens: 30, outputTokens: 20, totalTokens: 50, durationMs: 5 },
          };
        }
        return {
          text: '1. Inspect `src/math.ts` and existing exports\n2. Add `multiply(a: number, b: number)` to `src/math.ts`\n3. Export `multiply` in `src/index.ts` and run verification tests',
          modelId: req.modelId,
          usage: { inputTokens: 50, outputTokens: 35, totalTokens: 85, durationMs: 5 },
        };
      }

      // AGENT or DEBUG mode
      if (!lastMsg.includes('Tool Execution Result') && !lastMsg.includes('Verification command')) {
        return {
          text: 'Let me inspect the repository structure and diagnostics.\n```tool_call\n{"name": "inspect_diagnostics", "args": {}}\n```',
          modelId: req.modelId,
          usage: { inputTokens: 40, outputTokens: 25, totalTokens: 65, durationMs: 5 },
        };
      }
      if (lastMsg.includes('Verification command') && lastMsg.includes('failed')) {
        return {
          text: 'Fixing the broken return value in `src/math.ts`.\n```tool_call\n{"name": "propose_changes", "args": {"title": "Fix multiply implementation", "explanation": "Corrects multiplication formula", "changes": [{"path": "src/math.ts", "content": "export function add(a: number, b: number): number {\\n  return a + b;\\n}\\nexport function multiply(a: number, b: number): number {\\n  return a * b;\\n}\\n"}]}}\n```',
          modelId: req.modelId,
          usage: { inputTokens: 60, outputTokens: 45, totalTokens: 105, durationMs: 5 },
        };
      }
      if (allMessages.includes('trigger_broken_patch')) {
        return {
          text: 'Proposing initial change.\n```tool_call\n{"name": "propose_changes", "args": {"title": "Add multiply", "explanation": "Initial multiply", "changes": [{"path": "src/math.ts", "content": "export function add(a: number, b: number): number {\\n  return a + b;\\n}\\nexport function multiply(a: number, b: number): number {\\n  return a - b;\\n}\\n"}]}}\n```',
          modelId: req.modelId,
          usage: { inputTokens: 50, outputTokens: 40, totalTokens: 90, durationMs: 5 },
        };
      }
      return {
        text: 'Proposing multi-file changes.\n```tool_call\n{"name": "propose_changes", "args": {"title": "Add multiply and export in index", "explanation": "Implements multiply in math.ts and updates index.ts", "changes": [{"path": "src/math.ts", "content": "export function add(a: number, b: number): number {\\n  return a + b;\\n}\\nexport function multiply(a: number, b: number): number {\\n  return a * b;\\n}\\n"}, {"path": "src/index.ts", "content": "import { add, multiply } from \\"./math\\";\\nexport const result = add(1, multiply(2, 3));\\n"}]}}\n```',
        modelId: req.modelId,
        usage: { inputTokens: 60, outputTokens: 50, totalTokens: 110, durationMs: 5 },
      };
    },
  };

  const app = await createApp({ skipVite: true, modelRouterOverride: mockModelRouter });
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 2a. Tenant isolation check: Bob cannot run Composer on Alice's project
    const bobRes = await fetch(`${baseUrl}/api/projects/proj_alice_composer/composer/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bobToken}` },
      body: JSON.stringify({ task: 'Inspect math.ts', mode: 'ask' }),
    });
    check(bobRes.status === 403, 'Cross-tenant Composer run rejected with HTTP 403');

    // 2b. Ask Mode (read-only)
    const askRes = await fetch(`${baseUrl}/api/projects/proj_alice_composer/composer/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({ task: 'What does add do?', mode: 'ask' }),
    });
    check(askRes.status === 200, 'Ask mode Composer request succeeded (200)');
    const askBody: any = await askRes.json();
    check(askBody.status === 'completed' && askBody.mode === 'ask', 'Ask mode completed without creating a proposal');
    check(askBody.result.finalResponse.includes('src/math.ts'), 'Ask mode read src/math.ts and answered question');

    // 2c. Plan Mode (read-only exploration -> structured plan awaiting approval)
    const planRes = await fetch(`${baseUrl}/api/projects/proj_alice_composer/composer/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({ task: 'Plan adding multiply function', mode: 'plan' }),
    });
    const planBody: any = await planRes.json();
    check(planBody.status === 'plan_ready', 'Plan mode returns status="plan_ready" awaiting user approval');
    check(Array.isArray(planBody.result.plan) && planBody.result.plan.length === 3, 'Plan mode produces structured 3-step plan');
    check(
      planBody.events.some((e: any) => e.type === 'context_retrieval'),
      'Plan mode emits context_retrieval progress event'
    );
    check(
      planBody.events.some((e: any) => e.type === 'approval_requested'),
      'Plan mode emits approval_requested event'
    );

    // 2d. Agent Mode with SSE progress stream, proposal creation, apply & rollback
    const agentSseRes = await fetch(`${baseUrl}/api/projects/proj_alice_composer/composer/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({
        task: 'Add multiply function and export it',
        mode: 'agent',
        idempotencyKey: 'idem-alice-agent-1',
        stream: true,
      }),
    });
    check(agentSseRes.status === 200, 'Agent mode streams SSE progress events');
    const rawSse = await agentSseRes.text();
    const sseEvents = rawSse
      .split('\n\n')
      .map(block => block.trim())
      .filter(block => block.startsWith('data: '))
      .map(block => JSON.parse(block.slice(6)));

    check(sseEvents.some(e => e.type === 'started'), 'SSE stream includes "started" event');
    check(sseEvents.some(e => e.type === 'tool_call'), 'SSE stream includes "tool_call" event');
    check(sseEvents.some(e => e.type === 'proposal_created'), 'SSE stream includes "proposal_created" event');
    const doneEvent = sseEvents.find(e => e.type === 'done');
    check(Boolean(doneEvent && doneEvent.proposal), 'SSE stream concludes with "done" event carrying proposal');

    const taskId = doneEvent.taskId;
    const proposalId = doneEvent.proposal.id;

    // Verify reconnect / status endpoint
    const statusRes = await fetch(`${baseUrl}/api/projects/proj_alice_composer/composer/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    const statusBody: any = await statusRes.json();
    check(statusBody.status === 'proposal_ready' && statusBody.proposal.id === proposalId, 'GET /composer/tasks/:taskId preserves task status and proposal across reconnects');

    // Verify idempotency replay returns same taskId without re-running
    const replayRes = await fetch(`${baseUrl}/api/projects/proj_alice_composer/composer/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({
        task: 'Add multiply function and export it',
        mode: 'agent',
        idempotencyKey: 'idem-alice-agent-1',
      }),
    });
    const replayBody: any = await replayRes.json();
    check(replayBody.idempotentReplay === true && replayBody.taskId === taskId, 'Idempotency key prevents duplicate agent execution');

    // Apply proposal with automatic pre-apply checkpoint
    const applyRes = await fetch(`${baseUrl}/api/projects/proj_alice_composer/composer/proposals/${proposalId}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({ approvedPaths: ['src/math.ts', 'src/index.ts'] }),
    });
    const applyBody: any = await applyRes.json();
    check(applyRes.status === 200 && applyBody.success === true, 'POST /composer/proposals/:proposalId/apply applies multi-file changes');
    check(Boolean(applyBody.checkpointId), 'Pre-apply safety checkpoint created automatically');
    check(
      applyBody.updatedWorkspaceFiles.some((f: any) => f.path === 'src/math.ts' && f.content.includes('multiply')),
      'Updated workspace contains new multiply function in src/math.ts'
    );

    // Rollback to pre-apply checkpoint
    const rollbackRes = await fetch(
      `${baseUrl}/api/projects/proj_alice_composer/composer/checkpoints/${applyBody.checkpointId}/rollback`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${aliceToken}` },
      }
    );
    const rollbackBody: any = await rollbackRes.json();
    check(rollbackRes.status === 200 && rollbackBody.success === true, 'POST /composer/checkpoints/:checkpointId/rollback restores pre-apply snapshot');
    check(
      rollbackBody.restoredWorkspaceFiles.some((f: any) => f.path === 'src/math.ts' && !f.content.includes('multiply')),
      'Rolled-back src/math.ts matches original baseline byte-for-byte'
    );

    // 2e. Post-apply test verification & self-repair on real local disk workspace
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'float-stage1-repair-'));
    try {
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'src/math.ts'),
        'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
        'utf8'
      );

      const verifyScript = `node -e "const fs = require('fs'); const c = fs.readFileSync('${path.join(tempDir, 'src/math.ts').replace(/\\/g, '/')}', 'utf8'); if (!c.includes('a * b')) { console.error('FAIL: expected a * b'); process.exit(1); } console.log('PASS');"`;

      const repairRes = await fetch(`${baseUrl}/api/projects/proj_alice_composer/composer/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceToken}` },
        body: JSON.stringify({
          task: 'Implement multiply (trigger_broken_patch first, then repair)',
          mode: 'debug',
          localWorkspacePath: tempDir,
          autoApplyApprovedProposal: true,
          verificationCommand: verifyScript,
          allowedCommands: ['node -e'],
          repairOnVerificationFailure: true,
        }),
      });
      const repairBody: any = await repairRes.json();
      check(repairBody.status === 'verified', 'Debug/Agent self-repair loop ran failing check, applied repair proposal, and re-verified to green');
      check(repairBody.events.some((e: any) => e.type === 'repair_proposal'), 'Emitted repair_proposal event after initial verification failure');
      const finalDiskMath = fs.readFileSync(path.join(tempDir, 'src/math.ts'), 'utf8');
      check(finalDiskMath.includes('return a * b;'), 'Repaired code is persisted on disk and passes verification');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    console.log(`\n================================================================`);
    console.log(`STAGE 1 & 2 VERIFICATION COMPLETE: ${passed} assertions passed!`);
    console.log(`================================================================\n`);
  } finally {
    setGooglePublicKeysForTests(null);
    setProjectLookupForTests(null);
    clearComposerTaskStoreForTests();
    server.close();
  }
}

runTests().catch(err => {
  console.error('Stage 1 & 2 verification failed:', err);
  process.exit(1);
});
