import { ModelRouter } from '../src/server/providers/router';
import { INITIAL_MODELS, INITIAL_AGENTS } from '../src/features/ai/registry';
import { getVerifiedModel, getAllCatalogModels, MODEL_CONFIG } from '../src/data/verifiedModels';
import { AIProviderError } from '../src/server/providers/base';
import { validateToolPermission } from '../src/server/agentOrchestrator';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, extra?: any) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ ${testName}`, extra || '');
    failed++;
  }
}

async function runRealModelIdentityTests() {
  console.log('\n======================================================');
  console.log('PHASE 2 REAL MODEL IDENTITY & ALIAS REMOVAL TEST SUITE');
  console.log('======================================================\n');

  const router = new ModelRouter();

  // Test Suite 1: Alias Removal Verification
  console.log('--- Test Suite 1: Complete Removal of float-basic Alias ---');
  const foundInInitial = INITIAL_MODELS.find((m) => m.id === 'float-basic');
  assert(!foundInInitial, 'float-basic alias is completely removed from INITIAL_MODELS');
  const verifiedBasic = getVerifiedModel('float-basic');
  assert(!verifiedBasic, 'float-basic alias is completely removed from verifiedModels.ts');

  let aliasRouteErr: any = null;
  try {
    router.resolveRoute('float-basic');
  } catch (err) {
    aliasRouteErr = err;
  }
  assert(aliasRouteErr instanceof AIProviderError, 'Routing float-basic throws AIProviderError');
  assert(aliasRouteErr?.code === 'MODEL_NOT_AVAILABLE', 'float-basic returns MODEL_NOT_AVAILABLE');
  assert(aliasRouteErr?.statusCode === 404, 'float-basic returns 404 status');

  // Test Suite 2: Exact Upstream Model IDs Only
  console.log('\n--- Test Suite 2: Every Catalog Entry ID Equals Upstream Model ID ---');
  for (const model of getAllCatalogModels()) {
    assert(model.id === model.exactModelId, `Model "${model.id}" equals exactModelId "${model.exactModelId}"`);
    assert(Boolean(MODEL_CONFIG.models[model.id]), `Model "${model.id}" is configured in single MODEL_CONFIG object`);
  }

  const argon = getVerifiedModel('gemini-4-argon');
  assert(Boolean(argon), 'gemini-4-argon is present in verifiedModels');
  assert(argon?.providerId === 'google', 'gemini-4-argon providerId is google');
  assert(argon?.maxOutputTokens === 1000000, 'gemini-4-argon maxOutputTokens is 1,000,000 (1M)');
  assert(argon?.pricing.inputCostPer1M === null && argon?.pricing.outputCostPer1M === null, 'gemini-4-argon unknown pricing is null');

  const astra = getVerifiedModel('gpt-6-astra');
  assert(Boolean(astra), 'gpt-6-astra is present in verifiedModels');
  assert(astra?.exactModelId === 'gpt-6-astra', 'gpt-6-astra exactModelId is gpt-6-astra');

  const sol = getVerifiedModel('gpt-6-sol');
  assert(Boolean(sol), 'gpt-6-sol is present in verifiedModels');
  assert(sol?.exactModelId === 'gpt-6-sol', 'gpt-6-sol exactModelId is gpt-6-sol');
  assert(!getVerifiedModel('gpt-6.1-sol'), 'gpt-6.1-sol is removed from default catalog unless proven by health check');

  // Test Suite 3: Direct Backend Model Routing
  console.log('\n--- Test Suite 3: Direct Backend Model Routing ---');
  const argonRoute = router.resolveRoute('gemini-4-argon');
  assert(argonRoute.route.provider === 'google', 'gemini-4-argon routes to Google Gemini adapter');
  assert(argonRoute.route.apiModelId === 'gemini-4-argon', 'gemini-4-argon routes to gemini-4-argon');

  const gptRoute = router.resolveRoute('gpt-4o');
  assert(gptRoute.route.provider === 'openai', 'gpt-4o routes to OpenAI');
  const miniRoute = router.resolveRoute('gpt-4o-mini');
  assert(miniRoute.route.provider === 'openai', 'gpt-4o-mini routes to OpenAI');

  // Test Suite 4: Agent Compatibility & Tool Security
  console.log('\n--- Test Suite 4: Developer Agent Compatibility & Tool Security ---');
  const supportedAgentIds = [
    'coder-agent',
    'reviewer-agent',
    'planner-agent',
    'debugger-agent',
    'explorer-agent',
    'ui-agent'
  ];

  for (const agentId of supportedAgentIds) {
    const agent = INITIAL_AGENTS.find((a) => a.id === agentId);
    assert(Boolean(agent), `Agent "${agentId}" is defined in registry`);
    const isModelAllowed = Boolean(agent?.allowedModels.includes('*') || agent?.allowedModels.includes('gemini-4-argon'));
    assert(isModelAllowed, `Agent "${agentId}" can use real models`);
  }

  const reviewerReadPerm = validateToolPermission('reviewer-agent', 'read_project_file');
  assert(reviewerReadPerm.allowed === true, 'Reviewer agent permitted to read_project_file');
  const reviewerWritePerm = validateToolPermission('reviewer-agent', 'propose_changes');
  assert(reviewerWritePerm.allowed === false, 'Reviewer agent DENIED propose_changes (read-only enforcement)');
  const reviewerDirectModPerm = validateToolPermission('reviewer-agent', 'create_file');
  assert(reviewerDirectModPerm.allowed === false, 'Reviewer agent DENIED create_file (direct modification prohibited)');

  console.log('\n======================================================');
  console.log(`PHASE 2 REAL MODEL IDENTITY RESULTS: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

void runRealModelIdentityTests();
