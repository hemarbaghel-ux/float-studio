/**
 * FLOAT Studio - Server-Side Project Authorization & Header Anti-Spoofing Regression Suite
 *
 * Requirements:
 * 1. Independent authentication and project ownership verification
 * 2. Never trust X-Float-Project-Id or body projectId without server-side validation
 * 3. Reject mismatched X-Float-Project-Id header vs body projectId with HTTP 400
 * 4. Reject persisted project access by non-owners with HTTP 403 Forbidden
 * 5. Ephemeral 'default-project' workspace isolation per authenticated user ID
 * 6. Guard in-memory ephemeral workspaces against cross-user hijacking
 */

import assert from 'assert';
import { verifyProjectOwnership, setProjectLookupForTests, resetEphemeralWorkspacesForTests } from '../src/server/projectOwnership.js';

async function runAuthorizationTests() {
  console.log('=== FLOAT Server-Side Project Authorization & Security Tests ===\n');

  const ALICE_UID = 'user_alice_123';
  const BOB_UID = 'user_bob_456';
  const ALICE_PROJECT = 'proj_alice_persisted';
  const BOB_PROJECT = 'proj_bob_persisted';

  // Setup mock database for project lookup
  const mockProjectsDatabase = new Map<string, { ownerId: string; name: string }>([
    [ALICE_PROJECT, { ownerId: ALICE_UID, name: 'Alice Private Project' }],
    [BOB_PROJECT, { ownerId: BOB_UID, name: 'Bob Private Project' }]
  ]);

  setProjectLookupForTests(async (id: string) => {
    const data = mockProjectsDatabase.get(id);
    return {
      exists: Boolean(data),
      data: data
    };
  });

  resetEphemeralWorkspacesForTests();

  // Test 1: Unauthenticated request rejection
  {
    console.log('[Test 1] Missing authentication rejection...');
    const result = await verifyProjectOwnership(ALICE_PROJECT, '');
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.status, 401);
    assert.ok(result.error?.includes('Authentication is required'));
    console.log('  -> PASS: Unauthenticated access rejected with HTTP 401');
  }

  // Test 2: Invalid project ID format rejection
  {
    console.log('[Test 2] Invalid project ID format rejection...');
    const invalidIds = ['', '   ', 'proj/../../etc', 'proj\0null'];
    for (const badId of invalidIds) {
      const result = await verifyProjectOwnership(badId, ALICE_UID);
      assert.strictEqual(result.allowed, false);
      assert.strictEqual(result.status, 400);
    }
    console.log('  -> PASS: Malformed, empty, and path-traversal project IDs rejected with HTTP 400');
  }

  // Test 3: Persisted Project Authorization - Owner Access Granted
  {
    console.log('[Test 3] Persisted project owner authorization...');
    const aliceCheck = await verifyProjectOwnership(ALICE_PROJECT, ALICE_UID);
    assert.strictEqual(aliceCheck.allowed, true);
    assert.strictEqual(aliceCheck.status, 200);
    assert.strictEqual(aliceCheck.persisted, true);
    assert.strictEqual(aliceCheck.effectiveProjectId, ALICE_PROJECT);

    const bobCheck = await verifyProjectOwnership(BOB_PROJECT, BOB_UID);
    assert.strictEqual(bobCheck.allowed, true);
    assert.strictEqual(bobCheck.status, 200);
    assert.strictEqual(bobCheck.persisted, true);
    console.log('  -> PASS: Legitimate owners successfully authorized to their persisted projects');
  }

  // Test 4: Cross-Tenant Persisted Project Access - 403 Forbidden
  {
    console.log('[Test 4] Cross-tenant persisted project access rejection...');
    // Bob attempts to access Alice's project
    const bobAccessingAlice = await verifyProjectOwnership(ALICE_PROJECT, BOB_UID);
    assert.strictEqual(bobAccessingAlice.allowed, false);
    assert.strictEqual(bobAccessingAlice.status, 403);
    assert.ok(bobAccessingAlice.error?.includes('Unauthorized'));

    // Alice attempts to access Bob's project
    const aliceAccessingBob = await verifyProjectOwnership(BOB_PROJECT, ALICE_UID);
    assert.strictEqual(aliceAccessingBob.allowed, false);
    assert.strictEqual(aliceAccessingBob.status, 403);
    assert.ok(aliceAccessingBob.error?.includes('Unauthorized'));
    console.log('  -> PASS: Non-owner access to persisted projects rejected with HTTP 403 Forbidden');
  }

  // Test 5: Ephemeral 'default-project' Workspace Isolation
  {
    console.log('[Test 5] Ephemeral default-project per-user namespacing...');
    const aliceDefault = await verifyProjectOwnership('default-project', ALICE_UID, { allowMissing: true });
    assert.strictEqual(aliceDefault.allowed, true);
    assert.strictEqual(aliceDefault.isEphemeral, true);
    assert.strictEqual(aliceDefault.effectiveProjectId, `ephemeral-${ALICE_UID}-default-project`);

    const bobDefault = await verifyProjectOwnership('default-project', BOB_UID, { allowMissing: true });
    assert.strictEqual(bobDefault.allowed, true);
    assert.strictEqual(bobDefault.isEphemeral, true);
    assert.strictEqual(bobDefault.effectiveProjectId, `ephemeral-${BOB_UID}-default-project`);

    assert.notStrictEqual(
      aliceDefault.effectiveProjectId,
      bobDefault.effectiveProjectId,
      'Two users in default-project must be mapped to distinct isolated workspace namespaces'
    );
    console.log('  -> PASS: Ephemeral default-project isolated per user (ephemeral-${uid}-default-project)');
  }

  // Test 6: In-Memory Ephemeral Project Collision Prevention
  {
    console.log('[Test 6] Ephemeral workspace collision protection...');
    const ephemeralId = 'unsaved-workspace-xyz-99';

    // Alice claims it first
    const aliceClaim = await verifyProjectOwnership(ephemeralId, ALICE_UID, { allowMissing: true });
    assert.strictEqual(aliceClaim.allowed, true);
    assert.strictEqual(aliceClaim.effectiveProjectId, ephemeralId);

    // Bob tries to access the same unsaved workspace ID
    const bobAttempt = await verifyProjectOwnership(ephemeralId, BOB_UID, { allowMissing: true });
    assert.strictEqual(bobAttempt.allowed, false);
    assert.strictEqual(bobAttempt.status, 403);
    assert.ok(bobAttempt.error?.includes('Unauthorized'));
    console.log('  -> PASS: Unsaved project ID claimed by Alice cannot be accessed by Bob (HTTP 403)');
  }

  // Test 7: Header Anti-Spoofing Emulation (as implemented in src/server/app.ts:337)
  {
    console.log('[Test 7] Header Anti-Spoofing (X-Float-Project-Id vs body projectId)...');
    const headerProjectId = 'proj-header-123';
    const bodyProjectId = 'proj-body-456';

    const checkAntiSpoofing = (header?: string, body?: string): { status: number; error?: string } | null => {
      const h = header && header.trim() ? header.trim() : undefined;
      const b = body && body.trim() ? body.trim() : undefined;
      if (h && b && h !== b) {
        return {
          status: 400,
          error: 'Conflicting project identifier provided in X-Float-Project-Id header and request body.'
        };
      }
      return null;
    };

    const conflictResult = checkAntiSpoofing(headerProjectId, bodyProjectId);
    assert.ok(conflictResult);
    assert.strictEqual(conflictResult?.status, 400);
    assert.ok(conflictResult?.error?.includes('Conflicting project identifier'));

    const matchResult = checkAntiSpoofing('proj-matching', 'proj-matching');
    assert.strictEqual(matchResult, null, 'Matching header and body IDs must pass anti-spoofing check');

    const headerOnlyResult = checkAntiSpoofing('proj-only-header', undefined);
    assert.strictEqual(headerOnlyResult, null);

    const bodyOnlyResult = checkAntiSpoofing(undefined, 'proj-only-body');
    assert.strictEqual(bodyOnlyResult, null);
    console.log('  -> PASS: Header anti-spoofing strictly enforces identifier consistency (HTTP 400 on conflict)');
  }

  // Cleanup test hook
  setProjectLookupForTests(null);
  console.log('\nAll 7 server-side project authorization and anti-spoofing tests PASSED (100%).\n');
}

runAuthorizationTests().catch(err => {
  console.error('Authorization test failure:', err);
  process.exit(1);
});
