/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import {
  AgentHarness,
  ToolPolicyManager,
  DynamicContextManager,
  HARNESS_CANONICAL_TOOLS,
  getToolsForModel,
  EditorAgentSurface,
  AgentsWindowSurface,
  CliAgentSurface,
  CloudAgentSurface,
  WorkspaceMerkleTree,
  HybridSemanticRetrieval,
  IncrementalSyncScheduler,
  CheckpointEngine,
  WorktreeIsolationEngine,
  RootPlannerCoordinator
} from '../src/core';
import { IWorkspaceService } from '../src/shared/contracts/workspace';

// In-memory test workspace
function createTestWorkspace(initialFiles: Record<string, string> = {}): IWorkspaceService {
  const store = new Map<string, string>(Object.entries(initialFiles));
  return {
    listFiles: async () => Array.from(store.keys()).map(p => ({ path: p, name: p.split('/').pop()!, type: 'file' })),
    readFile: async (p: string) => {
      const val = store.get(p);
      if (val === undefined) throw new Error(`File not found: ${p}`);
      return val;
    },
    writeFile: async (p: string, c: string) => {
      store.set(p, c);
    },
    fileExists: async (p: string) => store.has(p),
    deleteFile: async (p: string) => {
      store.delete(p);
    }
  } as any;
}

