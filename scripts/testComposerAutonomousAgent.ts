/**
 * FLOAT Studio - Step 4: Autonomous Multi-File Composer & Diff Orchestrator Acceptance Suite
 *
 * Verifies:
 * 1. Tool registry execution (read_file, write_file, edit_file, list_directory, search_codebase, run_terminal_command)
 * 2. Path safety and traversal attack rejection
 * 3. Synchronized Multi-File Diff Orchestration (hunk extraction, statistics, individual file accept/reject)
 * 4. Concurrent modification conflict detection
 * 5. Autonomous Agent Loop (thought -> tool call -> observation -> self-correction on terminal error)
 * 6. Multi-file turn checkpointing & atomic filesystem rollback
 */

import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { FloatComposerToolRegistry, IComposerFileSystem, IComposerCommandRunner } from '../desktop/src/vs/workbench/contrib/float/common/composer/floatComposerTools.js';
import { ProductionComposerCommandRunner, IsolatedShadowWorkspaceCommandRunner } from '../desktop/src/vs/workbench/contrib/float/common/composer/floatProductionAdapters.js';
import { FloatMultiFileDiffOrchestrator, computeLineHunks } from '../desktop/src/vs/workbench/contrib/float/common/composer/floatMultiFileDiffOrchestrator.js';
import { FloatComposerAgent, IComposerAgentGoal } from '../desktop/src/vs/workbench/contrib/float/common/composer/floatComposerAgent.js';
import { FloatCheckpointService } from '../desktop/src/vs/workbench/contrib/float/common/checkpoints/floatCheckpointService.js';
import { IFloatService } from '../desktop/src/vs/workbench/contrib/float/common/floatService.js';
import { FloatProposalSession } from '../desktop/src/vs/workbench/contrib/float/common/proposals/floatProposal.js';

