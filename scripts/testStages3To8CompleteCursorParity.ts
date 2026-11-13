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
import { TabCompletionCoordinator } from '../src/services/completion/tabCompletionService';
import { runTerminalSetupDoctor } from '../src/server/terminal/terminalDoctor';
import { NativeLocalGitService } from '../src/services/git/nativeLocalGitService';
import { createStandardToolRegistry } from '../src/services/composer/canonicalTools';
import { registerBridgedMCPTool } from '../src/services/composer/mcpToolBridge';
import { CloudAgentOrchestrator } from '../src/server/cloudAgent/cloudAgentOrchestrator';
import { summarizeBenchmarkSuite } from '../src/server/evals/benchmarkHarness';
import { LocalFileSystemWorkspaceService } from '../src/services/indexing/localWorkspaceService';

let passed = 0;

function check(condition: unknown, label: string): void {
  assert.ok(condition, label);
  passed++;
  console.log(`  [PASS] ${label}`);
}

async function runTests() {
  console.log('=== STAGES 3 TO 8: WORKSPACE, TAB, TERMINAL DOCTOR, NATIVE GIT, MCP, CLOUD AGENT & EVALS ===\n');

  // --- Stage 3: Workspace Boundary & Tab Completion Coordinator ---
  console.log('--- Stage 3: Workspace Boundary & Tab Completion Coordinator ---');
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
      FLOAT_DOCKER_BIN: process.execPath, // existing absolute binary path on host
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

    // Secret guard test: staging a file with an OpenAI secret key must block commit
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

  // --- Stage 6: Bridged MCP Tool Registry with Schema Validation, Approval Gate & Redaction ---
  console.log('\n--- Stage 6: Bridged MCP Tool Registry with Schema Validation, Approval Gate & Redaction ---');
  const toolRegistry = createStandardToolRegistry();
  const wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'float-stage6-mcp-'));
  try {
    const localWs = new LocalFileSystemWorkspaceService(wsDir);
    const namespacedName = registerBridgedMCPTool(toolRegistry, {
      server: {
        id: 'github-mcp',
        name: 'GitHub MCP',
        transport: 'http',
        endpoint: 'https://mcp.example.com/github',
        enabled: true,
        status: 'connected',
        tools: [],
      },
      tool: {
        name: 'search_issues',
        description: 'Searches GitHub issues',
        inputSchema: {
          type: 'object',
          required: ['query'],
          properties: { query: { type: 'string' } },
        },
      },
      requireExplicitApproval: true,
      invokeHandler: async (_serverId, _toolName, args) => {
        const fakeToken = 'ghp_' + 'B'.repeat(36);
        return { matched: args.query, debugToken: fakeToken };
      },
    });

    const unapprovedOutcome = await toolRegistry.execute(
      namespacedName,
      { query: 'cursor parity' },
      { workspace: localWs, mode: 'agent' }
    );
    check(
      unapprovedOutcome.success === false && Boolean(unapprovedOutcome.error?.includes('Approval required')),
      'Bridged MCP tool blocks invocation until user explicitly approves tool'
    );

    const missingArgOutcome = await toolRegistry.execute(
      namespacedName,
      {},
      { workspace: localWs, mode: 'agent', mcpApprovedTools: [namespacedName] } as any
    );
    check(
      missingArgOutcome.success === false && Boolean(missingArgOutcome.error?.includes('missing required argument "query"')),
      'Bridged MCP tool validates required JSON schema arguments before invocation'
    );

    const approvedOutcome = await toolRegistry.execute(
      namespacedName,
      { query: 'cursor parity' },
      { workspace: localWs, mode: 'agent', mcpApprovedTools: [namespacedName] } as any
    );
    check(
      approvedOutcome.success === true &&
        String(approvedOutcome.data?.output).includes('[REDACTED_SECRET]') &&
        !String(approvedOutcome.data?.output).includes('ghp_'),
      'Approved MCP tool executes and automatically redacts leaked tokens in tool output'
    );
  } finally {
    fs.rmSync(wsDir, { recursive: true, force: true });
  }

  // --- Stage 7: Cloud / Background Multi-Agent Orchestrator & Conflict Detection ---
  console.log('\n--- Stage 7: Cloud / Background Multi-Agent Orchestrator & Conflict Detection ---');
  const orchestrator = new CloudAgentOrchestrator();
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
    conflictingRun.status === 'conflict_blocked' && conflictingRun.fileOwnershipConflicts.length === 1,
    'Cloud Agent orchestrator detects and blocks concurrent file ownership conflicts'
  );

  const cleanRun = orchestrator.startRun({
    userId: 'user_alice',
    projectId: 'proj_alice',
    goal: 'Disjoint parallel refactor',
    subtasks: [
      { subtaskId: 'st_1', title: 'Update router', role: 'implementer', ownedPaths: ['src/router.ts'] },
      { subtaskId: 'st_2', title: 'Add tests', role: 'verifier', ownedPaths: ['src/router.test.ts'], dependsOn: ['st_1'] },
    ],
    proposalsBySubtask: {
      st_1: {
        id: 'p1',
        title: 'Router update',
        explanation: 'Updates router',
        files: [{ path: 'src/router.ts', type: 'modify', content: 'export const router = true;\n', diff: '+export const router = true;' }],
        status: 'pending',
        createdAt: Date.now(),
      },
    },
  });
  check(
    cleanRun.status === 'proposal_ready' && cleanRun.mergedProposal?.files.length === 1,
    'Cloud Agent orchestrator merges disjoint subtask proposals in isolated worktree'
  );

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
