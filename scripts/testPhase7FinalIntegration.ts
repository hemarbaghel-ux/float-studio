import { ModelRouter } from '../src/server/providers/router';
import { normalizeGeminiError } from '../src/server/providers/gemini';
import { ProposalService, prepareProposalFinalization } from '../src/server/proposals/proposalService';
import { ValidationService } from '../src/server/validation/validationService';

async function runPhase7Tests() {
  console.log('=== FLOAT AI Phase 7: Final Integration, Polish & Production Readiness Test Suite ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // --- SECTION 1: Model Routing, Availability & No Silent Fallback ---
  console.log('--- 1. Model Selection & Routing Integrity ---');
  const router = new ModelRouter();

  // Valid active models resolve to proper adapter
  try {
    const astraAdapter = router.getAdapterForModel('gpt-6-astra');
    assert(astraAdapter.id === 'openai', 'Resolves GPT-6 Astra to the OpenAI provider adapter');

    const solAdapter = router.getAdapterForModel('gpt-6.1-sol');
    assert(solAdapter.id === 'openai', 'Resolves GPT-6.1 Sol to the OpenAI provider adapter');

    assert(router.resolveModelId('auto') === 'gpt-6-astra', 'Resolves auto model to gpt-6-astra');
  } catch (e: any) {
    assert(false, `Failed resolving active OpenAI models: ${e.message}`);
  }

  // Non-OpenAI model throws clear unsupported provider error, never silently fall back
  try {
    router.validateModelAvailability('gemini-2.0-flash');
    assert(false, 'Should have rejected retired model gemini-2.0-flash');
  } catch (err: any) {
    assert(err.code === 'UNSUPPORTED_PROVIDER' || err.message.includes('unsupported provider'), 'Rejects non-OpenAI models with clear error');
  }

  // External non-OpenAI models throw clean UNSUPPORTED_PROVIDER error, NEVER silently fallback
  try {
    const openaiAdapter = router.getAdapterForModel('gpt-6-astra');
    assert(openaiAdapter.id === 'openai', 'Resolves GPT-6 Astra strictly to OpenAI adapter');
  } catch (e: any) {
    assert(false, `Failed resolving gpt-4o: ${e.message}`);
  }

  try {
    router.getAdapterForModel('grok-4.7');
    assert(false, 'Should have rejected grok-4.7 as unsupported provider');
  } catch (e: any) {
    assert(e.code === 'UNSUPPORTED_PROVIDER' || e.message.includes('unsupported provider'), 'Rejects grok-4.7 as unsupported provider without silent fallback');
  }

  // Unrecognized model rejected with clear message
  try {
    router.getAdapterForModel('fake-nonexistent-model-xyz');
    assert(false, 'Should have rejected fake-nonexistent-model-xyz');
  } catch (err: any) {
    assert(err.message.includes('not recognized or supported by the FLOAT router'), 'Rejects unsupported model without silent fallback');
  }

  try {
    router.getAdapterForModel('gpt-4o');
    assert(false, 'Should have rejected non-selectable legacy OpenAI model gpt-4o');
  } catch (err: any) {
    assert(err.code === 'MODEL_NOT_FOUND', 'Rejects non-selectable legacy OpenAI model with explicit unavailable error');
  }

  // --- SECTION 2: Provider Error Normalization & Rate Limit Handling ---
  console.log('\n--- 2. Error Normalization & Rate Limit / Quota Handling ---');
  const retired404Error = new Error('{"error":{"code":404,"message":"This model models/gemini-2.0-flash is no longer available."}}');
  const normalizedRetired = normalizeGeminiError(retired404Error);
  assert(normalizedRetired.message.includes('no longer available'), 'Normalizes 404 retired model to user-friendly message');

  const highDemand503 = new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary."}}');
  const normalized503 = normalizeGeminiError(highDemand503);
  assert(normalized503.message.includes('temporary high demand'), 'Normalizes 503 high demand spikes cleanly');

  const quotaError = new Error('generic::resource_exhausted: You exceeded your current quota, please check your plan and billing details.');
  const normalizedQuota = normalizeGeminiError(quotaError);
  assert(normalizedQuota.message.includes('rate limit or quota exceeded'), 'Normalizes resource_exhausted to user-friendly message');
  assert(normalizedQuota.message.includes('switch models in the model selector'), 'Provides actionable next step for rate limits');

  const authError = new Error('API_KEY_INVALID: Key not valid');
  const normalizedAuth = normalizeGeminiError(authError);
  assert(normalizedAuth.message.includes('authentication failed'), 'Normalizes API key error cleanly');

  const timeoutError = new Error('ETIMEDOUT: connect timed out');
  const normalizedTimeout = normalizeGeminiError(timeoutError);
  assert(normalizedTimeout.message.includes('timed out'), 'Normalizes timeout errors cleanly');

  // --- SECTION 3: Code Proposal, Diff Review & Application ---
  console.log('\n--- 3. Code Proposal Workflow & Immutability ---');

  const virtualFiles = new Map<string, { path: string; name?: string; content?: string; type: string }>();
  const origContent = 'export function calculateTotal(items: number[]) { return items.reduce((a, b) => a + b, 0); }\n';
  virtualFiles.set('src/calc.ts', { path: 'src/calc.ts', name: 'calc.ts', content: origContent, type: 'file' });

  const propResult = ProposalService.createProposal({
    ownerId: 'user-p7',
    projectId: 'proj-p7',
    description: 'Add tax calculation to total',
    rawChanges: [
      {
        path: 'src/calc.ts',
        operation: 'modify',
        proposedContent: 'export function calculateTotal(items: number[], taxRate: number = 0.05) { return items.reduce((a, b) => a + b, 0) * (1 + taxRate); }\n'
      }
    ],
    virtualFiles
  });

  assert(!!propResult.proposal, 'Proposal created successfully');
  const proposal = propResult.proposal!;
  assert(proposal.status === 'pending_review', 'Proposal initial status is pending_review');
  assert(virtualFiles.get('src/calc.ts')?.content === origContent, 'Original file is 100% UNTOUCHED upon proposal creation');

  // Proposal status is confirmed only against the exact content saved to the cloud project.
  const unsavedFiles = [{ path: 'src/calc.ts', content: origContent }];
  const unsavedApply = prepareProposalFinalization(proposal, {
    ownerId: 'user-p7',
    projectId: 'proj-p7',
    approvedPaths: ['src/calc.ts'],
    currentFiles: unsavedFiles,
    projectData: { fileStorageVersion: 2, fileGeneration: 'generation-before' },
  });
  assert(!unsavedApply.result.success, 'Does not mark the proposal applied before the workspace is saved');
  assert(proposal.status === 'pending_review', 'A failed finalization leaves the proposal pending review');

  const savedApply = prepareProposalFinalization(proposal, {
    ownerId: 'user-p7',
    projectId: 'proj-p7',
    approvedPaths: ['src/calc.ts'],
    currentFiles: [{ path: 'src/calc.ts', content: proposal.changes[0].proposedContent }],
    projectData: { fileStorageVersion: 2, fileGeneration: 'generation-after' },
  });
  assert(savedApply.result.success, 'Confirms the proposal after exact content exists in the project snapshot');
  assert(savedApply.result.status === 'applied', 'Final status reflects the saved project content');

  // --- SECTION 4: Testing, Validation & Diagnostics ---
  console.log('\n--- 4. Testing & Validation Pipeline ---');

  // Sanitization
  const rawApiKeyOutput = 'Build completed for AIzaSyDVqIlcfHGV3NxuZxRRJhkiHaVJwBmjIL0 at /tmp/test';
  const cleanSanitized = ValidationService.sanitizeOutput(rawApiKeyOutput);
  assert(!cleanSanitized.includes('AIzaSyDVqIlcfHGV3NxuZxRRJhkiHaVJwBmjIL0'), 'Sanitizes Google API keys in output');
  assert(cleanSanitized.includes('[REDACTED_API_KEY]'), 'Replaces key with [REDACTED_API_KEY]');

  // Proposal preview validation
  const previewVal = await ValidationService.executeValidation({
    projectId: 'proj-p7',
    userId: 'user-p7',
    target: 'proposal',
    proposalId: proposal.id,
    files: [{ path: 'src/calc.ts', content: origContent }],
    requestedChecks: ['syntax']
  });
  assert(previewVal.status === 'passed', 'Proposal preview passes syntax check');
  assert(virtualFiles.get('src/calc.ts')?.content === origContent, 'Proposal validation does NOT modify source files');

  // Honest unsupported feature reporting
  const unsupportedCheck = await ValidationService.executeValidation({
    projectId: 'proj-p7',
    userId: 'user-p7',
    target: 'current_project',
    files: [{ path: 'src/calc.ts', content: origContent }],
    requestedChecks: ['test', 'eslint']
  });
  const testReport = unsupportedCheck.checks.find(c => c.type === 'test');
  assert(testReport?.status === 'unsupported', 'Reports unit test runner as unsupported honestly');

  console.log(`\n======================================================`);
  console.log(`Phase 7 Verification Results: ${passed} passed, ${failed} failed.`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase7Tests().catch(err => {
  console.error('Phase 7 Test execution failed:', err);
  process.exit(1);
});
