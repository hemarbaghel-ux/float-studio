import assert from 'assert';
import {
  WORKFLOW_MODE_POLICIES,
  validateModePermission,
  getWorkflowModeInstructions
} from '../src/server/agent/agentModes';

console.log('=== FLOAT AI Milestone 9: Agent Modes Verification ===\n');

try {
  // Test 1: Chat Mode permissions
  console.log('--- Test 1: Chat Mode Policy ---');
  const chatRead = validateModePermission('chat', 'read');
  const chatSearch = validateModePermission('chat', 'search');
  const chatPropose = validateModePermission('chat', 'propose');
  const chatApply = validateModePermission('chat', 'apply');
  const chatCmd = validateModePermission('chat', 'execute_command');

  assert.strictEqual(chatRead.allowed, true, 'Chat mode allows reading files');
  assert.strictEqual(chatSearch.allowed, true, 'Chat mode allows searching codebase');
  assert.strictEqual(chatPropose.allowed, false, 'Chat mode forbids proposing file modifications');
  assert.strictEqual(chatApply.allowed, false, 'Chat mode forbids applying proposals');
  assert.strictEqual(chatCmd.allowed, false, 'Chat mode forbids direct command execution');
  console.log('[PASS] Chat mode policy strictly prevents file/command mutations');

  // Test 2: Ask / Read-Only Mode permissions
  console.log('\n--- Test 2: Ask / Read-Only Mode Policy ---');
  const askRead = validateModePermission('ask', 'read');
  const askSearch = validateModePermission('ask', 'search');
  const askGit = validateModePermission('ask', 'git_inspect');
  const askDiag = validateModePermission('ask', 'diagnostics_inspect');
  const askPropose = validateModePermission('ask', 'propose');
  const askApply = validateModePermission('ask', 'apply');

  assert.strictEqual(askRead.allowed, true, 'Ask mode allows reading files');
  assert.strictEqual(askSearch.allowed, true, 'Ask mode allows searching codebase');
  assert.strictEqual(askGit.allowed, true, 'Ask mode allows inspecting Git state');
  assert.strictEqual(askDiag.allowed, true, 'Ask mode allows inspecting diagnostics');
  assert.strictEqual(askPropose.allowed, false, 'Ask mode strictly forbids proposing file changes');
  assert.strictEqual(askApply.allowed, false, 'Ask mode strictly forbids applying changes');
  console.log('[PASS] Ask mode is strictly read-only and forbids mutation actions');

  // Test 3: Plan Mode permissions and instructions
  console.log('\n--- Test 3: Plan Mode Policy & Approval Gates ---');
  const planPolicy = WORKFLOW_MODE_POLICIES['plan'];
  assert.strictEqual(planPolicy.canProposeChanges, true, 'Plan mode allows generating structured plans');
  assert.strictEqual(planPolicy.canApplyProposals, false, 'Plan mode cannot self-apply proposals');
  assert.strictEqual(planPolicy.requiresHumanApproval, true, 'Plan mode requires explicit human review and approval');
  const planInstructions = getWorkflowModeInstructions('plan');
  assert.ok(planInstructions.includes('PLAN MODE'), 'Includes PLAN MODE header');
  assert.ok(planInstructions.includes('user must review and approve'), 'Enforces user approval requirement');
  console.log('[PASS] Plan mode requires explicit user approval before execution');

  // Test 4: Agent Mode permissions and safety controls
  console.log('\n--- Test 4: Agent Mode Multi-Step Policy ---');
  const agentPolicy = WORKFLOW_MODE_POLICIES['agent'];
  assert.strictEqual(agentPolicy.canReadFiles, true, 'Agent mode can read project files');
  assert.strictEqual(agentPolicy.canSearchCodebase, true, 'Agent mode can search codebase');
  assert.strictEqual(agentPolicy.canProposeChanges, true, 'Agent mode creates proposal changesets');
  assert.strictEqual(agentPolicy.canApplyProposals, false, 'Agent mode cannot automatically apply without human approval');
  assert.strictEqual(agentPolicy.canExecuteCommands, false, 'Agent mode denies direct unvetted shell execution');
  console.log('[PASS] Agent mode proposal safety and command restrictions verified');

  // Test 5: Debug Mode workflow
  console.log('\n--- Test 5: Debug Mode Diagnostic Protocol ---');
  const debugPolicy = WORKFLOW_MODE_POLICIES['debug'];
  assert.strictEqual(debugPolicy.canInspectDiagnostics, true, 'Debug mode inspects diagnostics');
  assert.strictEqual(debugPolicy.canInspectGit, true, 'Debug mode inspects recent Git changes');
  const debugInstructions = getWorkflowModeInstructions('debug');
  assert.ok(debugInstructions.includes('DEBUG MODE'), 'Includes DEBUG MODE header');
  assert.ok(debugInstructions.includes('4-step diagnostic protocol'), 'Enforces 4-step diagnostic protocol');
  console.log('[PASS] Debug mode structured protocol verified');

  console.log('\n==================================================');
  console.log('Milestone 9 Agent Modes: All 5 suites passed!');
  console.log('==================================================\n');
} catch (err: any) {
  console.error('[FAIL] Agent modes verification failed:', err);
  process.exit(1);
}
