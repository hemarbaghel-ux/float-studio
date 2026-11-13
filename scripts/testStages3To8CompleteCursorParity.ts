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
import { VirtualProjectWorkspaceService } from '../src/server/composer/composerRouter';
import { TabCompletionCoordinator } from '../src/services/completion/tabCompletionService';
import { runTerminalSetupDoctor } from '../src/server/terminal/terminalDoctor';
import { NativeLocalGitService } from '../src/services/git/nativeLocalGitService';
import { createStandardToolRegistry } from '../src/services/composer/canonicalTools';
import { registerBridgedMCPTool } from '../src/services/composer/mcpToolBridge';
import { CloudAgentOrchestrator } from '../src/server/cloudAgent/cloudAgentOrchestrator';
import { summarizeBenchmarkSuite } from '../src/server/evals/benchmarkHarness';
import { LocalFileSystemWorkspaceService } from '../src/services/indexing/localWorkspaceService';
import { CanonicalToolRegistry } from '../src/shared/contracts/tools';
import { WorkspaceFileChangeEvent } from '../src/shared/contracts/workspace';
import { IProposal } from '../src/shared/contracts/proposals';
import { MCPDiscoveredTool, MCPServerConfig } from '../src/server/mcp/mcpService';

let passed = 0;

function check(condition: unknown, label: string): void {
  assert.ok(condition, label);
  passed++;
  console.log(`  [PASS] ${label}`);
}

