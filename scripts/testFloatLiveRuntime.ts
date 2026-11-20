/**
 * FLOAT Studio — Runtime Safety Smoke Test
 * 
 * Boots the Express server in NODE_ENV=test and checks real HTTP route behavior:
 * 1. GET /api/health
 * 2. GET /api/terminal/doctor
 * 3. Verify unscoped experimental FloatEngine endpoints are not exposed
 */

import http from 'http';
import assert from 'assert';
import crypto from 'crypto';
import { setGooglePublicKeysForTests } from '../src/server/authMiddleware.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const firebaseConfig = require('../firebase-applet-config.json');

async function runRuntimeSafetyVerification() {
  console.log('=== FLOAT AI STUDIO: RUNTIME SAFETY SMOKE TEST (TEST MODE) ===\n');

  process.env.NODE_ENV = 'test';
  process.env.FLOAT_APPROVAL_SECRET = 'test_float_approval_secret_entropy_64_bytes_secure_signature!';
  process.env.FLOAT_BYOK_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  // Setup RS256 test keypair for authenticated endpoints
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const kid = 'live-test-kid-1';
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

  const { createApp } = await import('../src/server/app.js');
  const app = await createApp({ skipVite: true });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const aliceToken = signToken('user-alice');
  console.log(`[INFO] Live test server listening at ${baseUrl}\n`);

  try {
    // 1. Health check (unauthenticated)
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(healthRes.status, 200, 'GET /api/health must return 200');
    const healthJson: any = await healthRes.json();
    assert.strictEqual(healthJson.status, 'ok', 'Health status must be ok');
    console.log('[PASS] 1. GET /api/health -> 200 OK (status: ok)');

    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${aliceToken}`
    };

    // 2. Terminal Doctor (authenticated)
    const doctorRes = await fetch(`${baseUrl}/api/terminal/doctor`, { headers: authHeaders });
    assert.strictEqual(doctorRes.status, 200, 'GET /api/terminal/doctor must return 200');
    const doctorJson: any = await doctorRes.json();
    assert.ok(typeof doctorJson.ready === 'boolean', 'Doctor must report boolean ready state');
    console.log('[PASS] 2. GET /api/terminal/doctor -> 200 OK (structured isolation checklist)');

    // The experimental FloatEngine router must remain inaccessible until its
    // workspace is project-scoped and terminal execution uses the real sandbox.
    const gatedEndpoints: Array<{ method: 'GET' | 'POST'; route: string; body?: unknown }> = [
      { method: 'GET', route: '/api/float/v1/workspace/tree' },
      { method: 'GET', route: '/api/float/v1/workspace/files?path=README.md' },
      { method: 'POST', route: '/api/float/v1/composer/plan', body: { projectId: 'project-alice', prompt: 'Inspect this project' } },
      { method: 'POST', route: '/api/float/v1/editor/autocomplete', body: { filePath: 'src/math.ts', prefix: 'const x = ', suffix: '' } },
      { method: 'POST', route: '/api/float/v1/editor/inline-edit', body: { filePath: 'src/math.ts', originalCode: 'const x = 1;', instruction: 'Rename x' } },
      { method: 'POST', route: '/api/float/v1/gateway/execute', body: { model: 'gpt-4o-mini', prompt: 'Test' } },
      { method: 'POST', route: '/api/float/v1/terminal/execute', body: { projectId: 'project-alice', command: 'npm test' } }
    ];

    for (const endpoint of gatedEndpoints) {
      const response = await fetch(`${baseUrl}${endpoint.route}`, {
        method: endpoint.method,
        headers: authHeaders,
        ...(endpoint.body === undefined ? {} : { body: JSON.stringify(endpoint.body) })
      });
      assert.strictEqual(
        response.status,
        404,
        `${endpoint.method} ${endpoint.route} must stay unavailable until project-scoped runtime integration is complete`
      );
      const payload: any = await response.json();
      assert.strictEqual(payload.error, 'API endpoint not found.');
      console.log(`[PASS] ${endpoint.method} ${endpoint.route} -> 404 (experimental endpoint safely unmounted)`);
    }

    console.log('\n======================================================');
    console.log('RUNTIME SAFETY VERIFICATION COMPLETE: HEALTH, DOCTOR, AND FAIL-CLOSED ROUTE CHECKS PASSED!');
    console.log('======================================================');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

runLiveVerification().catch((err) => {
  console.error('[FAIL] Runtime safety verification failed:', err);
  process.exit(1);
});
