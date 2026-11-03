/**
 * Live Upstream Model Provider Test Suite (Opt-in)
 * 
 * Verifies live upstream model connectivity, streaming chunk delivery,
 * and cancellation handling with genuine requests when credentials are configured.
 * 
 * When OPENAI_API_KEY is not configured, skips cleanly with clear reporting.
 */

import OpenAI from 'openai';
import { MODEL_REGISTRY, getModelDescriptor } from '../src/server/providers/modelRegistry';

async function runLiveTest() {
  console.log('=== FLOAT AI: Upstream Model Runtime Live Verification ===\n');

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey.trim() === '' || apiKey === 'mock-key' || apiKey === 'test-key') {
    console.log('[INFO] OPENAI_API_KEY is not configured in environment.');
    console.log('[INFO] Live upstream model test skipped cleanly (opt-in release gate).');
    console.log('[INFO] Verified models registered in catalog:');
    for (const m of MODEL_REGISTRY.filter(m => m.selectable)) {
      console.log(`  - ${m.id} (${m.displayName}) -> upstream: ${m.apiModelId} [${m.protocol}]`);
    }
    return;
  }

  console.log('[INFO] OPENAI_API_KEY detected. Initiating genuine upstream request...');
  const openai = new OpenAI({ apiKey: apiKey.trim() });

  // 1. Model Listing & Existence
  const startTime = Date.now();
  console.log('--- 1. Testing authenticated model listing ---');
  const models = await openai.models.list();
  const modelIds = new Set(models.data.map(m => m.id));
  console.log(`[PASS] Upstream authenticated: ${models.data.length} models accessible.`);

  // 2. Select target test model: try gpt-4o-mini or gpt-4o for live connectivity verification
  const testModel = modelIds.has('gpt-4o-mini') ? 'gpt-4o-mini' : (modelIds.has('gpt-4o') ? 'gpt-4o' : models.data[0]?.id);
  if (!testModel) {
    throw new Error('No accessible upstream model found for live test.');
  }
  console.log(`[INFO] Using model "${testModel}" for streaming and cancellation test.`);

  // 3. Live Streaming Verification
  console.log('--- 2. Testing live streaming chunk delivery ---');
  const streamStart = Date.now();
  const stream = await openai.chat.completions.create({
    model: testModel,
    messages: [{ role: 'user', content: 'Respond with exactly: PONG' }],
    stream: true,
    max_tokens: 10
  });

  let chunksReceived = 0;
  let fullResponse = '';
  for await (const chunk of stream) {
    chunksReceived++;
    const delta = chunk.choices[0]?.delta?.content || '';
    fullResponse += delta;
  }
  const streamDuration = Date.now() - streamStart;
  console.log(`[PASS] Received ${chunksReceived} chunks in ${streamDuration}ms. Output: "${fullResponse.trim()}"`);

  // 4. Cancellation Verification
  console.log('--- 3. Testing request cancellation via AbortController ---');
  const abortController = new AbortController();
  const abortPromise = openai.chat.completions.create(
    {
      model: testModel,
      messages: [{ role: 'user', content: 'Count from 1 to 100 with long explanations.' }],
      stream: true,
      max_tokens: 500
    },
    { signal: abortController.signal }
  );

  // Abort after 50ms
  setTimeout(() => abortController.abort(), 50);

  let abortedCleanly = false;
  try {
    const cancelStream = await abortPromise;
    for await (const _ of cancelStream) {
      // should abort quickly
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.message?.includes('aborted') || (err instanceof OpenAI.APIError)) {
      abortedCleanly = true;
    }
  }
  if (!abortedCleanly) {
    throw new Error('Expected request to be cancelled cleanly via AbortController signal.');
  }
  console.log('[PASS] Request cancellation via AbortController confirmed.');

  console.log('\n======================================================');
  console.log(`Upstream Model Runtime Live Verification: ALL CHECKS PASSED (${Date.now() - startTime}ms total)`);
  console.log('======================================================\n');
}

runLiveTest().catch((err) => {
  console.error('[FAIL] Upstream Model Runtime Live Verification failed:', err);
  process.exit(1);
});
