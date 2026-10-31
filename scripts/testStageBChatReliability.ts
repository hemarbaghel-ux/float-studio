import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import firebaseConfig from '../firebase-applet-config.json';
import { ModelRouter } from '../src/server/providers/router';
import { createApp } from '../src/server/app';
import { setGooglePublicKeysForTests } from '../src/server/authMiddleware';
import { INITIAL_MODELS } from '../src/features/ai/registry';
import {
  resolveDefaultSelectedModel,
  getInitialSelectedModel,
  isModelProviderConfigured
} from '../src/store/aiStore';

function createSignedJwt(
  header: Record<string, any>,
  payload: Record<string, any>,
  privateKeyPem: string
): string {
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${h}.${p}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  return `${data}.${signer.sign(privateKeyPem, 'base64url')}`;
}

function parseSseFrames(rawSse: string): any[] {
  return rawSse
    .split(/\r?\n\r?\n/)
    .map((block) =>
      block
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).replace(/^ /, ''))
        .join('\n')
    )
    .filter(Boolean)
    .map((jsonStr) => JSON.parse(jsonStr));
}

async function runStageBTests() {
  console.log('=== FLOAT AI Stage B: Chat & Agent Stream Reliability Verification ===\n');
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}:`, err?.message || err);
      failed++;
    }
  }

  const router = new ModelRouter();

  // 1. Model Router & Catalog tests
  await test('Resolves auto to gpt-6-astra and maps catalog models to their providers', () => {
    assert.strictEqual(router.resolveModelId('auto'), 'gpt-6-astra');
    assert.strictEqual(router.getAdapterForModel('gemini-4-argon').id, 'google');
    assert.strictEqual(router.getAdapterForModel('gpt-6-astra').id, 'openai');
    assert.strictEqual(router.getAdapterForModel('claude-sonnet-5-5').id, 'anthropic');
  });

  await test('Rejects unrecognized model without silent fallback', () => {
    assert.throws(
      () => router.getAdapterForModel('some-invented-model-v99'),
      /not recognized or supported/
    );
  });

  // 2. aiStore.ts Default Model & localStorage Filtering tests
  await test('aiStore defaults selectedModel to gemini-4-argon when only GEMINI_API_KEY is set and ignores unconfigured localStorage model', () => {
    const prevGemini = process.env.GEMINI_API_KEY;
    const prevGoogle = process.env.GOOGLE_API_KEY;
    const prevOpenAI = process.env.OPENAI_API_KEY;
    const prevAnthropic = process.env.ANTHROPIC_API_KEY;
    const prevWindow = (globalThis as any).window;
    const prevLocalStorage = (globalThis as any).localStorage;

    try {
      process.env.GEMINI_API_KEY = 'test-gemini-key-configured';
      delete process.env.GOOGLE_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      const storeMap = new Map<string, string>();
      storeMap.set('float_selected_model', 'gpt-6-astra'); // Unconfigured OpenAI model saved in localStorage
      const mockStorage = {
        getItem: (k: string) => storeMap.get(k) ?? null,
        setItem: (k: string, v: string) => storeMap.set(k, v)
      };
      (globalThis as any).window = {};
      (globalThis as any).localStorage = mockStorage;

      assert.strictEqual(isModelProviderConfigured('gemini-4-argon'), true);
      assert.strictEqual(isModelProviderConfigured('gpt-6-astra'), false);
      assert.strictEqual(isModelProviderConfigured('claude-sonnet-5-5'), false);

      const resolved = getInitialSelectedModel();
      assert.strictEqual(
        resolved,
        'gemini-4-argon',
        'Must default to gemini-4-argon when only GEMINI_API_KEY is configured and ignore saved gpt-6-astra'
      );
      assert.strictEqual(
        storeMap.get('float_selected_model'),
        'gemini-4-argon',
        'Must update localStorage to the configured default model'
      );

      // Now test when only OPENAI_API_KEY is set and saved model is claude-sonnet-5-5
      delete process.env.GEMINI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-test-openai-key';
      storeMap.set('float_selected_model', 'claude-sonnet-5-5');
      const resolvedOpenAI = resolveDefaultSelectedModel(INITIAL_MODELS, undefined, 'claude-sonnet-5-5');
      assert.strictEqual(
        resolvedOpenAI,
        'gpt-6-astra',
        'Must pick first configured model (gpt-6-astra) when only OPENAI_API_KEY is set'
      );
    } finally {
      if (prevGemini !== undefined) process.env.GEMINI_API_KEY = prevGemini;
      else delete process.env.GEMINI_API_KEY;
      if (prevGoogle !== undefined) process.env.GOOGLE_API_KEY = prevGoogle;
      else delete process.env.GOOGLE_API_KEY;
      if (prevOpenAI !== undefined) process.env.OPENAI_API_KEY = prevOpenAI;
      else delete process.env.OPENAI_API_KEY;
      if (prevAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = prevAnthropic;
      else delete process.env.ANTHROPIC_API_KEY;
      (globalThis as any).window = prevWindow;
      (globalThis as any).localStorage = prevLocalStorage;
    }
  });

  // 3. HTTP / SSE Endpoint tests for /api/ai/chat and /api/ai/agent
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const kid = 'stage-b-kid-2026';
  setGooglePublicKeysForTests({ [kid]: publicKey });
  const nowSec = Math.floor(Date.now() / 1000);
  const validToken = createSignedJwt(
    { alg: 'RS256', kid, typ: 'JWT' },
    {
      iss: `https://securetoken.google.com/${firebaseConfig.projectId}`,
      aud: firebaseConfig.projectId,
      sub: 'test-user-stage-b',
      user_id: 'test-user-stage-b',
      email: 'stageb@example.com',
      iat: nowSec - 60,
      exp: nowSec + 3600
    },
    privateKey
  );

  await test('Unconfigured provider returns SSE error event with code NOT_CONFIGURED and exact env var in both /api/ai/chat and /api/ai/agent', async () => {
    const prevAnthropic = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const app = await createApp({ skipVite: true });
    const server = app.listen(0);
    const addr = server.address() as any;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      // 1) /api/ai/chat with unconfigured claude-sonnet-5-5
      const chatRes = await fetch(`${baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validToken}`
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5-5',
          messages: [{ role: 'user', parts: [{ text: 'Hi' }] }],
          stream: true
        })
      });
      assert.strictEqual(chatRes.status, 200);
      const chatRaw = await chatRes.text();
      const chatFrames = parseSseFrames(chatRaw);
      assert.ok(chatFrames.length >= 1, '/api/ai/chat must emit at least one SSE event');
      const chatTerminal = chatFrames[chatFrames.length - 1];
      assert.strictEqual(chatTerminal.type, 'error', '/api/ai/chat terminal event must be error');
      assert.strictEqual(chatTerminal.code, 'NOT_CONFIGURED');
      assert.ok(
        String(chatTerminal.setupStep || '').includes('ANTHROPIC_API_KEY'),
        `Expected setupStep to mention ANTHROPIC_API_KEY, got: ${chatTerminal.setupStep}`
      );

      // 2) /api/ai/agent with unconfigured claude-sonnet-5-5
      const agentRes = await fetch(`${baseUrl}/api/ai/agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validToken}`
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5-5',
          prompt: 'Hi',
          virtualFiles: []
        })
      });
      assert.strictEqual(agentRes.status, 200);
      const agentRaw = await agentRes.text();
      const agentFrames = parseSseFrames(agentRaw);
      assert.strictEqual(agentFrames.length, 1, '/api/ai/agent must end with exactly one terminal error event');
      const agentTerminal = agentFrames[0];
      assert.strictEqual(agentTerminal.type, 'error');
      assert.strictEqual(agentTerminal.code, 'NOT_CONFIGURED');
      assert.ok(
        String(agentTerminal.setupStep || '').includes('ANTHROPIC_API_KEY'),
        `Expected setupStep to mention ANTHROPIC_API_KEY, got: ${agentTerminal.setupStep}`
      );
    } finally {
      server.close();
      if (prevAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = prevAnthropic;
    }
  });

  await test('No stream ends silently in /api/ai/agent; success emits result then done with modelUsed, and silent res.end() emits terminal error', async () => {
    let mode: 'success' | 'silent_end' | 'cancel_substring_error' = 'success';

    const customRouter: any = {
      generateContent: async () => ({
        text: 'Hello from custom router',
        usage: { inputTokens: 4, outputTokens: 6 },
        modelUsed: 'gemini-4-argon'
      }),
      generateContentStream: async (_params: any, onDelta: (d: string) => void) => {
        if (mode === 'cancel_substring_error') {
          throw Object.assign(new Error('Provider error: failed to cancel stale job'), {
            code: 'PROVIDER_ERROR',
            provider: 'OpenAI'
          });
        }
        onDelta('Hello ');
        onDelta('world');
        return {
          text: 'Hello world',
          usage: { inputTokens: 3, outputTokens: 2 },
          modelUsed: 'gemini-4-argon'
        };
      },
      runAgentLoop: async (_req: any, res: any) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        if (mode === 'success') {
          res.write(`data: ${JSON.stringify({ type: 'delta', data: { text: 'Hi there!' } })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: 'result', data: { text: 'Hi there!', changeSet: null, usage: { inputTokens: 5, outputTokens: 3 } } })}\n\n`);
          res.end();
          return;
        }
        if (mode === 'silent_end') {
          // Simulate buggy runner calling res.end() with no terminal event
          res.write(`data: ${JSON.stringify({ type: 'event', data: { type: 'thinking', message: 'Starting...' } })}\n\n`);
          res.end();
          return;
        }
        if (mode === 'cancel_substring_error') {
          throw Object.assign(new Error('Upstream error: could not cancel previous batch'), {
            code: 'PROVIDER_ERROR',
            provider: 'OpenAI'
          });
        }
      }
    };

    const app = await createApp({ skipVite: true, modelRouterOverride: customRouter });
    const server = app.listen(0);
    const addr = server.address() as any;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      // Case A: Agent success -> emits result then done, both with modelUsed
      mode = 'success';
      const successRes = await fetch(`${baseUrl}/api/ai/agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validToken}`
        },
        body: JSON.stringify({
          model: 'gemini-4-argon',
          prompt: 'Hi',
          virtualFiles: []
        })
      });
      const successFrames = parseSseFrames(await successRes.text());
      const types = successFrames.map((f) => f.type);
      assert.strictEqual(types[types.length - 2], 'result', 'Second to last event must be result');
      assert.strictEqual(types[types.length - 1], 'done', 'Last event must be done');
      const resultFrame = successFrames[successFrames.length - 2];
      const doneFrame = successFrames[successFrames.length - 1];
      assert.strictEqual(resultFrame.modelUsed, 'gemini-4-argon');
      assert.strictEqual(doneFrame.modelUsed, 'gemini-4-argon');

      // Case B: Silent res.end() -> intercepted and turned into terminal error event
      mode = 'silent_end';
      const silentRes = await fetch(`${baseUrl}/api/ai/agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validToken}`
        },
        body: JSON.stringify({
          model: 'gpt-6-astra',
          prompt: 'Hi',
          virtualFiles: []
        })
      });
      const silentFrames = parseSseFrames(await silentRes.text());
      const lastSilentFrame = silentFrames[silentFrames.length - 1];
      assert.strictEqual(lastSilentFrame.type, 'error', 'Silent res.end() must emit a terminal error event');
      assert.ok(lastSilentFrame.code, 'Terminal error event must include code');
      assert.ok(lastSilentFrame.setupStep, 'Terminal error event must include setupStep');

      // Case C: Error message containing the word "cancel" is NOT treated as user cancellation
      mode = 'cancel_substring_error';
      const cancelWordChatRes = await fetch(`${baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validToken}`
        },
        body: JSON.stringify({
          model: 'gpt-6-astra',
          messages: [{ role: 'user', parts: [{ text: 'Hi' }] }],
          stream: true
        })
      });
      const cancelWordChatFrames = parseSseFrames(await cancelWordChatRes.text());
      const lastChatFrame = cancelWordChatFrames[cancelWordChatFrames.length - 1];
      assert.strictEqual(lastChatFrame.type, 'error', 'Error containing "cancel" substring in /api/ai/chat must be error, not cancelled done');
      assert.strictEqual(lastChatFrame.code, 'PROVIDER_ERROR');

      const cancelWordAgentRes = await fetch(`${baseUrl}/api/ai/agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validToken}`
        },
        body: JSON.stringify({
          model: 'gpt-6-astra',
          prompt: 'Hi',
          virtualFiles: []
        })
      });
      const cancelWordAgentFrames = parseSseFrames(await cancelWordAgentRes.text());
      const lastAgentFrame = cancelWordAgentFrames[cancelWordAgentFrames.length - 1];
      assert.strictEqual(lastAgentFrame.type, 'error', 'Error containing "cancel" substring in /api/ai/agent must be error, not cancelled');
      assert.strictEqual(lastAgentFrame.code, 'PROVIDER_ERROR');
    } finally {
      server.close();
    }
  });

  await test('ChatThread.tsx and AIPanel.tsx use modelUsed for the message badge, treat result as completion, and show server code and setupStep', () => {
    const chatThreadSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/features/float/ChatThread.tsx'), 'utf8');
    const aiPanelSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/features/ai/AIPanel.tsx'), 'utf8');

    assert.ok(
      chatThreadSrc.includes('const badgeModelId = msg.modelUsed || msg.modelId;'),
      'ChatThread.tsx must prefer msg.modelUsed for the message badge'
    );
    assert.ok(
      chatThreadSrc.includes('msg.setupStep') && chatThreadSrc.includes('msg.errorCode'),
      'ChatThread.tsx must render msg.errorCode and msg.setupStep in the error banner'
    );
    assert.ok(
      aiPanelSrc.includes('const badgeModelId = (msg as any).modelUsed || msg.modelId;'),
      'AIPanel.tsx must prefer msg.modelUsed for the message badge'
    );
    assert.ok(
      aiPanelSrc.includes('(msg as any).setupStep') && aiPanelSrc.includes('(msg as any).errorCode'),
      'AIPanel.tsx must render errorCode and setupStep in the error banner'
    );
  });

  setGooglePublicKeysForTests(null);

  console.log(`\n======================================================`);
  console.log(`Stage B Test Summary: ${passed} passed, ${failed} failed.`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runStageBTests();

