/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRouter } from '../src/server/providers/router';
import { AIProviderAdapter, AIProviderRequest, AIProviderResponse } from '../src/server/providers/types';

describe('SEC-05 Outbound Chat & Model Secret Redaction Engine (Phase 1.1 Task 4)', () => {
  let router: ModelRouter;
  let receivedRequests: AIProviderRequest[];
  let receivedStreamingRequests: AIProviderRequest[];

  // Instrumented mock provider capturing actual outbound provider payloads
  const mockProvider: AIProviderAdapter = {
    id: 'mock-audit-provider',
    name: 'Mock Audit Provider',
    isConfigured: () => true,
    generateContent: async (request: AIProviderRequest): Promise<AIProviderResponse> => {
      receivedRequests.push(request);
      return {
        text: `Echo: ${request.messages[0]?.content || ''}`,
        model: request.model,
        provider: 'mock-audit-provider',
        latencyMs: 10,
        usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
      };
    },
    generateContentStream: async (
      request: AIProviderRequest,
      onChunk: (delta: string) => void
    ): Promise<AIProviderResponse> => {
      receivedStreamingRequests.push(request);
      const text = `Streamed: ${request.messages[0]?.content || ''}`;
      onChunk(text);
      return {
        text,
        model: request.model,
        provider: 'mock-audit-provider',
        latencyMs: 15,
        usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
      };
    },
  };

  beforeEach(() => {
    receivedRequests = [];
    receivedStreamingRequests = [];
    router = new ModelRouter();
    // Register the instrumented mock provider
    router.registerCustomAdapter('mock-audit-provider', mockProvider, ['mock-test-model']);
  });

  it('redacts secrets in non-streaming chat requests before outbound provider transmission', async () => {
    const rawUserMessage = `
      Please inspect my configuration:
      OPENAI_API_KEY=sk-proj-123456789012345678901234567890
      JWT_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
      PRIVATE_KEY:
      -----BEGIN RSA PRIVATE KEY-----
      MIIEowIBAAKCAQEA0mock
      -----END RSA PRIVATE KEY-----
    `;

    await router.generateContent({
      model: 'mock-test-model',
      messages: [{ role: 'user', content: rawUserMessage }],
      systemInstruction: 'Use key AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6 for Google verification',
    });

    // Inspect the ACTUAL payload received by the provider adapter
    expect(receivedRequests.length).toBe(1);
    const outboundRequest = receivedRequests[0];
    const outboundContent = outboundRequest.messages[0]?.content || '';

    // Verify secrets are strictly absent from outbound transmission
    expect(outboundContent).not.toContain('sk-proj-1234567890');
    expect(outboundContent).not.toContain('eyJhbGciOiJIUzI1Ni');
    expect(outboundContent).not.toContain('MIIEowIBAAKCAQEA0mock');

    // Verify redaction markers are present
    expect(outboundContent).toContain('[REDACTED_SECRET]');
    expect(outboundContent).toContain('[REDACTED_JWT]');
    expect(outboundContent).toContain('[REDACTED_PRIVATE_KEY]');

    // Verify system instructions are also redacted
    expect(outboundRequest.systemInstruction).not.toContain('AIzaSyA1B2C3D4');
    expect(outboundRequest.systemInstruction).toContain('[REDACTED_SECRET]');
  });

  it('redacts secrets in streaming chat requests before outbound provider transmission', async () => {
    const rawPrompt = 'Connecting to AWS with key AKIAIOSFODNN7EXAMPLE and Stripe sk_test_51Abcd1234567890abcdef123456';
    const streamedChunks: string[] = [];

    await router.generateContentStream(
      {
        model: 'mock-test-model',
        messages: [{ role: 'user', content: rawPrompt }],
      },
      (chunk) => {
        streamedChunks.push(chunk);
      }
    );

    // Verify the outbound payload received by the streaming provider
    expect(receivedStreamingRequests.length).toBe(1);
    const outboundContent = receivedStreamingRequests[0].messages[0]?.content || '';

    expect(outboundContent).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(outboundContent).not.toContain('sk_test_51Abcd1234567890abcdef123456');
    expect(outboundContent).toContain('[REDACTED_SECRET]');

    // Verify streamed chunks do not leak raw credentials
    const fullStreamed = streamedChunks.join('');
    expect(fullStreamed).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(fullStreamed).not.toContain('sk_test_51Abcd1234567890abcdef123456');
    expect(fullStreamed).toContain('[REDACTED_SECRET]');
  });

  it('redacts secrets emitted by external model responses before delivering to client', async () => {
    // Adapter simulates a model accidentally regurgitating a secret in its response
    const leakyProvider: AIProviderAdapter = {
      id: 'mock-leaky-provider',
      name: 'Mock Leaky Provider',
      isConfigured: () => true,
      generateContent: async () => ({
        text: 'Here is your token: ghp_1234567890abcdef1234567890123456',
        model: 'mock-leaky-model',
        provider: 'mock-leaky-provider',
        latencyMs: 5,
        usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
      }),
    };

    router.registerCustomAdapter('mock-leaky-provider', leakyProvider, ['mock-leaky-model']);

    const response = await router.generateContent({
      model: 'mock-leaky-model',
      messages: [{ role: 'user', content: 'What is my token?' }],
    });

    expect(response.text).not.toContain('ghp_1234567890abcdef');
    expect(response.text).toContain('[REDACTED_SECRET]');
  });
});
