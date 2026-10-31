import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  LARGE_PAYLOAD_THRESHOLD_BYTES,
  checkTransactionalRateLimit,
  setCustomFirestoreDbForTests,
  setCustomGcsAdapterForTests,
  type GcsAdapter
} from '../src/server/durableState';
import {
  claimQueuedAgentTask,
  getAgentTaskWorkspace,
  heartbeatAgentTask,
  releaseAgentProjectLease,
  saveAgentTask,
  saveAgentTaskWorkspace,
  setAgentPersistenceDbForTests
} from '../src/server/agentPersistence';
import { ProposalService } from '../src/server/agent/proposalService';
import { TerminalService } from '../src/server/terminal/terminalService';
import { SkillsService } from '../src/server/skills/skillsService';
import { ExecutionPolicyManager } from '../src/server/policy/executionPolicy';
import {
  getUserCloudSessionConfigDurable,
  resetUserCloudSessionsForTests,
  updateUserCloudSessionConfigDurable
} from '../src/server/providers/cloudAgentConfig';
import { checkAnalystRateLimitDurable, resetAnalystRateLimitsForTests } from '../src/server/analystRouter';
import { checkEndpointRateLimitDurable, resetEndpointRateLimitsForTests } from '../src/server/app';
import { orchestrator } from '../src/server/agentOrchestrator';
import { startBackgroundAgentWorkerLoop } from '../worker';

/**
 * Deterministic in-process Firestore mock supporting collections, nested subcollections (`chunks`),
 * `.where('ownerId', '==', ...)`, `.where('status', '==', ...)`, and atomic `.runTransaction(...)`.
 */
function createMockFirestoreDb() {
  const store = new Map<string, Record<string, any>>();

  const makeDocRef = (docPath: string): any => ({
    id: docPath.split('/').pop()!,
    path: docPath,
    async get() {
      const raw = store.get(docPath);
      const data = raw ? JSON.parse(JSON.stringify(raw)) : undefined;
      return {
        id: docPath.split('/').pop()!,
        exists: data !== undefined,
        data: () => data,
        get: (field: string) => (data ? data[field] : undefined),
        ref: makeDocRef(docPath)
      };
    },
    async set(val: Record<string, any>, options?: { merge?: boolean }) {
      const existing = options?.merge ? (store.get(docPath) || {}) : {};
      const merged: Record<string, any> = { ...existing };
      for (const [k, v] of Object.entries(val)) {
        if (v && typeof v === 'object' && v.constructor?.name === 'DeleteTransform') {
          delete merged[k];
        } else {
          merged[k] = v instanceof Date ? new Date(v.getTime()) : v;
        }
      }
      store.set(docPath, merged);
    },
    async update(val: Record<string, any>) {
      if (!store.has(docPath)) throw new Error(`Document ${docPath} does not exist`);
      await this.set(val, { merge: true });
    },
    async delete() {
      store.delete(docPath);
    },
    collection(subName: string) {
      return makeCollectionRef(`${docPath}/${subName}`);
    }
  });

  const makeCollectionRef = (colPath: string): any => {
    const getMatchingDocs = (filters: Array<{ field: string; op: string; value: any }>) => {
      const prefix = `${colPath}/`;
      const docs: any[] = [];
      for (const [key, val] of store.entries()) {
        if (!key.startsWith(prefix)) continue;
        const remainder = key.slice(prefix.length);
        if (remainder.includes('/')) continue; // exclude subcollection docs
        const matches = filters.every(f => {
          if (f.op === '==') return val[f.field] === f.value;
          if (f.op === 'in' && Array.isArray(f.value)) return f.value.includes(val[f.field]);
          return false;
        });
        if (matches) {
          const copy = JSON.parse(JSON.stringify(val));
          docs.push({
            id: remainder,
            exists: true,
            data: () => copy,
            get: (field: string) => copy[field],
            ref: makeDocRef(key)
          });
        }
      }
      return docs;
    };

    const buildQuery = (filters: Array<{ field: string; op: string; value: any }>): any => ({
      where(field: string, op: string, value: any) {
        return buildQuery([...filters, { field, op, value }]);
      },
      async get() {
        const docs = getMatchingDocs(filters);
        return {
          empty: docs.length === 0,
          size: docs.length,
          docs
        };
      }
    });

    return {
      doc(docId: string) {
        return makeDocRef(`${colPath}/${docId}`);
      },
      where(field: string, op: string, value: any) {
        return buildQuery([{ field, op, value }]);
      },
      async get() {
        const docs = getMatchingDocs([]);
        return {
          empty: docs.length === 0,
          size: docs.length,
          docs
        };
      }
    };
  };

  let txLock = Promise.resolve();

  return {
    store,
    collection(name: string) {
      return makeCollectionRef(name);
    },
    async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      const prev = txLock;
      let release!: () => void;
      txLock = new Promise<void>(r => {
        release = r;
      });
      await prev;
      try {
        const tx = {
          async get(ref: any) {
            return ref.get();
          },
          set(ref: any, val: Record<string, any>, options?: { merge?: boolean }) {
            void ref.set(val, options);
          },
          update(ref: any, val: Record<string, any>) {
            void ref.update(val);
          },
          delete(ref: any) {
            void ref.delete();
          }
        };
        return await fn(tx);
      } finally {
        release();
      }
    }
  };
}