async function runStep4Tests() {
  console.log('================================================================');
  console.log('  FLOAT STUDIO: STEP 4 AUTONOMOUS COMPOSER & MULTI-FILE SUITE   ');
  console.log('================================================================\n');

  const repoRoot = process.cwd();
  const tempWorkspace = path.resolve(repoRoot, `tmp/step4-composer-${Date.now()}`);
  fs.mkdirSync(tempWorkspace, { recursive: true });
  console.log(`[WORKSPACE] Disposable test workspace: ${tempWorkspace}\n`);

  // Create sample project files
  const fileA = 'src/calculator.ts';
  const fileB = 'src/types.ts';
  const fileC = 'tests/calculator.test.ts';

  fs.mkdirSync(path.join(tempWorkspace, 'src'), { recursive: true });
  fs.mkdirSync(path.join(tempWorkspace, 'tests'), { recursive: true });

  const initialCalculator = [
    'export function add(a: number, b: number): number {',
    '  return a + b;',
    '}',
    'export function multiply(a: number, b: number): number {',
    '  return a * b;',
    '}'
  ].join('\n');

  const initialTypes = [
    'export interface MathOptions {',
    '  precision: number;',
    '}'
  ].join('\n');

  const initialTest = [
    'import { add, multiply } from "../src/calculator";',
    'console.log("Tests running...");'
  ].join('\n');

  fs.writeFileSync(path.join(tempWorkspace, fileA), initialCalculator, 'utf8');
  fs.writeFileSync(path.join(tempWorkspace, fileB), initialTypes, 'utf8');
  fs.writeFileSync(path.join(tempWorkspace, fileC), initialTest, 'utf8');

  // --- Suite 0: Command Execution Requires Explicit User Approval ---
  console.log('--- Suite 0: Command Approval & Fail-Closed Behavior ---');
  {
    const noApproval = new ProductionComposerCommandRunner(tempWorkspace, 5000);
    const blocked = await noApproval.runCommand(`node -e "process.stdout.write('must-not-run')"`);
    assert.strictEqual(blocked.exitCode, 126);
    assert(blocked.stderr.includes('User approval is required'));

    const deniedRunner = new ProductionComposerCommandRunner(tempWorkspace, 5000, async () => false);
    const denied = await deniedRunner.runCommand(`node -e "process.stdout.write('must-not-run')"`);
    assert.strictEqual(denied.exitCode, 126);

    let capturedApproval: any;
    const approvedRunner = new ProductionComposerCommandRunner(tempWorkspace, 5000, async request => {
      capturedApproval = request;
      return true;
    });
    const approved = await approvedRunner.runCommand(`node -e "process.stdout.write('approved-command')"`);
    assert.strictEqual(approved.exitCode, 0);
    assert(approved.stdout.includes('approved-command'));
    assert.strictEqual(capturedApproval.workspaceRoot, tempWorkspace);

    const shadowNoApproval = new IsolatedShadowWorkspaceCommandRunner(tempWorkspace);
    try {
      const shadowBlocked = await shadowNoApproval.runCommand(`node -e "process.stdout.write('must-not-run')"`);
      assert.strictEqual(shadowBlocked.exitCode, 126);
    } finally {
      shadowNoApproval.dispose();
    }

    const shadowApproved = new IsolatedShadowWorkspaceCommandRunner(tempWorkspace, undefined, 5000, async request => {
      assert.strictEqual(request.workspaceRoot, tempWorkspace);
      return true;
    });
    try {
      const result = await shadowApproved.runCommand(`node -e "process.stdout.write('approved-copy-command')"`);
      assert.strictEqual(result.exitCode, 0);
      assert(result.stdout.includes('approved-copy-command'));
      assert.notStrictEqual(shadowApproved.shadowDir, tempWorkspace);
    } finally {
      shadowApproved.dispose();
    }
  }

  // --- Suite 1: Tool Registry & File Operations ---
  console.log('--- Suite 1: Tool Registry & Path Security ---');

  const fsAdapter: IComposerFileSystem = {
    readFile: async (p: string) => {
      const full = path.resolve(tempWorkspace, p);
      return fs.readFileSync(full, 'utf8');
    },
    writeFile: async (p: string, content: string) => {
      const full = path.resolve(tempWorkspace, p);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf8');
    },
    fileExists: async (p: string) => {
      const full = path.resolve(tempWorkspace, p);
      return fs.existsSync(full);
    },
    listDirectory: async (dir: string, recursive?: boolean) => {
      const full = path.resolve(tempWorkspace, dir);
      if (!fs.existsSync(full)) return [];
      const items = fs.readdirSync(full, { recursive: recursive ?? false });
      return items.map(String);
    },
    findFiles: async (pattern: string) => {
      const items = fs.readdirSync(tempWorkspace, { recursive: true }).map(String);
      return items.filter(i => i.includes(pattern));
    }
  };

  let simulatedExitCode = 0;
  const runnerAdapter: IComposerCommandRunner = {
    runCommand: async (cmd: string) => {
      if (cmd.includes('fail')) {
        return { exitCode: 1, stdout: '', stderr: 'Error: Cannot find module "math-lib"' };
      }
      return { exitCode: simulatedExitCode, stdout: `Tests passed: 3 suites, 12 tests OK for ${cmd}`, stderr: '' };
    }
  };

  const toolRegistry = new FloatComposerToolRegistry(fsAdapter, runnerAdapter);
  assert.strictEqual(toolRegistry.definitions.length, 6, 'Must define 6 core composer tools');

  // Test read_file
  const readRes = await toolRegistry.executeTool({
    id: 't1',
    name: 'read_file',
    parameters: { path: fileA }
  });
  assert.strictEqual(readRes.success, true);
  assert.ok(readRes.output.includes('export function add'));
  console.log('  -> PASS: read_file successfully loaded workspace source file');

  // Test path traversal rejection
  const badRes = await toolRegistry.executeTool({
    id: 't2',
    name: 'read_file',
    parameters: { path: '../outside.ts' }
  });
  assert.strictEqual(badRes.success, false);
  assert.ok(badRes.error?.includes('Path traversal rejected'));
  console.log('  -> PASS: Path traversal rejected with security violation error');

  // Test edit_file
  const editRes = await toolRegistry.executeTool({
    id: 't3',
    name: 'edit_file',
    parameters: {
      path: fileA,
      target: 'return a + b;',
      replacement: 'return Number(a) + Number(b);'
    }
  });
  assert.strictEqual(editRes.success, true);
  const updatedA = fs.readFileSync(path.join(tempWorkspace, fileA), 'utf8');
  assert.ok(updatedA.includes('return Number(a) + Number(b);'));
  console.log('  -> PASS: edit_file targeted snippet replacement verified on disk');

  // Restore fileA
  fs.writeFileSync(path.join(tempWorkspace, fileA), initialCalculator, 'utf8');

  // Test run_terminal_command
  const cmdRes = await toolRegistry.executeTool({
    id: 't4',
    name: 'run_terminal_command',
    parameters: { command: 'npm test' }
  });
  assert.strictEqual(cmdRes.success, true);
  assert.ok(cmdRes.output.includes('Exit Code: 0'));
  console.log('  -> PASS: run_terminal_command executed and captured command output\n');

  // --- Suite 2: Line Hunk Extraction & Diff Statistics ---
  console.log('--- Suite 2: Synchronized Line Hunks & Diff Statistics ---');
  const originalDoc = 'line 1\nline 2\nline 3\nline 4\nline 5';
  const proposedDoc = 'line 1\nline 2 (modified)\nline 3\nline 4.1 (new)\nline 5';

  const hunks = computeLineHunks(originalDoc, proposedDoc);
  assert.ok(hunks.length >= 2, 'Must extract distinct diff hunks');
  const modHunk = hunks.find(h => h.type === 'modify');
  assert.ok(modHunk, 'Must identify modified lines');
  assert.strictEqual(modHunk.originalLines[0], 'line 2');
  assert.strictEqual(modHunk.proposedLines[0], 'line 2 (modified)');
  console.log('  -> PASS: Accurate line-by-line hunk computation verified');

  // Multi-File Orchestrator
  const orchestrator = new FloatMultiFileDiffOrchestrator();
  const proposal = orchestrator.createProposal(
    'Add Division and MathOptions',
    'Adds divide function to calculator.ts and DivOptions to types.ts',
    [
      {
        path: fileA,
        originalContent: initialCalculator,
        proposedContent: `${initialCalculator}\nexport function divide(a: number, b: number): number { return a / b; }\n`
      },
      {
        path: fileB,
        originalContent: initialTypes,
        proposedContent: `${initialTypes}\nexport interface DivOptions { allowZero: boolean; }\n`
      }
    ]
  );

  assert.strictEqual(proposal.files.length, 2);
  assert.strictEqual(proposal.status, 'pending');
  assert.ok(proposal.stats.totalAdditions > 0);
  console.log(`  -> PASS: Multi-file proposal created: ${proposal.files.length} files, +${proposal.stats.totalAdditions} lines`);

  // Accept file B individually
  const acceptB = await orchestrator.acceptFile(proposal.id, fileB, async (p, content) => {
    fs.writeFileSync(path.join(tempWorkspace, p), content, 'utf8');
  });
  assert.strictEqual(acceptB, true);
  assert.strictEqual(proposal.status, 'partially_accepted');
  const diskTypes = fs.readFileSync(path.join(tempWorkspace, fileB), 'utf8');
  assert.ok(diskTypes.includes('DivOptions'));
  console.log('  -> PASS: Individual file acceptance verified with disk synchronization');

  // Reject file A individually
  const rejectA = orchestrator.rejectFile(proposal.id, fileA);
  assert.strictEqual(rejectA, true);
  console.log('  -> PASS: Individual file rejection verified');

  // Concurrent Conflict Detection
  fs.writeFileSync(path.join(tempWorkspace, fileA), 'CONCURRENT MODIFICATION FROM EXTERNAL EDITOR', 'utf8');
  const currentDisk = {
    [fileA]: fs.readFileSync(path.join(tempWorkspace, fileA), 'utf8'),
    [fileB]: fs.readFileSync(path.join(tempWorkspace, fileB), 'utf8')
  };
  const conflict = orchestrator.detectConcurrentConflict(proposal.id, currentDisk);
  assert.strictEqual(conflict.hasConflict, true);
  assert.ok(conflict.conflictedFiles.includes(fileA));
  console.log('  -> PASS: Concurrent external edit conflict detected safely\n');

  // Restore files
  fs.writeFileSync(path.join(tempWorkspace, fileA), initialCalculator, 'utf8');
  fs.writeFileSync(path.join(tempWorkspace, fileB), initialTypes, 'utf8');

  // --- Suite 3: Autonomous Agent Loop & Self-Healing ---
  console.log('--- Suite 3: Autonomous Agent Loop & Self-Healing ---');

  let agentConversationStep = 0;
  const sharedCheckpointService = new FloatCheckpointService(tempWorkspace);
  const mockFloatService: any = {
    getActiveModel: () => ({ id: 'gpt-6-astra', name: 'GPT-6 Astra' }),
    getCheckpointService: () => sharedCheckpointService,
    getProposalSession: () => new FloatProposalSession(),
    streamChat: async (messages: any[], callbacks: any) => {
      agentConversationStep++;
      const lastMsg = messages[messages.length - 1].content;

      if (agentConversationStep === 1) {
        // Step 1: Model reads calculator.ts
        callbacks.onChunk('I will read the calculator implementation.\n```tool_call\n{"name":"read_file","parameters":{"path":"src/calculator.ts"}}\n```');
      } else if (agentConversationStep === 2) {
        // Step 2: Model runs a failing test command to observe failure
        callbacks.onChunk('Now running tests to verify current state.\n```tool_call\n{"name":"run_terminal_command","parameters":{"command":"npm test fail"}}\n```');
      } else if (agentConversationStep === 3) {
        // Step 3: Self-healing response - model observes failure and writes fix
        assert.ok(lastMsg.includes('Cannot find module "math-lib"'), 'Model must receive failure diagnostic');
        callbacks.onChunk('Observed failure. Writing fix to calculator.ts.\n```tool_call\n{"name":"write_file","parameters":{"path":"src/calculator.ts","content":"export function add(a: number, b: number) { return a + b; }\\nexport function safeDiv(a: number, b: number) { return b === 0 ? 0 : a / b; }"}}\n```');
      } else if (agentConversationStep === 4) {
        // Step 4: Model verifies with passing command
        callbacks.onChunk('Verifying fix with test suite.\n```tool_call\n{"name":"run_terminal_command","parameters":{"command":"npm test pass"}}\n```');
      } else {
        // Step 5: Concludes with final code summary
        callbacks.onChunk('All tests passing. Completed multi-file task.\n```typescript path="src/calculator.ts"\nexport function add(a: number, b: number) { return a + b; }\nexport function safeDiv(a: number, b: number) { return b === 0 ? 0 : a / b; }\n```');
      }
      callbacks.onComplete();
    }
  };

  const agent = new FloatComposerAgent(mockFloatService, toolRegistry, orchestrator);
  const stepsLogged: string[] = [];

  const execution = await agent.executeGoal({
    prompt: 'Implement safe division and ensure test suite passes',
    maxSteps: 8,
    activeFilePath: fileA
  }, step => {
    if (step.toolCall) {
      stepsLogged.push(`${step.stepIndex}: ${step.toolCall.name}`);
    }
  });

  assert.strictEqual(execution.status, 'completed');
  assert.ok(execution.steps.length >= 4, 'Must execute multi-step tool sequence');
  assert.ok(stepsLogged.includes('1: read_file'));
  assert.ok(stepsLogged.includes('2: run_terminal_command'));
  assert.ok(stepsLogged.includes('3: write_file'));
  assert.ok(stepsLogged.includes('4: run_terminal_command'));
  console.log(`  -> PASS: Agent completed 5-step loop (Read -> Fail -> Self-Heal -> Pass -> Finalize)`);
  assert.ok(execution.proposal, 'Agent must produce structured multi-file proposal');
  assert.strictEqual(execution.proposal?.files.length, 1);
  console.log('  -> PASS: Structured multi-file proposal attached to execution record\n');

  // --- Suite 4: Multi-File Turn Checkpointing & Atomic Rollback ---
  console.log('--- Suite 4: Multi-File Checkpoint & Atomic Rollback ---');
  assert.ok(execution.checkpointId, 'Execution must record turn checkpoint ID');
  const checkpointService = mockFloatService.getCheckpointService();

  // Verify file has been mutated on disk by tool
  const mutatedDisk = fs.readFileSync(path.join(tempWorkspace, fileA), 'utf8');
  assert.ok(mutatedDisk.includes('safeDiv'));

  // Rollback turn checkpoint
  console.log(`  Rolling back checkpoint: ${execution.checkpointId}...`);
  const currentFiles: Record<string, string> = {
    [fileA]: fs.readFileSync(path.join(tempWorkspace, fileA), 'utf8')
  };
  const rollbackResult = checkpointService.restoreCheckpoint(execution.checkpointId!, currentFiles);
  assert.strictEqual(rollbackResult.success, true);

  for (const act of rollbackResult.actions) {
    if (act.action === 'modified_restored' && act.content !== undefined) {
      fs.writeFileSync(path.join(tempWorkspace, act.path), act.content, 'utf8');
    }
  }

  const restoredDisk = fs.readFileSync(path.join(tempWorkspace, fileA), 'utf8');
  assert.strictEqual(restoredDisk, initialCalculator, 'Buffer must be 100% restored to initial state');
  console.log('  -> PASS: Atomic filesystem rollback restored all files to initial pre-turn baseline');

  // Cleanup
  fs.rmSync(tempWorkspace, { recursive: true, force: true });
  console.log('  Cleaned up disposable workspace.');

  console.log('\n================================================================');
  console.log('  ALL STEP 4 AUTONOMOUS COMPOSER ACCEPTANCE SUITES PASSED (100%) ');
  console.log('================================================================');
}

runStep4Tests().catch(err => {
  console.error('[FATAL STEP 4 ERROR]:', err);
  process.exit(1);
});
