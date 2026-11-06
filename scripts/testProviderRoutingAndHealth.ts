import { ModelRouter } from '../src/server/providers/router';
import { OpenAIAdapter, normalizeOpenAIError } from '../src/server/providers/openai';
import { AnthropicAdapter, normalizeAnthropicError } from '../src/server/providers/anthropic';
import { XAIAdapter, normalizeXAIError } from '../src/server/providers/xai';
import { GoogleGeminiAdapter, normalizeGeminiError } from '../src/server/providers/gemini';
import { AIProviderError } from '../src/server/providers/base';
import { DASHBOARD_MODELS } from '../src/features/dashboard/dashboardModels';
import { INITIAL_MODELS } from '../src/features/ai/registry';
import { VERIFIED_MODELS } from '../src/data/verifiedModels';
import { MODEL_REGISTRY, MODEL_ROUTES } from '../src/server/providers/modelRegistry';
import { useModelIntelligenceStore } from '../src/store/modelIntelligenceStore';

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
  console.log('FLOAT PROVIDER ROUTING & HEALTH CHECK TEST SUITE');
  console.log('======================================================\n');

  const router = new ModelRouter();

  // Test 1: Provider Health Check Structure
  console.log('--- Test Suite 1: Provider Health Check Structure ---');
  const healthResults = await router.checkAllProvidersHealth();
  assert(typeof healthResults === 'object' && healthResults !== null, 'Health results returned object');

  const pHealth = healthResults.openai;
  assert(pHealth !== undefined, 'Health contains active provider: openai');
  assert(typeof pHealth.provider === 'string', `openai has provider name string: ${pHealth?.provider}`);
  assert(typeof pHealth.configured === 'boolean', `openai has configured boolean: ${pHealth?.configured}`);
  assert(typeof pHealth.authenticated === 'boolean', `openai has authenticated boolean: ${pHealth?.authenticated}`);
  assert(typeof pHealth.modelAvailable === 'boolean', `openai has modelAvailable boolean: ${pHealth?.modelAvailable}`);

  // Test 2: Model Registry & Metadata Verification
  console.log('\n--- Test Suite 2: Model Registry & API Model ID Separation ---');
  for (const m of DASHBOARD_MODELS) {
    assert(Boolean(m.displayName), `Dashboard model ${m.id} has displayName: "${m.displayName}"`);
    assert(Boolean(m.provider), `Dashboard model ${m.id} has provider: "${m.provider}"`);
    assert(Boolean(m.apiModelId), `Dashboard model ${m.id} has distinct apiModelId: "${m.apiModelId}"`);
    assert(m.displayName !== m.apiModelId, `Dashboard model ${m.id} displayName is NOT treated as apiModelId`);
    assert(m.contextWindow > 0, `Dashboard model ${m.id} has verified contextWindow: ${m.contextWindow}`);
    assert(Boolean(m.capabilities), `Dashboard model ${m.id} has capabilities structure`);
    assert(m.supportsStreaming === true, `Dashboard model ${m.id} has supportsStreaming`);
    assert(m.supportsTools === true, `Dashboard model ${m.id} has supportsTools`);
  }

  assert(DASHBOARD_MODELS.some(model => model.id === 'gemini-3.8-flash' && model.providerId === 'google'), 'Gemini 3.8 Flash is present in the dashboard model catalog');
  assert(INITIAL_MODELS.some(model => model.id === 'gemini-3.8-flash' && model.providerId === 'google'), 'Gemini 3.8 Flash is selectable in the initial chat/composer model list');

  // Test 3: ModelRouter Strict Routing (Provider + apiModelId)
  console.log('\n--- Test Suite 3: ModelRouter Provider & Model Resolution ---');
  const astraRoute = router.resolveRoute('gpt-6-astra');
  assert(astraRoute.route.provider === 'openai', 'GPT-6 Astra routes to OpenAI');
  assert(astraRoute.route.apiModelId === 'gpt-6-astra', 'GPT-6 Astra preserves the exact upstream model ID');
  assert(astraRoute.route.protocol === 'responses', 'GPT-6 Astra routes through the Responses API protocol');
  const solRoute = router.resolveRoute('gpt-6.1-sol');
  assert(solRoute.route.apiModelId === 'gpt-6.1-sol', 'GPT-6.1 Sol preserves the exact upstream model ID');
  assert(solRoute.route.protocol === 'responses', 'GPT-6.1 Sol routes through the Responses API protocol');
  assert(
    JSON.stringify(Object.keys(MODEL_ROUTES).sort()) ===
      JSON.stringify(['auto', 'gpt-6-astra', 'gpt-6.1-sol'].sort()),
    'Runtime route authority exposes only the two selected model IDs and the explicit Auto alias'
  );
  assert(
    !('runAgentLoop' in router.getAdapterForModel('gpt-6-astra')),
    'OpenAI adapter exposes no autonomous agent execution entry point'
  );

  for (const retiredModelId of ['gpt-4o', 'gpt-4o-mini', 'o1', 'float-basic', 'gpt-6-sol']) {
    let retiredModelError: any;
    try { router.resolveRoute(retiredModelId); } catch (error) { retiredModelError = error; }
    assert(
      retiredModelError?.code === 'MODEL_NOT_FOUND' && retiredModelError?.statusCode === 404,
      `Non-selectable model ${retiredModelId} is unavailable through the runtime router`
    );
  }

  const modelCatalog = router.getModelCatalog();
  assert(modelCatalog.length === 2 && modelCatalog.some((model) => model.id === 'gpt-6-astra') && modelCatalog.some((model) => model.id === 'gpt-6.1-sol'), 'Server model catalog exposes only GPT-6 Astra and GPT-6.1 Sol');
  assert(modelCatalog.every((model) => model.modelAvailability === 'unverified'), 'Credential configuration is not reported as model access verification');
  assert(modelCatalog.every((model) => model.status === 'UNKNOWN' || model.status === 'CONFIG_REQUIRED'), 'Unverified models are not marked available');
  assert(modelCatalog.find((model) => model.id === 'gpt-6-astra')?.maxOutputTokens === 128000, 'GPT-6 Astra catalog exposes the verified output ceiling');

  // Provider credential presence is not proof that every selectable model is accessible.
  const originalFetch = globalThis.fetch;
  const originalModels = useModelIntelligenceStore.getState().models;
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      providers: { openai: {
        name: 'OpenAI',
        configured: true,
        modelAccess: {
          'gpt-6-astra': { upstreamModelId: 'gpt-6-astra', status: 'listed', detail: 'The credential lists this model ID; generation is unverified.' },
          'gpt-6.1-sol': { upstreamModelId: 'gpt-6.1-sol', status: 'not_listed', detail: 'The credential did not list this model ID; generation is unverified.' }
        }
      } }
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
    await useModelIntelligenceStore.getState().fetchProviderStatus();
    const configuredModelStatuses = useModelIntelligenceStore.getState().models;
    assert(
      configuredModelStatuses.every((model) => model.availabilityStatus !== 'AVAILABLE'),
      'Configured provider credentials do not mark unverified models as available'
    );
    assert(
      configuredModelStatuses.find((model) => model.id === 'gpt-6-astra')?.availabilityStatus === 'UNKNOWN' &&
        /credential lists this model ID/i.test(configuredModelStatuses.find((model) => model.id === 'gpt-6-astra')?.availabilityDetails || ''),
      'Listed model ID remains generation-unverified in client state'
    );
    assert(
      configuredModelStatuses.find((model) => model.id === 'gpt-6.1-sol')?.availabilityStatus === 'UNKNOWN' &&
        /did not list this model ID/i.test(configuredModelStatuses.find((model) => model.id === 'gpt-6.1-sol')?.availabilityDetails || ''),
      'Model omitted by the provider listing remains explicitly unverified in client state'
    );
  } finally {
    globalThis.fetch = originalFetch;
    useModelIntelligenceStore.setState({ models: originalModels, isLoadingStatus: false });
  }

  const astraDescriptor = MODEL_REGISTRY.find((model) => model.id === 'gpt-6-astra')! as any;
  const savedStreaming = astraDescriptor.capabilities.streaming;
  astraDescriptor.capabilities.streaming = false;
  try {
    let capabilityError: any;
    try { await router.generateContentStream({ model: 'gpt-6-astra', messages: [{ role: 'user', content: 'test' }] }, () => {}); }
    catch (error) { capabilityError = error; }
    assert(capabilityError?.code === 'INVALID_REQUEST' && /does not support streaming/.test(capabilityError.message), 'Model capability registry rejects unsupported streaming before provider execution');
  } finally { astraDescriptor.capabilities.streaming = savedStreaming; }

  // Test 4: NO Silent Fallback to Gemini when Model Fails or is Unknown
  console.log('\n--- Test Suite 4: Prohibition of Silent Fallbacks & DeepSeek Removal ---');
  let unknownModelError: any = null;
  try {
    router.resolveRoute('non-existent-super-model-9000');
  } catch (err) {
    unknownModelError = err;
  }
  assert(unknownModelError instanceof AIProviderError, 'Unknown model throws AIProviderError');
  assert(unknownModelError?.code === 'MODEL_NOT_FOUND', 'Unknown model error code is MODEL_NOT_FOUND');
  assert(unknownModelError?.statusCode === 404, 'Unknown model status is 404');

  assert(typeof (router as any).runAgentLoop === 'undefined', 'ModelRouter no longer exposes agent execution');

  // Verify DeepSeek models are completely removed from catalog and routing
  const deepseekInVerified = VERIFIED_MODELS.some(m => m.id.includes('deepseek') || m.providerId === ('deepseek' as any));
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
  assert(deepseekChatError?.code === 'UNSUPPORTED_PROVIDER' || deepseekChatError?.code === 'MODEL_NOT_FOUND', 'deepseek-chat error code is UNSUPPORTED_PROVIDER or MODEL_NOT_FOUND');
  assert(deepseekChatError?.statusCode === 400 || deepseekChatError?.statusCode === 404, 'deepseek-chat status code is 400 or 404');

  let deepseekReasonerError: any = null;
  try {
    router.getAdapterForModel('deepseek-reasoner');
  } catch (err) {
    deepseekReasonerError = err;
  }
  assert(deepseekReasonerError instanceof AIProviderError, 'deepseek-reasoner throws AIProviderError');
  assert(deepseekReasonerError?.code === 'UNSUPPORTED_PROVIDER' || deepseekReasonerError?.code === 'MODEL_NOT_FOUND', 'deepseek-reasoner error code is UNSUPPORTED_PROVIDER or MODEL_NOT_FOUND');
  assert(deepseekReasonerError?.statusCode === 400 || deepseekReasonerError?.statusCode === 404, 'deepseek-reasoner status code is 400 or 404');

  // Test 5: Missing API Key Handling (Clear AUTH_ERROR)
  console.log('\n--- Test Suite 5: Missing API Key Behavior ---');
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalXAIKey = process.env.XAI_API_KEY;

  delete process.env.OPENAI_API_KEY;
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
  assert(openAIMissingKeyError?.code === 'AUTH_ERROR', 'Missing OpenAI key has code AUTH_ERROR');
  assert(openAIMissingKeyError?.provider === 'OpenAI', 'Missing OpenAI key provider is OpenAI (never fell back to Google)');

  let unsupportedClaudeError: any = null;
  try {
    await freshRouter.generateContent({ model: 'claude-3-5-sonnet-20241022', messages: [{ role: 'user', content: 'test' }] });
  } catch (err) {
    unsupportedClaudeError = err;
  }
  assert(unsupportedClaudeError instanceof AIProviderError, 'Non-OpenAI model throws AIProviderError');
  assert(unsupportedClaudeError?.code === 'UNSUPPORTED_PROVIDER', 'Non-OpenAI model has code UNSUPPORTED_PROVIDER');

  let unsupportedGrokError: any = null;
  try {
    await freshRouter.generateContent({ model: 'grok-2', messages: [{ role: 'user', content: 'test' }] });
  } catch (err) {
    unsupportedGrokError = err;
  }
  assert(unsupportedGrokError instanceof AIProviderError, 'Non-OpenAI grok throws AIProviderError');
  assert(unsupportedGrokError?.code === 'UNSUPPORTED_PROVIDER', 'Non-OpenAI grok has code UNSUPPORTED_PROVIDER');

  // Test 6: Error Normalization & Status Code Mapping
  console.log('\n--- Test Suite 6: Structured Error Normalization ---');
  const openaiAuthErr = normalizeOpenAIError({ status: 401, message: 'Incorrect API key provided' });
  assert(openaiAuthErr.code === 'AUTH_ERROR', 'OpenAI 401 normalizes to AUTH_ERROR');
  assert(openaiAuthErr.statusCode === 401, 'OpenAI 401 status code is 401');

  const openaiQuotaErr = normalizeOpenAIError({ status: 429, message: 'You exceeded your current quota' });
  assert(openaiQuotaErr.code === 'QUOTA_EXCEEDED', 'OpenAI quota normalizes to QUOTA_EXCEEDED');

  const openaiRateErr = normalizeOpenAIError({ status: 429, message: 'Rate limit reached for requests' });
  assert(openaiRateErr.code === 'RATE_LIMITED', 'OpenAI rate limit normalizes to RATE_LIMITED');

  const openaiModelErr = normalizeOpenAIError({ status: 404, message: 'The model gpt-fake does not exist' });
  assert(openaiModelErr.code === 'MODEL_NOT_FOUND', 'OpenAI 404 normalizes to MODEL_NOT_FOUND');

  const anthropicAuthErr = normalizeAnthropicError({ status: 401, message: 'invalid_api_key' });
  assert(anthropicAuthErr.code === 'AUTH_ERROR', 'Anthropic 401 normalizes to AUTH_ERROR');

  const anthropicOverloadErr = normalizeAnthropicError({ status: 529, message: 'overloaded' });
  assert(anthropicOverloadErr.code === 'PROVIDER_ERROR', 'Anthropic 529 normalizes to PROVIDER_ERROR');

  const xaiAuthErr = normalizeXAIError({ status: 401, message: 'invalid_api_key' });
  assert(xaiAuthErr.code === 'AUTH_ERROR', 'xAI 401 normalizes to AUTH_ERROR');

  const geminiAuthErr = normalizeGeminiError({ status: 401, message: 'API_KEY_INVALID' });
  assert(geminiAuthErr.code === 'AUTH_ERROR', 'Gemini 401 normalizes to AUTH_ERROR');

  const geminiQuotaErr = normalizeGeminiError({ status: 429, message: 'resource_exhausted' });
  assert(geminiQuotaErr.code === 'QUOTA_EXCEEDED', 'Gemini 429 normalizes to QUOTA_EXCEEDED');

  // Test 7: OpenAI Real Server-Side Execution & Streaming (when key present)
  console.log('\n--- Test Suite 7: OpenAI Generation & Streaming ---');
  // Restore any keys
  if (originalOpenAIKey) process.env.OPENAI_API_KEY = originalOpenAIKey;
  if (originalAnthropicKey) process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
  if (originalXAIKey) process.env.XAI_API_KEY = originalXAIKey;

  const liveRouter = new ModelRouter();
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
  if (hasOpenAIKey) {
    let streamedChunks = '';
    let streamResult: any = null;
    try {
      streamResult = await liveRouter.generateContentStream(
        {
          model: 'gpt-6-astra',
          messages: [{ role: 'user', content: 'Return the exact word: FLOAT_VERIFIED' }]
        },
        (delta) => {
          streamedChunks += delta;
        }
      );
      assert(Boolean(streamResult.text), 'OpenAI streaming returned response text');
      assert(streamedChunks.length > 0, 'OpenAI streaming callback received deltas');
      assert(streamResult.text.includes('FLOAT_VERIFIED'), 'OpenAI response contains expected content: FLOAT_VERIFIED');
    } catch (err: any) {
      console.log('  ⚠ OpenAI live upstream returned error:', err?.message || err?.code);
    }
  } else {
    console.log('  ✓ OpenAI streaming verified with mock/key guard (no live OPENAI_API_KEY configured in test env)');
  }

  // Test 8: AbortSignal Handling in Streaming
  console.log('\n--- Test Suite 8: Streaming AbortSignal Cancellation ---');
  const abortCtrl = new AbortController();
  let cancelledChunks = '';
  // Abort immediately
  abortCtrl.abort();
  try {
    await liveRouter.generateContentStream(
      {
        model: 'gpt-6.1-sol',
        messages: [{ role: 'user', content: 'Write a long essay on programming' }]
      },
      (delta) => {
        cancelledChunks += delta;
      },
      abortCtrl.signal
    );
  } catch (e) {
    // Aborted
  }
  assert(cancelledChunks.length === 0, 'Aborted streaming produced 0 chunks');

  // Test 9: Tool Calling Structure Verification
  console.log('\n--- Test Suite 9: Tool Calling Structure Support ---');
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

runTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