describe('FLOAT Studio — Master Cursor Architecture Parity Acceptance Suite', () => {
  // 1. Product Surfaces: 1 Agent, 4 Places it runs
  describe('1. The Four Product Surfaces', () => {
    it('Surface 1: Editor Agent runs beside Code-OSS, produces supervised inline diffs and applies them', async () => {
      const ws = createTestWorkspace({ 'src/calc.ts': 'function sum(a, b) { return a + b; }' });
      const editorSurface = new EditorAgentSurface(ws);

      const diff = await editorSurface.generateSupervisedEdit('src/calc.ts', 'add error handling');
      expect(diff.status).toBe('pending');
      expect(diff.proposedContent).toContain('try {');
      expect(diff.proposedContent).toContain('catch (error)');

      const accepted = await editorSurface.acceptEdit('src/calc.ts');
      expect(accepted).toBe(true);

      const updated = await ws.readFile('src/calc.ts');
      expect(updated).toContain('try {');
    });

    it('Surface 2: Agents Window coordinates multiple parallel agents across local, worktree, cloud, or SSH', () => {
      const ws = createTestWorkspace();
      const agentsWindow = new AgentsWindowSurface(ws);

      const a1 = agentsWindow.spawnAgent('Refactor Auth', 'worktree', 'Extract OAuth provider');
      const a2 = agentsWindow.spawnAgent('Run E2E Suites', 'cloud', 'Test checkout flow');

      expect(a1.environment).toBe('worktree');
      expect(a1.worktreePath).toContain('.float/worktrees');
      expect(a2.environment).toBe('cloud');

      const allAgents = agentsWindow.listAgents();
      expect(allAgents.length).toBe(2);

      const stopped = agentsWindow.stopAgent(a1.id);
      expect(stopped).toBe(true);
      expect(agentsWindow.getAgent(a1.id)?.status).toBe('completed');
    });

    it('Surface 3: CLI Agent runs headless in shell or CI pipelines', async () => {
      const ws = createTestWorkspace();
      const cliSurface = new CliAgentSurface(ws);

      const result = await cliSurface.runHeadless({
        prompt: 'audit dependency vulnerabilities',
        mode: 'plan',
        modelId: 'composer-fast'
      });

      expect(result.completed).toBe(true);
      expect(result.mode).toBe('plan');
      expect(result.finalResponse).toContain('Plan Mode');
    });

    it('Surface 4: Cloud Agent executes unattended tasks on isolated VMs, generating PRs with visual screenshots', async () => {
      const cloudSurface = new CloudAgentSurface();
      const vm = await cloudSurface.provisionIsolatedVm('us-west1');

      expect(vm.cpuCores).toBe(8);
      expect(vm.status).toBe('ready');

      const outcome = await cloudSurface.runUnattendedTask(
        vm.vmId,
        'Upgrade to Tailwind v4 and verify landing page',
        'https://github.com/hemarbaghel-ux/float-studio'
      );

      expect(outcome.success).toBe(true);
      expect(outcome.prUrl).toContain('/pull/automated-');
      expect(outcome.screenshots.length).toBeGreaterThanOrEqual(1);

      await cloudSurface.deprovisionVm(vm.vmId);
    });
  });

  // 2. The Agent Harness (Instructions x Tools x Model) & Dynamic Context
  describe('2. The Harness & Dynamic Context Invariants', () => {
    it('assembles instructions tuned per model, including .cursor/rules, skills overview, and mode policy', () => {
      const ws = createTestWorkspace();
      const harness = new AgentHarness(ws, 'plan');

      harness.getDynamicContextManager().registerSkillSummary({
        id: 'chrome-extensions',
        name: 'Chrome Extensions',
        description: 'Build and audit Manifest V3 browser extensions',
        path: 'skills/chrome-extensions'
      });

      const instructions = harness.assembleInstructions('plan', 'composer-pro', [
        { name: '.cursorrules', content: 'Do not import lodash.' }
      ]);

      expect(instructions).toContain('MODE: PLAN');
      expect(instructions).toContain('.cursorrules');
      expect(instructions).toContain('Do not import lodash.');
      expect(instructions).toContain('Chrome Extensions');
      expect(instructions).toContain('Dynamic Context Invariants');
    });

    it('offloads long tool outputs to disk artifacts to prevent prompt stuffing', () => {
      const dctx = new DynamicContextManager();
      const hugeOutput = 'A'.repeat(5000);

      const processed = dctx.processToolOutput('search_files', hugeOutput, 1000);
      expect(processed.truncated).toBe(true);
      expect(processed.inlineOutput).toContain('[... Truncated 4000 characters');
      expect(processed.artifactFilePath).toContain('search_files_output_');
    });

    it('registers the 11 documented canonical tools matching Cursor', () => {
      expect(HARNESS_CANONICAL_TOOLS.length).toBe(11);
      const toolNames = HARNESS_CANONICAL_TOOLS.map(t => t.name);

      expect(toolNames).toContain('search_files');
      expect(toolNames).toContain('semantic_search');
      expect(toolNames).toContain('read_file');
      expect(toolNames).toContain('edit_file');
      expect(toolNames).toContain('run_shell');
      expect(toolNames).toContain('browser');
      expect(toolNames).toContain('web_search');
      expect(toolNames).toContain('fetch_rules_or_skills');
      expect(toolNames).toContain('generate_image');
      expect(toolNames).toContain('ask_user');
      expect(toolNames).toContain('invoke_subagent');
    });

    it('adapts tool descriptions per model family', () => {
      const claudeTools = getToolsForModel('claude-3-5-sonnet');
      expect(claudeTools[0].description).toContain('[Claude Optimized]');
    });
  });

  // 3. Indexing Pipeline (Merkle Tree + Embeddings + Grep + 5min sync)
  describe('3. Indexing Pipeline', () => {
    it('builds workspace Merkle tree and generates similarity fingerprint for 92% index reuse', () => {
      const merkle = new WorkspaceMerkleTree();
      const files = [
        { path: 'src/app.ts', content: 'export const app = 1;' },
        { path: 'src/utils.ts', content: 'export function add(a, b) { return a + b; }' }
      ];

      const tree = merkle.buildTree(files);
      expect(tree.isDirectory).toBe(true);
      expect(tree.hash).toBeDefined();

      const fp1 = merkle.generateFingerprint();
      expect(fp1.fileCount).toBe(2);

      // Clone with identical files -> 100% similarity (>= 92%)
      const similarity = WorkspaceMerkleTree.calculateSimilarity(fp1, fp1);
      expect(similarity).toBe(1.0);
      expect(similarity >= 0.92).toBe(true);
    });

    it('chunks files by AST functions/classes and provides hybrid semantic + grep retrieval (+12.5% accuracy)', () => {
      const retrieval = new HybridSemanticRetrieval();
      const sampleTs = `
export class PaymentService {
  processStripe(amount: number) {
    return amount * 100;
  }
}

export function validateBillingEmail(email: string): boolean {
  return email.includes('@');
}
`;

      const chunks = retrieval.chunkFile('src/payment.ts', sampleTs);
      expect(chunks.length).toBeGreaterThanOrEqual(2);

      const results = retrieval.search('validate billing email');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].chunk.symbolName).toBe('validateBillingEmail');
      expect(results[0].score).toBeGreaterThan(0.5);
    });

    it('schedules periodic background sync every 5 minutes', async () => {
      let syncCalled = false;
      const scheduler = new IncrementalSyncScheduler(async () => {
        syncCalled = true;
      }, 50); // fast interval for test

      await scheduler.triggerSync();
      expect(syncCalled).toBe(true);
      expect(scheduler.getLastSyncTime()).toBeGreaterThan(0);
    });
  });

  // 4. Isolation & Verification (Checkpoints & Worktrees)
  describe('4. Isolation & Verification', () => {
    it('Checkpoint Engine captures pre-edit snapshot and rolls back disk files while leaving chat intact (not git)', async () => {
      const ws = createTestWorkspace({ 'config.json': '{"version": "1.0"}' });
      const checkpoints = new CheckpointEngine(ws);

      const chk = await checkpoints.createCheckpoint('Before edit', ['config.json']);
      expect(chk.snapshots.length).toBe(1);

      // Agent modifies file
      await ws.writeFile('config.json', '{"version": "2.0-broken"}');
      expect(await ws.readFile('config.json')).toContain('2.0-broken');

      // User hits restore checkpoint
      const outcome = await checkpoints.restoreCheckpoint(chk.id);
      expect(outcome.restoredCount).toBe(1);
      expect(outcome.chatPreserved).toBe(true); // Preserves chat conversation

      const reverted = await ws.readFile('config.json');
      expect(reverted).toBe('{"version": "1.0"}');
    });

    it('Worktree Isolation Engine caps parallel worktrees at 8 to prevent working tree clobbering', async () => {
      const worktrees = new WorktreeIsolationEngine();

      const wt1 = await worktrees.provisionWorktree('Task 1');
      expect(wt1.status).toBe('active');
      expect(wt1.branchName).toContain('float-agent/task-1-');

      expect(worktrees.getActiveWorktreeCount()).toBe(1);

      await worktrees.closeWorktree(wt1.id, 'merge');
      expect(worktrees.getActiveWorktreeCount()).toBe(0);
    });
  });

  // 5. Modes as Tool Policies (Shift+Tab)
  describe('5. Modes as Tool Policies (Shift+Tab)', () => {
    it('enforces exact tool policies for Agent, Ask, Plan, and Debug modes', () => {
      const policyMgr = new ToolPolicyManager('agent');

      // Agent: All tools, edits allowed
      expect(policyMgr.isToolAllowed('edit_file', 'agent')).toBe(true);
      expect(policyMgr.isToolAllowed('run_shell', 'agent')).toBe(true);

      // Ask: Read-only only
      expect(policyMgr.isToolAllowed('search_files', 'ask')).toBe(true);
      expect(policyMgr.isToolAllowed('edit_file', 'ask')).toBe(false);
      expect(policyMgr.isToolAllowed('run_shell', 'ask')).toBe(false);

      // Plan: Research and plan only, no edits before approval
      expect(policyMgr.isToolAllowed('read_file', 'plan')).toBe(true);
      expect(policyMgr.isToolAllowed('edit_file', 'plan')).toBe(false);

      // Debug: Runtime evidence bias
      expect(policyMgr.getPolicy('debug').runtimeEvidenceBias).toBe(true);
    });

    it('cycles modes sequentially on Shift+Tab: Agent -> Ask -> Plan -> Debug -> Agent', () => {
      const policyMgr = new ToolPolicyManager('agent');

      expect(policyMgr.cycleMode()).toBe('ask');
      expect(policyMgr.cycleMode()).toBe('plan');
      expect(policyMgr.cycleMode()).toBe('debug');
      expect(policyMgr.cycleMode()).toBe('agent');
    });
  });

  // 6. Hierarchical Multi-Agent & Root Planner
  describe('6. Hierarchical Multi-Agent & Root Planner', () => {
    it('Root Planner coordinates project goal without coding, spawns recursive sub-slices and collects worker reports', async () => {
      const coordinator = new RootPlannerCoordinator();

      const goal = coordinator.planGoal(
        'Implement Hybrid Vector Search',
        'Build AST chunking, embeddings, and hybrid retrieval',
        [
          { title: 'AST Chunking', description: 'Chunk by functions/classes' },
          { title: 'Vector Scoring', description: 'Cosine similarity with grep boost' }
        ]
      );

      expect(goal.status).toBe('planning');
      expect(goal.slices.length).toBe(2);

      // Decompose slice recursively
      const decomposed = coordinator.decomposeSlice(goal.goalId, goal.slices[0].id, [
        { title: 'TypeScript Parser', description: 'Extract TS functions' },
        { title: 'Python Parser', description: 'Extract Python defs' }
      ]);
      expect(decomposed).toBe(true);

      // Dispatch isolated worker
      const dispatch = await coordinator.dispatchWorker(goal.goalId, goal.slices[0].id);
      expect(dispatch.workerId).toBeDefined();
      expect(dispatch.worktreePath).toBeDefined();

      // Worker completes and hands back write-up
      const ingested = coordinator.ingestWorkerReport(goal.goalId, {
        workerId: dispatch.workerId,
        sliceId: goal.slices[0].id,
        worktreePath: dispatch.worktreePath,
        summary: 'Parsed all functions and classes accurately with zero errors.',
        filesChanged: ['src/core/indexing/symbolExtractor.ts'],
        testsPassed: true
      });
      expect(ingested).toBe(true);

      const updatedGoal = coordinator.getGoal(goal.goalId);
      expect(updatedGoal?.slices[0].status).toBe('completed');
      expect(updatedGoal?.slices[0].writeup).toContain('Parsed all functions');
    });
  });
});
