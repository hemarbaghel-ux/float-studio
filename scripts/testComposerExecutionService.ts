import assert from 'node:assert/strict';
import {
  runComposerTask,
  type ComposerMode,
  type RunComposerTaskOptions
} from '../src/server/agent/composerExecutionService';
import { setProjectLookupForTests, resetEphemeralWorkspacesForTests } from '../src/server/projectOwnership';
import { ExecutionPolicyManager } from '../src/server/policy/executionPolicy';
import { ProposalService } from '../src/server/proposals/proposalService';
import type { AIProviderRequest, AIProviderResponse } from '../src/server/providers/base';
import type { FileNode } from '../src/types';

const USER_ID = 'composer-test-owner';
const PROJECT_ID = 'composer-test-project';

const files: FileNode[] = [
  {
    id: 'src',
    name: 'src',
    type: 'folder',
    children: [
      {
        id: 'index',
        name: 'index.ts',
        type: 'file',
        content: 'export const answer = 42;\n'
      }
    ]
  }
];

function options(
  mode: ComposerMode,
  generate: (request: AIProviderRequest) => Promise<AIProviderResponse>,
  overrides: Partial<RunComposerTaskOptions> = {}
): RunComposerTaskOptions {
  return {
    userId: USER_ID,
    projectId: PROJECT_ID,
    model: 'gpt-6-astra',
    prompt: 'Inspect this project and explain the entry point.',
    mode,
    generate,
    ...overrides
  };
}

async function run(): Promise<void> {
  setProjectLookupForTests(async (projectId: string) => projectId === PROJECT_ID
    ? {
        exists: true,
        data: { id: PROJECT_ID, ownerId: USER_ID, name: 'Composer Fixture', files }
      }
    : { exists: false }
  );
  ExecutionPolicyManager.clearCacheForTests();

  try {
    // Ask mode is a normal model answer and receives no tools.
    let askCalled = false;
    const ask = await runComposerTask(options('ask', async request => {
      askCalled = true;
      assert.deepEqual(request.tools, []);
      return { text: 'The answer is 42.' };
    }));
    assert.equal(askCalled, true);
    assert.equal(ask.status, 'completed');
    assert.equal(ask.finalText, 'The answer is 42.');

    // Agent mode sends real structured tool schemas and executes a server-side
    // bounded read tool before passing the observation back to the model.
    let agentCalls = 0;
    const agent = await runComposerTask(options('agent', async request => {
      agentCalls++;
      assert.ok(request.tools?.some(tool => tool.name === 'list_project_files'));
      assert.ok(request.tools?.some(tool => tool.name === 'propose_changes'));
      if (agentCalls === 1) {
        return {
          text: 'I will inspect the project files.',
          toolCalls: [{ id: 'call-list', name: 'list_project_files', arguments: {} }]
        };
      }
      assert.ok(request.messages.some(message => JSON.stringify(message).includes('index.ts')));
      return { text: 'The project has one source file exporting answer = 42.' };
    }));
    assert.equal(agent.status, 'completed');
    assert.equal(agent.iterations, 2);
    assert.equal(agent.steps.length, 1);
    assert.equal(agent.steps[0].toolName, 'list_project_files');
    assert.equal(agent.steps[0].success, true);
    assert.equal(agentCalls, 2);

    // Plan mode gets read-only tools, never the proposal tool.
    const plan = await runComposerTask(options('plan', async request => {
      assert.ok(request.tools?.some(tool => tool.name === 'read_project_file'));
      assert.ok(!request.tools?.some(tool => tool.name === 'propose_changes'));
      return { text: '1. Inspect the entry point.\n2. Add tests.' };
    }));
    assert.equal(plan.status, 'completed');

    // Manual mode surfaces an approval request and does not execute the tool.
    const manual = await runComposerTask(options('manual', async request => ({
      text: 'I would like to inspect files.',
      toolCalls: [{ id: 'call-manual', name: 'list_project_files', arguments: {} }]
    })));
    assert.equal(manual.status, 'approval_required');
    assert.equal(manual.steps.length, 1);
    assert.equal(manual.steps[0].requiresHumanApproval, true);
    assert.equal(manual.steps[0].success, false);

    // The hard iteration bound is enforced even when a model keeps requesting tools.
    const bounded = await runComposerTask(options('agent', async () => ({
      text: 'Inspecting.',
      toolCalls: [{ id: 'call-read', name: 'read_project_file', arguments: { path: 'src/index.ts' } }]
    }), { maxIterations: 1 }));
    assert.equal(bounded.status, 'max_iterations_exceeded');
    assert.equal(bounded.iterations, 1);
    assert.equal(bounded.steps.length, 1);

    // In sandboxed mode, the agent may stage a durable proposal, but the
    // proposal remains pending review and never edits the project snapshot.
    ExecutionPolicyManager.setPolicyMode(USER_ID, 'sandboxed');
    const proposalRun = await runComposerTask(options('agent', async request => {
      assert.ok(request.tools?.some(tool => tool.name === 'propose_changes'));
      return {
        text: 'I prepared a small change for review.',
        toolCalls: [{
          id: 'call-propose',
          name: 'propose_changes',
          arguments: {
            description: 'Update the answer constant',
            changes: [{
              path: 'src/index.ts',
              operation: 'modify',
              proposedContent: 'export const answer = 43;\\n'
            }]
          }
        }]
      };
    }, { maxIterations: 1 }));
    assert.equal(proposalRun.steps[0].success, true);
    assert.equal(proposalRun.proposalsGenerated.length, 1);
    const stagedProposal = ProposalService.getProposal(proposalRun.proposalsGenerated[0]);
    assert.ok(stagedProposal);
    assert.equal(stagedProposal?.status, 'pending_review');
    assert.equal(stagedProposal?.changes[0].originalContent, 'export const answer = 42;\\n');
    assert.equal(stagedProposal?.changes[0].proposedContent, 'export const answer = 43;\\n');

    // A pre-cancelled task does not call the model or execute tools.
    const abort = new AbortController();
    abort.abort();
    let calledAfterAbort = false;
    const cancelled = await runComposerTask(options('agent', async () => {
      calledAfterAbort = true;
      return { text: 'Should never be called.' };
    }, { signal: abort.signal }));
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(calledAfterAbort, false);

    // Unavailable or malformed tool calls are rejected rather than dispatched.
    const rejected = await runComposerTask(options('agent', async () => ({
      text: 'Trying an unsupported tool.',
      toolCalls: [{ id: 'call-unknown', name: 'delete_project', arguments: {} }]
    }), { maxIterations: 1 }));
    assert.equal(rejected.steps[0].success, false);
    assert.match(rejected.steps[0].error || '', /not available/);

    console.log('Composer execution service: 8 scenarios passed.');
  } finally {
    setProjectLookupForTests(null);
    resetEphemeralWorkspacesForTests();
    ProposalService.clearForTests?.();
    ExecutionPolicyManager.clearCacheForTests();
  }
}

run().catch(error => {
  console.error('Composer execution service test failed:', error);
  process.exitCode = 1;
});
