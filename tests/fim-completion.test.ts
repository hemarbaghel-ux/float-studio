/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach } from 'vitest';
import { FimCompletionEngine } from '../src/services/completion/fimCompletionEngine';

describe('FimCompletionEngine (Cursor Tab Parity)', () => {
  let engine: FimCompletionEngine;

  beforeEach(() => {
    engine = new FimCompletionEngine();
  });

  describe('Template Detection', () => {
    it('detects deepseek and qwen model families', () => {
      expect(engine.detectFimTemplate('deepseek-coder-6.7b')).toBe('deepseek');
      expect(engine.detectFimTemplate('qwen2.5-coder-7b')).toBe('deepseek');
      expect(engine.detectFimTemplate('float-fim-local')).toBe('deepseek');
    });

    it('detects starcoder family', () => {
      expect(engine.detectFimTemplate('starcoder2-15b')).toBe('starcoder');
      expect(engine.detectFimTemplate('santacoder')).toBe('starcoder');
    });

    it('detects codellama family', () => {
      expect(engine.detectFimTemplate('codellama-34b')).toBe('codellama');
    });

    it('defaults to chat for general conversational models', () => {
      expect(engine.detectFimTemplate('gpt-4o-mini')).toBe('chat');
      expect(engine.detectFimTemplate('claude-3-5-sonnet-20241022')).toBe('chat');
    });
  });

  describe('Prompt Formatting', () => {
    it('formats DeepSeek FIM tokens accurately', () => {
      const res = engine.formatFimPrompt('const a = 1;', 'console.log(a);', 'deepseek-coder');
      expect(res.template).toBe('deepseek');
      expect(res.prompt).toBe('<｜fim begin｜>const a = 1;<｜fim hole｜>console.log(a);<｜fim end｜>');
      expect(res.stopTokens).toContain('<｜fim end｜>');
    });

    it('formats StarCoder FIM tokens accurately', () => {
      const res = engine.formatFimPrompt('def add(a, b):', 'return res', 'starcoder');
      expect(res.template).toBe('starcoder');
      expect(res.prompt).toBe('<fim_prefix>def add(a, b):<fim_suffix>return res<fim_middle>');
      expect(res.stopTokens).toContain('<fim_middle>');
    });

    it('formats CodeLlama tokens accurately', () => {
      const res = engine.formatFimPrompt('function run() {', '}', 'codellama');
      expect(res.template).toBe('codellama');
      expect(res.prompt).toBe('<PRE> function run() { <SUF>} <MID>');
      expect(res.stopTokens).toContain('<EOT>');
    });
  });

  describe('Speculative Keystroke Prediction', () => {
    it('returns instantaneous completion when user types matching keystrokes', () => {
      const fileName = 'test.ts';
      const initialPrefix = 'function calculateSum(';
      const initialSuffix = ') {\n}';
      const fullPrediction = 'a: number, b: number';

      engine.recordSpeculative(fileName, initialPrefix, initialSuffix, fullPrediction);

      // User types 'a'
      const match1 = engine.matchSpeculativeKeystroke(fileName, 'function calculateSum(a', initialSuffix);
      expect(match1).toBe(': number, b: number');

      // User types ': number'
      const match2 = engine.matchSpeculativeKeystroke(fileName, 'function calculateSum(a: number', initialSuffix);
      expect(match2).toBe(', b: number');

      // User types something deviating
      const matchMismatch = engine.matchSpeculativeKeystroke(fileName, 'function calculateSum(x', initialSuffix);
      expect(matchMismatch).toBeNull();
    });
  });

  describe('Suffix Deduplication and Output Cleaning', () => {
    it('deduplicates redundant closing tokens already present in suffix', () => {
      const completion = 'const x = Math.sqrt(4);';
      const suffix = '; \n console.log(x);';
      const deduplicated = engine.deduplicateSuffix(completion, suffix);
      expect(deduplicated).toBe('const x = Math.sqrt(4)');
    });

    it('cleans accidental markdown code fences from model completions', () => {
      const raw = '```typescript\nconst message = "hello";\n```';
      expect(engine.cleanCompletionOutput(raw).trim()).toBe('const message = "hello";');
    });

    it('strips leaked FIM special tokens', () => {
      const raw = 'function test() {}<｜fim end｜>';
      expect(engine.cleanCompletionOutput(raw)).toBe('function test() {}');
    });
  });

  describe('Full Complete Flow with Mock Router', () => {
    it('executes completion using fallback router when no direct FIM endpoint is set', async () => {
      const mockRouter = {
        generateContent: async () => ({
          text: 'return x * 2;\n}',
        }),
      };

      const res = await engine.complete(
        {
          prefix: 'function double(x: number) {\n  ',
          suffix: '\n',
          fileName: 'calc.ts',
          model: 'gpt-4o-mini',
        },
        { modelRouter: mockRouter }
      );

      expect(res.completion).toContain('return x * 2');
      expect(res.speculativeCacheHit).toBe(false);

      // Second call matching the typed characters hits speculative cache with 0ms latency
      const cachedRes = await engine.complete(
        {
          prefix: 'function double(x: number) {\n  ret',
          suffix: '\n',
          fileName: 'calc.ts',
          model: 'gpt-4o-mini',
        },
        { modelRouter: mockRouter }
      );

      expect(cachedRes.speculativeCacheHit).toBe(true);
      expect(cachedRes.latencyMs).toBe(0);
      expect(cachedRes.completion).toBe('urn x * 2;\n}');
    });
  });
});
