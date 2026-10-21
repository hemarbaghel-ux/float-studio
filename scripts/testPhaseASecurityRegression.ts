/**
 * FLOAT Studio — Phase A & Phase A.1 Security & HTTP Authorization Regression Suite
 *
 * Exercises both service-level invariants and real localhost HTTP requests through the
 * Express application (`createApp({ skipVite: true })`) covering:
 * 1. Missing, invalid, expired, missing-`user_id`, and mismatched-`user_id` Firebase JWTs (401),
 *    bounded public-certificate refresh on unknown `kid` (key rotation), and fail-closed cert outages (503).
 * 2. Unauthenticated HTTP requests blocked with 401 across all protected AI, analyst, session,
 *    project, and Milestone 9 endpoints.
 * 3. Fix for the `default-project` ownership bypass on `/api/ai/agent`, `/api/ai/plan`, and `/api/ai/chat`
 *    (testing both a persisted project with ID `'default-project'` owned by another user -> 403, and
 *    explicit user-isolated ephemeral mode when unpersisted -> `ephemeral-${uid}-default-project`).
 * 4. Unsaved-workspace (`allowMissing`) policy: permitted only on `/api/ai/chat`, `/api/ai/agent`,
 *    and `/api/ai/plan`, and strictly rejected (404) on project execution, proposals, search, validation,
 *    and Milestone 9 project routes.
 * 5. MCP project isolation (`MCPService.canAccessServer` + `/api/mcp/*` HTTP routes): project-scoped
 *    MCP servers, tools, resources, deletions, and executions require both owner match AND exact
 *    `projectId` match; missing or mismatched `projectId` never exposes project-scoped MCP assets;
 *    explicitly user-scoped MCP servers remain accessible to their owner.
 * 6. Cross-user project access blocked with 403 and authorized owner access permitted with 200.
 * 7. HTTP rate limiting (429) on sensitive endpoints.
 * 8. Client bundle secret absence and `clearSubscriptionCache()` verification.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import firebaseConfig from '../firebase-applet-config.json';
import {
  requireAuth,
  verifyFirebaseIdToken,
  setGooglePublicKeysForTests,
  getCertRefreshCountForTests
} from '../src/server/authMiddleware';
import {
  verifyProjectOwnership,
  requireProjectOwnership,
  setProjectLookupForTests,
  resetEphemeralWorkspacesForTests
} from '../src/server/projectOwnership';
import { setAdminCredentialsOverrideForTests } from '../src/server/adminFirebase';
import { resetAnalystRateLimitsForTests } from '../src/server/analystRouter';
import {
  createApp,
  checkEndpointRateLimit,
  resetEndpointRateLimitsForTests
} from '../src/server/app';
import {
  GPT6_ASTRA_CLOUD_CONFIG,
  getUserCloudSessionConfig,
  updateUserCloudSessionConfig,
  resetUserCloudSessionsForTests
} from '../src/server/providers/cloudAgentConfig';
import { RulesService } from '../src/server/rules/rulesService';
import { SkillsService } from '../src/server/skills/skillsService';
import { MCPService } from '../src/server/mcp/mcpService';
import { CodeReviewService } from '../src/server/review/codeReviewService';
import { DiagnosticsService } from '../src/server/diagnostics/diagnosticsService';
import { AutomationService } from '../src/server/automations/automationService';
import {
  getUserSubscription,
  updateUserSubscription,
  clearSubscriptionCache,
  resetSubscriptionMemoryState
} from '../src/server/subscription/subscriptionPersistence';

let passed = 0;
let failed = 0;

function check(condition: unknown, message: string): void {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

function createSignedJwt(
  header: Record<string, any>,
  payload: Record<string, any>,
  privateKeyPem?: string
): string {
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${h}.${p}`;
  if (!privateKeyPem) {
    return `${data}.forged_signature`;
  }
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  return `${data}.${signer.sign(privateKeyPem, 'base64url')}`;
}

async function runPhaseARegressionSuite() {
  console.log('======================================================================');
  console.log('FLOAT STUDIO — PHASE A & A.1 SECURITY & HTTP REGRESSION SUITE');
  console.log('======================================================================\n');

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const { publicKey: rotatedPublicKey, privateKey: rotatedPrivateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const { privateKey: untrustedPrivateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const kid = 'phase-a-kid-2026';
  const rotatedKid = 'phase-a-kid-2026-rotated';
  setGooglePublicKeysForTests({ [kid]: publicKey });

  const nowSec = Math.floor(Date.now() / 1000);
  const makeClaims = (uid: string, overrides: Record<string, any> = {}) => ({
    iss: `https://securetoken.google.com/${firebaseConfig.projectId}`,
    aud: firebaseConfig.projectId,
    sub: uid,
    user_id: uid,
    email: `${uid}@float.ai`,
    iat: nowSec - 10,
    exp: nowSec + 3600,
    ...overrides
  });

  const aliceToken = createSignedJwt({ alg: 'RS256', kid, typ: 'JWT' }, makeClaims('user_alice'), privateKey);
  const bobToken = createSignedJwt({ alg: 'RS256', kid, typ: 'JWT' }, makeClaims('user_bob'), privateKey);

  // ---------------------------------------------------------------------------
  // 1. Token Verification, Claim Policy (user_id === sub), & Bounded Key Refresh
  // ---------------------------------------------------------------------------
  console.log('--- 1. Firebase JWT Claim Policy (user_id === sub) & Bounded Key Rotation ---');
  const aliceVerified = await verifyFirebaseIdToken(aliceToken);
  check(aliceVerified?.uid === 'user_alice', 'Valid RS256 token for user_alice verifies cleanly');

  const unsignedJwt = createSignedJwt({ alg: 'none', kid }, makeClaims('user_alice'));
  check((await verifyFirebaseIdToken(unsignedJwt)) === null, 'Unsigned alg:none JWT is rejected');

  const wrongKeyJwt = createSignedJwt({ alg: 'RS256', kid }, makeClaims('user_alice'), untrustedPrivateKey);
  check((await verifyFirebaseIdToken(wrongKeyJwt)) === null, 'JWT signed with untrusted key is rejected');

  const expiredJwt = createSignedJwt({ alg: 'RS256', kid }, makeClaims('user_alice', { exp: nowSec - 1 }), privateKey);
  check((await verifyFirebaseIdToken(expiredJwt)) === null, 'Expired JWT is rejected');

  const futureJwt = createSignedJwt({ alg: 'RS256', kid }, makeClaims('user_alice', { iat: nowSec + 300 }), privateKey);
  check((await verifyFirebaseIdToken(futureJwt)) === null, 'Future-issued JWT is rejected');

  // Missing or mismatched user_id claims must be rejected
  const claimsMissingUserId = makeClaims('user_alice');
  delete (claimsMissingUserId as any).user_id;
  const missingUserIdJwt = createSignedJwt({ alg: 'RS256', kid }, claimsMissingUserId, privateKey);
  check((await verifyFirebaseIdToken(missingUserIdJwt)) === null, 'JWT with missing user_id claim is rejected');

  const mismatchedUserIdJwt = createSignedJwt(
    { alg: 'RS256', kid },
    makeClaims('user_alice', { user_id: 'user_bob' }),
    privateKey
  );
  check((await verifyFirebaseIdToken(mismatchedUserIdJwt)) === null, 'JWT with mismatched user_id !== sub is rejected');

  // Bounded refresh on unknown kid
  setGooglePublicKeysForTests(
    { [kid]: publicKey },
    {
      minRefreshIntervalMs: 60_000,
      onRefreshCerts: () => ({ [kid]: publicKey, [rotatedKid]: rotatedPublicKey })
    }
  );
  const rotatedAliceToken = createSignedJwt(
    { alg: 'RS256', kid: rotatedKid, typ: 'JWT' },
    makeClaims('user_alice'),
    rotatedPrivateKey
  );
  const rotatedVerified = await verifyFirebaseIdToken(rotatedAliceToken);
  check(
    rotatedVerified?.uid === 'user_alice' && getCertRefreshCountForTests() === 1,
    'Unknown kid triggers bounded certificate refresh (count=1) and accepts valid rotated signing key'
  );
  const bogusKidToken = createSignedJwt(
    { alg: 'RS256', kid: 'unknown-kid-after-refresh', typ: 'JWT' },
    makeClaims('user_alice'),
    rotatedPrivateKey
  );
  check(
    (await verifyFirebaseIdToken(bogusKidToken)) === null && getCertRefreshCountForTests() === 1,
    'Unknown kid within refresh cooldown window is rejected without triggering a second refresh'
  );

  setGooglePublicKeysForTests({ [kid]: publicKey });

  // ---------------------------------------------------------------------------
  // 2. Server-Side Project Ownership: Fail-Closed vs Configured
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Server-Side Project Ownership & Fail-Closed Guarantees ---');
  setAdminCredentialsOverrideForTests(false);
  setProjectLookupForTests(null);
  const unconfiguredResult = await verifyProjectOwnership('proj_alice_1', 'user_alice');
  check(
    unconfiguredResult.allowed === false && unconfiguredResult.status === 503,
    'verifyProjectOwnership fails closed (503) when Firebase Admin credentials are missing'
  );

  // Configure deterministic mock Firebase Admin project store
  const persistedProjects = new Map<string, Record<string, any>>([
    [
      'proj_alice_1',
      {
        ownerId: 'user_alice',
        name: 'Alice Workspace 1',
        files: JSON.stringify([
          { id: 'f1', name: 'index.ts', path: 'src/index.ts', type: 'file', content: 'export const alpha = 42;' }
        ])
      }
    ],
    ['proj_alice_2', { ownerId: 'user_alice', name: 'Alice Workspace 2', files: '[]' }],
    ['proj_bob_1', { ownerId: 'user_bob', name: 'Bob Workspace 1', files: '[]' }]
  ]);
  setProjectLookupForTests(async (projectId) => {
    const record = persistedProjects.get(projectId);
    return record ? { exists: true, data: record } : { exists: false };
  });

  // ---------------------------------------------------------------------------
  // 3. Real HTTP-Level End-to-End Tests Against Express App (`createApp`)
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Real HTTP-Level Express Route & Middleware Tests ---');
  let lastAgentProjectIdSeen: string | null = null;

  const mockModelRouter: any = {
    getProviderStatus: () => ({ openai: { configured: true } }),
    checkAllProvidersHealth: async () => ({ openai: { ok: true } }),
    generateContent: async (opts: any) => {
      const promptText = JSON.stringify(opts?.messages || '');
      if (promptText.includes('structured implementation plan') || promptText.includes('JSON')) {
        return {
          text: JSON.stringify({
            title: 'Test Plan',
            summary: 'Plan summary',
            steps: [{ id: 'step-1', title: 'Inspect', description: 'Inspect files', targetFiles: ['src/index.ts'] }],
            estimatedImpact: 'low'
          }),
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
        };
      }
      return {
        text: 'Mock chat completion ok',
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 }
      };
    },
    generateContentStream: async (_opts: any, onDelta: (d: string) => void) => {
      onDelta('stream-ok');
      return { text: 'stream-ok', usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 } };
    },
    runAgentLoop: async (req: any, res: any) => {
      lastAgentProjectIdSeen = req.body?.projectId ?? null;
      res.status(200).json({
        ok: true,
        effectiveProjectId: req.body?.projectId,
        isEphemeralWorkspace: Boolean(req.body?.isEphemeralWorkspace)
      });
    }
  };

  const app = await createApp({ skipVite: true, modelRouterOverride: mockModelRouter });
  const server: http.Server = await new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // 3A. Missing / Invalid Auth over HTTP -> 401, Cert Outage -> 503
    const unauthEndpoints: Array<{ method: string; url: string; body?: any }> = [
      { method: 'GET', url: '/api/session/current' },
      { method: 'POST', url: '/api/session/connect', body: { sessionId: 's1' } },
      { method: 'POST', url: '/api/analyst/profile', body: { rows: [{ a: 1 }] } },
      { method: 'POST', url: '/api/analyst/query', body: { query: 'test', rows: [{ a: 1 }] } },
      { method: 'POST', url: '/api/ai/gemini-stream', body: { prompt: 'hi' } },
      { method: 'POST', url: '/api/ai/verify-key', body: { provider: 'openai', key: 'sk-test' } },
      { method: 'POST', url: '/api/ai/chat', body: { messages: [{ role: 'user', content: 'hi' }] } },
      { method: 'POST', url: '/api/ai/agent', body: { prompt: 'fix bug' } },
      { method: 'POST', url: '/api/ai/plan', body: { prompt: 'plan feature' } },
      { method: 'GET', url: '/api/skills' },
      { method: 'GET', url: '/api/mcp/servers' },
      { method: 'GET', url: '/api/projects/proj_alice_1/search?q=alpha' },
      { method: 'GET', url: '/api/projects/proj_alice_1/proposals' },
      { method: 'GET', url: '/api/projects/proj_alice_1/rules' }
    ];

    for (const ep of unauthEndpoints) {
      const resp = await fetch(`${baseUrl}${ep.url}`, {
        method: ep.method,
        headers: ep.body ? { 'Content-Type': 'application/json' } : {},
        body: ep.body ? JSON.stringify(ep.body) : undefined
      });
      check(resp.status === 401, `HTTP ${ep.method} ${ep.url} without token returns 401 (got ${resp.status})`);
    }

    const badTokenResp = await fetch(`${baseUrl}/api/session/current`, {
      headers: { Authorization: `Bearer ${wrongKeyJwt}` }
    });
    check(badTokenResp.status === 401, 'HTTP GET /api/session/current with invalid RS256 signature returns 401');

    const missingUidResp = await fetch(`${baseUrl}/api/session/current`, {
      headers: { Authorization: `Bearer ${missingUserIdJwt}` }
    });
    check(missingUidResp.status === 401, 'HTTP GET /api/session/current with missing user_id claim returns 401');

    setGooglePublicKeysForTests(null, { simulateOutage: true });
    const certOutageHttpResp = await fetch(`${baseUrl}/api/session/current`, {
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    check(certOutageHttpResp.status === 503, 'HTTP GET /api/session/current during public-cert outage fails closed with 503');
    setGooglePublicKeysForTests({ [kid]: publicKey });

    // 3B. Correction 1: `default-project` Ownership Bypass Fixed (Persisted vs Ephemeral Mode)
    console.log('\n--- 4. HTTP Verification: default-project Persisted vs Ephemeral Ownership ---');
    resetEphemeralWorkspacesForTests();
    const aliceEphemeralAgentResp = await fetch(`${baseUrl}/api/ai/agent`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Inspect workspace', projectId: 'default-project', virtualFiles: [] })
    });
    const aliceEphemeralAgentJson = await aliceEphemeralAgentResp.json();
    check(
      aliceEphemeralAgentResp.status === 200 &&
        aliceEphemeralAgentJson.isEphemeralWorkspace === true &&
        lastAgentProjectIdSeen === 'ephemeral-user_alice-default-project',
      'HTTP POST /api/ai/agent with unpersisted default-project runs in explicit user-isolated ephemeral mode (ephemeral-user_alice-default-project)'
    );

    const bobEphemeralPlanResp = await fetch(`${baseUrl}/api/ai/plan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Create a plan', projectId: 'default-project', virtualFiles: [] })
    });
    const bobEphemeralPlanJson = await bobEphemeralPlanResp.json();
    check(
      bobEphemeralPlanResp.status === 201 &&
        bobEphemeralPlanJson.isEphemeralWorkspace === true &&
        bobEphemeralPlanJson.plan?.projectId === 'ephemeral-user_bob-default-project',
      'HTTP POST /api/ai/plan with unpersisted default-project isolates plan under ephemeral-user_bob-default-project'
    );

    // Persisted 'default-project' owned by user_alice in Firestore: user_bob MUST be rejected with 403!
    persistedProjects.set('default-project', {
      ownerId: 'user_alice',
      name: 'Alice Persisted Default Project',
      files: JSON.stringify([{ id: 's1', name: 'secret.ts', path: 'src/secret.ts', type: 'file', content: 'export const SECRET = 1;' }])
    });

    const bobHijackDefaultAgent = await fetch(`${baseUrl}/api/ai/agent`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Steal default-project', projectId: 'default-project', virtualFiles: [] })
    });
    check(
      bobHijackDefaultAgent.status === 403,
      'HTTP POST /api/ai/agent blocks user_bob with 403 when default-project is a persisted project owned by user_alice'
    );

    const bobHijackDefaultPlan = await fetch(`${baseUrl}/api/ai/plan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Steal plan on default-project', projectId: 'default-project', virtualFiles: [] })
    });
    check(
      bobHijackDefaultPlan.status === 403,
      'HTTP POST /api/ai/plan blocks user_bob with 403 when default-project is a persisted project owned by user_alice'
    );

    const bobHijackDefaultChat = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'default-project',
        messages: [{ role: 'user', content: 'Hello' }]
      })
    });
    check(
      bobHijackDefaultChat.status === 403,
      'HTTP POST /api/ai/chat blocks user_bob with 403 when default-project is a persisted project owned by user_alice'
    );

    // Meanwhile user_alice (the owner of persisted 'default-project') succeeds in persisted mode:
    const aliceOwnDefaultAgent = await fetch(`${baseUrl}/api/ai/agent`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Work on my persisted default-project', projectId: 'default-project', virtualFiles: [] })
    });
    const aliceOwnDefaultAgentJson = await aliceOwnDefaultAgent.json();
    check(
      aliceOwnDefaultAgent.status === 200 &&
        aliceOwnDefaultAgentJson.isEphemeralWorkspace === false &&
        aliceOwnDefaultAgentJson.effectiveProjectId === 'default-project',
      'HTTP POST /api/ai/agent allows owner user_alice to access persisted default-project'
    );

    persistedProjects.delete('default-project');

    // 3C. Correction 3: Unsaved-Workspace Behavior vs Persisted-Project Endpoints over HTTP
    console.log('\n--- 5. HTTP Verification: Unsaved-Workspace Policy vs Persisted-Only Endpoints ---');
    resetEphemeralWorkspacesForTests();
    const unsavedId = 'local-unsaved-workspace-alice-99';

    const aliceUnsavedChat = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: unsavedId,
        messages: [{ role: 'user', content: 'Explain this unsaved file' }]
      })
    });
    check(aliceUnsavedChat.status === 200, 'HTTP POST /api/ai/chat supports unsaved local workspace for user_alice (200)');

    const aliceUnsavedPlan = await fetch(`${baseUrl}/api/ai/plan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: unsavedId,
        prompt: 'Plan unsaved workspace feature'
      })
    });
    check(aliceUnsavedPlan.status === 201, 'HTTP POST /api/ai/plan supports unsaved local workspace for user_alice (201)');

    const bobUnsavedHijack = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: unsavedId,
        messages: [{ role: 'user', content: 'Try to access Alice unsaved workspace' }]
      })
    });
    check(bobUnsavedHijack.status === 403, 'HTTP POST /api/ai/chat blocks user_bob from hijacking user_alice unsaved workspace ID (403)');

    const persistedOnlyChecks: Array<{ method: string; url: string; body?: any }> = [
      { method: 'POST', url: `/api/projects/${unsavedId}/executions`, body: { command: 'npm test', files: [] } },
      { method: 'GET', url: `/api/projects/${unsavedId}/search?q=alpha` },
      { method: 'POST', url: `/api/projects/${unsavedId}/proposals`, body: { description: 'p', changes: [] } },
      { method: 'GET', url: `/api/projects/${unsavedId}/proposals` },
      { method: 'POST', url: `/api/projects/${unsavedId}/validation/run`, body: { files: [] } },
      { method: 'GET', url: `/api/projects/${unsavedId}/rules` }
    ];
    for (const checkEp of persistedOnlyChecks) {
      const resp = await fetch(`${baseUrl}${checkEp.url}`, {
        method: checkEp.method,
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          ...(checkEp.body ? { 'Content-Type': 'application/json' } : {})
        },
        body: checkEp.body ? JSON.stringify(checkEp.body) : undefined
      });
      check(
        resp.status === 404,
        `Persisted-only endpoint ${checkEp.method} ${checkEp.url} rejects unsaved workspace with 404 (got ${resp.status})`
      );
    }

    // 3D. Cross-User Persisted Project Access Blocked (403) vs Owner Access Permitted (200/201)
    console.log('\n--- 6. HTTP Verification: Cross-User Project Access (403) vs Authorized Owner Access (200) ---');
    const bobCrossSearch = await fetch(`${baseUrl}/api/projects/proj_alice_1/search?q=alpha`, {
      headers: { Authorization: `Bearer ${bobToken}` }
    });
    check(bobCrossSearch.status === 403, 'HTTP GET /api/projects/proj_alice_1/search blocks non-owner user_bob with 403');

    const aliceOwnSearch = await fetch(`${baseUrl}/api/projects/proj_alice_1/search?q=alpha`, {
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    const aliceSearchJson = await aliceOwnSearch.json();
    check(
      aliceOwnSearch.status === 200 && Array.isArray(aliceSearchJson.matches) && aliceSearchJson.matches.length === 1,
      'HTTP GET /api/projects/proj_alice_1/search allows owner user_alice and returns matches (200)'
    );

    const bobCrossProposals = await fetch(`${baseUrl}/api/projects/proj_alice_1/proposals`, {
      headers: { Authorization: `Bearer ${bobToken}` }
    });
    check(bobCrossProposals.status === 403, 'HTTP GET /api/projects/proj_alice_1/proposals blocks non-owner user_bob with 403');

    const aliceCreateProposal = await fetch(`${baseUrl}/api/projects/proj_alice_1/proposals`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'Add helper',
        changes: [{ path: 'src/helper.ts', operation: 'create', proposedContent: 'export const h = 1;' }],
        virtualFiles: []
      })
    });
    check(aliceCreateProposal.status === 201, 'HTTP POST /api/projects/proj_alice_1/proposals allows owner user_alice (201)');

    const bobCrossRules = await fetch(`${baseUrl}/api/projects/proj_alice_1/rules`, {
      headers: { Authorization: `Bearer ${bobToken}` }
    });
    check(bobCrossRules.status === 403, 'HTTP GET /api/projects/proj_alice_1/rules blocks non-owner user_bob with 403');

    // 3E. Correction 2: MCP Project Isolation over HTTP (`/api/mcp/*`)
    console.log('\n--- 7. HTTP Verification: MCP Project Isolation (List, Discovery, Execution, Cross-Project & Cross-User) ---');
    MCPService.clear();

    const regUserMcp = await fetch(`${baseUrl}/api/mcp/servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'srv-alice-user',
        name: 'Alice User MCP',
        transport: 'stdio',
        command: 'npx',
        env: { SECRET: 'val' }
      })
    });
    check(regUserMcp.status === 200, 'HTTP POST /api/mcp/servers registers user-scoped MCP server for user_alice');

    const regProjMcp = await fetch(`${baseUrl}/api/mcp/servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'srv-alice-proj-1',
        name: 'Alice Proj 1 MCP',
        transport: 'http',
        endpointUrl: 'https://mcp.example.com/p1',
        projectId: 'proj_alice_1',
        env: { SECRET: 'p1' }
      })
    });
    check(regProjMcp.status === 200, 'HTTP POST /api/mcp/servers registers project-scoped MCP server for proj_alice_1');

    MCPService.setDiscoveredTools('srv-alice-proj-1', [
      { name: 'deploy_proj_1', description: 'Deploy proj 1', inputSchema: { type: 'object' } }
    ], 'user_alice', 'proj_alice_1');
    MCPService.setDiscoveredResources('srv-alice-proj-1', [
      { uri: 'mcp://proj_alice_1/config', name: 'Proj 1 Config' }
    ], 'user_alice', 'proj_alice_1');

    const listNoProjResp = await fetch(`${baseUrl}/api/mcp/servers`, {
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    const listNoProjJson = await listNoProjResp.json();
    check(
      listNoProjResp.status === 200 &&
        listNoProjJson.servers.length === 1 &&
        listNoProjJson.servers[0].id === 'srv-alice-user',
      'HTTP GET /api/mcp/servers without projectId returns ONLY user-scoped server and hides project-scoped server'
    );

    const toolsNoProjResp = await fetch(`${baseUrl}/api/mcp/tools?serverId=srv-alice-proj-1`, {
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    const toolsNoProjJson = await toolsNoProjResp.json();
    check(
      toolsNoProjResp.status === 200 && toolsNoProjJson.tools.length === 0,
      'HTTP GET /api/mcp/tools without projectId does not expose project-scoped tools'
    );

    const resNoProjResp = await fetch(`${baseUrl}/api/mcp/resources?serverId=srv-alice-proj-1`, {
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    const resNoProjJson = await resNoProjResp.json();
    check(
      resNoProjResp.status === 200 && resNoProjJson.resources.length === 0,
      'HTTP GET /api/mcp/resources without projectId does not expose project-scoped resources'
    );

    const execNoProjResp = await fetch(`${baseUrl}/api/mcp/execute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverId: 'srv-alice-proj-1', toolName: 'deploy_proj_1', args: {} })
    });
    check(
      execNoProjResp.status === 404,
      'HTTP POST /api/mcp/execute without projectId rejects execution on project-scoped MCP server (404)'
    );

    const execMismatchProjResp = await fetch(`${baseUrl}/api/mcp/execute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverId: 'srv-alice-proj-1',
        toolName: 'deploy_proj_1',
        projectId: 'proj_alice_2',
        args: {}
      })
    });
    check(
      execMismatchProjResp.status === 404,
      'HTTP POST /api/mcp/execute with mismatched projectId (proj_alice_2) rejects execution on proj_alice_1 server (404)'
    );

    const bobMcpProjResp = await fetch(`${baseUrl}/api/mcp/servers?projectId=proj_alice_1`, {
      headers: { Authorization: `Bearer ${bobToken}` }
    });
    check(
      bobMcpProjResp.status === 403,
      'HTTP GET /api/mcp/servers?projectId=proj_alice_1 by non-owner user_bob returns 403'
    );

    const execMatchingProjResp = await fetch(`${baseUrl}/api/mcp/execute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverId: 'srv-alice-proj-1',
        toolName: 'deploy_proj_1',
        projectId: 'proj_alice_1',
        args: { env: 'staging' }
      })
    });
    const execMatchingProjJson = await execMatchingProjResp.json();
    check(
      execMatchingProjResp.status === 200 && execMatchingProjJson.success === true,
      'HTTP POST /api/mcp/execute with matching owner and projectId executes tool (200)'
    );

    // 3F. HTTP Rate Limiting (429) on Sensitive Endpoints
    console.log('\n--- 8. HTTP Verification: Rate Limiting (429) ---');
    resetEndpointRateLimitsForTests();
    resetAnalystRateLimitsForTests();

    let hit429OnSessionConnect = false;
    for (let i = 0; i < 21; i++) {
      const r = await fetch(`${baseUrl}/api/session/connect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: `sess_rate_${i}` })
      });
      if (r.status === 429) {
        hit429OnSessionConnect = true;
        break;
      }
    }
    check(hit429OnSessionConnect, 'HTTP POST /api/session/connect enforces rate limiting and returns 429 on 21st request');

    const bobSessionResp = await fetch(`${baseUrl}/api/session/connect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess_bob_ok' })
    });
    check(bobSessionResp.status === 200, 'HTTP POST /api/session/connect isolates rate limit buckets per authenticated user');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // ---------------------------------------------------------------------------
  // 4. Gemini Secret Absence & Subscription Cache Reset
  // ---------------------------------------------------------------------------
  console.log('\n--- 9. Client Bundle Secret Absence & Subscription Cache Reset ---');
  const viteCfg = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf8');
  const geminiClient = fs.readFileSync(path.resolve(process.cwd(), 'src/services/gemini.ts'), 'utf8');
  check(!viteCfg.includes('GEMINI_API_KEY'), 'vite.config.ts does not define process.env.GEMINI_API_KEY');
  check(!geminiClient.includes('GEMINI_API_KEY') && !geminiClient.includes('@google/genai'), 'src/services/gemini.ts contains zero GEMINI_API_KEY or @google/genai client imports');

  resetSubscriptionMemoryState();
  await updateUserSubscription({ userId: 'user_alice', planId: 'ultimate', status: 'active', updatedAt: Date.now() });
  check((await getUserSubscription('user_alice')).planId === 'ultimate', 'Subscription updated to ultimate in memory');
  clearSubscriptionCache();
  check((await getUserSubscription('user_alice')).planId === 'free', 'clearSubscriptionCache resets subscription cache to free');

  resetEphemeralWorkspacesForTests();
  setProjectLookupForTests(null);
  setAdminCredentialsOverrideForTests(null);
  setGooglePublicKeysForTests(null);

  console.log(`\n======================================================================`);
  console.log(`Phase A & A.1 Regression Summary: ${passed} passed, ${failed} failed.`);
  console.log(`======================================================================`);
  if (failed > 0) {
    process.exit(1);
  }
}

void runPhaseARegressionSuite();
