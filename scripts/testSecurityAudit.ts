import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import firebaseConfig from '../firebase-applet-config.json';
import {
  isFirebaseTokenTimeValid,
  verifyFirebaseIdToken,
  requireAuth,
  setGooglePublicKeysForTests,
  getCertRefreshCountForTests
} from '../src/server/authMiddleware';
import { normalizeGitPath, validateBranch } from '../src/server/github/gitRouter';
import { sanitizeProposalPath } from '../src/server/agent/proposalService';
import { EvalEngine } from '../src/server/evalEngine';
import {
  verifyProjectOwnership,
  setProjectLookupForTests,
  resetEphemeralWorkspacesForTests
} from '../src/server/projectOwnership';
import { setAdminCredentialsOverrideForTests } from '../src/server/adminFirebase';
import {
  getUserSubscription,
  updateUserSubscription,
  clearSubscriptionCache,
  resetSubscriptionMemoryState
} from '../src/server/subscription/subscriptionPersistence';
import {
  GPT6_ASTRA_CLOUD_CONFIG,
  getUserCloudSessionConfig,
  updateUserCloudSessionConfig,
  resetUserCloudSessionsForTests
} from '../src/server/providers/cloudAgentConfig';
import { checkEndpointRateLimit, resetEndpointRateLimitsForTests } from '../src/server/app';
import { checkAnalystRateLimit, resetAnalystRateLimitsForTests } from '../src/server/analystRouter';

let passed = 0;
function check(condition: unknown, message: string): void {
  assert.ok(condition, message);
  passed++;
}

