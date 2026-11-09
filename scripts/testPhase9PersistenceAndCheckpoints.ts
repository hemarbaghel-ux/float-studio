/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Phase 9 Verification Suite: Persistence, State, and Checkpoints
 *
 * Verifies:
 * 1. Workspace checkpoint creation, file tracking, and deterministic rollback.
 * 2. Checkpoint JSON serialization, SHA-256 checksum generation, and tamper detection.
 * 3. Local workspace disk persistence (.float/checkpoints/${checkpointId}.json).
 * 4. Automatic pre-proposal safety checkpointing and one-click rollback on applied proposals.
 * 5. Durable cloud persistence (inline and chunked subcollections with SHA-256 integrity).
 * 6. UTF-8 multi-byte boundary safe chunking.
 * 7. Cross-tenant and cross-project isolation in durable storage.
 * 8. Automatic TTL expiration checks on read and transactional write.
 * 9. Transactional rate limiting with atomic Firestore transactions and TTL.
 * 10. Conversation cloud messages serialization bounds and manifest completeness verification.
 * 11. Proposal persistence optimistic concurrency control.
 */

import assert from 'assert';
import crypto from 'crypto';
import { WorkspaceCheckpointManager } from '../src/services/composer/checkpointManager';
import { IWorkspaceService, IWorkspaceFile, IWorkspaceFileMetadata } from '../src/shared/contracts/workspace';
import { IProposal, computeContentHash } from '../src/shared/contracts/proposals';
import { applyProposal, checkProposalConflicts } from '../src/services/composer/proposalApplier';
import {
  saveLargePayloadDurable,
  loadLargePayloadDurable,
  deleteLargePayloadDurable,
  splitUtf8IntoChunks,
  computePayloadSha256,
  setCustomFirestoreDbForTests,
  checkTransactionalRateLimit,
  saveServerDocDurable,
  getServerDocDurable,
  deleteServerDocDurable,
  resetFallbackRateLimitsForTests,
} from '../src/server/durableState';
import {
  serializeConversationMessages,
  parseConversationMessageDocuments,
  MAX_CONVERSATION_MESSAGE_BYTES,
} from '../src/services/conversationCloudMessages';
import { AIMessage } from '../src/types';

/**
 * In-memory workspace mock for checkpoint & file tests
 */
class InMemoryWorkspace implements IWorkspaceService {
  public files = new Map<string, string>();

  async readFile(relPath: string): Promise<string> {
    const val = this.files.get(relPath);
    if (val === undefined) throw new Error(`File not found: ${relPath}`);
    return val;
  }

  async writeFile(relPath: string, content: string): Promise<void> {
    this.files.set(relPath, content);
  }

  async deleteFile(relPath: string): Promise<void> {
    this.files.delete(relPath);
  }

  async fileExists(relPath: string): Promise<boolean> {
    return this.files.has(relPath);
  }

  async listFiles(options?: { recursive?: boolean; directory?: string }): Promise<readonly IWorkspaceFile[]> {
    const dir = options?.directory || '';
    const results: IWorkspaceFile[] = [];
    for (const [p, content] of this.files.entries()) {
      if (dir && !p.startsWith(dir)) continue;
      results.push({
        path: p,
        name: p.split('/').pop() || p,
        type: 'file',
        size: Buffer.byteLength(content, 'utf8'),
        lastModified: Date.now(),
      });
    }
    return results;
  }

  async getMetadata(relPath: string): Promise<IWorkspaceFileMetadata> {
    const content = this.files.get(relPath);
    if (content === undefined) throw new Error(`File not found: ${relPath}`);
    return {
      path: relPath,
      name: relPath.split('/').pop() || relPath,
      type: 'file',
      size: Buffer.byteLength(content, 'utf8'),
      lastModified: Date.now(),
      readonly: false,
    };
  }
}

/**
 * In-memory Firestore mock for durable state tests
 */
