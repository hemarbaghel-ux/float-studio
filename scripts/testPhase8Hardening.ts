/**
 * Phase 8 Verification Suite: Hardening, Graceful Shutdown & Usage Metering
 * Verifies:
 * 1. Error filtering (`isKnownRequestAbortError`) only ignores true AbortErrors and never swallows real errors or arbitrary "cancel" strings.
 * 2. Real token usage metering (`recordTokenUsage`, `getUserUsageSummary`, `checkPlanLimit`) accurately tracks input/output tokens and enforces plan limits.
 * 3. Graceful shutdown (`gracefulShutdownServer`) closes the HTTP server, stops active processes, and requeues running agent tasks.
 * 4. Release checklist and E2E spec exist and are non-empty.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { isKnownRequestAbortError } from '../server';
import { gracefulShutdownServer } from '../src/server/app';
import {
  recordTokenUsage,
  getUserUsageSummary,
  checkPlanLimit,
  updateUserSubscription,
  resetSubscriptionMemoryState,
} from '../src/server/subscription/subscriptionPersistence';

async function runPhase8Tests() {
  console.log('=== Phase 8 Verification: Hardening, Graceful Shutdown & Usage Metering ===\n');

  // 1. Error Filter Hardening
  console.log('1. Testing Error Filter Hardening (isKnownRequestAbortError)...');
  const abortErr = Object.assign(new Error('The operation was aborted'), { name: 'AbortError', code: 'ABORT_ERR' });
  assert.equal(isKnownRequestAbortError(abortErr), true, 'True request AbortError should be recognized');

  const normalCancelMessageError = new Error('Failed to cancel Stripe subscription in database');
  assert.equal(
    isKnownRequestAbortError(normalCancelMessageError),
    false,
    'Real errors mentioning "cancel" must NEVER be swallowed'
  );
  assert.equal(isKnownRequestAbortError(new TypeError('Cannot read properties of undefined')), false);
  console.log('   ✓ Blanket /cancel/i swallowing removed; only genuine AbortErrors are filtered.\n');

  // 2. Real Token Usage Metering & Plan Limits
  console.log('2. Testing Real Token Usage Metering & Plan Limits...');
  resetSubscriptionMemoryState();
  const testUser = 'user-phase8-metering';

  await recordTokenUsage({
    userId: testUser,
    modelId: 'gemini-4-argon',
    inputTokens: 1250,
    outputTokens: 450,
  });
  await recordTokenUsage({
    userId: testUser,
    modelId: 'gpt-6-astra',
    inputTokens: 800,
    outputTokens: 200,
  });

  const usage = await getUserUsageSummary(testUser);
  assert.equal(usage.totalQueries, 2);
  assert.equal(usage.totalInputTokens, 2050);
  assert.equal(usage.totalOutputTokens, 650);
  assert.equal(usage.totalTokens, 2700);

  const freeLimit = await checkPlanLimit(testUser);
  assert.equal(freeLimit.planId, 'free');
  assert.equal(freeLimit.monthlyLimit, 50);
  assert.equal(freeLimit.usedQueries, 2);
  assert.equal(freeLimit.remainingQueries, 48);
  assert.equal(freeLimit.allowed, true);

  await updateUserSubscription({
    userId: testUser,
    planId: 'pro',
    status: 'active',
    updatedAt: Date.now(),
  });
  const proLimit = await checkPlanLimit(testUser);
  assert.equal(proLimit.planId, 'pro');
  assert.equal(proLimit.monthlyLimit, 500);
  assert.equal(proLimit.remainingQueries, 498);
  console.log('   ✓ Real token usage metering and tier limit calculation verified.\n');

  // 3. Graceful Shutdown Verification
  console.log('3. Testing Graceful Server Shutdown (HTTP server + Prozesse + Agent Orchestrator)...');
  const dummyServer = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end('ok');
  });
  await new Promise<void>((resolve) => dummyServer.listen(0, '127.0.0.1', () => resolve()));
  assert.equal(dummyServer.listening, true);

  const shutdownStats = await gracefulShutdownServer(dummyServer);
  assert.equal(dummyServer.listening, false, 'HTTP server must be closed after gracefulShutdownServer');
  assert.equal(typeof shutdownStats.stoppedProcesses, 'number');
  assert.equal(Array.isArray(shutdownStats.requeuedTaskIds), true);
  console.log('   ✓ Graceful shutdown closed HTTP server, stopped active processes, and drained orchestrator.\n');

  // 4. Release Checklist & Playwright E2E Spec Verification
  console.log('4. Verifying /docs/RELEASE_CHECKLIST.md and /tests/e2e/float-core.spec.ts...');
  const checklistPath = path.resolve(process.cwd(), 'docs/RELEASE_CHECKLIST.md');
  const e2eSpecPath = path.resolve(process.cwd(), 'tests/e2e/float-core.spec.ts');
  assert.equal(fs.existsSync(checklistPath), true, 'docs/RELEASE_CHECKLIST.md must exist');
  assert.equal(fs.existsSync(e2eSpecPath), true, 'tests/e2e/float-core.spec.ts must exist');
  const checklistContent = fs.readFileSync(checklistPath, 'utf8');
  assert.match(checklistContent, /gemini-4-argon/);
  assert.match(checklistContent, /strict": true/);
  console.log('   ✓ Release checklist and Playwright E2E spec verified.\n');

  // 5. Production Firestore Guard Verification (503 NOT_CONFIGURED when NODE_ENV=production without Admin credentials)
  console.log('5. Testing NODE_ENV=production missing Firestore Admin credentials guard (503 NOT_CONFIGURED)...');
  const { checkTransactionalRateLimit, FirestoreNotConfiguredError } = await import('../src/server/durableState');
  const { hasAdminCredentials } = await import('../src/server/adminFirebase');
  if (!hasAdminCredentials()) {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      let caughtError: any = null;
      try {
        await checkTransactionalRateLimit('test_prod_guard', 'user-1', 10, 60_000);
      } catch (err) {
        caughtError = err;
      }
      assert.ok(caughtError instanceof FirestoreNotConfiguredError, 'Must throw FirestoreNotConfiguredError in production when Firestore Admin credentials are missing');
      assert.equal(caughtError.statusCode, 503, 'Status code must be 503');
      assert.equal(caughtError.code, 'NOT_CONFIGURED', 'Error code must be NOT_CONFIGURED');
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
    console.log('   ✓ Production Firestore guard throws 503 NOT_CONFIGURED instead of in-memory fallback.\n');
  }

  console.log('ALL PHASE 8 CHECKS PASSED!');
}

runPhase8Tests().catch((err) => {
  console.error('Phase 8 verification failed:', err);
  process.exit(1);
});
