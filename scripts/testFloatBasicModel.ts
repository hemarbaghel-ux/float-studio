import { ModelRouter } from '../src/server/providers/router';
import { INITIAL_MODELS, INITIAL_AGENTS, FLOAT_BASIC_MODEL } from '../src/features/ai/registry';
import { VERIFIED_MODELS, getVerifiedModel } from '../src/data/verifiedModels';
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

async function runFloatBasicTests() {
  console.log('\n======================================================');
  console.log('FLOAT BASIC MODEL TEST SUITE (FREE TIER INTEGRATION)');
  console.log('======================================================\n');

  const router = new ModelRouter();

  // Test Suite 1: Catalog Presence & Metadata
  console.log('--- Test Suite 1: FLOAT Basic Catalog Presence & Metadata ---');
  const foundInInitial = INITIAL_MODELS.find(m => m.id === 'float-basic');
  assert(Boolean(foundInInitial), 'float-basic is present in INITIAL_MODELS');
  assert(foundInInitial?.displayName === 'FLOAT Basic', 'Display name is "FLOAT Basic"');
  assert(foundInInitial?.shortName === 'FLOAT Basic', 'Short name is "FLOAT Basic"');
  assert(foundInInitial?.tier === 'Free', 'Tier is explicitly "Free"');
  assert(foundInInitial?.provider?.includes('FLOAT'), 'Provider branding contains "FLOAT"');
  assert(foundInInitial?.providerId === 'openai', 'Backend providerId is "openai"');
  assert(foundInInitial?.apiModelId === 'gpt-4o-mini', 'apiModelId is "gpt-4o-mini"');
  assert(foundInInitial?.contextWindow === 128000, 'Context window is verified 128000 tokens');
  assert(foundInInitial?.status === 'AVAILABLE', 'Status is "AVAILABLE" for Free users');
  assert(foundInInitial?.pricing?.inputCost === 0, 'Input token cost is 0 (Free)');
  assert(foundInInitial?.pricing?.outputCost === 0, 'Output token cost is 0 (Free)');

  // Test Suite 2: Six Basic Developer Capabilities
  console.log('\n--- Test Suite 2: Six Supported Basic Developer Capabilities ---');
  const caps = foundInInitial?.capabilitiesList || [];
  assert(caps.includes('Coding'), 'Supported capability: Coding');
  assert(caps.includes('Reviewing'), 'Supported capability: Reviewing');
  assert(caps.includes('Planning'), 'Supported capability: Planning');
  assert(caps.includes('Debugging'), 'Supported capability: Debugging');
  assert(caps.includes('Exploring'), 'Supported capability: Exploring');
  assert(caps.includes('UI assistance'), 'Supported capability: UI assistance');
  assert(foundInInitial?.supportsReasoning === false, 'supportsReasoning is false (honest: not advertised as frontier reasoning)');

  // Test Suite 3: Verified Models Registry & Limitations
  console.log('\n--- Test Suite 3: Verified Model Details & Documented Limitations ---');
  const verifiedBasic = getVerifiedModel('float-basic');
  assert(Boolean(verifiedBasic), 'getVerifiedModel("float-basic") returns model details');
  assert(verifiedBasic?.category === 'efficient', 'Category is "efficient"');
  assert(Boolean(verifiedBasic?.limitations && verifiedBasic.limitations.length >= 3), 'Has explicit documented limitations');
  assert(verifiedBasic?.limitations?.some(l => l.includes('not optimized for large-scale architectural redesign')), 'Discloses architectural redesign limitation');
  assert(verifiedBasic?.limitations?.some(l => l.includes('proposal review')), 'Discloses proposal review requirement');

  // Test Suite 4: Backend ModelRouter Resolution
  console.log('\n--- Test Suite 4: Backend Model Routing ---');
  const route = router.resolveRoute('float-basic');
  assert(route.route.provider === 'openai', 'float-basic routes to OpenAI backend provider');
  assert(route.route.apiModelId === 'gpt-4o-mini', 'float-basic routes to gpt-4o-mini apiModelId');
  assert(typeof route.adapter.generateContent === 'function', 'Resolved adapter has generateContent method');

  const adapter = router.getAdapterForModel('float-basic');
  assert(adapter.id === 'openai', 'getAdapterForModel("float-basic") returns OpenAI adapter');

  // Test Suite 5: OpenAI Routing & Unsupported Provider Rejection
  console.log('\n--- Test Suite 5: OpenAI Model Routing & Provider Protection ---');
  const gptRoute = router.resolveRoute('gpt-4o');
  assert(gptRoute.route.provider === 'openai', 'gpt-4o remains routed to OpenAI');
  const miniRoute = router.resolveRoute('gpt-4o-mini');
  assert(miniRoute.route.provider === 'openai', 'gpt-4o-mini routes to OpenAI');
  const o1Route = router.resolveRoute('o1');
  assert(o1Route.route.provider === 'openai', 'o1 routes to OpenAI');

  // Invalid model resolution throws 404 MODEL_NOT_FOUND
  let invalidError: any = null;
  try {
    router.resolveRoute('non-existent-float-model');
  } catch (err: any) {
    invalidError = err;
  }
  assert(invalidError instanceof AIProviderError, 'Invalid model throws AIProviderError');
  assert(invalidError?.statusCode === 404, 'Invalid model returns 404 status code');
  assert(invalidError?.code === 'MODEL_NOT_FOUND', 'Invalid model returns MODEL_NOT_FOUND');

  // Test Suite 6: Agent Compatibility for the Six Basic Developer Agents
  console.log('\n--- Test Suite 6: Developer Agent Compatibility & Tool Security ---');
  const supportedAgentIds = [
    'coder-agent',
    'reviewer-agent',
    'planner-agent',
    'debugger-agent',
    'explorer-agent',
    'ui-agent'
  ];

  for (const agentId of supportedAgentIds) {
    const agent = INITIAL_AGENTS.find(a => a.id === agentId);
    assert(Boolean(agent), `Agent "${agentId}" is defined in registry`);
    const isModelAllowed = agent?.allowedModels.includes('*') || agent?.allowedModels.includes('float-basic');
    assert(isModelAllowed, `Agent "${agentId}" can be configured with float-basic`);
  }

  // Ensure tool authorization boundaries remain strictly enforced
  const reviewerReadPerm = validateToolPermission('reviewer-agent', 'read_project_file');
  assert(reviewerReadPerm.allowed === true, 'Reviewer agent permitted to read_project_file');
  const reviewerWritePerm = validateToolPermission('reviewer-agent', 'propose_changes');
  assert(reviewerWritePerm.allowed === false, 'Reviewer agent DENIED propose_changes (read-only enforcement)');
  const reviewerDirectModPerm = validateToolPermission('reviewer-agent', 'create_file');
  assert(reviewerDirectModPerm.allowed === false, 'Reviewer agent DENIED create_file (direct modification prohibited)');

  const uiAgentSearchPerm = validateToolPermission('ui-agent', 'search_project');
  assert(uiAgentSearchPerm.allowed === true, 'UI agent permitted to search_project');
  const uiAgentProposePerm = validateToolPermission('ui-agent', 'propose_changes');
  assert(uiAgentProposePerm.allowed === true, 'UI agent permitted to propose_changes');
  const uiAgentDirectModPerm = validateToolPermission('ui-agent', 'delete_file');
  assert(uiAgentDirectModPerm.allowed === false, 'UI agent DENIED delete_file (must use propose_changes)');

  console.log('\n======================================================');
  console.log(`FLOAT BASIC TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

void runFloatBasicTests();