function signTestJwt(
  header: Record<string, any>,
  payload: Record<string, any>,
  privateKeyPem?: string
): string {
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${h}.${p}`;
  if (!privateKeyPem) {
    return `${signingInput}.unsigned_payload_attempt`;
  }
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const sig = signer.sign(privateKeyPem, 'base64url');
  return `${signingInput}.${sig}`;
}

function createMockRes() {
  return {
    statusCode: 200,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    }
  };
}

async function runSecurityAudit() {
  const now = 1_800_000_000;
  check(isFirebaseTokenTimeValid(now + 60, now - 60, now) === true, 'accepts a correctly timed Firebase ID token');
  check(isFirebaseTokenTimeValid(now, now - 60, now) === false, 'rejects an expired Firebase ID token at its exact expiry');
  check(isFirebaseTokenTimeValid(Number.NaN, now, now) === false, 'rejects malformed Firebase expiry claims');
  check(isFirebaseTokenTimeValid(now + 60, now + 61, now) === false, 'rejects ID tokens issued too far in the future');

  check(normalizeGitPath('src\\feature.ts') === 'src/feature.ts', 'normalizes Git paths to repository separators');
  for (const unsafe of ['../secret', 'src/../../secret', '/etc/passwd', 'C:\\Windows\\win.ini', 'src\\..\\secret', 'src//file']) {
    check(normalizeGitPath(unsafe) === null, `rejects unsafe Git path ${unsafe}`);
  }
  check(validateBranch('feature/audit-fix') === 'feature/audit-fix', 'accepts a valid Git branch name');
  for (const unsafe of ['main..attacker', 'feature//bad', '../main', 'feature/.hidden', '-leading']) {
    assert.throws(() => validateBranch(unsafe), `rejects unsafe Git branch ${unsafe}`);
    passed++;
  }

  for (const unsafe of ['..\\..\\secrets.txt', 'C:\\Windows\\win.ini', '/etc/passwd', 'src/.env.production', 'src/keys/private.pem']) {
    check(Boolean(sanitizeProposalPath(unsafe).error), `rejects unsafe proposal path ${unsafe}`);
  }
  check(sanitizeProposalPath('src/components/App.tsx').safePath === 'src/components/App.tsx', 'accepts safe proposal path');

  const evalEngine = new EvalEngine();
  for (const unsafe of ['src/.env.production', '../../outside.ts']) {
    assert.throws(() => evalEngine.createTask({
      name: 'security path test', description: 'valid test task', category: 'Security', difficulty: 'easy',
      prompt: 'Do not run', validationType: 'exact_match', files: [{ path: unsafe, content: 'sensitive' }]
    } as any, 'security-test'), `rejects evaluation context path ${unsafe}`);
    passed++;
  }

  // --- Phase A & A.1: Cryptographic JWT Verification, Strict Claims & Bounded Key Rotation ---
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
  const { privateKey: attackerPrivateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const kid = 'phase-a-test-key-1';
  const rotatedKid = 'phase-a-test-key-2-rotated';
  setGooglePublicKeysForTests({ [kid]: publicKey });

  const nowSec = Math.floor(Date.now() / 1000);
  const validClaims = {
    iss: `https://securetoken.google.com/${firebaseConfig.projectId}`,
    aud: firebaseConfig.projectId,
    sub: 'user_alice_123',
    user_id: 'user_alice_123',
    email: 'alice@float.ai',
    iat: nowSec - 30,
    exp: nowSec + 3600
  };

  // 1. Valid RS256 token succeeds
  const validToken = signTestJwt({ alg: 'RS256', kid, typ: 'JWT' }, validClaims, privateKey);
  const verifiedUser = await verifyFirebaseIdToken(validToken);
  check(verifiedUser?.uid === 'user_alice_123' && verifiedUser?.email === 'alice@float.ai', 'accepts cryptographically verified RS256 Firebase token');

  // 2. Forged alg:none token is rejected
  const algNoneToken = signTestJwt({ alg: 'none', kid, typ: 'JWT' }, validClaims);
  check((await verifyFirebaseIdToken(algNoneToken)) === null, 'rejects alg:none unverified JWT payload');

  // 3. Token signed with wrong RSA key is rejected
  const wrongKeyToken = signTestJwt({ alg: 'RS256', kid, typ: 'JWT' }, validClaims, attackerPrivateKey);
  check((await verifyFirebaseIdToken(wrongKeyToken)) === null, 'rejects JWT signed by untrusted private key');

  // 4. Tampered payload (privilege escalation to another uid) is rejected
  const parts = validToken.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({ ...validClaims, sub: 'admin_victim', user_id: 'admin_victim' })).toString('base64url');
  const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
  check((await verifyFirebaseIdToken(tamperedToken)) === null, 'rejects JWT with tampered payload claims');

  // 5. Expired token is rejected
  const expiredToken = signTestJwt({ alg: 'RS256', kid, typ: 'JWT' }, { ...validClaims, exp: nowSec - 10 }, privateKey);
  check((await verifyFirebaseIdToken(expiredToken)) === null, 'rejects expired RS256 JWT');

  // 6. Wrong audience / issuer / missing user_id / mismatched user_id rejected
  const wrongAudToken = signTestJwt({ alg: 'RS256', kid }, { ...validClaims, aud: 'other-project' }, privateKey);
  check((await verifyFirebaseIdToken(wrongAudToken)) === null, 'rejects JWT with wrong audience');

  const { user_id: _omittedUserId, ...claimsWithoutUserId } = validClaims;
  const missingUserIdToken = signTestJwt({ alg: 'RS256', kid }, claimsWithoutUserId, privateKey);
  check((await verifyFirebaseIdToken(missingUserIdToken)) === null, 'rejects JWT when user_id claim is missing');

  const emptyUserIdToken = signTestJwt({ alg: 'RS256', kid }, { ...validClaims, user_id: '   ' }, privateKey);
  check((await verifyFirebaseIdToken(emptyUserIdToken)) === null, 'rejects JWT when user_id claim is blank');

  const mismatchUidToken = signTestJwt({ alg: 'RS256', kid }, { ...validClaims, user_id: 'other_uid' }, privateKey);
  check((await verifyFirebaseIdToken(mismatchUidToken)) === null, 'rejects JWT with mismatched user_id vs sub');

  // 7. Unknown signing-key ID (kid) triggers bounded certificate refresh
  setGooglePublicKeysForTests(
    { [kid]: publicKey },
    {
      minRefreshIntervalMs: 60_000,
      onRefreshCerts: () => ({
        [kid]: publicKey,
        [rotatedKid]: rotatedPublicKey
      })
    }
  );
  const rotatedToken = signTestJwt({ alg: 'RS256', kid: rotatedKid, typ: 'JWT' }, validClaims, rotatedPrivateKey);
  const verifiedAfterRotation = await verifyFirebaseIdToken(rotatedToken);
  check(
    verifiedAfterRotation?.uid === 'user_alice_123' && getCertRefreshCountForTests() === 1,
    'unknown kid triggers exactly one bounded public-certificate refresh and accepts newly rotated Google key'
  );

  const unknownKidToken = signTestJwt({ alg: 'RS256', kid: 'completely-unknown-kid', typ: 'JWT' }, validClaims, rotatedPrivateKey);
  const rejectedUnknownKid = await verifyFirebaseIdToken(unknownKidToken);
  check(
    rejectedUnknownKid === null && getCertRefreshCountForTests() === 1,
    'subsequent unknown kid within cooldown window is rejected without spamming upstream certificate refreshes'
  );

  // 8. Certificate refresh failure on unknown kid fails closed (503)
  setGooglePublicKeysForTests(
    { [kid]: publicKey },
    {
      minRefreshIntervalMs: 60_000,
      onRefreshCerts: () => {
        throw new Error('Upstream cert endpoint unreachable during key rotation');
      }
    }
  );
  const refreshOutageRes = createMockRes();
  let nextCalled = false;
  await requireAuth({ headers: { authorization: `Bearer ${rotatedToken}` } }, refreshOutageRes as any, () => { nextCalled = true; });
  check(refreshOutageRes.statusCode === 503 && !nextCalled, 'requireAuth fails closed with 503 if public certificate refresh fails during key rotation');

  // 9. requireAuth middleware rejects missing/invalid tokens (401) and fails closed (503) on cert outage
  setGooglePublicKeysForTests({ [kid]: publicKey });
  const unauthRes = createMockRes();
  await requireAuth({ headers: {} }, unauthRes as any, () => { nextCalled = true; });
  check(unauthRes.statusCode === 401 && !nextCalled, 'requireAuth returns 401 when Authorization header is missing');

  const invalidRes = createMockRes();
  await requireAuth({ headers: { authorization: `Bearer ${wrongKeyToken}` } }, invalidRes as any, () => { nextCalled = true; });
  check(invalidRes.statusCode === 401 && !nextCalled, 'requireAuth returns 401 for unverified token signature');

  setGooglePublicKeysForTests(null, { simulateOutage: true });
  const outageRes = createMockRes();
  await requireAuth({ headers: { authorization: `Bearer ${validToken}` } }, outageRes as any, () => { nextCalled = true; });
  check(outageRes.statusCode === 503 && !nextCalled, 'requireAuth fails closed with 503 when trusted verification keys are unavailable');
  setGooglePublicKeysForTests(null);

  // --- Phase A & A.1: Server-Side Project Ownership, default-project & Ephemeral Mode Tests ---
  setAdminCredentialsOverrideForTests(false);
  setProjectLookupForTests(null);
  const failClosedRes = await verifyProjectOwnership('proj-1', 'user_alice_123');
  check(failClosedRes.allowed === false && failClosedRes.status === 503, 'verifyProjectOwnership fails closed (503) when Firebase Admin is not configured');

  const mockProjects = new Map<string, Record<string, any>>([
    ['proj-alice', { ownerId: 'user_alice_123', name: 'Alice Project', files: '[]' }],
    ['default-project', { ownerId: 'user_alice_123', name: 'Alice Persisted Default Project', files: '[]' }]
  ]);
  setProjectLookupForTests(async (projectId) => {
    const data = mockProjects.get(projectId);
    return data ? { exists: true, data } : { exists: false };
  });

  const ownerCheck = await verifyProjectOwnership('proj-alice', 'user_alice_123');
  check(ownerCheck.allowed === true && ownerCheck.status === 200 && ownerCheck.persisted === true && ownerCheck.projectData?.name === 'Alice Project', 'verifyProjectOwnership allows verified project owner');

  const intruderCheck = await verifyProjectOwnership('proj-alice', 'user_bob_456');
  check(intruderCheck.allowed === false && intruderCheck.status === 403 && intruderCheck.projectData === undefined, 'verifyProjectOwnership blocks non-owner with 403 without leaking projectData');

  // Persisted 'default-project' owned by Alice must block Bob even when allowMissing: true
  const bobDefaultPersistedCheck = await verifyProjectOwnership('default-project', 'user_bob_456', { allowMissing: true });
  check(
    bobDefaultPersistedCheck.allowed === false && bobDefaultPersistedCheck.status === 403,
    'persisted project with ID default-project owned by another user is rejected with 403 even when allowMissing is true'
  );
  const aliceDefaultPersistedCheck = await verifyProjectOwnership('default-project', 'user_alice_123', { allowMissing: true });
  check(
    aliceDefaultPersistedCheck.allowed === true &&
      aliceDefaultPersistedCheck.persisted === true &&
      aliceDefaultPersistedCheck.isEphemeral === false &&
      aliceDefaultPersistedCheck.effectiveProjectId === 'default-project',
    'persisted project with ID default-project is accessible to its verified owner'
  );

  // Ephemeral 'default-project' (when not persisted in Firestore) isolates effectiveProjectId per user
  mockProjects.delete('default-project');
  const aliceDefaultEphemeral = await verifyProjectOwnership('default-project', 'user_alice_123', { allowMissing: true });
  const bobDefaultEphemeral = await verifyProjectOwnership('default-project', 'user_bob_456', { allowMissing: true });
  check(
    aliceDefaultEphemeral.allowed === true &&
      aliceDefaultEphemeral.persisted === false &&
      aliceDefaultEphemeral.isEphemeral === true &&
      aliceDefaultEphemeral.effectiveProjectId === 'ephemeral-user_alice_123-default-project' &&
      bobDefaultEphemeral.effectiveProjectId === 'ephemeral-user_bob_456-default-project',
    'unpersisted default-project in allowMissing mode explicitly runs as user-isolated ephemeral workspace'
  );

  // Unpersisted 'default-project' is rejected with 404 on persisted-only routes (allowMissing: false)
  const defaultOnPersistedRoute = await verifyProjectOwnership('default-project', 'user_alice_123', { allowMissing: false });
  check(defaultOnPersistedRoute.allowed === false && defaultOnPersistedRoute.status === 404, 'unpersisted default-project is rejected with 404 when allowMissing is false');

  const missingCheck = await verifyProjectOwnership('proj-nonexistent', 'user_alice_123');
  check(missingCheck.allowed === false && missingCheck.status === 404, 'verifyProjectOwnership returns 404 for nonexistent project');

  const traversalProjCheck = await verifyProjectOwnership('../etc/passwd', 'user_alice_123');
  check(traversalProjCheck.allowed === false && traversalProjCheck.status === 400, 'verifyProjectOwnership rejects invalid/traversal projectId with 400');

  resetEphemeralWorkspacesForTests();
  setProjectLookupForTests(null);
  setAdminCredentialsOverrideForTests(null);

  // --- Phase A: Vite Bundle & Client Gemini Key Exposure Prevention ---
  const viteConfigContent = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf8');
  check(!viteConfigContent.includes('GEMINI_API_KEY'), 'vite.config.ts does not inject GEMINI_API_KEY into client bundle');

  const clientGeminiContent = fs.readFileSync(path.resolve(process.cwd(), 'src/services/gemini.ts'), 'utf8');
  check(!clientGeminiContent.includes('process.env.GEMINI_API_KEY') && !clientGeminiContent.includes('new GoogleGenAI'), 'src/services/gemini.ts does not use process.env.GEMINI_API_KEY or instantiate GoogleGenAI in browser');

  const serverAppContent = fs.readFileSync(path.resolve(process.cwd(), 'src/server/app.ts'), 'utf8');
  check(!serverAppContent.includes("from '../lib/firebase'") && !serverAppContent.includes("from 'firebase/firestore'"), 'src/server/app.ts does not import client Firebase SDK');

  // --- Phase A: Cloud Session Per-User Isolation & Shell Injection Prevention ---
  resetUserCloudSessionsForTests();
  const badEnvUpdate = updateUserCloudSessionConfig('user_alice_123', {
    environmentId: "env_bad'; rm -rf / #"
  });
  check(badEnvUpdate.ok === false, 'rejects shell metacharacters in cloud session environmentId');

  const aliceSessionUpdate = updateUserCloudSessionConfig('user_alice_123', {
    sessionId: 'sess_alice_custom_1',
    environmentId: 'ccarenv_alice_custom_1'
  });
  check(aliceSessionUpdate.ok === true, 'accepts valid alphanumeric cloud session identifiers for user_alice');
  check(getUserCloudSessionConfig('user_bob_456').sessionId === GPT6_ASTRA_CLOUD_CONFIG.sessionId, 'user_alice cloud session update does not mutate user_bob or global config');

  // --- Phase A: Rate Limiting & Subscription Cache Clear ---
  resetEndpointRateLimitsForTests();
  resetAnalystRateLimitsForTests();
  for (let i = 0; i < 3; i++) {
    check(checkEndpointRateLimit('verify_key', 'user_rate_test', 3, 60_000) === true, `rate limiter allows request ${i + 1}/3`);
  }
  check(checkEndpointRateLimit('verify_key', 'user_rate_test', 3, 60_000) === false, 'rate limiter blocks request exceeding window quota');
  check(checkEndpointRateLimit('verify_key', 'other_user', 3, 60_000) === true, 'rate limiter isolates buckets per userId');

  for (let i = 0; i < 2; i++) {
    check(checkAnalystRateLimit('user_analyst_test', 2, 60_000) === true, `analyst rate limiter allows request ${i + 1}/2`);
  }
  check(checkAnalystRateLimit('user_analyst_test', 2, 60_000) === false, 'analyst rate limiter blocks excess requests');

  resetSubscriptionMemoryState();
  await updateUserSubscription({
    userId: 'user_sub_cache_test',
    planId: 'pro',
    status: 'active',
    updatedAt: Date.now()
  });
  check((await getUserSubscription('user_sub_cache_test')).planId === 'pro', 'subscription update persists pro plan in memory');
  clearSubscriptionCache();
  check((await getUserSubscription('user_sub_cache_test')).planId === 'free', 'clearSubscriptionCache clears memorySubscriptions map');

  console.log(`Security audit focused checks: ${passed} passed, 0 failed.`);
}

void runSecurityAudit();
