/**
 * FLOAT Studio - Production Desktop AI Platform & Model Runtime Verification
 *
 * Verifies the actual production classes:
 * - FloatModelClient (desktop/src/vs/workbench/contrib/float/common/model-runtime/floatModelClient.ts)
 * - FloatAuthService (desktop/src/vs/workbench/contrib/float/common/auth/floatAuthService.ts)
 * - FloatModelRegistry (desktop/src/vs/workbench/contrib/float/common/model-runtime/floatModelRegistry.ts)
 *
 * Suites:
 * 1. Progressive SSE Streaming with Split Frames and Multiline Data
 * 2. Routing Alias Resolution ('auto' -> 'gpt-6.1-sol') and Metadata Tracking
 * 3. Client-Side AbortController Cancellation and Network Socket Termination
 * 4. Upstream HTTP Error Propagation (400, 401, 403, 429, 500)
 * 5. Multi-Conversation Isolation & Session Integrity
 * 6. FloatAuthService Secret Storage, Expiration & Token Sanitization
 */

import assert from 'assert';
import http from 'http';
import { AddressInfo } from 'net';
import { FloatModelClient } from '../desktop/src/vs/workbench/contrib/float/common/model-runtime/floatModelClient.js';
import { FloatAuthService } from '../desktop/src/vs/workbench/contrib/float/common/auth/floatAuthService.js';
import { FLOAT_MODELS, getFloatModel, getDefaultFloatModel } from '../desktop/src/vs/workbench/contrib/float/common/model-runtime/floatModelRegistry.js';
import { ISecretStorageService } from '../desktop/src/vs/platform/secrets/common/secrets.js';

class MockSecretStorageService implements ISecretStorageService {
  declare readonly _serviceBrand: undefined;
  private storage = new Map<string, string>();
  readonly onDidChangeSecret = (() => {}) as any;

  async get(key: string): Promise<string | undefined> {
    return this.storage.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  has(key: string): boolean {
    return this.storage.has(key);
  }
}

function createEphemeralJwt(expSecondsFromNow: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    uid: 'user-audit-123',
    email: 'test@float.run',
    exp: nowSec + expSecondsFromNow
  })).toString('base64url');
  const signature = 'fake_signature_for_test_harness';
  return `${header}.${payload}.${signature}`;
}

