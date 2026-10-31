import { OpenAIAdapter } from '../src/server/providers/openai';
import { AIProviderError } from '../src/server/providers/base';

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

async function runTests() {
  console.log('\n======================================================');
  console.log('TEST SUITE: SIMULATED AI BEHAVIOR REMOVAL & ERROR INTEGRITY');
  console.log('======================================================\n');

  // Test Suite 1: Missing Credentials Rejection (No fake responses)
  console.log('--- Test Suite 1: Missing Credentials Must Throw (No Silent Synthesized Responses) ---');
  const originalKey = process.env.OPENAI_API_KEY;
  const originalCodex = process.env.CODEX_API_KEY;
  const originalEnv = process.env.OPENAI_ENVIRONMENT_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.CODEX_API_KEY;
  delete process.env.OPENAI_ENVIRONMENT_KEY;

  const unconfiguredAdapter = new OpenAIAdapter();
  assert(unconfiguredAdapter.isConfigured() === false, 'Adapter correctly reports isConfigured() === false');

  // 1.1 generateContent without credentials
  let missingKeyGenError: any = null;
  try {
    await unconfiguredAdapter.generateContent({
      model: 'gpt-6-astra',
      messages: [{ role: 'user', content: 'Create a React button component' }]
    });
  } catch (err: any) {
    missingKeyGenError = err;
  }
  assert(missingKeyGenError instanceof AIProviderError, 'generateContent without key throws AIProviderError');
  assert((missingKeyGenError?.code as string) === 'NOT_CONFIGURED', 'Error code is NOT_CONFIGURED');
  assert(missingKeyGenError?.statusCode === 503, 'HTTP status is 503');
  assert(missingKeyGenError?.message.includes('not configured'), 'Error message is actionable and mentions configuration');

  // 1.2 generateContentStream without credentials
  let missingKeyStreamError: any = null;
  const streamedChunks: string[] = [];
  try {
    await unconfiguredAdapter.generateContentStream(
      {
        model: 'gpt-6-sol',
        messages: [{ role: 'user', content: 'Debug this concurrency error' }]
      },
      (chunk) => { streamedChunks.push(chunk); }
    );
  } catch (err: any) {
    missingKeyStreamError = err;
  }
  assert(missingKeyStreamError instanceof AIProviderError, 'generateContentStream without key throws AIProviderError');
  assert((missingKeyStreamError?.code as string) === 'NOT_CONFIGURED', 'Streaming error code is NOT_CONFIGURED');
  assert(missingKeyStreamError?.statusCode === 503, 'Streaming status is 503');
  assert(streamedChunks.length === 0, 'Zero chunks streamed on missing credentials (no fabricated text)');

  // Test Suite 2: Upstream 401 (Invalid Key) Must Throw Actionable Error
  console.log('\n--- Test Suite 2: Invalid Upstream Credentials Must Throw (No Masquerading) ---');
  process.env.OPENAI_API_KEY = 'sk-invalid-key-for-test-mock';
  const mock401Adapter = new OpenAIAdapter();
  (mock401Adapter as any).getClient = () => ({
    chat: {
      completions: {
        create: async () => {
          const err: any = new Error('Incorrect API key provided: sk-invalid-key-for-test-mock');
          err.status = 401;
          throw err;
        }
      }
    }
  });

  let invalidKeyGenError: any = null;
  try {
    await mock401Adapter.generateContent({
      model: 'gpt-6-astra',
      messages: [{ role: 'user', content: 'Hello' }]
    });
  } catch (err: any) {
    invalidKeyGenError = err;
  }
  assert(invalidKeyGenError instanceof AIProviderError, 'Upstream 401 throws AIProviderError');
  assert(invalidKeyGenError?.code === 'AUTH_ERROR', 'Error code is AUTH_ERROR');
  assert(invalidKeyGenError?.statusCode === 401, 'Error status is 401');
  assert(invalidKeyGenError?.message.includes('authentication failed'), 'Message accurately describes auth failure');

  let invalidKeyStreamError: any = null;
  const invalidStreamedChunks: string[] = [];
  try {
    await mock401Adapter.generateContentStream(
      {
        model: 'gpt-6-astra',
        messages: [{ role: 'user', content: 'Hello' }]
      },
      (chunk) => { invalidStreamedChunks.push(chunk); }
    );
  } catch (err: any) {
    invalidKeyStreamError = err;
  }
  assert(invalidKeyStreamError instanceof AIProviderError, 'Streaming 401 throws AIProviderError');
  assert(invalidKeyStreamError?.code === 'AUTH_ERROR', 'Streaming 401 code is AUTH_ERROR');
  assert(invalidStreamedChunks.length === 0, 'Zero chunks streamed on 401 error (no fabricated output)');

  // Test Suite 3: Upstream Rate Limit / Quota Exceeded (429) Must Throw RATE_LIMITED
  console.log('\n--- Test Suite 3: Upstream Quota/Rate Limit (429) Must Throw ---');
  const mock429Adapter = new OpenAIAdapter();
  (mock429Adapter as any).getClient = () => ({
    chat: {
      completions: {
        create: async () => {
          const err: any = new Error('You exceeded your current quota, please check your plan and billing details.');
          err.status = 429;
          throw err;
        }
      }
    }
  });

  let quotaError: any = null;
  try {
    await mock429Adapter.generateContent({
      model: 'gpt-6-sol',
      messages: [{ role: 'user', content: 'Design architecture' }]
    });
  } catch (err: any) {
    quotaError = err;
  }
  assert(quotaError instanceof AIProviderError, 'Quota exceeded throws AIProviderError');
  assert(quotaError?.code === 'RATE_LIMITED', 'Error code is RATE_LIMITED');
  assert(quotaError?.statusCode === 429, 'Status is 429');

  // Test Suite 4: Explicit Demo Mode (Visibly Identified & No Fabricated Tokens)
  console.log('\n--- Test Suite 4: Explicit Demo Mode Handling ---');
  delete process.env.OPENAI_API_KEY;
  const demoAdapter = new OpenAIAdapter();

  const demoRes = await demoAdapter.generateContent({
    model: 'gpt-6-astra',
    messages: [{ role: 'user', content: 'Build a React dashboard' }],
    demoMode: true
  });
  assert(demoRes.isSimulated === true, 'demoMode sets isSimulated: true');
  assert(demoRes.text.includes('[SIMULATED DEMO RESPONSE]'), 'Demo output visibly contains [SIMULATED DEMO RESPONSE] banner');
  assert(demoRes.usage === undefined, 'Demo response does NOT fabricate token usage (usage is undefined)');

  // Restore original environment
  if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
  if (originalCodex !== undefined) process.env.CODEX_API_KEY = originalCodex;
  if (originalEnv !== undefined) process.env.OPENAI_ENVIRONMENT_KEY = originalEnv;

  console.log('\n======================================================');
  console.log(`TEST SUITE RESULTS: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});