function createMockFirestoreDb() {
  const store = new Map<string, Map<string, any>>();
  const subcollections = new Map<string, Map<string, any>>(); // docPath -> subColMap

  function getCol(name: string) {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  }

  function getSubCol(docKey: string) {
    if (!subcollections.has(docKey)) subcollections.set(docKey, new Map());
    return subcollections.get(docKey)!;
  }

  const db: any = {
    collection: (colName: string) => {
      const colMap = getCol(colName);
      return {
        doc: (docId: string) => {
          const docKey = `${colName}/${docId}`;
          return {
            ref: { id: docId, path: docKey },
            get: async () => {
              const data = colMap.get(docId);
              return {
                exists: data !== undefined,
                data: () => data,
                get: (f: string) => (data ? data[f] : undefined),
              };
            },
            set: async (data: any, options?: any) => {
              if (options?.merge && colMap.has(docId)) {
                colMap.set(docId, { ...colMap.get(docId), ...data });
              } else {
                colMap.set(docId, { ...data });
              }
            },
            delete: async () => {
              colMap.delete(docId);
            },
            collection: (subName: string) => {
              const subMap = getSubCol(`${docKey}/${subName}`);
              return {
                doc: (subDocId: string) => ({
                  set: async (data: any) => {
                    subMap.set(subDocId, { ...data });
                  },
                  get: async () => {
                    const data = subMap.get(subDocId);
                    return {
                      exists: data !== undefined,
                      data: () => data,
                    };
                  },
                  ref: {
                    delete: async () => {
                      subMap.delete(subDocId);
                    },
                  },
                }),
                get: async () => {
                  const docs = Array.from(subMap.entries()).map(([id, d]) => ({
                    id,
                    data: () => d,
                    ref: {
                      delete: async () => subMap.delete(id),
                    },
                  }));
                  return {
                    empty: docs.length === 0,
                    docs,
                  };
                },
              };
            },
          };
        },
        where: (field: string, op: string, val: any) => ({
          get: async () => {
            const matches: any[] = [];
            for (const [id, data] of colMap.entries()) {
              if (op === '==' && data[field] === val) {
                matches.push({ id, data: () => data });
              }
            }
            return {
              empty: matches.length === 0,
              docs: matches,
            };
          },
        }),
      };
    },
    runTransaction: async (updateFunction: (tx: any) => Promise<any>) => {
      const tx: any = {
        get: async (docRef: any) => docRef.get(),
        set: async (docRef: any, data: any, opts?: any) => docRef.set(data, opts),
        delete: async (docRef: any) => docRef.delete(),
      };
      return await updateFunction(tx);
    },
  };

  return db;
}

