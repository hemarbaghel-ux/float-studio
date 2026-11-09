/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert';
import { modelRouter } from '../src/server/providers/router';
import { normalizeOpenAIError } from '../src/server/providers/openai';
import { normalizeGeminiError } from '../src/server/providers/gemini';
import { ConversationSearchService } from '../src/server/conversation/conversationSearch';
import { AIMessage } from '../src/types';

console.log('======================================================================');
console.log('FLOAT STUDIO — PHASE 3 AI CHAT & MODEL GATEWAY VERIFICATION SUITE');
console.log('======================================================================\n');

let passedCount = 0;

function check(title: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(() => {
          console.log(`  ✓ [PASS] ${title}`);
          passedCount++;
        })
        .catch((err) => {
          console.error(`  ✗ [FAIL] ${title}`);
          console.error(`    ${err?.message || err}`);
          process.exit(1);
        });
    }
    console.log(`  ✓ [PASS] ${title}`);
    passedCount++;
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${title}`);
    console.error(`    ${err?.message || err}`);
    process.exit(1);
  }
}

async function runAllTests() {
  // -------------------------------------------------------------------------
  // 1. Upstream Model ID Mapping & Protocol Conformance
  // -------------------------------------------------------------------------
  console.log('--- 1. Upstream Model Selection & Protocol Conformance ---');

  check('Canonical model selection maps to exact upstream model IDs', () => {
    const solRoute = modelRouter.resolveRoute('gpt-6.1-sol');
    assert.strictEqual(solRoute.route.provider, 'openai');
    assert.strictEqual(solRoute.route.apiModelId, 'gpt-6.1-sol');

    const geminiRoute = modelRouter.resolveRoute('gemini-3.8-flash');
    assert.strictEqual(geminiRoute.route.provider, 'google');
    assert.strictEqual(geminiRoute.route.apiModelId, 'gemini-3.8-flash');

    const autoRoute = modelRouter.resolveRoute('auto');
    assert.strictEqual(autoRoute.route.provider, 'openai');
    assert.strictEqual(autoRoute.route.apiModelId, 'gpt-6-astra');
  });

  check('Rejects unsupported providers and retired models without silent fallbacks', () => {
    assert.throws(
      () => modelRouter.resolveRoute('claude-3-5-sonnet'),
      /unsupported provider/i
    );
    assert.throws(
      () => modelRouter.resolveRoute('deepseek-r1'),
      /unsupported provider/i
    );
    assert.throws(
      () => modelRouter.resolveRoute('unrecognized-random-model'),
      /not recognized/i
    );
  });

  // -------------------------------------------------------------------------
  // 2. IModelGateway Implementation Conformance
  // -------------------------------------------------------------------------
  console.log('\n--- 2. IModelGateway Implementation Conformance ---');

  check('ModelRouter implements IModelGateway methods', () => {
    assert.strictEqual(typeof modelRouter.generate, 'function');
    assert.strictEqual(typeof modelRouter.generateStream, 'function');
    assert.strictEqual(typeof modelRouter.checkHealth, 'function');
    assert.strictEqual(typeof modelRouter.getCatalog, 'function');

    const catalog = modelRouter.getCatalog();
    assert.ok(catalog.getAllModels().length >= 3);
  });

  check('checkHealth returns typed operational status for known and unknown providers', async () => {
    const openaiHealth = await modelRouter.checkHealth('openai');
    assert.strictEqual(openaiHealth.providerId, 'openai');
    assert.strictEqual(typeof openaiHealth.operational, 'boolean');

    const unknownHealth = await modelRouter.checkHealth('non_existent_provider');
    assert.strictEqual(unknownHealth.operational, false);
    assert.match(unknownHealth.error || '', /not registered/i);
  });

  // -------------------------------------------------------------------------
  // 3. Error Normalization Across Providers
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Error Normalization Across Providers ---');

  check('OpenAI errors normalize into standard AIProviderError categories', () => {
    const authErr = normalizeOpenAIError({ status: 401, message: 'Incorrect API key provided' });
    assert.strictEqual(authErr.code, 'AUTH_ERROR');
    assert.strictEqual(authErr.statusCode, 401);

    const quotaErr = normalizeOpenAIError({ message: 'You exceeded your current quota' });
    assert.strictEqual(quotaErr.code, 'QUOTA_EXCEEDED');
    assert.strictEqual(quotaErr.statusCode, 429);

    const rateLimitErr = normalizeOpenAIError({ status: 429, message: 'Rate limit reached' });
    assert.strictEqual(rateLimitErr.code, 'RATE_LIMITED');
    assert.strictEqual(rateLimitErr.statusCode, 429);

    const modelNotFoundErr = normalizeOpenAIError({ status: 404, message: 'The model does not exist' });
    assert.strictEqual(modelNotFoundErr.code, 'MODEL_NOT_FOUND');
    assert.strictEqual(modelNotFoundErr.statusCode, 404);

    const abortErr = normalizeOpenAIError({ name: 'AbortError', message: 'The operation was aborted' });
    assert.strictEqual(abortErr.statusCode, 499);
  });

  check('Google Gemini errors normalize into standard AIProviderError categories', () => {
    const authErr = normalizeGeminiError({ status: 401, message: 'API_KEY_INVALID' });
    assert.strictEqual(authErr.code, 'AUTH_ERROR');
    assert.strictEqual(authErr.statusCode, 401);

    const quotaErr = normalizeGeminiError({ status: 429, message: 'Resource has been exhausted (e.g. check quota)' });
    assert.strictEqual(quotaErr.code, 'QUOTA_EXCEEDED');
    assert.strictEqual(quotaErr.statusCode, 429);

    const notFoundErr = normalizeGeminiError({ status: 404, message: 'models/unknown is not found' });
    assert.strictEqual(notFoundErr.code, 'MODEL_NOT_FOUND');
    assert.strictEqual(notFoundErr.statusCode, 404);

    const abortErr = normalizeGeminiError({ name: 'AbortError', message: 'Request aborted' });
    assert.strictEqual(abortErr.statusCode, 499);
  });

  // -------------------------------------------------------------------------
  // 4. Streaming & AbortSignal Cancellation
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Streaming & AbortSignal Cancellation ---');

  check('Simulated/Demo streaming delivers incremental deltas', async () => {
    const chunks: string[] = [];
    const res = await modelRouter.generateContentStream(
      {
        model: 'gpt-6.1-sol',
        messages: [{ role: 'user', content: 'Explain binary search' }],
        demoMode: true,
      },
      (delta) => {
        chunks.push(delta);
      }
    );

    assert.ok(chunks.length > 0, 'Must deliver streaming chunks');
    assert.strictEqual(res.isSimulated, true);
    assert.ok(res.text.length > 0);
  });

  check('AbortSignal cancellation stops streaming cleanly', async () => {
    const abortController = new AbortController();
    abortController.abort();

    let chunksDelivered = 0;
    try {
      await modelRouter.generateContentStream(
        {
          model: 'gpt-6.1-sol',
          messages: [{ role: 'user', content: 'Long request' }],
          demoMode: true,
        },
        () => {
          chunksDelivered++;
        },
        abortController.signal
      );
    } catch (e: any) {
      assert.strictEqual(e.name, 'AbortError');
    }

    assert.strictEqual(chunksDelivered, 0, 'No chunks should be delivered after abort');
  });

  // -------------------------------------------------------------------------
  // 5. Conversation Persistence & Multi-Tenant Isolation
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Conversation Search & Multi-Tenant Isolation ---');

  check('Indexes conversation and queries by content excerpt', () => {
    const aliceMsg: AIMessage = {
      id: 'msg-1',
      role: 'user',
      content: 'How do I optimize Dijkstra algorithm in TypeScript?',
      timestamp: Date.now(),
    };
    const aliceBotMsg: AIMessage = {
      id: 'msg-2',
      role: 'model',
      content: 'Use a Fibonacci heap or min-priority queue for O(E + V log V).',
      timestamp: Date.now() + 100,
    };

    ConversationSearchService.indexConversation({
      id: 'conv-alice-1',
      projectId: 'proj-alice-1',
      userId: 'user-alice',
      title: 'Dijkstra Optimization',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [aliceMsg, aliceBotMsg],
    });

    // Alice searches for Dijkstra
    const aliceResults = ConversationSearchService.search('user-alice', {
      queryText: 'Dijkstra',
    });
    assert.strictEqual(aliceResults.total, 1);
    assert.strictEqual(aliceResults.results[0].conversationId, 'conv-alice-1');
    assert.match(aliceResults.results[0].excerpt, /Dijkstra/);

    // Multi-tenant isolation: Bob cannot access Alice's conversation
    const bobResults = ConversationSearchService.search('user-bob', {
      queryText: 'Dijkstra',
    });
    assert.strictEqual(bobResults.total, 0, 'Cross-tenant query must return zero results');
  });

  console.log('\n======================================================================');
  console.log(`ALL PHASE 3 AI CHAT & GATEWAY TESTS PASSED (${passedCount} checks)!`);
  console.log('======================================================================\n');
}

runAllTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