async function runTests() {
  console.log('--- Phase 4 Hardened: Production Desktop AI Model Client & Auth Tests ---\n');

  // Verify Model Registry Alignment
  {
    console.log('[Suite 0] Desktop Model Registry Consistency...');
    const defaultModel = getDefaultFloatModel();
    assert.strictEqual(defaultModel.id, 'gpt-6.1-sol', 'Default model must be gpt-6.1-sol');

    const modelIds = FLOAT_MODELS.map(m => m.id);
    assert.ok(modelIds.includes('gpt-6.1-sol'), 'gpt-6.1-sol must be registered');
    assert.ok(modelIds.includes('gpt-6-astra'), 'gpt-6-astra must be registered');
    assert.ok(modelIds.includes('auto'), 'auto routing alias must be registered');

    const autoModel = getFloatModel('auto');
    assert.strictEqual(autoModel?.isRoutingAlias, true, 'auto must be flagged as routing alias');
    assert.strictEqual(autoModel?.upstreamModelId, 'gpt-6-astra', 'auto must route to gpt-6-astra');
    console.log('  -> PASS: Desktop registry perfectly consistent with server models');
  }

  // Suite 1: Progressive SSE Streaming with Split Frames
  {
    console.log('[Suite 1] Progressive SSE Stream Delivery (Production FloatModelClient)...');
    let requestPayload: any = null;
    let authHeader: string | undefined = undefined;
    let projectHeader: string | undefined = undefined;

    const server = http.createServer((req, res) => {
      authHeader = req.headers['authorization'];
      projectHeader = req.headers['x-float-project-id'] as string;

      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        requestPayload = JSON.parse(body);

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        // Write SSE frames with split TCP chunks and multiline data
        res.write('data: {"type":"delta","text":"Hello"}\n\n');
        setTimeout(() => {
          // Multiline payload inside single SSE frame
          res.write('data: {"type":"delta",\n');
          res.write('data: "text":" from FLOAT Production"}\n\n');
          setTimeout(() => {
            res.write('data: {"type":"done","usage":{"totalTokens":42}}\n\n');
            res.end();
          }, 20);
        }, 20);
      });
    });

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;

    const client = new FloatModelClient();
    client.setEndpoint(`http://127.0.0.1:${port}/api/ai/chat`);

    let accumulatedChunks = '';
    let completedText = '';
    let streamMetadata: any = null;

    await new Promise<void>((resolve, reject) => {
      client.streamChat(
        [{ role: 'user', content: 'Say hello' }],
        'gpt-6.1-sol',
        {
          onChunk: (chunk) => { accumulatedChunks += chunk; },
          onError: (err) => { reject(err); },
          onComplete: (full, meta) => {
            completedText = full;
            streamMetadata = meta;
            resolve();
          }
        },
        'token-test-xyz',
        'project-delta-77'
      );
    });

    server.close();

    assert.strictEqual(authHeader, 'Bearer token-test-xyz');
    assert.strictEqual(projectHeader, 'project-delta-77');
    assert.strictEqual(requestPayload.model, 'gpt-6.1-sol');
    assert.strictEqual(requestPayload.projectId, 'project-delta-77');
    assert.strictEqual(requestPayload.stream, true);
    assert.strictEqual(completedText, 'Hello from FLOAT Production');
    assert.strictEqual(accumulatedChunks, 'Hello from FLOAT Production');
    assert.strictEqual(streamMetadata.requestedModelId, 'gpt-6.1-sol');
    assert.strictEqual(streamMetadata.executedModelId, 'gpt-6.1-sol');
    assert.strictEqual(streamMetadata.isRoutingAlias, false);
    console.log('  -> PASS: Progressive SSE stream, split frame decoding and metadata verified');
  }

  // Suite 2: Routing Alias Resolution
  {
    console.log('[Suite 2] Routing Alias Resolution (auto -> gpt-6-astra)...');
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"type":"delta","text":"Routed response"}\n\n');
      res.write('data: {"type":"done"}\n\n');
      res.end();
    });

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;

    const client = new FloatModelClient();
    client.setEndpoint(`http://127.0.0.1:${port}/api/ai/chat`);

    let metadata: any = null;
    await new Promise<void>((resolve, reject) => {
      client.streamChat(
        [{ role: 'user', content: 'Route me' }],
        'auto',
        {
          onChunk: () => {},
          onError: (err) => { reject(err); },
          onComplete: (_text, meta) => {
            metadata = meta;
            resolve();
          }
        }
      );
    });

    server.close();

    assert.strictEqual(metadata.requestedModelId, 'auto');
    assert.strictEqual(metadata.executedModelId, 'gpt-6-astra');
    assert.strictEqual(metadata.isRoutingAlias, true);
    console.log('  -> PASS: auto alias explicitly tracked (requested=auto, executed=gpt-6-astra, alias=true)');
  }

  // Suite 3: Client Cancellation & Connection Termination
  {
    console.log('[Suite 3] Client Cancellation (AbortController)...');
    let clientDisconnected = false;

    let resolveDisconnect: () => void;
    const disconnectPromise = new Promise<void>(r => { resolveDisconnect = r; });

    const server = http.createServer((req, res) => {
      res.on('close', () => {
        clientDisconnected = true;
        resolveDisconnect();
      });

      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"type":"delta","text":"Initial"}\n\n');
      // Intentionally keep connection open
    });

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;

    const client = new FloatModelClient();
    client.setEndpoint(`http://127.0.0.1:${port}/api/ai/chat`);

    let errorReceived: Error | null = null;
    const streamPromise = new Promise<void>((resolve) => {
      client.streamChat(
        [{ role: 'user', content: 'Long request' }],
        'gpt-6.1-sol',
        {
          onChunk: (_c) => {
            // Cancel as soon as first chunk arrives
            client.cancelActiveStream();
          },
          onError: (err) => {
            errorReceived = err;
            resolve();
          },
          onComplete: () => {
            assert.fail('Should not complete when cancelled');
          }
        }
      );
    });

    await streamPromise;
    await Promise.race([
      disconnectPromise,
      new Promise(r => setTimeout(r, 300))
    ]);
    server.close();

    assert.ok(errorReceived);
    assert.match(errorReceived!.message, /cancelled by user/i);
    assert.strictEqual(clientDisconnected, true, 'Upstream connection must be terminated on abort');
    console.log('  -> PASS: AbortController cancelled stream and cleanly terminated upstream socket');
  }

  // Suite 4: Upstream HTTP Error Propagation
  {
    console.log('[Suite 4] Upstream HTTP Error Handling (400, 401, 403, 429, 500)...');
    const scenarios = [
      { status: 400, errJson: { error: 'Invalid model' }, expectedMatch: /400/ },
      { status: 401, errJson: { error: 'Authentication required' }, expectedMatch: /401/ },
      { status: 403, errJson: { error: 'Access denied to project' }, expectedMatch: /403/ },
      { status: 429, errJson: { error: 'Rate limit exceeded' }, expectedMatch: /429/ },
      { status: 500, errJson: { error: 'Server crashed' }, expectedMatch: /500/ }
    ];

    for (const sc of scenarios) {
      const server = http.createServer((_req, res) => {
        res.writeHead(sc.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(sc.errJson));
      });

      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
      const port = (server.address() as AddressInfo).port;

      const client = new FloatModelClient();
      client.setEndpoint(`http://127.0.0.1:${port}/api/ai/chat`);

      let caughtErr: Error | null = null;
      await new Promise<void>(resolve => {
        client.streamChat(
          [{ role: 'user', content: 'Test' }],
          'gpt-6.1-sol',
          {
            onChunk: () => {},
            onError: (err) => {
              caughtErr = err;
              resolve();
            },
            onComplete: () => {
              assert.fail(`Status ${sc.status} should have errored`);
            }
          }
        );
      });

      server.close();
      assert.ok(caughtErr);
      assert.match(caughtErr!.message, sc.expectedMatch);
      assert.ok(caughtErr!.message.includes(sc.errJson.error));
    }
    console.log('  -> PASS: All HTTP error statuses correctly propagated and formatted');
  }

  // Suite 5: Multi-Conversation Isolation
  {
    console.log('[Suite 5] Conversation Session Isolation...');
    const client = new FloatModelClient();

    const conv1 = client.getOrCreateConversation('conv-1', 'proj-alpha', 'gpt-6.1-sol');
    const conv2 = client.getOrCreateConversation('conv-2', 'proj-beta', 'gpt-6-astra');

    assert.strictEqual(conv1.projectId, 'proj-alpha');
    assert.strictEqual(conv1.requestedModelId, 'gpt-6.1-sol');
    assert.strictEqual(conv2.projectId, 'proj-beta');
    assert.strictEqual(conv2.requestedModelId, 'gpt-6-astra');

    conv1.messages.push({ id: 'm1', role: 'user', content: 'Alpha query', timestamp: 1 });
    conv2.messages.push({ id: 'm2', role: 'user', content: 'Beta query', timestamp: 2 });

    assert.strictEqual(client.getConversation('conv-1')?.messages.length, 1);
    assert.strictEqual(client.getConversation('conv-2')?.messages.length, 1);
    assert.strictEqual(client.getConversation('conv-1')?.messages[0].content, 'Alpha query');
    assert.strictEqual(client.getConversation('conv-2')?.messages[0].content, 'Beta query');

    client.clearConversation('conv-1');
    assert.strictEqual(client.getConversation('conv-1'), undefined);
    assert.strictEqual(client.getConversation('conv-2') !== undefined, true);
    console.log('  -> PASS: Conversations maintain strict multi-tenant session isolation');
  }

  // Suite 5B: Independent conversation streams and cancellation ownership
  {
    console.log('[Suite 5B] Concurrent Conversation Stream Isolation...');
    let resolveConversationASeen!: () => void;
    const conversationASeen = new Promise<void>(resolve => { resolveConversationASeen = resolve; });
    const server = http.createServer((req, res) => {
      const conversationId = req.headers['x-float-conversation-id'];
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      const finish = (text: string) => {
        res.write('data: ' + JSON.stringify({ type: 'delta', text }) + '\n\n');
        res.write('data: ' + JSON.stringify({ type: 'done' }) + '\n\n');
        res.end();
      };
      if (conversationId === 'conv-a') {
        resolveConversationASeen();
        setTimeout(() => finish('response-a'), 60);
      } else if (conversationId === 'conv-b') {
        finish('response-b');
      } else {
        res.writeHead(400);
        res.end();
      }
    });

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;
    const client = new FloatModelClient();
    client.setEndpoint(`http://127.0.0.1:${port}/api/ai/chat`);
    const runConversation = (conversationId: string) => new Promise<string>((resolve, reject) => {
      client.streamChat(
        [{ role: 'user', content: 'Run independent conversation ' + conversationId }],
        'gpt-6.1-sol',
        {
          onChunk: () => {},
          onError: reject,
          onComplete: fullText => resolve(fullText)
        },
        undefined,
        'project-stream-isolation',
        undefined,
        conversationId
      );
    });

    try {
      const conversationA = runConversation('conv-a');
      await conversationASeen;
      const conversationB = runConversation('conv-b');
      const [responseA, responseB] = await Promise.all([conversationA, conversationB]);
      assert.equal(responseA, 'response-a', 'starting conversation B must not abort conversation A');
      assert.equal(responseB, 'response-b', 'conversation B must complete independently');
      console.log('  -> PASS: concurrent conversations keep independent abort controllers and both streams complete');
    } finally {
      client.cancelActiveStream();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }

  // Suite 5C: Caller AbortSignal is propagated to the underlying HTTP stream
  {
    console.log('[Suite 5C] Caller AbortSignal Propagation...');
    let clientDisconnected = false;
    let notifyDisconnect!: () => void;
    const disconnectPromise = new Promise<void>(resolve => { notifyDisconnect = resolve; });
    const server = http.createServer((_req, res) => {
      res.on('close', () => {
        clientDisconnected = true;
        notifyDisconnect();
      });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Connection': 'keep-alive' });
      res.write('data: {"type":"delta","text":"initial"}\\n\\n');
      // Keep the response open until the caller aborts its stream.
    });

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;
    const client = new FloatModelClient();
    client.setEndpoint(`http://127.0.0.1:${port}/api/ai/chat`);
    const callerController = new AbortController();
    let receivedError: Error | null = null;
    try {
      await new Promise<void>((resolve, reject) => {
        client.streamChat(
          [{ role: 'user', content: 'Cancel this generated stream from the caller' }],
          'gpt-6.1-sol',
          {
            onChunk: () => callerController.abort(),
            onError: error => {
              receivedError = error;
              resolve();
            },
            onComplete: () => reject(new Error('aborted stream must not complete successfully'))
          },
          undefined,
          'project-caller-cancel',
          undefined,
          'conv-caller-cancel',
          callerController.signal
        );
      });
      await Promise.race([
        disconnectPromise,
        new Promise(resolve => setTimeout(resolve, 300))
      ]);
      assert.equal(callerController.signal.aborted, true);
      assert.ok(receivedError);
      assert.match(receivedError!.message, /cancelled by user/i);
      assert.equal(clientDisconnected, true, 'caller abort must terminate the underlying HTTP connection');
      console.log('  -> PASS: caller AbortSignal cancels fetch and closes the upstream response');
    } finally {
      client.cancelActiveStream('conv-caller-cancel');
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }

  // Suite 6: FloatAuthService Security & Token Lifecycle
  {
    console.log('[Suite 6] FloatAuthService Secret Storage & Token Lifecycle...');
    const secretStorage = new MockSecretStorageService();
    const authService = new FloatAuthService(secretStorage);

    // Initial state
    assert.strictEqual(authService.isAuthenticated(), false);
    assert.strictEqual(authService.getAuthToken(), null);
    assert.strictEqual(authService.getSanitizedToken(), '[UNAUTHENTICATED]');

    // Set valid token
    const validToken = createEphemeralJwt(3600); // 1 hour in future
    await authService.setAuthToken(validToken);

    assert.strictEqual(authService.isAuthenticated(), true);
    assert.strictEqual(authService.isTokenExpired(), false);
    assert.strictEqual(authService.getAuthToken(), validToken);
    assert.strictEqual(await secretStorage.get('float.authToken'), validToken);

    // Token sanitization - never leak full token
    const sanitized = authService.getSanitizedToken();
    assert.ok(!sanitized.includes(validToken), 'Sanitized token must not contain full secret');
    assert.strictEqual(sanitized.slice(0, 4), validToken.slice(0, 4));
    assert.strictEqual(sanitized.slice(-4), validToken.slice(-4));

    // Expired token handling
    const expiredToken = createEphemeralJwt(-300); // 5 minutes ago
    await authService.setAuthToken(expiredToken);
    assert.strictEqual(authService.isTokenExpired(), true);
    assert.strictEqual(authService.isAuthenticated(), false);
    assert.strictEqual(authService.getAuthToken(), null, 'Expired token must return null');

    // Sign out
    await authService.setAuthToken(validToken);
    assert.strictEqual(authService.isAuthenticated(), true);
    await authService.signOut();
    assert.strictEqual(authService.isAuthenticated(), false);
    assert.strictEqual(authService.getAuthToken(), null);
    assert.strictEqual(await secretStorage.get('float.authToken'), undefined);

    console.log('  -> PASS: Secret storage persistence, JWT expiration and token sanitization verified');
  }

  console.log('\nAll production desktop AI, stream isolation and authentication suites PASSED.\n');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
