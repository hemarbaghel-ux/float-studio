/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Phase 5 Verification Test: Composer and Autonomous Code Editing
 *
 * Validates:
 * 1. Canonical Tool Registry & argument schema validation.
 * 2. Path traversal and sensitive file access prevention.
 * 3. Autonomous agent execution loop with budget enforcement (iterations, timeout, cancellation).
 * 4. Multi-file proposal creation in pending_review status without disk mutation.
 * 5. Conflict detection when files are modified prior to proposal acceptance.
 * 6. Explicit user approval, selective application, and atomic disk mutation.
 * 7. Safety checkpoints and deterministic one-click rollback.
 * 8. Proposal rejection leaving workspace files untouched.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { LocalFileSystemWorkspaceService } from '../src/services/indexing/localWorkspaceService';
import {
  createStandardToolRegistry,
  validateToolArgs,
  WorkspaceCheckpointManager,
  applyProposal,
  rejectProposal,
  rollbackProposal,
  checkProposalConflicts,
  ComposerAgent,
  ComposerProgressEvent,
} from '../src/services/composer';
import {
  IModelGateway,
  ModelGatewayRequest,
  ModelGatewayResponse,
  ModelGatewayDelta,
  ProviderHealthStatus,
} from '../src/shared/contracts/gateway';
import { IModelCatalog } from '../src/shared/contracts/models';
import { IProposal, generateUnifiedDiff } from '../src/shared/contracts/proposals';

let passed = 0;
let failed = 0;

