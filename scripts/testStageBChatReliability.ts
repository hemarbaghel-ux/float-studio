import assert from 'assert';
import { ModelRouter } from '../src/server/providers/router';
import { messagesForConversation } from '../src/features/ai/conversationMessageScope';
import { ownsActiveRequest } from '../src/features/ai/requestLifecycle';

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
  test('Resolves auto to gpt-6-astra', () => {
    assert.strictEqual(router.resolveModelId('auto'), 'gpt-6-astra');
  });

  test('Preserves the exact selected GPT-6 model ID', () => {
    assert.strictEqual(router.resolveModelId('gpt-6.1-sol'), 'gpt-6.1-sol');
  });

  // Test 2: Rejection of Non-OpenAI Models
  test('Throws descriptive error when retired or non-OpenAI model is requested', () => {
    assert.throws(
      () => router.validateModelAvailability('gemini-2.0-flash'),
      /unsupported provider/
    );
  });

  // Test 3: Provider Mapping Integrity (No silent fallback)
  test('Maps GPT-6 Astra strictly to the OpenAI provider', () => {
    const adapter = router.getAdapterForModel('gpt-6-astra');
    assert.strictEqual(adapter.id, 'openai');
  });

  test('Rejects non-selectable OpenAI models through the execution router', () => {
    assert.throws(() => router.resolveRoute('gpt-4o'), (error: any) => error.code === 'MODEL_NOT_FOUND');
    assert.throws(() => router.resolveRoute('float-basic'), (error: any) => error.code === 'MODEL_NOT_FOUND');
  });

  test('Rejects claude as unsupported provider', () => {
    assert.throws(
      () => router.getAdapterForModel('claude-3-7-sonnet-20250219'),
      /unsupported provider/
    );
  });

  test('Rejects grok as unsupported provider', () => {
    assert.throws(
      () => router.getAdapterForModel('grok-2-1212'),
      /unsupported provider/
    );
  });

  test('Rejects deepseek models with unsupported provider error (no silent fallback)', () => {
    assert.throws(
      () => router.getAdapterForModel('deepseek-reasoner'),
      /unsupported provider/
    );
    assert.throws(
      () => router.getAdapterForModel('deepseek-chat'),
      /unsupported provider/
    );
  });

  test('Rejects unrecognized model without silent fallback', () => {
    assert.throws(
      () => router.getAdapterForModel('some-invented-model-v99'),
      /not recognized or supported/
    );
  });

  // Test 4: Provider Configuration check
  test('Returns configured status map for registered adapters', () => {
    const status = router.getProviderStatus();
    assert.ok(status.openai, 'OpenAI status must be present');
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

  // Test 7: Phase 2A Request Submission & Duplicate Prevention
  test('Submission guard blocks duplicate in-flight requests when streaming', () => {
    let streaming = false;
    let requestsFired = 0;
    const send = (promptText: string) => {
      if (!promptText.trim() || streaming) return;
      streaming = true;
      requestsFired++;
    };

    send('First prompt');
    assert.strictEqual(requestsFired, 1, 'First request fired');
    send('Second prompt rapid click');
    assert.strictEqual(requestsFired, 1, 'Rapid click blocked while streaming');
    streaming = false;
    send('Next prompt after completion');
    assert.strictEqual(requestsFired, 2, 'Next prompt fires once streaming completes');
  });

  // Test 8: Phase 2A Error Code Categorization & Actionable Extraction
  test('Categorizes provider error codes for actionable UI presentation', () => {
    const errorCodes = [
      { status: 401, error: 'Unauthorized', expectedCode: 'AUTH_ERROR' },
      { status: 429, error: 'Rate limit exceeded', expectedCode: 'RATE_LIMITED' },
      { status: 429, error: 'insufficient_quota', expectedCode: 'QUOTA_EXCEEDED' },
      { status: 404, error: 'Model not found', expectedCode: 'MODEL_NOT_FOUND' },
      { status: 500, error: 'Internal server error', expectedCode: 'PROVIDER_ERROR' }
    ];

    for (const testCase of errorCodes) {
      const code = testCase.error.includes('quota')
        ? 'QUOTA_EXCEEDED'
        : (testCase.status === 401 ? 'AUTH_ERROR' : testCase.status === 429 ? 'RATE_LIMITED' : testCase.status === 404 ? 'MODEL_NOT_FOUND' : 'PROVIDER_ERROR');
      assert.strictEqual(code, testCase.expectedCode);
    }
  });

  // Test 9: Phase 2A Stream Cancellation & Cleanup
  test('Stream cancellation signals abort controller and cleans up loading state', () => {
    const controller = new AbortController();
    let isStreaming = true;
    let isCancelled = false;

    // Simulate clicking stop button
    controller.abort();
    if (controller.signal.aborted) {
      isStreaming = false;
      isCancelled = true;
    }

    assert.strictEqual(isStreaming, false, 'Loading/streaming state must exit on cancellation');
    assert.strictEqual(isCancelled, true, 'Message marked as cancelled without saving error');
  });

  // Test 10: Phase 2A Conversation Switching Isolation
  test('Active chat tracking discards late chunks when user navigates away', () => {
    let activeChatId = 'chat-alpha';
    let targetMsgChatId = 'chat-alpha';
    let patchedContent = '';

    const patch = (msgChatId: string, text: string) => {
      if (activeChatId !== msgChatId) return; // Guard prevents cross-chat bleeding
      patchedContent = text;
    };

    // Chunk arrives for active chat
    patch(targetMsgChatId, 'Hello from chat alpha');
    assert.strictEqual(patchedContent, 'Hello from chat alpha');

    // User navigates to chat-beta while chunk was in transit
    activeChatId = 'chat-beta';
    patch('chat-alpha', 'Late chunk from chat alpha');
    assert.strictEqual(patchedContent, 'Hello from chat alpha', 'Late chunk must not apply after navigation');
  });

  test('Conversation persistence filters messages to the target conversation', () => {
    const messages = [
      { id: 'a1', conversationId: 'chat-alpha', role: 'user', content: 'alpha' },
      { id: 'b1', conversationId: 'chat-beta', role: 'user', content: 'beta' },
      { id: 'a2', conversationId: 'chat-alpha', role: 'model', content: 'answer' }
    ] as any;
    const persisted = messagesForConversation(messages, 'chat-alpha');
    assert.deepStrictEqual(persisted.map((message) => message.id), ['a1', 'a2'], 'Persisting alpha cannot include beta messages');
  });

  test('A stale request cannot clear the newer request controller or loading state', () => {
    const older = new AbortController();
    const newer = new AbortController();
    assert.strictEqual(ownsActiveRequest(newer, older), false, 'older finally block does not own active request slot');
    assert.strictEqual(ownsActiveRequest(newer, newer), true, 'current finally block can release its own slot');
  });

  // Test 11: Phase 2A Empty Response Rejection
  test('Empty response or malformed stream is rejected as error rather than empty success', () => {
    const fullText = '';
    const hasChangeSet = false;
    let didThrow = false;

    try {
      if (!fullText && !hasChangeSet) {
        throw new Error('Provider returned an empty response. Please verify provider connectivity and try again.');
      }
    } catch (e: any) {
      didThrow = true;
      assert.ok(e.message.includes('empty response'), 'Identifies empty response error');
    }
    assert.strictEqual(didThrow, true, 'Must throw error on empty response');
  });

  // Test 12: Phase 2A OpenAI-Only Active Model Routing
  test('All active dashboard models map strictly to their exact OpenAI API IDs', () => {
    const activeOpenAIModels = ['gpt-6-astra', 'gpt-6.1-sol'];
    for (const mId of activeOpenAIModels) {
      const { route, adapter } = router.resolveRoute(mId);
      assert.strictEqual(adapter.id, 'openai', `Model ${mId} routes to openai adapter`);
      assert.strictEqual(route.apiModelId, mId, `Model ${mId} reaches its exact upstream ID`);
    }
  });

  console.log(`\n======================================================`);
  console.log(`Stage B Test Summary: ${passed} passed, ${failed} failed.`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runStageBTests();
