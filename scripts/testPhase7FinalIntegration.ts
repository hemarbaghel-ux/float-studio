import { ModelRouter } from '../src/server/providers/router';
import { normalizeGeminiError } from '../src/server/providers/gemini';
import { ToolRegistry } from '../src/server/agent/toolRegistry';
import { ProposalService, sanitizeProposalPath, computeContentHash } from '../src/server/agent/proposalService';
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
    const flashLiteAdapter = router.getAdapterForModel('gemini-3.1-flash-lite');
    assert(flashLiteAdapter.id === 'google', 'Resolves gemini-3.1-flash-lite to google provider adapter');
    
    const flash38Adapter = router.getAdapterForModel('gemini-3.8-flash');
    assert(flash38Adapter.id === 'google', 'Resolves gemini-3.8-flash to google provider adapter');

    assert(router.resolveModelId('auto') === 'gemini-3.1-flash-lite', 'Resolves auto model to gemini-3.1-flash-lite');
  } catch (e: any) {
    assert(false, `Failed resolving active Gemini models: ${e.message}`);
  }

  // Retired model throws clear availability error, never silently fall back
  try {
    router.validateModelAvailability('gemini-2.0-flash');
    assert(false, 'Should have rejected retired model gemini-2.0-flash');
  } catch (err: any) {
    assert(err.message.includes('retired by Google'), 'Rejects retired gemini-2.0-flash with clear upgrade message');
  }

  // Unconfigured external providers throw clean error, NEVER silently fallback to Gemini
  try {
    const openaiAdapter = router.getAdapterForModel('gpt-4o');
    assert(openaiAdapter.id === 'openai', 'Resolves gpt-4o strictly to openai adapter');
  } catch (e: any) {
    assert(false, `Failed resolving gpt-4o: ${e.message}`);
  }

  try {
    const xaiAdapter = router.getAdapterForModel('grok-4.7');
    assert(xaiAdapter.id === 'xai', 'Resolves Grok 4.7 strictly to xAI adapter');
  } catch (e: any) {
    assert(false, `Failed resolving grok-4.7: ${e.message}`);
  }

  // Unrecognized model rejected with clear message
  try {
    router.getAdapterForModel('fake-nonexistent-model-xyz');
    assert(false, 'Should have rejected fake-nonexistent-model-xyz');
  } catch (err: any) {
    assert(err.message.includes('not recognized or supported by the FLOAT router'), 'Rejects unsupported model without silent fallback');
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

  // --- SECTION 3: Agent Tool Execution & Safety Boundaries ---
  console.log('\n--- 3. Agent Tool Safety & Traversal Guards ---');

  // Path traversal rejection
  const traversalCheck = sanitizeProposalPath('../../etc/passwd');
  assert(!!traversalCheck.error && traversalCheck.error.includes('Path traversal'), 'Rejects path traversal in proposal paths');

  // Sensitive file blocking
  const envCheck = sanitizeProposalPath('.env.production');
  assert(!!envCheck.error && envCheck.error.includes('sensitive path'), 'Rejects sensitive .env files in proposals');

  const keyCheck = sanitizeProposalPath('src/keys/private.pem');
  assert(!!keyCheck.error && keyCheck.error.includes('sensitive path'), 'Rejects private.pem certificate keys');

  // Tool execution permissions
  const virtualFiles = new Map<string, { path: string; name?: string; content?: string; type: string }>();
  virtualFiles.set('src/index.ts', { path: 'src/index.ts', name: 'index.ts', content: 'console.log("hello");', type: 'file' });
  virtualFiles.set('.env', { path: '.env', name: '.env', content: 'SECRET=123', type: 'file' });

  const context = {
    userId: 'user-p7',
    projectId: 'proj-p7',
    projectName: 'Phase 7 Workspace',
    virtualFiles
  };

  // list_project_files excludes sensitive files
  const listResult = await ToolRegistry.execute('list_project_files', {}, context);
  assert(listResult.success, 'list_project_files executes successfully');
  const foundPaths = (listResult.output?.files || []).map((f: any) => typeof f === 'string' ? f : f.path);
  assert(!foundPaths.includes('.env'), 'list_project_files hides sensitive .env from agent');
  assert(foundPaths.includes('src/index.ts'), 'list_project_files includes authorized project files');

  // read_project_file blocks reading sensitive files
  const readSecretResult = await ToolRegistry.execute('read_project_file', { path: '.env' }, context);
  assert(!readSecretResult.success, 'read_project_file rejects reading sensitive .env file');

  // --- SECTION 4: Code Proposal, Diff Review & Application ---
  console.log('\n--- 4. Code Proposal Workflow & Immutability ---');

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

  // Stale detection: if file changes before apply
  const divergedFiles = [{ path: 'src/calc.ts', content: 'export function calculateTotal() { return 0; }\n' }];
  const staleApply = await ProposalService.applyProposal(proposal.id, {
    userId: 'user-p7',
    currentFiles: divergedFiles
  });
  assert(!staleApply.success, 'Rejects applying proposal if target file has diverged (conflict guard)');
  assert(staleApply.status === 'stale', 'Status updated to stale on conflict');

  // Clean apply when matching original content
  const cleanFiles = [{ path: 'src/calc.ts', content: origContent }];
  // Create fresh proposal for clean apply
  const freshProp = ProposalService.createProposal({
    ownerId: 'user-p7',
    projectId: 'proj-p7',
    description: 'Fresh clean proposal',
    rawChanges: [
      {
        path: 'src/calc.ts',
        operation: 'modify',
        proposedContent: 'export const calculateTotal = () => 42;\n'
      }
    ],
    virtualFiles
  }).proposal!;

  const cleanApply = await ProposalService.applyProposal(freshProp.id, {
    userId: 'user-p7',
    currentFiles: cleanFiles
  });
  assert(cleanApply.success, 'Successfully applies approved proposal when hashes match');
  assert(cleanApply.status === 'applied', 'Status marked applied after successful execution');

  // --- SECTION 5: Testing, Validation & Diagnostics ---
  console.log('\n--- 5. Testing & Validation Pipeline ---');

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
    proposalId: freshProp.id,
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