async function runPhase9Verification() {
  console.log('=== FLOAT Phase 9: Persistence, State, and Checkpoints Verification ===\n');
  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => {
            console.log(`[PASS] Test ${total}: ${name}`);
            passed++;
          })
          .catch(err => {
            console.error(`[FAIL] Test ${total}: ${name}:`, err.message);
            process.exitCode = 1;
          });
      }
      console.log(`[PASS] Test ${total}: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] Test ${total}: ${name}:`, err.message);
      process.exitCode = 1;
    }
  }

  // --------------------------------------------------------------------------
  // Test 1: Workspace Checkpoint Creation, Modification, and Deterministic Rollback
  // --------------------------------------------------------------------------
  await test('Workspace Checkpoint captures files and restores deleted/mutated states cleanly', async () => {
    const ws = new InMemoryWorkspace();
    await ws.writeFile('src/main.ts', 'console.log("Original Main");');
    await ws.writeFile('src/utils.ts', 'export const add = (a: number, b: number) => a + b;');

    const manager = new WorkspaceCheckpointManager(ws);
    const ckpt = await manager.createCheckpoint('proj-1', 'Initial Baseline');

    assert.ok(ckpt.id.startsWith('chk_'));
    assert.strictEqual(ckpt.projectId, 'proj-1');
    assert.strictEqual(ckpt.fileSnapshots.get('src/main.ts'), 'console.log("Original Main");');

    // Mutate main.ts, delete utils.ts, and create an untracked file
    await ws.writeFile('src/main.ts', 'console.log("MUTATED CORRUPT");');
    await ws.deleteFile('src/utils.ts');
    await ws.writeFile('src/untracked.ts', 'export const evil = true;');

    assert.strictEqual(await ws.readFile('src/main.ts'), 'console.log("MUTATED CORRUPT");');
    assert.strictEqual(await ws.fileExists('src/utils.ts'), false);
    assert.strictEqual(await ws.fileExists('src/untracked.ts'), true);

    // Rollback
    const restoreResult = await manager.restoreCheckpoint(ckpt.id);
    assert.strictEqual(restoreResult.success, true);
    assert.strictEqual(await ws.readFile('src/main.ts'), 'console.log("Original Main");');
    assert.strictEqual(await ws.readFile('src/utils.ts'), 'export const add = (a: number, b: number) => a + b;');
  });

  // --------------------------------------------------------------------------
  // Test 2: Checkpoint Export, SHA-256 Checksum, and Tamper Detection
  // --------------------------------------------------------------------------
  await test('Checkpoint Export generates valid SHA-256 and detects tampering on import', async () => {
    const ws = new InMemoryWorkspace();
    await ws.writeFile('config.json', '{"env":"test"}');

    const manager = new WorkspaceCheckpointManager(ws);
    const ckpt = await manager.createCheckpoint('proj-2', 'Before config change');

    const exported = manager.exportCheckpoint(ckpt.id);
    assert.ok(exported, 'Exported string must exist');
    const parsed = JSON.parse(exported);
    assert.strictEqual(parsed.id, ckpt.id);
    assert.strictEqual(parsed.fileCount, 1);
    assert.ok(parsed.sha256 && parsed.sha256.length === 64);

    // Re-importing unmodified JSON succeeds
    const manager2 = new WorkspaceCheckpointManager(ws);
    const imported = manager2.importCheckpoint(exported);
    assert.strictEqual(imported.id, ckpt.id);
    assert.strictEqual(imported.fileSnapshots.get('config.json'), '{"env":"test"}');

    // Tampering with content while preserving old sha256 must throw error
    parsed.fileSnapshots['config.json'] = '{"env":"hacked"}';
    assert.throws(
      () => manager2.importCheckpoint(JSON.stringify(parsed)),
      /Checkpoint integrity verification failed/
    );
  });

  // --------------------------------------------------------------------------
  // Test 3: Local Workspace Disk Persistence (.float/checkpoints/${id}.json)
  // --------------------------------------------------------------------------
  await test('Checkpoint persists to workspace disk and reloads across manager instances', async () => {
    const ws = new InMemoryWorkspace();
    await ws.writeFile('src/app.ts', 'const app = 1;');

    const manager = new WorkspaceCheckpointManager(ws);
    const ckpt = await manager.createCheckpoint('proj-disk', 'Disk test');

    const diskPath = await manager.persistToWorkspaceDisk(ckpt.id);
    assert.strictEqual(diskPath, `.float/checkpoints/${ckpt.id}.json`);
    assert.strictEqual(await ws.fileExists(diskPath), true);

    // Simulate restart with fresh manager instance
    const freshManager = new WorkspaceCheckpointManager(ws);
    assert.strictEqual(freshManager.getCheckpoint(ckpt.id), undefined);

    const reloaded = await freshManager.loadFromWorkspaceDisk(ckpt.id);
    assert.ok(reloaded);
    assert.strictEqual(reloaded.id, ckpt.id);
    assert.strictEqual(reloaded.fileSnapshots.get('src/app.ts'), 'const app = 1;');
  });

  // --------------------------------------------------------------------------
  // Test 4: Automatic Pre-Proposal Safety Checkpoints and Rollback
  // --------------------------------------------------------------------------
  await test('Proposal Applier captures automatic safety checkpoint before applying changes', async () => {
    const ws = new InMemoryWorkspace();
    await ws.writeFile('src/feature.ts', 'export function feature() { return "v1"; }');

    const manager = new WorkspaceCheckpointManager(ws);
    const proposal: IProposal = {
      id: 'prop-safety-1',
      projectId: 'proj-safety',
      title: 'Upgrade feature to v2',
      description: 'Upgrades feature logic',
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files: [
        {
          path: 'src/feature.ts',
          operation: 'modify',
          originalContent: 'export function feature() { return "v1"; }',
          originalHash: computeContentHash('export function feature() { return "v1"; }'),
          proposedContent: 'export function feature() { return "v2"; }',
          proposedHash: computeContentHash('export function feature() { return "v2"; }'),
          status: 'pending',
        },
      ],
    };

    const applyRes = await applyProposal({
      proposal,
      workspace: ws,
      checkpointManager: manager,
    });

    assert.strictEqual(applyRes.success, true);
    assert.ok(applyRes.checkpointId, 'Proposal apply recorded pre-apply safety checkpoint');
    assert.strictEqual(await ws.readFile('src/feature.ts'), 'export function feature() { return "v2"; }');

    // Rollback via captured checkpoint
    const rollbackRes = await manager.restoreCheckpoint(applyRes.checkpointId!);
    assert.strictEqual(rollbackRes.success, true);
    assert.strictEqual(await ws.readFile('src/feature.ts'), 'export function feature() { return "v1"; }');
  });

  // --------------------------------------------------------------------------
  // Test 5: Conflict Detection Protects Workspace from Stale Modifications
  // --------------------------------------------------------------------------
  await test('Proposal conflict detection halts application if underlying files changed externally', async () => {
    const ws = new InMemoryWorkspace();
    await ws.writeFile('src/conflict.ts', 'version A');

    const proposal: IProposal = {
      id: 'prop-conflict-1',
      projectId: 'proj-conflict',
      title: 'Modify conflict.ts',
      description: 'Conflict test',
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files: [
        {
          path: 'src/conflict.ts',
          operation: 'modify',
          originalContent: 'version A',
          originalHash: computeContentHash('version A'),
          proposedContent: 'version B',
          status: 'pending',
        },
      ],
    };

    // External edit before apply
    await ws.writeFile('src/conflict.ts', 'version A MUTATED');

    const conflicts = await checkProposalConflicts(proposal, ws);
    assert.strictEqual(conflicts.length, 1);
    assert.ok(conflicts[0].reason.includes('modified in the workspace'));

    const applyRes = await applyProposal({
      proposal,
      workspace: ws,
    });
    assert.strictEqual(applyRes.success, false);
    assert.strictEqual(applyRes.status, 'stale');
    assert.strictEqual(await ws.readFile('src/conflict.ts'), 'version A MUTATED');
  });

  // --------------------------------------------------------------------------
  // Test 6: Durable State Storage - Inline Payloads
  // --------------------------------------------------------------------------
  await test('Durable storage saves and reloads inline payloads with SHA-256 and TTL metadata', async () => {
    const mockDb = createMockFirestoreDb();
    setCustomFirestoreDbForTests(mockDb);

    const smallPayload = { setting: 'dark_mode', editorFontSize: 14 };
    const manifest = await saveLargePayloadDurable({
      collectionName: 'user_preferences',
      docId: 'pref_user_1',
      ownerId: 'user_alice',
      projectId: 'proj_global',
      payload: smallPayload,
      ttlMs: 3600_000,
    });

    assert.strictEqual(manifest.storageBackend, 'inline');
    assert.strictEqual(manifest.ownerId, 'user_alice');
    assert.ok(manifest.sha256.length === 64);
    assert.ok(manifest.expiresAtMs > Date.now());

    const loaded = await loadLargePayloadDurable<{ setting: string; editorFontSize: number }>({
      collectionName: 'user_preferences',
      docId: 'pref_user_1',
      ownerId: 'user_alice',
    });

    assert.ok(loaded);
    assert.strictEqual(loaded.payload.setting, 'dark_mode');
    assert.strictEqual(loaded.payload.editorFontSize, 14);
    assert.strictEqual(loaded.manifest.storageBackend, 'inline');
  });

  // --------------------------------------------------------------------------
  // Test 7: Durable State Storage - Large Payloads (>900KB) with Firestore Chunking
  // --------------------------------------------------------------------------
  await test('Durable storage splits large payloads into subcollections and reassembles with integrity check', async () => {
    const mockDb = createMockFirestoreDb();
    setCustomFirestoreDbForTests(mockDb);

    // Create a 1.2 MB string payload
    const largeCode = 'function simulateHeavyWorkload() {\n  return "payload_data_block_' + 'X'.repeat(80) + '";\n}\n';
    const repeats = Math.ceil((1.2 * 1024 * 1024) / largeCode.length);
    const largeObject = { code: largeCode.repeat(repeats), index: 42 };

    const manifest = await saveLargePayloadDurable({
      collectionName: 'workspace_snapshots',
      docId: 'snapshot_large_1',
      ownerId: 'user_alice',
      projectId: 'proj_scale',
      payload: largeObject,
      thresholdBytes: 500 * 1024, // Trigger chunking at 500KB
    });

    assert.strictEqual(manifest.storageBackend, 'firestore_chunks');
    assert.ok((manifest.chunkCount ?? 0) >= 2, 'Payload must be split into multiple chunks');

    const loaded = await loadLargePayloadDurable<typeof largeObject>({
      collectionName: 'workspace_snapshots',
      docId: 'snapshot_large_1',
      ownerId: 'user_alice',
    });

    assert.ok(loaded);
    assert.strictEqual(loaded.payload.index, 42);
    assert.strictEqual(loaded.payload.code.length, largeObject.code.length);
    assert.strictEqual(loaded.manifest.storageBackend, 'firestore_chunks');
  });

  // --------------------------------------------------------------------------
  // Test 8: UTF-8 Multi-Byte Boundary Safe Chunking
  // --------------------------------------------------------------------------
  await test('splitUtf8IntoChunks preserves multi-byte UTF-8 emojis across chunk boundaries', () => {
    // 4-byte UTF-8 emoji: 🚀 (F0 9F 9A 80)
    const repeatedEmojis = '🚀✨🌟🔥'.repeat(500);
    const chunks = splitUtf8IntoChunks(repeatedEmojis, 100);

    const reassembled = chunks.join('');
    assert.strictEqual(reassembled, repeatedEmojis);
    assert.strictEqual(computePayloadSha256(reassembled), computePayloadSha256(repeatedEmojis));
  });

  // --------------------------------------------------------------------------
  // Test 9: Multi-Tenant Isolation & Fail-Closed Security in Durable State
  // --------------------------------------------------------------------------
  await test('Cross-tenant durable storage access and deletion are strictly rejected', async () => {
    const mockDb = createMockFirestoreDb();
    setCustomFirestoreDbForTests(mockDb);

    await saveServerDocDurable('confidential_docs', 'doc_secret_1', 'user_alice', {
      apiSecret: 'sk-alice-top-secret',
    });

    // Bob attempts to read Alice's doc
    const bobRead = await getServerDocDurable('confidential_docs', 'doc_secret_1', 'user_bob');
    assert.strictEqual(bobRead, null, 'User B must not read User A durable doc');

    // Bob attempts to delete Alice's doc
    const bobDelete = await deleteServerDocDurable('confidential_docs', 'doc_secret_1', 'user_bob');
    assert.strictEqual(bobDelete, false, 'User B must not delete User A durable doc');

    // Alice reads own doc
    const aliceRead = await getServerDocDurable<{ apiSecret: string }>('confidential_docs', 'doc_secret_1', 'user_alice');
    assert.ok(aliceRead);
    assert.strictEqual(aliceRead.apiSecret, 'sk-alice-top-secret');
  });

  // --------------------------------------------------------------------------
  // Test 10: Automatic TTL Expiration Checks
  // --------------------------------------------------------------------------
  await test('Durable storage rejects expired documents on read', async () => {
    const mockDb = createMockFirestoreDb();
    setCustomFirestoreDbForTests(mockDb);

    // Save with expired TTL (-5 seconds)
    await saveLargePayloadDurable({
      collectionName: 'ephemeral_tokens',
      docId: 'token_exp_1',
      ownerId: 'user_alice',
      projectId: 'proj_auth',
      payload: { token: 'expired-123' },
      ttlMs: -5000,
    });

    const loaded = await loadLargePayloadDurable({
      collectionName: 'ephemeral_tokens',
      docId: 'token_exp_1',
      ownerId: 'user_alice',
    });
    assert.strictEqual(loaded, null, 'Expired document must return null on read');
  });

  // --------------------------------------------------------------------------
  // Test 11: Transactional Rate Limiter with Sliding Window and Quota Enforcement
  // --------------------------------------------------------------------------
  await test('checkTransactionalRateLimit enforces rate bounds and resets on window expiry', async () => {
    const mockDb = createMockFirestoreDb();
    setCustomFirestoreDbForTests(mockDb);
    resetFallbackRateLimitsForTests();

    const bucket = 'composer_completions';
    const user = 'user_rate_test';
    const maxRequests = 3;
    const windowMs = 50;

    assert.strictEqual(await checkTransactionalRateLimit(bucket, user, maxRequests, windowMs), true);
    assert.strictEqual(await checkTransactionalRateLimit(bucket, user, maxRequests, windowMs), true);
    assert.strictEqual(await checkTransactionalRateLimit(bucket, user, maxRequests, windowMs), true);
    // 4th request must be rate-limited
    assert.strictEqual(await checkTransactionalRateLimit(bucket, user, maxRequests, windowMs), false);

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 60));

    // Next request must be permitted in the new window
    assert.strictEqual(await checkTransactionalRateLimit(bucket, user, maxRequests, windowMs), true);
  });

  // --------------------------------------------------------------------------
  // Test 12: Conversation Message Serialization Bounds and Manifest Verification
  // --------------------------------------------------------------------------
  await test('Conversation messages enforce UTF-8 size bounds and complete manifest verification', () => {
    const messages: AIMessage[] = [
      { id: 'm1', role: 'user', content: 'Hello FLOAT', timestamp: 1000 },
      { id: 'm2', role: 'assistant', content: 'Hello! How can I help you?', timestamp: 1010 },
    ];

    const serialized = serializeConversationMessages(messages);
    assert.ok(serialized);
    assert.strictEqual(serialized.length, 2);
    assert.strictEqual(serialized[0].index, 0);

    // Oversized message exceeding MAX_CONVERSATION_MESSAGE_BYTES returns null
    const hugeMessage: AIMessage = {
      id: 'm_huge',
      role: 'user',
      content: 'A'.repeat(MAX_CONVERSATION_MESSAGE_BYTES + 100),
      timestamp: 1020,
    };
    assert.strictEqual(serializeConversationMessages([hugeMessage]), null);

    // Manifest verification: incomplete generation returns null
    const parsedIncomplete = parseConversationMessageDocuments(
      [
        { id: 'gen1_00000000', index: 0, message: JSON.stringify(messages[0]), generation: 'gen1' },
      ],
      { ownerId: 'user_1', generation: 'gen1', count: 2, complete: true } // expects 2 docs, only 1 provided
    );
    assert.strictEqual(parsedIncomplete, null, 'Incomplete document batch must fail manifest validation');

    // Complete generation matches
    const parsedComplete = parseConversationMessageDocuments(
      [
        { id: 'gen1_00000000', index: 0, message: JSON.stringify(messages[0]), generation: 'gen1' },
        { id: 'gen1_00000001', index: 1, message: JSON.stringify(messages[1]), generation: 'gen1' },
      ],
      { ownerId: 'user_1', generation: 'gen1', count: 2, complete: true }
    );
    assert.ok(parsedComplete);
    assert.strictEqual(parsedComplete.length, 2);
    assert.strictEqual(parsedComplete[1].content, 'Hello! How can I help you?');
  });

  // --------------------------------------------------------------------------
  // Test 13: End-to-End Checkpoint Save and Rehydration via Durable Storage
  // --------------------------------------------------------------------------
  await test('WorkspaceCheckpointManager saves to durable cloud storage and rehydrates with fidelity', async () => {
    const mockDb = createMockFirestoreDb();
    setCustomFirestoreDbForTests(mockDb);

    const ws = new InMemoryWorkspace();
    await ws.writeFile('src/core.ts', 'export const ENGINE_VERSION = 1;');
    await ws.writeFile('docs/README.md', '# Core Docs');

    const manager1 = new WorkspaceCheckpointManager(ws);
    const ckpt = await manager1.createCheckpoint('proj-cloud', 'Snapshot before major refactor');

    const saveResult = await manager1.saveToDurableStorage(ckpt.id, 'user_cloud_engineer');
    assert.ok(saveResult);
    assert.strictEqual(saveResult.manifestId, ckpt.id);

    // Create a new checkpoint manager instance with empty in-memory state
    const manager2 = new WorkspaceCheckpointManager(ws);
    assert.strictEqual(manager2.getCheckpoint(ckpt.id), undefined);

    const rehydrated = await manager2.loadFromDurableStorage(ckpt.id, 'user_cloud_engineer');
    assert.ok(rehydrated);
    assert.strictEqual(rehydrated.id, ckpt.id);
    assert.strictEqual(rehydrated.fileSnapshots.get('src/core.ts'), 'export const ENGINE_VERSION = 1;');
    assert.strictEqual(rehydrated.fileSnapshots.get('docs/README.md'), '# Core Docs');

    // Bob cannot load Alice's cloud checkpoint
    const bobAccess = await manager2.loadFromDurableStorage(ckpt.id, 'user_bob_impostor');
    assert.strictEqual(bobAccess, null);
  });

  // Summary
  console.log(`\n======================================================`);
  console.log(`Phase 9 Verification: ${passed}/${total} test cases passed.`);
  console.log(`======================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runPhase9Verification().catch(err => {
  console.error('Unhandled verification error:', err);
  process.exit(1);
});