async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}:`, err?.message || err);
    failed++;
  }
}

async function run() {
  console.log('=== FLOAT Recovery Phase 5: Composer & Autonomous Editing Test Suite ===\n');

  // Setup temporary test workspace
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'float-phase5-test-'));
  const srcDir = path.join(tempDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  fs.writeFileSync(path.join(srcDir, 'math.ts'), 'export function add(a: number, b: number): number {\n  return a + b;\n}\n');
  fs.writeFileSync(path.join(srcDir, 'calculator.ts'), 'import { add } from "./math";\nexport class Calculator {\n  calculate(a: number, b: number): number {\n    return add(a, b);\n  }\n}\n');
  fs.writeFileSync(path.join(tempDir, 'package.json'), '{\n  "name": "test-repo",\n  "version": "1.0.0"\n}\n');

  const workspace = new LocalFileSystemWorkspaceService(tempDir);
  await workspace.initializeIndex();
  const checkpointManager = new WorkspaceCheckpointManager(workspace);
  const toolRegistry = createStandardToolRegistry();

  // Test 1: Tool Registry & Argument Validation
  console.log('1. Tool Registry & Schema Validation');
  await check('Standard tools are registered in CanonicalToolRegistry', () => {
    const list = toolRegistry.list();
    const names = list.map(t => t.name);
    if (!names.includes('list_dir')) throw new Error('Missing list_dir');
    if (!names.includes('read_file')) throw new Error('Missing read_file');
    if (!names.includes('search_codebase')) throw new Error('Missing search_codebase');
    if (!names.includes('inspect_symbol')) throw new Error('Missing inspect_symbol');
    if (!names.includes('propose_changes')) throw new Error('Missing propose_changes');
    if (!names.includes('run_command')) throw new Error('Missing run_command');
  });

  await check('validateToolArgs rejects missing required parameters', () => {
    const errReadFile = validateToolArgs('read_file', {});
    if (!errReadFile || !errReadFile.includes('Missing required parameter "path"')) {
      throw new Error(`Expected missing path error, got: ${errReadFile}`);
    }

    const errSearch = validateToolArgs('search_codebase', {});
    if (!errSearch || !errSearch.includes('Missing required parameter "query"')) {
      throw new Error(`Expected missing query error, got: ${errSearch}`);
    }

    const okReadFile = validateToolArgs('read_file', { path: 'src/math.ts' });
    if (okReadFile !== null) throw new Error(`Unexpected validation error: ${okReadFile}`);
  });

  // Test 2: Safe Tool Execution & Traversal Prevention
  console.log('\n2. Safe Workspace Inspection');
  await check('read_file successfully reads authorized workspace files', async () => {
    const res = await toolRegistry.execute('read_file', { path: 'src/math.ts' }, {
      workspace,
      userId: 'user-1',
      projectId: 'proj-1',
    });
    if (!res.success) throw new Error(`Failed to read file: ${res.error}`);
    if (!res.data.content.includes('function add')) throw new Error('Unexpected content in math.ts');
  });

  await check('read_file strictly rejects path traversal attempts (../)', async () => {
    const res = await toolRegistry.execute('read_file', { path: '../secret.txt' }, {
      workspace,
      userId: 'user-1',
      projectId: 'proj-1',
    });
    if (res.success) throw new Error('Path traversal was unexpectedly allowed');
    if (!res.error || !res.error.includes('strictly prohibited')) {
      throw new Error(`Expected traversal prohibition error, got: ${res.error}`);
    }
  });

  await check('search_codebase locates references using WorkspaceIndex', async () => {
    const res = await toolRegistry.execute('search_codebase', { query: 'Calculator' }, {
      workspace,
      userId: 'user-1',
      projectId: 'proj-1',
    });
    if (!res.success) throw new Error(`Search failed: ${res.error}`);
    if (res.data.total === 0) throw new Error('Search returned 0 matches for Calculator');
  });

  await check('inspect_symbol finds symbol definitions in workspace', async () => {
    const res = await toolRegistry.execute('inspect_symbol', { symbol: 'Calculator' }, {
      workspace,
      userId: 'user-1',
      projectId: 'proj-1',
    });
    if (!res.success) throw new Error(`inspect_symbol failed: ${res.error}`);
    if (res.data.definitions.length === 0) throw new Error('Symbol Calculator was not found in index');
  });

  // Test 3: Proposal Drafting Without Unapproved Disk Mutation
  console.log('\n3. Proposal Drafting Safety Invariant');
  let draftProposal: IProposal | undefined;
  await check('propose_changes creates reviewable proposal leaving disk files untouched', async () => {
    const originalMathContent = fs.readFileSync(path.join(srcDir, 'math.ts'), 'utf8');

    const res = await toolRegistry.execute('propose_changes', {
      title: 'Add multiply and subtract methods',
      explanation: 'Extends math utilities with standard operations.',
      changes: [
        {
          path: 'src/math.ts',
          content: 'export function add(a: number, b: number): number {\n  return a + b;\n}\n\nexport function multiply(a: number, b: number): number {\n  return a * b;\n}\n',
        },
        {
          path: 'src/constants.ts',
          content: 'export const PI = 3.14159;\n',
        },
      ],
    }, {
      workspace,
      userId: 'user-1',
      projectId: 'proj-1',
    });

    if (!res.success) throw new Error(`propose_changes failed: ${res.error}`);
    if (!res.requiresApproval) throw new Error('propose_changes must require human approval');
    draftProposal = res.data.proposal;
    if (!draftProposal || draftProposal.status !== 'pending_review') {
      throw new Error('Proposal must be in pending_review status');
    }

    // Verify workspace disk content remains UNTOUCHED
    const currentMathOnDisk = fs.readFileSync(path.join(srcDir, 'math.ts'), 'utf8');
    if (currentMathOnDisk !== originalMathContent) {
      throw new Error('Workspace file was mutated before proposal approval!');
    }
    const constantsExists = fs.existsSync(path.join(srcDir, 'constants.ts'));
    if (constantsExists) {
      throw new Error('New proposed file was created on disk before proposal approval!');
    }
  });

  await check('generateUnifiedDiff accurately renders addition and deletion hunks', () => {
    const orig = 'line 1\nline 2\n';
    const prop = 'line 1\nline 2 modified\nline 3\n';
    const diff = generateUnifiedDiff('src/sample.ts', orig, prop);
    if (!diff.includes('--- a/src/sample.ts')) throw new Error('Missing unified diff header');
    if (!diff.includes('+line 2 modified')) throw new Error('Missing added line in diff');
    if (!diff.includes('-line 2')) throw new Error('Missing deleted line in diff');
  });

  // Test 4: Conflict Detection
  console.log('\n4. Stale Proposal Conflict Detection');
  await check('applyProposal detects conflicts when workspace files are modified externally', async () => {
    if (!draftProposal) throw new Error('Draft proposal missing');

    // Simulate an external workspace modification to math.ts
    fs.writeFileSync(path.join(srcDir, 'math.ts'), 'export function add(a: number, b: number): number {\n  // external edit\n  return a + b;\n}\n');

    const conflicts = await checkProposalConflicts(draftProposal, workspace);
    if (conflicts.length === 0) {
      throw new Error('Failed to detect conflict on externally modified file');
    }
    if (conflicts[0].path !== 'src/math.ts') {
      throw new Error(`Expected conflict on src/math.ts, got ${conflicts[0].path}`);
    }

    // Try applying without force -> must fail with status 'stale'
    const applyRes = await applyProposal({
      proposal: draftProposal,
      workspace,
      checkpointManager,
      force: false,
    });
    if (applyRes.success) throw new Error('Application should have failed due to conflicts');
    if (applyRes.status !== 'stale') throw new Error(`Expected status stale, got ${applyRes.status}`);

    // Restore original math content for subsequent tests
    fs.writeFileSync(path.join(srcDir, 'math.ts'), 'export function add(a: number, b: number): number {\n  return a + b;\n}\n');
  });

  // Test 5: Explicit User Approval, Atomic Apply, and Rollback
  console.log('\n5. Explicit User Approval & Checkpoint Rollback');
  let checkpointId: string | undefined;
  await check('applyProposal atomically mutates workspace files upon explicit user acceptance', async () => {
    if (!draftProposal) throw new Error('Draft proposal missing');

    const applyRes = await applyProposal({
      proposal: draftProposal,
      workspace,
      checkpointManager,
      force: false,
    });

    if (!applyRes.success) throw new Error(`Apply failed: ${applyRes.error}`);
    if (applyRes.status !== 'applied') throw new Error(`Expected status applied, got ${applyRes.status}`);
    if (!applyRes.checkpointId) throw new Error('Apply must record a safety checkpoint');
    checkpointId = applyRes.checkpointId;

    // Verify disk content now matches proposal
    const diskMath = fs.readFileSync(path.join(srcDir, 'math.ts'), 'utf8');
    if (!diskMath.includes('function multiply')) {
      throw new Error('Approved proposal changes were not applied to disk');
    }
    const diskConstants = fs.readFileSync(path.join(srcDir, 'constants.ts'), 'utf8');
    if (!diskConstants.includes('PI = 3.14159')) {
      throw new Error('Approved new file was not created on disk');
    }
  });

  await check('rollbackProposal deterministically restores workspace to pre-apply state', async () => {
    if (!checkpointId) throw new Error('Missing checkpoint ID');

    const restoreRes = await rollbackProposal({
      checkpointId,
      checkpointManager,
    });

    if (!restoreRes.success) throw new Error(`Rollback failed: ${restoreRes.error}`);

    // Verify math.ts was restored
    const restoredMath = fs.readFileSync(path.join(srcDir, 'math.ts'), 'utf8');
    if (restoredMath.includes('function multiply')) {
      throw new Error('Rollback failed to revert math.ts to original content');
    }

    // Verify newly created constants.ts was deleted
    const constantsStillExists = fs.existsSync(path.join(srcDir, 'constants.ts'));
    if (constantsStillExists) {
      throw new Error('Rollback failed to remove newly created file constants.ts');
    }
  });

  // Test 6: Proposal Rejection
  console.log('\n6. Proposal Rejection Workflow');
  await check('rejectProposal updates proposal status without touching workspace disk', async () => {
    if (!draftProposal) throw new Error('Missing proposal');

    const rejected = rejectProposal({ proposal: draftProposal });
    if (rejected.status !== 'rejected') throw new Error(`Expected rejected status, got ${rejected.status}`);

    const mathContent = fs.readFileSync(path.join(srcDir, 'math.ts'), 'utf8');
    if (mathContent.includes('function multiply')) {
      throw new Error('Workspace was modified during rejection');
    }
  });

  // Test 7: Autonomous Composer Agent Execution Loop
  console.log('\n7. Autonomous Composer Agent Loop & Budget Enforcement');

  // Mock Model Gateway for deterministic agent loop verification
  class MockComposerGateway implements IModelGateway {
    private callCount = 0;

    async generate(request: ModelGatewayRequest, signal?: AbortSignal): Promise<ModelGatewayResponse> {
      this.callCount++;

      if (this.callCount === 1) {
        // Turn 1: Model inspects workspace files
        return {
          text: 'I will inspect the workspace files first.\n```tool_call\n{\n  "name": "list_dir",\n  "args": { "recursive": true }\n}\n```',
          modelId: 'mock-composer',
          usage: { inputTokens: 50, outputTokens: 30, totalTokens: 80, durationMs: 10 },
        };
      }

      if (this.callCount === 2) {
        // Turn 2: Model proposes modifications based on inspection
        return {
          text: 'Now I will propose the code modification.\n```tool_call\n{\n  "name": "propose_changes",\n  "args": {\n    "title": "Add subtract function",\n    "explanation": "Provides subtract helper.",\n    "changes": [\n      {\n        "path": "src/math.ts",\n        "content": "export function add(a: number, b: number): number {\\n  return a + b;\\n}\\n\\nexport function subtract(a: number, b: number): number {\\n  return a - b;\\n}\\n"\n      }\n    ]\n  }\n}\n```',
          modelId: 'mock-composer',
          usage: { inputTokens: 100, outputTokens: 60, totalTokens: 160, durationMs: 10 },
        };
      }

      return {
        text: 'Task complete. Proposal is ready for your review.',
        modelId: 'mock-composer',
        usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60, durationMs: 10 },
      };
    }

    async generateStream(
      request: ModelGatewayRequest,
      onDelta: (delta: ModelGatewayDelta) => void,
      signal?: AbortSignal
    ): Promise<ModelGatewayResponse> {
      return this.generate(request, signal);
    }

    async checkHealth(providerId: string): Promise<ProviderHealthStatus> {
      return { providerId, operational: true, latencyMs: 5, timestamp: Date.now() };
    }

    getCatalog(): IModelCatalog {
      return { models: [], defaultModelId: 'mock-composer', lastUpdated: Date.now() };
    }
  }

  await check('ComposerAgent executes multi-turn tool reasoning and drafts proposal', async () => {
    const mockGateway = new MockComposerGateway();
    const agent = new ComposerAgent(mockGateway, toolRegistry, workspace, checkpointManager);

    const events: ComposerProgressEvent[] = [];
    const outcome = await agent.run({
      task: 'Please add a subtract function to src/math.ts',
      userId: 'user-agent-1',
      projectId: 'proj-1',
      maxIterations: 5,
      timeoutMs: 10_000,
      onProgress: (ev) => events.push(ev),
    });

    if (outcome.status !== 'proposal_ready') {
      throw new Error(`Expected proposal_ready status, got: ${outcome.status}`);
    }
    if (!outcome.proposal) {
      throw new Error('Agent failed to produce a proposal');
    }
    if (outcome.proposal.files[0].path !== 'src/math.ts') {
      throw new Error(`Expected proposal for src/math.ts, got: ${outcome.proposal.files[0].path}`);
    }
    if (outcome.iterations !== 2) {
      throw new Error(`Expected 2 iterations, took: ${outcome.iterations}`);
    }

    // Verify progress reporting captured tool calls
    const toolCallEvents = events.filter(e => e.type === 'tool_call');
    if (toolCallEvents.length !== 2) {
      throw new Error(`Expected 2 tool_call events, got: ${toolCallEvents.length}`);
    }
  });

  await check('ComposerAgent respects cancellation signal', async () => {
    const mockGateway = new MockComposerGateway();
    const agent = new ComposerAgent(mockGateway, toolRegistry, workspace, checkpointManager);

    const abortController = new AbortController();
    abortController.abort(); // Pre-aborted

    const outcome = await agent.run({
      task: 'Quick task',
      userId: 'user-agent-1',
      projectId: 'proj-1',
      signal: abortController.signal,
    });

    if (outcome.status !== 'cancelled') {
      throw new Error(`Expected cancelled status, got: ${outcome.status}`);
    }
  });

  await check('ComposerAgent enforces iteration budget', async () => {
    // Gateway that constantly requests list_dir
    class InfiniteLoopGateway implements IModelGateway {
      async generate(): Promise<ModelGatewayResponse> {
        return {
          text: '```tool_call\n{\n  "name": "list_dir",\n  "args": {}\n}\n```',
          modelId: 'mock-infinite',
          usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20, durationMs: 5 },
        };
      }
      async generateStream(req: any, onDelta: any, sig?: any): Promise<ModelGatewayResponse> {
        return this.generate();
      }
      async checkHealth(providerId: string): Promise<ProviderHealthStatus> {
        return { providerId, operational: true, latencyMs: 5, timestamp: Date.now() };
      }
      getCatalog(): IModelCatalog {
        return { models: [], defaultModelId: 'mock-infinite', lastUpdated: Date.now() };
      }
    }

    const agent = new ComposerAgent(new InfiniteLoopGateway(), toolRegistry, workspace, checkpointManager);
    const outcome = await agent.run({
      task: 'Endless task',
      userId: 'user-agent-1',
      projectId: 'proj-1',
      maxIterations: 3,
    });

    if (outcome.status !== 'budget_exceeded') {
      throw new Error(`Expected budget_exceeded status, got: ${outcome.status}`);
    }
    if (outcome.iterations !== 3) {
      throw new Error(`Expected exactly 3 iterations, got: ${outcome.iterations}`);
    }
  });

  // Cleanup temp directory
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }

  console.log(`\n========================================`);
  console.log(`Phase 5 Test Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error in Phase 5:', err);
  process.exit(1);
});
