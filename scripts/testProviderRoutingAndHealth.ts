import { ModelRouter } from '../src/server/providers/router';
import { OpenAIAdapter, normalizeOpenAIError, CONFIGURED_HEALTH_CHECK_MODELS } from '../src/server/providers/openai';
import { AnthropicAdapter, normalizeAnthropicError } from '../src/server/providers/anthropic';
import { XAIAdapter, normalizeXAIError } from '../src/server/providers/xai';
import { GoogleGeminiAdapter, normalizeGeminiError, CONFIGURED_GEMINI_HEALTH_MODELS } from '../src/server/providers/gemini';
import { AIProviderError } from '../src/server/providers/base';
import { DASHBOARD_MODELS } from '../src/features/dashboard/dashboardModels';
import { VERIFIED_MODELS, MODEL_CONFIG, MODEL_PRICING_CONFIG, getAllCatalogModels } from '../src/data/verifiedModels';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, extraInfo?: any) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ ${testName}`, extraInfo ? extraInfo : '');
    failed++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('FLOAT PROVIDER ROUTING & HEALTH CHECK TEST SUITE (PHASE 2)');
  console.log('======================================================\n');

  const router = new ModelRouter();

  // Test 1: Provider Health Check Structure & Per-Model 1-Token Report
  console.log('--- Test Suite 1: Provider Health Check Structure & Per-Model Report ---');
  const healthResults = await router.checkAllProvidersHealth();
  assert(typeof healthResults === 'object' && healthResults !== null, 'Health results returned object');

  const pHealth = healthResults.openai;
  assert(pHealth !== undefined, 'Health contains active provider: openai');
  assert(typeof pHealth.provider === 'string', `openai has provider name string: ${pHealth?.provider}`);
  assert(typeof pHealth.configured === 'boolean', `openai has configured boolean: ${pHealth?.configured}`);
  assert(typeof pHealth.authenticated === 'boolean', `openai has authenticated boolean: ${pHealth?.authenticated}`);
  assert(typeof pHealth.modelAvailable === 'boolean', `openai has modelAvailable boolean: ${pHealth?.modelAvailable}`);
  assert(typeof pHealth.models === 'object' && pHealth.models !== null, 'openai health includes per-model report map');

  for (const modelId of CONFIGURED_HEALTH_CHECK_MODELS) {
    const entry = pHealth.models?.[modelId];
    assert(Boolean(entry), `Health check reports status for OpenAI model: ${modelId}`);
    assert(entry?.status === 'ok' || entry?.status === 'error', `Model ${modelId} status is ok or error (got: ${entry?.status})`);
  }

  const gHealth = healthResults.google;
  assert(gHealth !== undefined, 'Health contains active provider: google');
  assert(typeof gHealth.models === 'object' && gHealth.models !== null, 'google health includes per-model report map');
  for (const modelId of CONFIGURED_GEMINI_HEALTH_MODELS) {
    const entry = gHealth.models?.[modelId];
    assert(Boolean(entry), `Health check reports status for Gemini model: ${modelId}`);
    assert(entry?.status === 'ok' || entry?.status === 'error', `Model ${modelId} status is ok or error (got: ${entry?.status})`);
  }

  // Test 2: Model Registry & Single MODEL_CONFIG Verification
  console.log('\n--- Test Suite 2: Model Registry & Single MODEL_CONFIG ---');
  assert(Boolean(MODEL_CONFIG.effectiveDate), `MODEL_CONFIG has effectiveDate: ${MODEL_CONFIG.effectiveDate}`);
  assert(MODEL_PRICING_CONFIG === MODEL_CONFIG, 'MODEL_PRICING_CONFIG references single MODEL_CONFIG object');
  assert(MODEL_CONFIG.models['gemini-4-argon'].maxOutputTokens === 1000000, 'Gemini 4 Argon maxOutputTokens is 1M');
  assert(MODEL_CONFIG.models['gemini-4-argon'].inputCostPer1M === null, 'Gemini 4 Argon unknown inputCostPer1M is null');
  assert(MODEL_CONFIG.models['gemini-4-argon'].outputCostPer1M === null, 'Gemini 4 Argon unknown outputCostPer1M is null');
  assert(Boolean(MODEL_CONFIG.models['gemini-4-argon'].sourceUrl), 'Gemini 4 Argon has sourceUrl in MODEL_CONFIG');
  assert(MODEL_CONFIG.models['gpt-6-luna'].inputCostPer1M === 0.10, 'Luna input price is $0.10 per 1M tokens');
  assert(MODEL_CONFIG.models['gpt-6-luna'].outputCostPer1M === 0.50, 'Luna output price is $0.50 per 1M tokens');
  assert(MODEL_CONFIG.models['gpt-6-sol'].inputCostPer1M === 2.00, 'Sol input price is $2.00 per 1M tokens');
  assert(MODEL_CONFIG.models['gpt-6-sol'].outputCostPer1M === 10.00, 'Sol output price is $10.00 per 1M tokens');
  assert(MODEL_CONFIG.models['gpt-6.1-sol'] === undefined, 'gpt-6.1-sol is removed from MODEL_CONFIG');
  assert(MODEL_CONFIG.models['gpt-6-astra'].inputCostPer1M === null, 'Astra unknown input price is null');
  assert(MODEL_CONFIG.models['gpt-6-astra'].outputCostPer1M === null, 'Astra unknown output price is null');
  assert(MODEL_CONFIG.models['claude-sonnet-5-5'].inputCostPer1M === null, 'claude-sonnet-5-5 unknown input price is null');
  assert(MODEL_CONFIG.models['claude-opus-5-5'].inputCostPer1M === null, 'claude-opus-5-5 unknown input price is null');
  assert(MODEL_CONFIG.models['claude-haiku-5-5'].inputCostPer1M === null, 'claude-haiku-5-5 unknown input price is null');

  for (const m of getAllCatalogModels()) {
    assert(m.id === m.exactModelId, `Catalog model ${m.id} has id === exactModelId (${m.exactModelId}) with no alias`);
  }

  for (const m of DASHBOARD_MODELS) {
    assert(Boolean(m.displayName), `Dashboard model ${m.id} has displayName: "${m.displayName}"`);
    assert(Boolean(m.provider), `Dashboard model ${m.id} has provider: "${m.provider}"`);
    assert(Boolean(m.apiModelId), `Dashboard model ${m.id} has apiModelId: "${m.apiModelId}"`);
    assert(m.id === m.apiModelId, `Dashboard model ${m.id} id equals apiModelId`);
    assert(m.contextWindow > 0, `Dashboard model ${m.id} has verified contextWindow: ${m.contextWindow}`);
    assert(Boolean(m.capabilities), `Dashboard model ${m.id} has capabilities structure`);
    assert(m.supportsStreaming === true, `Dashboard model ${m.id} has supportsStreaming`);
    assert(m.supportsTools === true, `Dashboard model ${m.id} has supportsTools`);
  }

  // Test 3: ModelRouter Strict Routing (Gemini 4 Argon + Real GPT-6 IDs + Claude 5.5 IDs)
  console.log('\n--- Test Suite 3: ModelRouter Provider & Direct Model Resolution ---');
  const argonRoute = router.resolveRoute('gemini-4-argon');
  assert(argonRoute.route.provider === 'google', 'gemini-4-argon routes to Google provider');
  assert(argonRoute.route.apiModelId === 'gemini-4-argon', 'gemini-4-argon resolves directly to gemini-4-argon API ID');

  for (const gpt6Id of ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna']) {
    const r = router.resolveRoute(gpt6Id);
    assert(r.route.provider === 'openai', `${gpt6Id} routes to OpenAI provider`);
    assert(r.route.apiModelId === gpt6Id, `${gpt6Id} resolves directly to ${gpt6Id} API ID`);
    assert((r.route as any).isInternalAlias === undefined, `${gpt6Id} has no isInternalAlias property`);
    assert((r.route as any).upstreamModelId === undefined, `${gpt6Id} has no upstreamModelId: 'gpt-4o' mapping`);
  }

  let removedSolError: any = null;
  try {
    router.resolveRoute('gpt-6.1-sol');
  } catch (err) {
    removedSolError = err;
  }
  assert(removedSolError instanceof AIProviderError && removedSolError.code === 'MODEL_NOT_AVAILABLE', 'gpt-6.1-sol is rejected unless /api/ai/health proves it works');

  for (const claudeId of ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5']) {
    const cr = router.resolveRoute(claudeId);
    assert(cr.route.provider === 'anthropic', `${claudeId} routes to Anthropic provider`);
    assert(cr.route.apiModelId === claudeId, `${claudeId} resolves to exact API ID`);
  }

  const gptRoute = router.resolveRoute('gpt-4o');
  assert(gptRoute.route.provider === 'openai', 'gpt-4o routes to OpenAI provider');
  assert(gptRoute.route.apiModelId === 'gpt-4o', 'gpt-4o resolves to gpt-4o API ID');

  const miniRoute = router.resolveRoute('gpt-4o-mini');
  assert(miniRoute.route.provider === 'openai', 'gpt-4o-mini routes to OpenAI provider');
  assert(miniRoute.route.apiModelId === 'gpt-4o-mini', 'gpt-4o-mini resolves to gpt-4o-mini API ID');

  const claudeRoute = router.resolveRoute('claude-sonnet-5-5');
  assert(claudeRoute.route.provider === 'anthropic', 'claude-sonnet-5-5 routes to Anthropic provider');
  assert(claudeRoute.route.apiModelId === 'claude-sonnet-5-5', 'claude-sonnet-5-5 resolves to exact API ID');

  // Test 4: NO Silent Fallback & No Aliases (float-basic rejected)
  console.log('\n--- Test Suite 4: Prohibition of Silent Fallbacks, Aliases & DeepSeek Removal ---');
  let floatBasicError: any = null;
  try {
    router.resolveRoute('float-basic');
  } catch (err) {
    floatBasicError = err;
  }
  assert(floatBasicError instanceof AIProviderError, 'Removed alias float-basic throws AIProviderError');
  assert(floatBasicError?.code === 'MODEL_NOT_AVAILABLE', 'Removed alias float-basic error code is MODEL_NOT_AVAILABLE');
  assert(floatBasicError?.statusCode === 404, 'Removed alias float-basic status is 404');

  let unknownModelError: any = null;
  try {
    router.resolveRoute('non-existent-super-model-9000');
  } catch (err) {
    unknownModelError = err;
  }
  assert(unknownModelError instanceof AIProviderError, 'Unknown model throws AIProviderError');
  assert(unknownModelError?.code === 'MODEL_NOT_AVAILABLE', 'Unknown model error code is MODEL_NOT_AVAILABLE');
  assert(unknownModelError?.statusCode === 404, 'Unknown model status is 404');

  const deepseekInVerified = VERIFIED_MODELS.some((m) => m.id.includes('deepseek') || m.providerId === ('deepseek' as any));
  assert(!deepseekInVerified, 'Zero DeepSeek models exist in VERIFIED_MODELS');

  const providerStatus = router.getProviderStatus();
  assert(providerStatus.deepseek === undefined, 'DeepSeek provider does not exist in ModelRouter getProviderStatus()');

  let deepseekChatError: any = null;
  try {
    router.resolveRoute('deepseek-chat');
  } catch (err) {
    deepseekChatError = err;
  }
  assert(deepseekChatError instanceof AIProviderError, 'deepseek-chat throws AIProviderError');
  assert(deepseekChatError?.code === 'UNSUPPORTED_PROVIDER', 'deepseek-chat error code is UNSUPPORTED_PROVIDER');
  assert(deepseekChatError?.statusCode === 400, 'deepseek-chat status code is 400');

  // Test 5: Missing API Key Handling (Explicit NOT_CONFIGURED per provider)
  console.log('\n--- Test Suite 5: Missing API Key Behavior ---');
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  const originalCodexKey = process.env.CODEX_API_KEY;
  const originalEnvKey = process.env.OPENAI_ENVIRONMENT_KEY;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalXAIKey = process.env.XAI_API_KEY;

  delete process.env.OPENAI_API_KEY;
  delete process.env.CODEX_API_KEY;
  delete process.env.OPENAI_ENVIRONMENT_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.XAI_API_KEY;

  const freshRouter = new ModelRouter();

  let openAIMissingKeyError: any = null;
  try {
    await freshRouter.generateContent({ model: 'gpt-6-astra', messages: [{ role: 'user', content: 'test' }] });
  } catch (err) {
    openAIMissingKeyError = err;
  }
  assert(openAIMissingKeyError instanceof AIProviderError, 'Missing OpenAI key throws AIProviderError');
  assert(openAIMissingKeyError?.code === 'NOT_CONFIGURED', 'Missing OpenAI key has code NOT_CONFIGURED');
  assert(openAIMissingKeyError?.provider === 'OpenAI', 'Missing OpenAI key provider is OpenAI (never fell back to Google)');

  let geminiMissingKeyError: any = null;
  try {
    await freshRouter.generateContent({ model: 'gemini-4-argon', messages: [{ role: 'user', content: 'test' }] });
  } catch (err) {
    geminiMissingKeyError = err;
  }
  assert(geminiMissingKeyError instanceof AIProviderError, 'Missing Gemini key throws AIProviderError');
  assert(geminiMissingKeyError?.code === 'NOT_CONFIGURED', 'Missing Gemini key has code NOT_CONFIGURED');
  assert(geminiMissingKeyError?.provider === 'Google Gemini', 'Missing Gemini key provider is Google Gemini');

  let anthropicMissingKeyError: any = null;
  try {
    await freshRouter.generateContent({ model: 'claude-sonnet-4-20250514', messages: [{ role: 'user', content: 'test' }] });
  } catch (err) {
    anthropicMissingKeyError = err;
  }
  assert(anthropicMissingKeyError instanceof AIProviderError, 'Missing Anthropic key throws AIProviderError');
  assert(anthropicMissingKeyError?.code === 'NOT_CONFIGURED', 'Missing Anthropic key has code NOT_CONFIGURED');
  assert(anthropicMissingKeyError?.provider === 'Anthropic', 'Missing Anthropic key provider is Anthropic');

  // Test 6: Error Normalization & Status Code Mapping (401 / 429 / 5xx)
  console.log('\n--- Test Suite 6: Structured Error Normalization ---');
  const openaiAuthErr = normalizeOpenAIError({ status: 401, message: 'Incorrect API key provided' });
  assert(openaiAuthErr.code === 'AUTH_ERROR', 'OpenAI 401 normalizes to AUTH_ERROR');
  assert(openaiAuthErr.statusCode === 401, 'OpenAI 401 status code is 401');

  const openaiQuotaErr = normalizeOpenAIError({ status: 429, message: 'You exceeded your current quota' });
  assert(openaiQuotaErr.code === 'RATE_LIMITED', 'OpenAI quota 429 normalizes to RATE_LIMITED');

  const openaiModelErr = normalizeOpenAIError({ status: 404, message: 'The model gpt-6-astra does not exist' });
  assert((openaiModelErr.code as string) === 'MODEL_NOT_AVAILABLE', 'OpenAI 404 normalizes to MODEL_NOT_AVAILABLE');

  const anthropicAuthErr = normalizeAnthropicError({ status: 401, message: 'invalid_api_key' });
  assert(anthropicAuthErr.code === 'AUTH_ERROR', 'Anthropic 401 normalizes to AUTH_ERROR');

  const anthropicOverloadErr = normalizeAnthropicError({ status: 529, message: 'overloaded' });
  assert(anthropicOverloadErr.code === 'PROVIDER_ERROR', 'Anthropic 529 normalizes to PROVIDER_ERROR');

  const xaiAuthErr = normalizeXAIError({ status: 401, message: 'invalid_api_key' });
  assert(xaiAuthErr.code === 'AUTH_ERROR', 'xAI 401 normalizes to AUTH_ERROR');

  const geminiAuthErr = normalizeGeminiError({ status: 401, message: 'API_KEY_INVALID' });
  assert(geminiAuthErr.code === 'AUTH_ERROR', 'Gemini 401 normalizes to AUTH_ERROR');
  assert(geminiAuthErr.statusCode === 401, 'Gemini 401 statusCode is 401');

  const geminiRateErr = normalizeGeminiError({ status: 429, message: 'resource_exhausted' });
  assert(geminiRateErr.code === 'RATE_LIMITED', 'Gemini 429 normalizes to RATE_LIMITED');
  assert(geminiRateErr.statusCode === 429, 'Gemini 429 statusCode is 429');

  const gemini503Err = normalizeGeminiError({ status: 503, message: 'Service temporarily unavailable' });
  assert(gemini503Err.code === 'PROVIDER_ERROR', 'Gemini 503 normalizes to PROVIDER_ERROR');
  assert(gemini503Err.statusCode === 503, 'Gemini 503 statusCode is 503');

  // Restore any keys
  if (originalOpenAIKey) process.env.OPENAI_API_KEY = originalOpenAIKey;
  if (originalCodexKey) process.env.CODEX_API_KEY = originalCodexKey;
  if (originalEnvKey) process.env.OPENAI_ENVIRONMENT_KEY = originalEnvKey;
  if (originalGeminiKey) process.env.GEMINI_API_KEY = originalGeminiKey;
  if (originalAnthropicKey) process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
  if (originalXAIKey) process.env.XAI_API_KEY = originalXAIKey;

  // Test 7: Streaming AbortSignal Cancellation (OpenAI & Gemini 4 Argon)
  console.log('\n--- Test Suite 7: Streaming AbortSignal Cancellation ---');
  const liveRouter = new ModelRouter();
  const abortCtrl = new AbortController();
  let cancelledChunks = '';
  abortCtrl.abort();
  try {
    await liveRouter.generateContentStream(
      {
        model: 'gemini-4-argon',
        messages: [{ role: 'user', content: 'Write a long essay on programming' }]
      },
      (delta) => {
        cancelledChunks += delta;
      },
      abortCtrl.signal
    );
  } catch {
    // Aborted
  }
  assert(cancelledChunks.length === 0, 'Aborted Gemini 4 Argon streaming produced 0 chunks');

  // Test 8: Tool Calling Structure Verification (OpenAI, Gemini 4 Argon, Anthropic)
  console.log('\n--- Test Suite 8: Tool Calling Structure Support ---');
  const dummyTool = {
    name: 'calculate_sum',
    description: 'Calculate the sum of two numbers',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number' }
      },
      required: ['a', 'b']
    }
  };

  const geminiAdapter = new GoogleGeminiAdapter();
  assert(typeof geminiAdapter.formatTools === 'function', 'Gemini 4 Argon adapter implements formatTools');
  const formattedGeminiTools = geminiAdapter.formatTools([dummyTool]);
  assert(
    Array.isArray(formattedGeminiTools) && Array.isArray(formattedGeminiTools[0].functionDeclarations),
    'Gemini formatTools produces functionDeclarations structure'
  );
  assert(formattedGeminiTools?.[0].functionDeclarations[0].name === 'calculate_sum', 'Gemini formatTools retains tool name');

  const openaiAdapter = new OpenAIAdapter();
  assert(typeof (openaiAdapter as any).formatTools === 'function', 'OpenAI adapter implements formatTools');
  const formattedOpenAITools = (openaiAdapter as any).formatTools([dummyTool]);
  assert(Array.isArray(formattedOpenAITools) && formattedOpenAITools[0].type === 'function', 'OpenAI formatTools produces OpenAI function structure');
  assert(formattedOpenAITools[0].function.name === 'calculate_sum', 'OpenAI formatTools retains tool name');

  const anthropicAdapter = new AnthropicAdapter();
  assert(typeof (anthropicAdapter as any).formatTools === 'function', 'Anthropic adapter implements formatTools');
  const formattedAnthropicTools = (anthropicAdapter as any).formatTools([dummyTool]);
  assert(Array.isArray(formattedAnthropicTools) && formattedAnthropicTools[0].input_schema !== undefined, 'Anthropic formatTools produces input_schema structure');
  assert(formattedAnthropicTools[0].name === 'calculate_sum', 'Anthropic formatTools retains tool name');

  console.log('\n======================================================');
  console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