async function runTests() {
  console.log('=== STAGES 3 TO 8: WORKSPACE, TAB, TERMINAL DOCTOR, NATIVE GIT, MCP, CLOUD AGENT & EVALS ===\n');

  // --- Stage 3A: VirtualProjectWorkspaceService & LocalFileSystemWorkspaceService Contract Parity ---
  console.log('--- Stage 3A: VirtualProjectWorkspaceService & LocalFileSystemWorkspaceService Contract Parity ---');
  const virtualWs = new VirtualProjectWorkspaceService('proj_virtual_test', [
    { path: 'src/index.ts', content: 'export const version = 1;\n' },
  ]);
  check(virtualWs.getRootUri() === 'float-workspace://proj_virtual_test', 'VirtualProjectWorkspaceService.getRootUri() returns stable URI');
  check(virtualWs.resolvePath('./src/index.ts') === 'src/index.ts', 'VirtualProjectWorkspaceService.resolvePath() normalizes safe path');

  let traversalRejected = false;
  try {
    virtualWs.resolvePath('../outside.ts');
  } catch {
    traversalRejected = true;
  }
  check(traversalRejected, 'VirtualProjectWorkspaceService.resolvePath() rejects parent traversal');

  let sensitiveRejected = false;
  try {
    await virtualWs.fileExists('.env.local');
  } catch {
    sensitiveRejected = true;
  }
  check(sensitiveRejected, 'VirtualProjectWorkspaceService.fileExists() enforces validateSafeWorkspacePath without bypass');

  const watchedEvents: WorkspaceFileChangeEvent[] = [];
  const unsubscribe = virtualWs.watch(ev => watchedEvents.push(ev));

  await virtualWs.writeFile('src/helper.ts', 'export const helper = () => 42;\n');
  await virtualWs.writeFile('src/index.ts', 'export const version = 2;\n');
  check(await virtualWs.fileExists('src/helper.ts'), 'VirtualProjectWorkspaceService.fileExists() returns true for written file');
  check((await virtualWs.readFile('src/index.ts')).includes('version = 2'), 'VirtualProjectWorkspaceService.readFile() returns updated content');

  const statHelper = await virtualWs.stat('src/helper.ts');
  check(
    typeof statHelper.size === 'number' &&
      statHelper.size > 0 &&
      typeof statHelper.mtime === 'number' &&
      statHelper.isFile === true &&
      statHelper.isDirectory === false &&
      !('lastModified' in (statHelper as unknown as Record<string, unknown>)),
    'VirtualProjectWorkspaceService.stat() returns authoritative WorkspaceFileStat (size, mtime, isFile, isDirectory)'
  );

  const listedFiles = await virtualWs.listFiles({ includePatterns: [/src\/.*/] });
  check(
    Array.isArray(listedFiles) &&
      listedFiles.length === 2 &&
      listedFiles.every(f => f.type === 'file' && typeof f.mtime === 'number' && typeof f.size === 'number'),
    'VirtualProjectWorkspaceService.listFiles() returns mutable WorkspaceFile[] with mtime and size'
  );

  await virtualWs.deleteFile('src/helper.ts');
  check(!(await virtualWs.fileExists('src/helper.ts')), 'VirtualProjectWorkspaceService.deleteFile() removes file and updates index');

  unsubscribe();
  await virtualWs.writeFile('src/unwatched.ts', 'export const x = 1;\n');
  check(
    watchedEvents.length === 3 &&
      watchedEvents[0].type === 'created' &&
      watchedEvents[1].type === 'modified' &&
      watchedEvents[2].type === 'deleted',
    'VirtualProjectWorkspaceService.watch() emits created, modified, and deleted events and honors unsubscribe()'
  );

  const vCaps = virtualWs.getCapabilities();
  const tempCompareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'float-ws-caps-'));
  try {
    const localCompareWs = new LocalFileSystemWorkspaceService(tempCompareDir);
    const lCaps = localCompareWs.getCapabilities();
    check(
      vCaps.canWatch === true &&
        vCaps.canWrite === true &&
        vCaps.isLocalDisk === false &&
        typeof vCaps.maxFileSize === 'number' &&
        Object.keys(vCaps).sort().join(',') === Object.keys(lCaps).sort().join(','),
      'VirtualProjectWorkspaceService.getCapabilities() matches exact WorkspaceCapabilities contract shape'
    );
  } finally {
    fs.rmSync(tempCompareDir, { recursive: true, force: true });
  }

  // --- Stage 3B: Tab Completion Coordinator ---
  console.log('\n--- Stage 3B: Tab Completion Coordinator ---');
  const tab = new TabCompletionCoordinator();
  check(tab.isAllowedForLanguage('typescript') === true, 'Tab completion enabled by default for TypeScript');
  tab.setPolicy({ disabledLanguages: ['markdown'] });
  check(tab.isAllowedForLanguage('markdown') === false, 'Per-language disable blocks Tab completion for markdown');

  const key = tab.buildCacheKey('src/app.ts', 'typescript', 'function calc(a: number) {\n  return ', '\n// TODO: add logging\n}');
  const pred = tab.recordCompletion(key, 'a * 2;\n}', 'src/app.ts', '\n// TODO: add logging\n}', 42);
  check(pred.isMultiLine === true, 'Detects multi-line Tab completion');
  check(pred.partialWordAcceptText === 'a', 'Computes partial-word acceptance token');
  check(pred.partialLineAcceptText === 'a * 2;', 'Computes partial-line acceptance text');
  check(Boolean(pred.nextEditJump && pred.nextEditJump.targetLine > 1), 'Predicts next-edit jump to follow-up TODO marker');

  const cached = tab.getCached(key);
  check(cached?.cacheHit === true && cached.latencyMs === 0, 'LRU cache serves instant cache hit for repeated prefix/suffix');
  tab.recordAcceptance(true);
  const metrics = tab.getMetrics();
  check(metrics.totalRequests === 2 && metrics.cacheHits === 1 && metrics.acceptedCount === 1, 'Tab telemetry records requests, cache hits, and acceptances');

  // --- Stage 4: Isolated Terminal & Docker Execution Setup Doctor ---
  console.log('\n--- Stage 4: Isolated Terminal & Docker Execution Setup Doctor ---');
  const unconfiguredReport = runTerminalSetupDoctor({});
  check(unconfiguredReport.ready === false && unconfiguredReport.mode === 'unconfigured', 'Doctor reports unconfigured when Docker/TLS/scratch env vars are absent');
  check(unconfiguredReport.checks.length === 4, 'Doctor evaluates all 4 required isolation invariants');
  check(unconfiguredReport.browserPreviewDisclaimer.includes('in-memory UI preview only'), 'Doctor explicitly distinguishes browser worker preview from OS/container terminal');

  const tempScratch = fs.mkdtempSync(path.join(os.tmpdir(), 'float-exec-0700-'));
  fs.chmodSync(tempScratch, 0o700);
  try {
    const configuredReport = runTerminalSetupDoctor({
      FLOAT_DOCKER_BIN: process.execPath,
      FLOAT_EXECUTION_IMAGE: 'ubuntu@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      DOCKER_HOST: 'tcp://127.0.0.1:2376',
      DOCKER_TLS_VERIFY: '1',
      DOCKER_CERT_PATH: tempScratch,
      FLOAT_EXECUTION_SHARED_DIR: tempScratch,
    });
    check(configuredReport.ready === true && configuredReport.mode === 'isolated_docker_pty', 'Doctor passes when pinned image digest, TLS proxy, and 0700 scratch dir are valid');
  } finally {
    fs.rmSync(tempScratch, { recursive: true, force: true });
  }

  // --- Stage 5: Real Local Git Repository Operations, Secret Guard & Branch Protection ---
  console.log('\n--- Stage 5: Real Local Git Repository Operations, Secret Guard & Branch Protection ---');
  const gitTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'float-stage5-git-'));
  try {
    const git = new NativeLocalGitService(gitTempDir);
    await git.init('main');
    check(await git.isGitRepository(), 'Initialized real local Git repository on disk');

    fs.writeFileSync(path.join(gitTempDir, 'README.md'), '# Float Local Git\n', 'utf8');
    await git.stageFiles(['README.md']);
    const initialCommit = await git.commitStaged({
      message: 'chore: initial commit',
      authorName: 'Float Bot',
      authorEmail: 'bot@float.local',
    });
    check(Boolean(initialCommit.sha && initialCommit.filesCommitted.includes('README.md')), 'Created real initial Git commit on main');

    await git.createBranch('feat/stage5-branch', true);
    const statusAfterBranch = await git.getStatus();
    check(statusAfterBranch.branch === 'feat/stage5-branch', 'Created and switched to feature branch feat/stage5-branch');

    const fakeSecret = 'sk-' + 'a'.repeat(36);
    fs.writeFileSync(path.join(gitTempDir, 'leaked.ts'), `export const KEY = "${fakeSecret}";\n`, 'utf8');
    await git.stageFiles(['leaked.ts']);
    let secretBlocked = false;
    try {
      await git.commitStaged({ message: 'feat: accidental secret commit' });
    } catch (err: any) {
      secretBlocked = Boolean(err && (err.name === 'SecretLeakError' || String(err.message).toLowerCase().includes('secret')));
    }
    check(secretBlocked, 'Pre-commit secret scanner blocks committing staged API keys');
    await git.unstageFiles(['leaked.ts']);
    fs.unlinkSync(path.join(gitTempDir, 'leaked.ts'));

    let mainBlocked = false;
    try {
      git.validateRemotePushTarget('main', true);
    } catch (err: any) {
      mainBlocked = err.message.includes('protected branch');
    }
    check(mainBlocked, 'Protected branch guard blocks direct push to main');

    let featureAllowed = false;
    try {
      git.validateRemotePushTarget('feat/stage5-branch', true);
      featureAllowed = true;
    } catch {
      featureAllowed = false;
    }
    check(featureAllowed, 'Protected branch guard permits approved push to feature branch');
  } finally {
    fs.rmSync(gitTempDir, { recursive: true, force: true });
  }

  // --- Stage 6: Bridged MCP Tool Registry (Real Contracts, Schema, Approval, Abort, Stdio, Timeout, Collision, Redaction) ---
  console.log('\n--- Stage 6: Bridged MCP Tool Registry with Real Contracts ---');
  const toolRegistry = createStandardToolRegistry();
  const wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'float-stage6-mcp-'));
  try {
    const localWs = new LocalFileSystemWorkspaceService(wsDir);
    const mcpServer: MCPServerConfig = {
      id: 'github-mcp',
      name: 'GitHub MCP',
      transport: 'http',
      endpointUrl: 'https://mcp.example.com/github',
      enabled: true,
      requiresApproval: true,
      createdAt: Date.now(),
    };
    const mcpTool: MCPDiscoveredTool = {
      serverId: 'github-mcp',
      serverName: 'GitHub MCP',
      name: 'search_issues',
      description: 'Searches GitHub issues',
      inputSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
        },
      },
      isAllowed: true,
    };

    const namespacedName = registerBridgedMCPTool(toolRegistry, {
      server: mcpServer,
      tool: mcpTool,
      requireExplicitApproval: true,
      invokeHandler: async (_serverId, _toolName, args) => {
        if (args.query === 'trigger_failure') {
          throw new Error('Upstream failure with secret sk-' + 'z'.repeat(28));
        }
        const fakeToken = 'ghp_' + 'B'.repeat(36);
        return { matched: args.query, debugToken: fakeToken };
      },
    });

    check(Boolean(toolRegistry.get(namespacedName)), 'Bridged MCP tool is registered via public CanonicalToolRegistry.register()');

    // Namespacing collision test
    let collisionDetected = false;
    try {
      registerBridgedMCPTool(toolRegistry, {
        server: mcpServer,
        tool: mcpTool,
        invokeHandler: async () => ({}),
      });
    } catch (err: any) {
      collisionDetected = err.message.includes('already registered in CanonicalToolRegistry');
    }
    check(collisionDetected, 'Duplicate MCP tool registration is rejected by CanonicalToolRegistry collision guard');

    // 1. Approval rejection
    const unapprovedOutcome = await toolRegistry.execute(
      namespacedName,
      { query: 'cursor parity' },
      { workspace: localWs, userId: 'user_alice', projectId: 'proj_alice', mode: 'agent' }
    );
    check(
      unapprovedOutcome.success === false &&
        unapprovedOutcome.requiresApproval === true &&
        Boolean(unapprovedOutcome.error?.includes('Approval required')) &&
        typeof unapprovedOutcome.timestamp === 'number',
      'Bridged MCP tool blocks invocation until user explicitly approves tool'
    );

    // 2. Missing required parameter
    const missingArgOutcome = await toolRegistry.execute(
      namespacedName,
      {},
      {
        workspace: localWs,
        userId: 'user_alice',
        projectId: 'proj_alice',
        mode: 'agent',
        mcpApprovedTools: [namespacedName],
      } as any
    );
    check(
      missingArgOutcome.success === false && Boolean(missingArgOutcome.error?.includes('missing required argument "query"')),
      'Bridged MCP tool validates required JSON schema arguments before invocation'
    );

    // 3. Invalid parameter type
    const badTypeOutcome = await toolRegistry.execute(
      namespacedName,
      { query: 'cursor parity', limit: 'not-a-number' },
      {
        workspace: localWs,
        userId: 'user_alice',
        projectId: 'proj_alice',
        mode: 'agent',
        mcpApprovedTools: [namespacedName],
      } as any
    );
    check(
      badTypeOutcome.success === false && Boolean(badTypeOutcome.error?.includes('argument "limit" must be of type number')),
      'Bridged MCP tool validates argument types against inputSchema.properties'
    );

    // 4. Abort signal handling
    const preAborted = new AbortController();
    preAborted.abort();
    const abortedOutcome = await toolRegistry.execute(
      namespacedName,
      { query: 'cursor parity' },
      {
        workspace: localWs,
        userId: 'user_alice',
        projectId: 'proj_alice',
        mode: 'agent',
        signal: preAborted.signal,
        mcpApprovedTools: [namespacedName],
      } as any
    );
    check(
      abortedOutcome.success === false && Boolean(abortedOutcome.error?.includes('aborted') || abortedOutcome.error?.includes('cancelled')),
      'Bridged MCP tool respects AbortSignal cancellation'
    );

    // 5. Disabled stdio transport
    const stdioRegistry = new CanonicalToolRegistry();
    const stdioToolName = registerBridgedMCPTool(stdioRegistry, {
      server: {
        id: 'local-stdio',
        name: 'Local Stdio MCP',
        transport: 'stdio',
        command: 'npx',
        enabled: true,
        createdAt: Date.now(),
      },
      tool: {
        serverId: 'local-stdio',
        serverName: 'Local Stdio MCP',
        name: 'run_local',
        description: 'Runs stdio tool',
        inputSchema: { type: 'object', properties: {} },
        isAllowed: true,
      },
      requireExplicitApproval: false,
      invokeHandler: async () => ({ ok: true }),
    });
    const stdioOutcome = await stdioRegistry.execute(
      stdioToolName,
      {},
      { workspace: localWs, userId: 'user_alice', projectId: 'proj_alice', mode: 'agent' }
    );
    check(
      stdioOutcome.success === false && Boolean(stdioOutcome.error?.includes('stdio transport is disabled')),
      'Bridged MCP tool blocks stdio transport unless FLOAT_ENABLE_MCP_STDIO is enabled'
    );

    // 6. Tool failure & error secret redaction
    const failureOutcome = await toolRegistry.execute(
      namespacedName,
      { query: 'trigger_failure' },
      {
        workspace: localWs,
        userId: 'user_alice',
        projectId: 'proj_alice',
        mode: 'agent',
        mcpApprovedTools: [namespacedName],
      } as any
    );
    check(
      failureOutcome.success === false &&
        Boolean(failureOutcome.error?.includes('[REDACTED_SECRET]')) &&
        !Boolean(failureOutcome.error?.includes('sk-zzzz')),
      'Bridged MCP tool captures invocation failures and redacts leaked secrets from error messages'
    );

    // 7. Successful HTTP MCP execution & output secret redaction
    const approvedOutcome = await toolRegistry.execute(
      namespacedName,
      { query: 'cursor parity', limit: 5 },
      {
        workspace: localWs,
        userId: 'user_alice',
        projectId: 'proj_alice',
        mode: 'agent',
        mcpApprovedTools: [namespacedName],
      } as any
    );
    check(
      approvedOutcome.success === true &&
        String(approvedOutcome.data?.output).includes('[REDACTED_SECRET]') &&
        !String(approvedOutcome.data?.output).includes('ghp_') &&
        typeof approvedOutcome.durationMs === 'number' &&
        typeof approvedOutcome.timestamp === 'number',
      'Approved MCP tool executes and automatically redacts leaked tokens in tool output'
    );
  } finally {
    fs.rmSync(wsDir, { recursive: true, force: true });
  }

  // --- Stage 7: Cloud / Background Multi-Agent Orchestrator & Conflict Detection ---
  console.log('\n--- Stage 7: Cloud / Background Multi-Agent Orchestrator & Conflict Detection ---');
  const orchestrator = new CloudAgentOrchestrator();

  // 1. Overlapping file ownership blocked without merging
  const conflictingRun = orchestrator.startRun({
    userId: 'user_alice',
    projectId: 'proj_alice',
    goal: 'Parallel refactor with overlapping file ownership',
    subtasks: [
      { subtaskId: 'st_1', title: 'Update router', role: 'implementer', ownedPaths: ['src/router.ts'] },
      { subtaskId: 'st_2', title: 'Add auth to router', role: 'implementer', ownedPaths: ['src/router.ts'] },
    ],
  });
  check(
    conflictingRun.status === 'conflict_blocked' &&
      conflictingRun.fileOwnershipConflicts.length === 1 &&
      conflictingRun.mergedProposal === undefined,
    'Cloud Agent orchestrator detects and blocks concurrent file ownership conflicts without merging'
  );

  // 2. Empty proposals -> completed with no mergedProposal
  const emptyRun = orchestrator.startRun({
    userId: 'user_alice',
    projectId: 'proj_alice',
    goal: 'Audit-only subtasks producing no file changes',
    subtasks: [
      { subtaskId: 'st_audit', title: 'Inspect types', role: 'reviewer', ownedPaths: ['src/types.ts'] },
    ],
  });
  check(
    emptyRun.status === 'completed' && emptyRun.mergedProposal === undefined,
    'Cloud Agent orchestrator completes cleanly when subtasks produce no file changes'
  );

  // 3. Multiple subtasks producing file changes, owner/project attribution, status & timestamps
  const nowTs = Date.now();
  const subProp1: IProposal = {
    id: 'p1',
    ownerId: 'user_alice',
    projectId: 'proj_alice',
    title: 'Router update',
    explanation: 'Updates router',
    status: 'pending_review',
    files: [
      {
        path: 'src/router.ts',
        operation: 'modify',
        proposedContent: 'export const router = true;\n',
        status: 'pending',
        diffStats: { additions: 1, deletions: 0 },
        unifiedDiff: '+export const router = true;',
      },
    ],
    createdAt: nowTs,
    updatedAt: nowTs,
  };
  const subProp2: IProposal = {
    id: 'p2',
    ownerId: 'user_alice',
    projectId: 'proj_alice',
    title: 'Router tests',
    explanation: 'Adds router unit tests',
    status: 'pending_review',
    files: [
      {
        path: 'src/router.test.ts',
        operation: 'create',
        proposedContent: 'import { router } from "./router";\n',
        status: 'pending',
        diffStats: { additions: 1, deletions: 0 },
        unifiedDiff: '+import { router } from "./router";',
      },
    ],
    createdAt: nowTs,
    updatedAt: nowTs,
  };

  const cleanRun = orchestrator.startRun({
    userId: 'user_alice',
    projectId: 'proj_alice',
    goal: 'Disjoint parallel refactor across router and tests',
    subtasks: [
      { subtaskId: 'st_1', title: 'Update router', role: 'implementer', ownedPaths: ['src/router.ts'] },
      { subtaskId: 'st_2', title: 'Add tests', role: 'verifier', ownedPaths: ['src/router.test.ts'], dependsOn: ['st_1'] },
    ],
    proposalsBySubtask: {
      st_1: subProp1,
      st_2: subProp2,
    },
  });
  check(
    cleanRun.status === 'proposal_ready' &&
      cleanRun.mergedProposal?.files.length === 2 &&
      cleanRun.mergedProposal?.ownerId === 'user_alice' &&
      cleanRun.mergedProposal?.projectId === 'proj_alice' &&
      cleanRun.mergedProposal?.status === 'pending_review' &&
      typeof cleanRun.mergedProposal?.createdAt === 'number' &&
      typeof cleanRun.mergedProposal?.updatedAt === 'number',
    'Cloud Agent orchestrator merges multiple subtask proposals with valid ownerId, projectId, pending_review status, and timestamps'
  );

  // 4. User isolation in getRun() and cancelRun()
  check(
    orchestrator.getRun(cleanRun.runId, 'user_bob') === undefined &&
      orchestrator.cancelRun(cleanRun.runId, 'user_bob') === undefined,
    'Cloud Agent orchestrator enforces strict tenant isolation in getRun() and cancelRun()'
  );
  const cancelledByOwner = orchestrator.cancelRun(cleanRun.runId, 'user_alice');
  check(cancelledByOwner?.status === 'cancelled', 'Cloud Agent owner can cancel their own run');

  // --- Stage 8: Evaluation & Benchmark Harness Integrity ---
  console.log('\n--- Stage 8: Evaluation & Benchmark Harness Integrity ---');
  const mockSuite = summarizeBenchmarkSuite('Float Contract Benchmark', 'deterministic_mock_contract', [
    {
      taskId: 'bug_fix_1',
      category: 'bug_fix',
      executionMode: 'deterministic_mock_contract',
      completed: true,
      testsPassed: true,
      introducedRegression: false,
      patchAccepted: true,
      latencyMs: 120,
      totalTokens: 450,
      estimatedCostUsd: 0.0021,
      toolErrorCount: 0,
      humanInterventions: 0,
    },
  ]);
  check(
    mockSuite.isLiveProviderVerified === false && mockSuite.taskCompletionRate === 1,
    'Benchmark harness explicitly marks deterministic_mock_contract suites as isLiveProviderVerified=false'
  );

  let mixedModeRejected = false;
  try {
    summarizeBenchmarkSuite('Mixed Suite', 'live_provider_verified', [
      {
        taskId: 'mock_task',
        category: 'bug_fix',
        executionMode: 'deterministic_mock_contract',
        completed: true,
        testsPassed: true,
        introducedRegression: false,
        patchAccepted: true,
        latencyMs: 50,
        totalTokens: 100,
        estimatedCostUsd: 0,
        toolErrorCount: 0,
        humanInterventions: 0,
      },
    ]);
  } catch (err: any) {
    mixedModeRejected = err.message.includes('Benchmark integrity violation');
  }
  check(mixedModeRejected, 'Benchmark harness forbids mixing deterministic mock runs into live_provider_verified suites');

  // Verify HTTP endpoints for Stage 3, 4, 7
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'stage3-8-kid';
  setGooglePublicKeysForTests({ [kid]: publicKey.export({ type: 'spki', format: 'pem' }).toString() });
  const now = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })).toString('base64url');
  const p = Buffer.from(
    JSON.stringify({
      iss: `https://securetoken.google.com/${firebaseConfig.projectId}`,
      aud: firebaseConfig.projectId,
      sub: 'user_alice',
      user_id: 'user_alice',
      email: 'user_alice@float.ai',
      iat: now - 10,
      exp: now + 3600,
    })
  ).toString('base64url');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${h}.${p}`);
  const aliceToken = `${h}.${p}.${signer.sign(privateKey, 'base64url')}`;
  setProjectLookupForTests(async () => ({ exists: true, data: { ownerId: 'user_alice', name: 'Alice Project' } }));

  const app = await createApp({ skipVite: true });
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const docRes = await fetch(`${baseUrl}/api/terminal/doctor`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    const docBody: any = await docRes.json();
    check(docRes.status === 200 && Array.isArray(docBody.checks), 'GET /api/terminal/doctor returns structured isolation checklist');

    const tabRes = await fetch(`${baseUrl}/api/ai/complete/telemetry`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    const tabBody: any = await tabRes.json();
    check(tabRes.status === 200 && Boolean(tabBody.policy && tabBody.metrics), 'GET /api/ai/complete/telemetry returns Tab policy and metrics');
  } finally {
    setGooglePublicKeysForTests(null);
    setProjectLookupForTests(null);
    server.close();
  }

  console.log(`\n================================================================`);
  console.log(`STAGES 3 TO 8 VERIFICATION COMPLETE: ${passed} assertions passed!`);
  console.log(`================================================================\n`);
}

runTests().catch(err => {
  console.error('Stages 3 to 8 verification failed:', err);
  process.exit(1);
});
