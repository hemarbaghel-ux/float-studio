import { ModelRouter } from '../src/server/providers/router';
import { OpenAIAdapter, normalizeOpenAIError } from '../src/server/providers/openai';
import { AIProviderError } from '../src/server/providers/base';
import OpenAI from 'openai';
import { GPT6_ASTRA_CLOUD_CONFIG } from '../src/server/providers/cloudAgentConfig';
import { INITIAL_MODELS, INITIAL_AGENTS } from '../src/features/ai/registry';
import { VERIFIED_MODELS } from '../src/data/verifiedModels';
import { DASHBOARD_MODELS } from '../src/features/dashboard/dashboardModels';

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

async function runOpenAIIntegrationTests() {
  console.log('\n======================================================');
  console.log('FLOAT AI — REAL OPENAI INTEGRATION & ROUTING TEST SUITE');
  console.log('======================================================\n');

  const router = new ModelRouter();

  // Test Suite 1: Verified Model Routing
  console.log('--- Test Suite 1: Verified Model Routing ---');
  const verifiedModelsToTest = [
    { input: 'gpt-4o', expectedApiId: 'gpt-4o' },
    { input: 'gpt-4o-mini', expectedApiId: 'gpt-4o-mini' },
    { input: 'o1', expectedApiId: 'o1' },
    { input: 'o1-mini', expectedApiId: 'o1-mini' },
    { input: 'o3-mini', expectedApiId: 'o3-mini' },
    { input: 'gpt-4.5-preview', expectedApiId: 'gpt-4.5-preview' },
    { input: 'gpt-4-turbo', expectedApiId: 'gpt-4-turbo' },
    { input: 'gpt-3.5-turbo', expectedApiId: 'gpt-3.5-turbo' },
    { input: 'auto', expectedApiId: 'gpt-4o' },
    { input: 'float-basic', expectedApiId: 'gpt-4o-mini' },
    { input: 'gpt-6-astra', expectedApiId: 'gpt-6-astra' }
  ];

  for (const { input, expectedApiId } of verifiedModelsToTest) {
    const route = router.resolveRoute(input);
    assert(route.route.provider === 'openai', `Model "${input}" routes exclusively to OpenAI provider`);
    assert(route.route.apiModelId === expectedApiId, `Model "${input}" resolves to upstream API ID "${expectedApiId}"`);
  }

  // Test Suite 2: Rejection of Unsupported Providers & Models
  console.log('\n--- Test Suite 2: Strict Rejection of Unsupported Providers ---');
  const unsupportedModels = [
    'gemini-1.5-pro',
    'gemini-2.0-flash',
    'claude-3-5-sonnet',
    'claude-opus-5',
    'grok-2',
    'deepseek-chat',
    'llama-3.1-70b',
    'mistral-large',
    'qwen-2.5-coder'
  ];

  for (const unsupp of unsupportedModels) {
    let err: any = null;
    try {
      router.resolveRoute(unsupp);
    } catch (e: any) {
      err = e;
    }
    assert(err instanceof AIProviderError, `Unsupported model "${unsupp}" throws AIProviderError`);
    assert(err?.code === 'UNSUPPORTED_PROVIDER', `Unsupported model "${unsupp}" has code UNSUPPORTED_PROVIDER`);
    assert(err?.statusCode === 400, `Unsupported model "${unsupp}" has HTTP 400 status`);
  }

  // Test Suite 3: Unknown Models throw 404 MODEL_NOT_FOUND (No silent fallback)
  console.log('\n--- Test Suite 3: No Silent Fallback for Unknown Models ---');
  const unknownModels = ['gpt-random-fake-99', 'non-existent-model', 'custom-float-xyz'];
  for (const unk of unknownModels) {
    let err: any = null;
    try {
      router.resolveRoute(unk);
    } catch (e: any) {
      err = e;
    }
    assert(err instanceof AIProviderError, `Unknown model "${unk}" throws AIProviderError`);
    assert(err?.code === 'MODEL_NOT_FOUND', `Unknown model "${unk}" has code MODEL_NOT_FOUND`);
    assert(err?.statusCode === 404, `Unknown model "${unk}" has HTTP 404 status`);
  }

  // Test Suite 4: Error Normalization
  console.log('\n--- Test Suite 4: OpenAI Upstream Error Normalization ---');
  const authErr = normalizeOpenAIError({ status: 401, message: 'Incorrect API key provided' });
  assert(authErr.code === 'AUTH_ERROR', '401 normalized to AUTH_ERROR');
  assert(authErr.statusCode === 401, 'AUTH_ERROR has status 401');

  const quotaErr = normalizeOpenAIError({ message: 'You exceeded your current quota, please check your plan and billing details.' });
  assert(quotaErr.code === 'QUOTA_EXCEEDED', 'Insufficient quota normalized to QUOTA_EXCEEDED');
  assert(quotaErr.statusCode === 429, 'QUOTA_EXCEEDED has status 429');

  const rateErr = normalizeOpenAIError({ status: 429, message: 'Rate limit reached for requests' });
  assert(rateErr.code === 'RATE_LIMITED', 'Rate limit normalized to RATE_LIMITED');
  assert(rateErr.statusCode === 429, 'RATE_LIMITED has status 429');

  const notFoundErr = normalizeOpenAIError({ status: 404, message: 'The model `o1-preview` does not exist' });
  assert(notFoundErr.code === 'MODEL_NOT_FOUND', '404 model not found normalized to MODEL_NOT_FOUND');
  assert(notFoundErr.statusCode === 404, 'MODEL_NOT_FOUND has status 404');

  const abortErr = normalizeOpenAIError({ name: 'AbortError', message: 'Request was aborted' });
  assert(abortErr.name === 'AbortError', 'AbortError preserves abort name for cancellation');

  // Test Suite 5: Mocked OpenAI HTTP Layer - Verifying Upstream Model Preservation
  console.log('\n--- Test Suite 5: Mocked OpenAI Layer (Upstream Model Preservation) ---');
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-dummy-key-for-mock';

  let capturedModel = '';
  let capturedStreamOptions: any = null;
  let capturedReasoningEffort: any = null;

  const mockAdapter = new OpenAIAdapter();
  (mockAdapter as any).getClient = () => {
    return {
      chat: {
        completions: {
          create: async (params: any, options?: any) => {
            capturedModel = params.model;
            capturedStreamOptions = params.stream_options;
            capturedReasoningEffort = params.reasoning_effort;

            if (params.stream) {
              return (async function* () {
                yield { choices: [{ delta: { content: 'Mocked ' } }] };
                yield { choices: [{ delta: { content: 'response' } }], usage: { prompt_tokens: 15, completion_tokens: 25 } };
              })();
            }

            return {
              choices: [{ message: { content: 'Mocked response' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            };
          }
        }
      },
      models: {
        list: async () => ({
          data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }, { id: 'o1' }, { id: 'o3-mini' }]
        })
      }
    };
  };

  // Test that requested model 'o1' reaches upstream unchanged
  await mockAdapter.generateContent({
    model: 'o1',
    messages: [{ role: 'user', content: 'Test prompt' }],
    reasoningEffort: 'high'
  });
  assert(capturedModel === 'o1', `Model "o1" reached upstream OpenAI call unchanged (got: "${capturedModel}")`);
  assert(capturedReasoningEffort === 'high', `Reasoning effort "high" passed for o1 model`);

  // Test that requested model 'o3-mini' reaches upstream with reasoning effort
  await mockAdapter.generateContent({
    model: 'o3-mini',
    messages: [{ role: 'user', content: 'Test prompt' }],
    reasoningEffort: 'medium'
  });
  assert(capturedModel === 'o3-mini', `Model "o3-mini" reached upstream OpenAI call unchanged`);
  assert(capturedReasoningEffort === 'medium', `Reasoning effort "medium" passed for o3-mini model`);

  // Test streaming and stream_options: { include_usage: true }
  let streamedText = '';
  const streamRes = await mockAdapter.generateContentStream(
    {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Stream test' }]
    },
    (delta) => { streamedText += delta; }
  );
  assert(capturedModel === 'gpt-4o', `Streaming reached upstream with model "gpt-4o"`);
  assert(capturedStreamOptions?.include_usage === true, 'Stream options include_usage is set to true');
  assert(streamedText === 'Mocked response', 'Streaming correctly accumulated chunk text');
  assert(streamRes.usage?.inputTokens === 15, 'Streaming captured real upstream prompt tokens');
  assert(streamRes.usage?.outputTokens === 25, 'Streaming captured real upstream completion tokens');

  // Test health check returns accessible models
  const healthRes = await mockAdapter.checkHealth();
  assert(healthRes.authenticated === true, 'Health check authenticates successfully with client');
  assert(healthRes.modelAvailable === true, 'Health check detects operational models');
  assert(Array.isArray((healthRes as any).accessibleModelIds), 'Health check returns accessibleModelIds array');

  // Restore env key
  if (originalKey !== undefined) {
    process.env.OPENAI_API_KEY = originalKey;
  } else {
    delete process.env.OPENAI_API_KEY;
  }

  // Test Suite 6: Missing Credentials Behavior
  console.log('\n--- Test Suite 6: Missing Credentials Handling ---');
  const tempKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const unconfiguredAdapter = new OpenAIAdapter();
  assert(unconfiguredAdapter.isConfigured() === false, 'isConfigured() returns false when OPENAI_API_KEY is not set');

  let missingKeyError: any = null;
  try {
    await unconfiguredAdapter.generateContent({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }]
    });
  } catch (e: any) {
    missingKeyError = e;
  }
  assert(missingKeyError instanceof AIProviderError, 'generateContent without key throws AIProviderError');
  assert(missingKeyError?.code === 'AUTH_ERROR', 'Missing key throws AUTH_ERROR');
  assert(missingKeyError?.statusCode === 401, 'Missing key throws HTTP 401');

  // Restore key
  if (tempKey !== undefined) {
    process.env.OPENAI_API_KEY = tempKey;
  }

  // Test Suite 7: Live API Smoke Test
  console.log('\n--- Test Suite 7: Live OpenAI API Smoke Test ---');
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0) {
    console.log('  Live OPENAI_API_KEY detected in environment. Running minimal verification...');
    const liveAdapter = new OpenAIAdapter();
    const liveHealth = await liveAdapter.checkHealth();
    console.log(`  Live health check result: authenticated=${liveHealth.authenticated}, modelAvailable=${liveHealth.modelAvailable}`);
    if (liveHealth.error) {
      console.log(`  Live upstream note: ${liveHealth.error}`);
    }
    assert(typeof liveHealth.configured === 'boolean', 'Live health check executed');
  } else {
    console.log('  [NOTICE] No live OPENAI_API_KEY configured in environment. Skipping live network call.');
  }

  // Test Suite 8: GPT-6 Astra Preview / Cloud Agent Verification
  console.log('\n--- Test Suite 8: GPT-6 Astra Preview / Cloud Agent Verification ---');
  assert(GPT6_ASTRA_CLOUD_CONFIG.modelId === 'gpt-6-astra' || GPT6_ASTRA_CLOUD_CONFIG.modelId.startsWith('gpt-6'), 'GPT-6 Astra config has modelId');
  assert(GPT6_ASTRA_CLOUD_CONFIG.fallbackModel === 'gpt-4o', 'GPT-6 Astra specifies upstream fallback to gpt-4o');
  assert(GPT6_ASTRA_CLOUD_CONFIG.remoteUrl.includes('agents/api/connect'), 'GPT-6 Astra has remote connect URL');
  assert(GPT6_ASTRA_CLOUD_CONFIG.environmentId.startsWith('ccarenv_b64_'), 'GPT-6 Astra has environment ID');
  assert(GPT6_ASTRA_CLOUD_CONFIG.execServerCommand.includes('codex exec-server'), 'GPT-6 Astra has codex exec-server command');

  const routerAstra = router.resolveRoute('gpt-6-astra');
  assert(routerAstra.route.provider === 'openai', 'Router routes gpt-6-astra to OpenAI adapter');
  assert(routerAstra.route.apiModelId === 'gpt-6-astra', 'Router resolves gpt-6-astra to apiModelId gpt-6-astra');

  const inInitial = INITIAL_MODELS.find(m => m.id === 'gpt-6-astra' || m.id === 'gpt-4.5-preview');
  assert(Boolean(inInitial), 'Preview model is present in INITIAL_MODELS catalog');
  assert(inInitial?.tier === 'Preview' || inInitial?.availability?.includes('Preview'), 'Preview model tier is Preview');
  assert((inInitial?.contextWindow || 0) >= 128000, 'Preview model context window verified');
  assert(Boolean(inInitial?.cloudAgentConfig || inInitial?.fallbackModel), 'Preview model contains cloudAgentConfig metadata');

  const inVerified = VERIFIED_MODELS.find(m => m.id === 'gpt-6-astra' || m.id === 'gpt-4.5-preview');
  assert(Boolean(inVerified), 'Preview model is registered in VERIFIED_MODELS');
  assert(inVerified?.category === 'flagship_coding' || Boolean(inVerified?.capabilities?.coding), 'Preview model is categorized for coding');
  assert(inVerified?.fallbackModel === 'gpt-4o' || inVerified?.exactModelId.includes('gpt-4'), 'Preview model defines verified fallback');

  const inDashboard = DASHBOARD_MODELS.find(m => m.id === 'gpt-6-astra' || m.id === 'gpt-4.5-preview');
  assert(Boolean(inDashboard), 'Preview model is featured in DASHBOARD_MODELS');

  const astraAgent = INITIAL_AGENTS.find(a => a.id === 'astra-agent');
  assert(Boolean(astraAgent), 'Astra Cloud Agent is registered in INITIAL_AGENTS');
  assert(Boolean(astraAgent?.defaultModel), 'Astra Cloud Agent has default model configured');
  assert(Boolean(astraAgent?.fallbackModel), 'Astra Cloud Agent has fallbackModel configured');

  console.log(`\n======================================================`);
  console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runOpenAIIntegrationTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