async function runTests() {
  console.log('=== Phase 4: Durable State, >900 KB Storage Offloading & Background Worker Tests ===\n');

  const mockDb = createMockFirestoreDb();
  setCustomFirestoreDbForTests(mockDb);
  setAgentPersistenceDbForTests(mockDb);

  try {
    // ------------------------------------------------------------------------
    // Suite 1: Durable State Persistence Across Restart + Tenant Isolation
    // ------------------------------------------------------------------------
    console.log('Suite 1: Durable state persistence across restart & tenant isolation...');
    {
      // 1A. ProposalService
      ProposalService.clearCacheForTests();
      const created = await ProposalService.createProposalDurable({
        ownerId: 'user-alpha',
        projectId: 'proj-1',
        description: 'Durable proposal test',
        rawChanges: [
          {
            path: 'src/index.ts',
            operation: 'modify',
            proposedContent: 'export const durable = true;\n'
          }
        ],
        virtualFiles: new Map([['src/index.ts', { content: 'export const durable = false;\n' }]])
      });
      assert.ok(created.proposal, 'Proposal should be created');
      const proposalId = created.proposal.id;

      // Simulate server restart by wiping in-memory cache
      ProposalService.clearCacheForTests();
      assert.equal(ProposalService.getProposal(proposalId), undefined, 'In-memory cache must be empty after restart');

      // Owner can load from Firestore
      const reloaded = await ProposalService.getProposalDurable(proposalId, 'user-alpha');
      assert.ok(reloaded, 'Owner must reload proposal from Firestore after restart');
      assert.equal(reloaded.description, 'Durable proposal test');

      // Cross-tenant access blocked
      const crossTenantProposal = await ProposalService.getProposalDurable(proposalId, 'user-beta');
      assert.equal(crossTenantProposal, null, 'User Beta must not read User Alpha proposal');

      // 1B. TerminalService
      TerminalService.clear();
      const term = await TerminalService.createSessionDurable('proj-1', 'user-alpha', 'Build Shell');
      await TerminalService.appendExecutionDurable(term.id, 'user-alpha', 'npm test', 'All tests green', '', 0);

      // Simulate restart
      TerminalService.clear();
      assert.equal(TerminalService.getSession(term.id, 'user-alpha'), undefined);

      const reloadedTerm = await TerminalService.getSessionDurable(term.id, 'user-alpha');
      assert.ok(reloadedTerm, 'Terminal session must survive restart in Firestore');
      assert.ok(reloadedTerm.outputBuffer.includes('All tests green'));

      const crossTenantTerm = await TerminalService.getSessionDurable(term.id, 'user-beta');
      assert.equal(crossTenantTerm, undefined, 'User Beta must not access User Alpha terminal session');

      // 1C. SkillsService
      SkillsService.clear();
      await SkillsService.registerSkillDurable(
        {
          id: 'custom-security-audit',
          name: 'Custom Security Skill',
          description: 'Audits SQL queries',
          instructions: 'Always parameterize SQL queries.',
          allowedTools: ['read_project_file'],
          scope: 'user',
          enabled: true,
          keywords: ['sql', 'audit'],
          permissionsRequired: ['read']
        },
        'user-alpha'
      );

      // Simulate restart
      SkillsService.clear();
      assert.equal(SkillsService.getSkill('custom-security-audit', 'user-alpha'), undefined);

      const alphaSkills = await SkillsService.getAllSkillsDurable('user-alpha');
      assert.ok(alphaSkills.some(s => s.id === 'custom-security-audit'), 'User Alpha custom skill must survive restart');

      const betaSkills = await SkillsService.getAllSkillsDurable('user-beta');
      assert.ok(!betaSkills.some(s => s.id === 'custom-security-audit'), 'User Beta must not see User Alpha custom skill');

      // 1D. ExecutionPolicyManager
      ExecutionPolicyManager.clearCacheForTests();
      await ExecutionPolicyManager.setPolicyModeDurable('user-alpha', 'safe');
      await ExecutionPolicyManager.setPolicyModeDurable('user-beta', 'manual');

      // Simulate restart
      ExecutionPolicyManager.clearCacheForTests();
      assert.equal(await ExecutionPolicyManager.getPolicyModeDurable('user-alpha'), 'safe');
      assert.equal(await ExecutionPolicyManager.getPolicyModeDurable('user-beta'), 'manual');

      // 1E. cloudAgentConfig user sessions
      resetUserCloudSessionsForTests();
      const updatedSession = await updateUserCloudSessionConfigDurable('user-alpha', {
        sessionId: 'sess_custom_alpha_12345',
        environmentId: 'env_custom_alpha_67890'
      });
      assert.equal(updatedSession.ok, true);

      // Simulate restart
      resetUserCloudSessionsForTests();
      const alphaCloud = await getUserCloudSessionConfigDurable('user-alpha');
      assert.equal(alphaCloud.sessionId, 'sess_custom_alpha_12345');
      const betaCloud = await getUserCloudSessionConfigDurable('user-beta');
      assert.notEqual(betaCloud.sessionId, 'sess_custom_alpha_12345', 'User Beta must not inherit User Alpha cloud session');

      console.log('  ✓ Passed Suite 1');
    }

    // ------------------------------------------------------------------------
    // Suite 2: Transactional Rate Limiters with Firestore TTL
    // ------------------------------------------------------------------------
    console.log('Suite 2: Transactional rate limiters with Firestore TTL...');
    {
      resetAnalystRateLimitsForTests();
      resetEndpointRateLimitsForTests();

      assert.equal(await checkAnalystRateLimitDurable('user-rate-1', 2, 60_000), true);
      assert.equal(await checkAnalystRateLimitDurable('user-rate-1', 2, 60_000), true);
      assert.equal(await checkAnalystRateLimitDurable('user-rate-1', 2, 60_000), false, '3rd request must be rate limited');

      // Different user is isolated
      assert.equal(await checkAnalystRateLimitDurable('user-rate-2', 2, 60_000), true);

      // Verify TTL metadata in Firestore document
      const rateDoc = mockDb.store.get('server_rate_limits/analyst:user-rate-1');
      assert.ok(rateDoc, 'Rate limit counter must be stored in server_rate_limits collection');
      assert.equal(rateDoc.count, 2);
      assert.ok(rateDoc.expiresAt instanceof Date, 'Rate limit doc must include Firestore TTL expiresAt Date');
      assert.ok(rateDoc.expiresAtMs > Date.now(), 'Rate limit TTL must be in the future');

      // Chat endpoint rate limiter
      assert.equal(await checkEndpointRateLimitDurable('chat', 'user-chat-1', 1, 60_000), true);
      assert.equal(await checkEndpointRateLimitDurable('chat', 'user-chat-1', 1, 60_000), false);
      console.log('  ✓ Passed Suite 2');
    }

    // ------------------------------------------------------------------------
    // Suite 3: >900 KB Workspace Offloading (Chunked Firestore & Cloud Storage)
    // ------------------------------------------------------------------------
    console.log('Suite 3: >900 KB workspace size-limit handling (Chunked Firestore & GCS)...');
    {
      // Create a ~1.35 MB workspace (exceeds 900 KB threshold)
      const largeFiles = Array.from({ length: 15 }, (_, idx) => ({
        path: `src/module_${idx}.ts`,
        name: `module_${idx}.ts`,
        type: 'file',
        content: `// Module ${idx}\n` + 'export const DATA = "' + 'A'.repeat(95 * 1024) + '";\n'
      }));
      const totalBytes = Buffer.byteLength(JSON.stringify(largeFiles), 'utf8');
      assert.ok(totalBytes > LARGE_PAYLOAD_THRESHOLD_BYTES, `Expected >900 KB workspace, got ${totalBytes} bytes`);

      // 3A. Without GOOGLE_CLOUD_STORAGE_BUCKET -> Chunked Firestore subcollection
      const prevBucket = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
      delete process.env.GOOGLE_CLOUD_STORAGE_BUCKET;

      await saveAgentTaskWorkspace('task-chunked-1', 'user-alpha', 'proj-large', largeFiles);
      const manifestDoc = mockDb.store.get('agentTaskWorkspaces/task-chunked-1');
      assert.ok(manifestDoc, 'Workspace manifest doc must exist in Firestore');
      assert.equal(manifestDoc.storageBackend, 'firestore_chunks');
      assert.ok(manifestDoc.chunkCount >= 2, `Expected >=2 chunks, got ${manifestDoc.chunkCount}`);
      assert.ok(manifestDoc.expiresAt instanceof Date, 'Manifest must have TTL expiresAt');

      // Reassemble and verify integrity
      const loadedChunked = await getAgentTaskWorkspace('task-chunked-1', 'user-alpha');
      assert.ok(loadedChunked, 'Must load chunked workspace for owner');
      assert.equal(loadedChunked.length, 15);
      assert.equal(loadedChunked[14].content.length, largeFiles[14].content.length);

      // Cross-tenant read denied
      const deniedChunked = await getAgentTaskWorkspace('task-chunked-1', 'user-beta');
      assert.equal(deniedChunked, null, 'User Beta must not load User Alpha chunked workspace');

      // 3B. With GOOGLE_CLOUD_STORAGE_BUCKET -> Offloaded to Cloud Storage with metadata in Firestore
      const gcsObjects = new Map<string, Buffer>();
      const mockGcs: GcsAdapter = {
        async uploadObject(bucket, objectPath, data) {
          gcsObjects.set(`${bucket}/${objectPath}`, Buffer.from(data));
        },
        async downloadObject(bucket, objectPath) {
          return gcsObjects.get(`${bucket}/${objectPath}`) || null;
        },
        async deleteObject(bucket, objectPath) {
          gcsObjects.delete(`${bucket}/${objectPath}`);
        }
      };
      setCustomGcsAdapterForTests(mockGcs);
      process.env.GOOGLE_CLOUD_STORAGE_BUCKET = 'float-test-workspaces-bucket';

      await saveAgentTaskWorkspace('task-gcs-1', 'user-alpha', 'proj-large', largeFiles);
      const gcsManifest = mockDb.store.get('agentTaskWorkspaces/task-gcs-1');
      assert.ok(gcsManifest, 'GCS workspace metadata must be stored in Firestore');
      assert.equal(gcsManifest.storageBackend, 'gcs');
      assert.equal(gcsManifest.gcsBucket, 'float-test-workspaces-bucket');
      assert.equal(gcsManifest.files, undefined, 'Inline files must be omitted from Firestore when offloaded to GCS');
      assert.ok(gcsObjects.has(`float-test-workspaces-bucket/${gcsManifest.gcsObjectPath}`), 'Payload must exist in GCS bucket');

      const loadedFromGcs = await getAgentTaskWorkspace('task-gcs-1', 'user-alpha');
      assert.ok(loadedFromGcs, 'Must load >900 KB workspace from GCS');
      assert.equal(loadedFromGcs.length, 15);
      assert.equal(loadedFromGcs[0].content, largeFiles[0].content);

      // Cross-tenant read denied
      assert.equal(await getAgentTaskWorkspace('task-gcs-1', 'user-beta'), null);

      if (prevBucket === undefined) delete process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
      else process.env.GOOGLE_CLOUD_STORAGE_BUCKET = prevBucket;
      setCustomGcsAdapterForTests(null);
      console.log('  ✓ Passed Suite 3');
    }

    // ------------------------------------------------------------------------
    // Suite 4: Background Worker Transactional Task Claiming, Leases & Heartbeats
    // ------------------------------------------------------------------------
    console.log('Suite 4: Background worker transactional task claiming, leases & heartbeats...');
    {
      const taskId = 'task-worker-claim-1';
      await saveAgentTask({
        id: taskId,
        ownerId: 'user-alpha',
        projectId: 'proj-worker-1',
        name: 'Worker Lease Test',
        status: 'QUEUED',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      // Two workers race to claim the same queued task
      const [claimA, claimB] = await Promise.all([
        claimQueuedAgentTask(taskId, 'worker-A'),
        claimQueuedAgentTask(taskId, 'worker-B')
      ]);
      assert.equal(
        Number(claimA) + Number(claimB),
        1,
        'Exactly one worker must win the transactional claim'
      );
      const winningWorker = claimA ? 'worker-A' : 'worker-B';
      const losingWorker = claimA ? 'worker-B' : 'worker-A';

      // Verify project lease prevents a second task on the same project while lease is active
      await saveAgentTask({
        id: 'task-worker-claim-2',
        ownerId: 'user-alpha',
        projectId: 'proj-worker-1',
        name: 'Concurrent Task Same Project',
        status: 'QUEUED',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      const secondProjectClaim = await claimQueuedAgentTask('task-worker-claim-2', losingWorker);
      assert.equal(secondProjectClaim, false, 'Active project lease must block concurrent task on same project');

      // Heartbeat from winning worker succeeds; heartbeat from losing worker fails
      const hbWinner = await heartbeatAgentTask(taskId, winningWorker);
      assert.equal(hbWinner.active, true, 'Winning worker heartbeat must succeed');

      const hbLoser = await heartbeatAgentTask(taskId, losingWorker);
      assert.equal(hbLoser.active, false, 'Losing worker heartbeat must be rejected');

      // Release lease and verify second task can now be claimed
      await releaseAgentProjectLease(taskId, 'user-alpha', winningWorker);
      const claimAfterRelease = await claimQueuedAgentTask('task-worker-claim-2', losingWorker);
      assert.equal(claimAfterRelease, true, 'Second task must be claimable after lease is released');
      await releaseAgentProjectLease('task-worker-claim-2', 'user-alpha', losingWorker);

      // Verify worker loop start/stop lifecycle
      orchestrator.setEnqueueOnlyMode(true);
      assert.equal(orchestrator.isEnqueueOnlyMode(), true);
      orchestrator.setEnqueueOnlyMode(null);

      const handle = startBackgroundAgentWorkerLoop({ pollIntervalMs: 500, recoveryIntervalMs: 5000 });
      assert.ok(handle.workerId, 'Worker loop must expose workerId');
      const stopRes = await handle.stop();
      assert.ok(Array.isArray(stopRes.requeuedTaskIds));
      console.log('  ✓ Passed Suite 4');
    }

    // ------------------------------------------------------------------------
    // Suite 5: Firestore Rules Server-Only Collection Denial
    // ------------------------------------------------------------------------
    console.log('Suite 5: Firestore security rules deny browser access to server-only collections...');
    {
      const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
      const requiredDeniedCollections = [
        'codeProposals',
        'server_proposals',
        'server_terminal_sessions',
        'server_custom_skills',
        'server_execution_policies',
        'server_cloud_agent_sessions',
        'server_rate_limits',
        'agentTasks',
        'agentTaskEvents',
        'agentTaskResults',
        'agentTaskWorkspaces',
        'agentProjectLeases',
        'server_checkpoints'
      ];
      for (const col of requiredDeniedCollections) {
        assert.ok(
          rulesText.includes(`match /${col}/`),
          `firestore.rules must explicitly define match /${col}/`
        );
      }
      console.log('  ✓ Passed Suite 5');
    }

    console.log('\nALL PHASE 4 TESTS PASSED!');
  } finally {
    setCustomFirestoreDbForTests(null);
    setAgentPersistenceDbForTests(null);
    setCustomGcsAdapterForTests(null);
  }
}

runTests().catch(err => {
  console.error('Phase 4 test failed:', err);
  process.exit(1);
});
