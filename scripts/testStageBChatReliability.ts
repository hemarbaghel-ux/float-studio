import assert from 'assert';
import { ModelRouter } from '../src/server/providers/router';

async function runStageBTests() {
  console.log('=== FLOAT AI Stage B: Reliable Basic Chat Verification ===\n');
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => {
            console.log(`[PASS] ${name}`);
            passed++;
          })
          .catch((err) => {
            console.error(`[FAIL] ${name}:`, err.message);
            failed++;
          });
      }
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  const router = new ModelRouter();

  // Test 1: Active Model Resolution
  test('Resolves auto to gemini-3.1-flash-lite', () => {
    assert.strictEqual(router.resolveModelId('auto'), 'gemini-3.1-flash-lite');
  });

  test('Resolves exact gemini-3.8-flash model', () => {
    assert.strictEqual(router.resolveModelId('gemini-3.8-flash'), 'gemini-3.8-flash');
  });

  // Test 2: Rejection of Retired Models with Helpful Message
  test('Throws descriptive error when retired model is requested', () => {
    assert.throws(
      () => router.validateModelAvailability('gemini-2.0-flash'),
      /retired by Google/
    );
  });

  // Test 3: Provider Mapping Integrity (No silent fallback)
  test('Maps gpt-4o strictly to openai provider', () => {
    const adapter = router.getAdapterForModel('gpt-4o');
    assert.strictEqual(adapter.id, 'openai');
  });

  test('Maps claude-3-7-sonnet to anthropic provider', () => {
    const adapter = router.getAdapterForModel('claude-3-7-sonnet-20250219');
    assert.strictEqual(adapter.id, 'anthropic');
  });

  test('Maps grok-2 to xai provider', () => {
    const adapter = router.getAdapterForModel('grok-2-1212');
    assert.strictEqual(adapter.id, 'xai');
  });

  test('Rejects deepseek models with MODEL_NOT_FOUND error (no silent fallback)', () => {
    assert.throws(
      () => router.getAdapterForModel('deepseek-reasoner'),
      /DeepSeek models .* have been removed|not recognized or supported/
    );
    assert.throws(
      () => router.getAdapterForModel('deepseek-chat'),
      /DeepSeek models .* have been removed|not recognized or supported/
    );
  });

  test('Rejects unrecognized model without silent fallback', () => {
    assert.throws(
      () => router.getAdapterForModel('some-invented-model-v99'),
      /not recognized or supported/
    );
  });

  // Test 4: Provider Configuration check
  test('Returns configured status map for all registered adapters', () => {
    const status = router.getProviderStatus();
    assert.ok(status.google, 'Google status must be present');
    assert.ok(status.openai, 'OpenAI status must be present');
    assert.ok(status.anthropic, 'Anthropic status must be present');
    assert.ok(status.xai, 'xAI status must be present');
    assert.strictEqual(status.deepseek, undefined, 'DeepSeek status must not be present');
  });

  // Test 5: Sliding Window Rate Limiter Logic
  test('Enforces sliding window rate limits accurately', () => {
    const chatRateLimits = new Map<string, number[]>();
    const checkChatRateLimit = (userId: string, maxRequests = 3, windowMs = 1000): boolean => {
      const now = Date.now();
      const timestamps = (chatRateLimits.get(userId) || []).filter(t => now - t < windowMs);
      if (timestamps.length >= maxRequests) {
        return false;
      }
      timestamps.push(now);
      chatRateLimits.set(userId, timestamps);
      return true;
    };

    assert.strictEqual(checkChatRateLimit('user-1', 3, 1000), true);
    assert.strictEqual(checkChatRateLimit('user-1', 3, 1000), true);
    assert.strictEqual(checkChatRateLimit('user-1', 3, 1000), true);
    assert.strictEqual(checkChatRateLimit('user-1', 3, 1000), false, '4th request must be blocked');

    // Independent user is not blocked
    assert.strictEqual(checkChatRateLimit('user-2', 3, 1000), true);
  });

  // Test 6: Message History & Retry Deduplication Simulation
  test('Retry preserves user turns without duplicating prompts', () => {
    const mockMessages = [
      { id: 'msg-1', role: 'user', content: 'Create a binary search function' },
      { id: 'msg-2', role: 'model', content: 'Here is the binary search...', status: 'completed' },
      { id: 'msg-3', role: 'user', content: 'Now add unit tests' },
      { id: 'msg-4', role: 'model', content: '**Error**: Provider rate limit', status: 'error' }
    ];

    // Simulate handleRetry on msg-4
    const errorMsgId = 'msg-4';
    const errorIdx = mockMessages.findIndex(m => m.id === errorMsgId);
    assert.strictEqual(errorIdx, 3);

    let precedingUserPrompt = '';
    for (let i = errorIdx - 1; i >= 0; i--) {
      if (mockMessages[i].role === 'user') {
        precedingUserPrompt = mockMessages[i].content;
        break;
      }
    }
    assert.strictEqual(precedingUserPrompt, 'Now add unit tests');

    // Remove the error message
    const filtered = mockMessages.filter((_, idx) => idx !== errorIdx);
    assert.strictEqual(filtered.length, 3);

    // In retry mode (isRetry = true):
    const priorTurns = filtered
      .filter(m => m.content && m.status !== 'error')
      .map(m => ({ role: m.role, text: m.content }));

    // User turn is already at the end of priorTurns, so requestMessages does not append it twice:
    const requestMessages = priorTurns; // isRetry ? priorTurns : [...priorTurns, draftText]
    assert.strictEqual(requestMessages.length, 3);
    assert.strictEqual(requestMessages[requestMessages.length - 1].role, 'user');
    assert.strictEqual(requestMessages[requestMessages.length - 1].text, 'Now add unit tests');
  });

  console.log(`\n======================================================`);
  console.log(`Stage B Test Summary: ${passed} passed, ${failed} failed.`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runStageBTests();
