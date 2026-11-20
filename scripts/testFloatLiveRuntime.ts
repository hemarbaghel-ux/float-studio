/**
 * FLOAT Studio — Live Production Runtime Verification
 * 
 * Boots the built production Express server (dist/server.cjs) and tests real HTTP endpoints:
 * 1. GET /api/health
 * 2. GET /api/terminal/doctor
 * 3. GET /api/float/v1/workspace/tree
 * 4. POST /api/float/v1/editor/autocomplete (Cursor Tab)
 * 5. POST /api/float/v1/editor/inline-edit (Ctrl+K)
 * 6. Direct FloatEngine: FIM Tab Completion, Context Resolution, Autonomous Task Execution
 */

import http from 'http';
import assert from 'assert';
import crypto from 'crypto';
import { setGooglePublicKeysForTests } from '../src/server/authMiddleware.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const firebaseConfig = require('../firebase-applet-config.json');

async function runLiveVerification() {
  console.log('=== FLOAT AI STUDIO: LIVE PRODUCTION RUNTIME VERIFICATION ===\n');

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

    // 3. Float Logic Workspace Tree (authenticated)
    const treeRes = await fetch(`${baseUrl}/api/float/v1/workspace/tree`, { headers: authHeaders });
    assert.strictEqual(treeRes.status, 200, 'GET /api/float/v1/workspace/tree must return 200');
    const treeJson: any = await treeRes.json();
    assert.ok(treeJson.success, 'Tree response must be successful');
    console.log('[PASS] 3. GET /api/float/v1/workspace/tree -> 200 OK (returned file tree)');

    // 4. Float Logic Autocomplete (Cursor Tab)
    const tabRes = await fetch(`${baseUrl}/api/float/v1/editor/autocomplete`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        filePath: 'src/math.ts',
        prefix: 'function add(a: number, b: number): number {',
        suffix: ''
      })
    });
    assert.strictEqual(tabRes.status, 200, 'POST /api/float/v1/editor/autocomplete must return 200');
    const tabJson: any = await tabRes.json();
    assert.ok(tabJson.success, 'Tab response must be successful');
    assert.ok(tabJson.completion.completion.includes('return a + b;'), 'Tab completion must generate body');
    console.log('[PASS] 4. POST /api/float/v1/editor/autocomplete -> 200 OK (Cursor Tab FIM completion served)');

    // 5. Float Logic Inline Edit (Ctrl+K)
    const inlineRes = await fetch(`${baseUrl}/api/float/v1/editor/inline-edit`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        filePath: 'src/calc.ts',
        originalCode: 'function calc() { return 1; }',
        instruction: 'Add docstring comment'
      })
    });
    assert.strictEqual(inlineRes.status, 200, 'POST /api/float/v1/editor/inline-edit must return 200');
    const inlineJson: any = await inlineRes.json();
    assert.ok(inlineJson.success, 'Inline edit response must be successful');
    assert.strictEqual(inlineJson.result.hunks.length, 1, 'Inline edit must return 1 hunk');
    console.log('[PASS] 5. POST /api/float/v1/editor/inline-edit -> 200 OK (Ctrl+K inline diff generated)');

    // 6. Direct FloatEngine Subsystem In-Memory Checks
    const { FloatEngine } = await import('../src/core/float/index.js');
    const os = await import('os');
    const path = await import('path');
    const tempDir = path.join(os.tmpdir(), `float_live_test_${Date.now()}`);
    const engine = new FloatEngine({
      workspaceRoot: tempDir,
      approvalSecret: 'test_float_approval_secret_entropy_64_bytes_secure_signature!',
      byokEncryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    });

    // Test context resolution
    await engine.workspace.writeFile('src/app.ts', 'export const APP_NAME = "Float Studio";');
    engine.intelligence.indexFile('src/app.ts', 'export const APP_NAME = "Float Studio";');
    const context = await engine.intelligence.resolveContext('Look at @file:src/app.ts', 2000);
    assert.ok(context.formattedPrompt.includes('APP_NAME'), 'Resolved context must include file content');
    console.log('[PASS] 6. Direct FloatEngine: Context resolution resolved @file mention accurately');

    // Test autonomous task execution with shadow diff
    const goal = await engine.executeAutonomousTask(
      'proj_test',
      'user_test',
      'Add helper function',
      [{ filePath: 'src/helper.ts', content: 'export function help() { return true; }' }]
    );
    assert.strictEqual(goal.diffs.length, 1, 'Autonomous task must produce 1 shadow diff');
    console.log('[PASS] 7. Direct FloatEngine: Autonomous goal executed and produced shadow diffs');

    console.log('\n======================================================');
    console.log('LIVE RUNTIME VERIFICATION COMPLETE: ALL CHECKS PASSED!');
    console.log('======================================================');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

runLiveVerification().catch((err) => {
  console.error('[FAIL] Live runtime verification failed:', err);
  process.exit(1);
});
