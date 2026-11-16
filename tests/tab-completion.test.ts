/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach } from 'vitest';
import { TabCompletionCoordinator } from '../src/services/completion/tabCompletionService';

describe('TabCompletionCoordinator (Cursor Tab Parity)', () => {
  let coordinator: TabCompletionCoordinator;

  beforeEach(() => {
    coordinator = new TabCompletionCoordinator();
  });

  describe('Policy Management & Language Filtering', () => {
    it('allows completions by default for standard languages', () => {
      expect(coordinator.isAllowedForLanguage('typescript')).toBe(true);
      expect(coordinator.isAllowedForLanguage('python')).toBe(true);
      expect(coordinator.isAllowedForLanguage('rust')).toBe(true);
    });

    it('blocks completions when globally disabled', () => {
      coordinator.setPolicy({ enabled: false });
      expect(coordinator.isAllowedForLanguage('typescript')).toBe(false);
      expect(coordinator.isAllowedForLanguage('python')).toBe(false);
    });

    it('blocks disabled languages according to policy', () => {
      coordinator.setPolicy({ disabledLanguages: ['plaintext', 'markdown'] });
      expect(coordinator.isAllowedForLanguage('plaintext')).toBe(false);
      expect(coordinator.isAllowedForLanguage('markdown')).toBe(false);
      expect(coordinator.isAllowedForLanguage('typescript')).toBe(true);
    });
  });

  describe('Cache Key Construction & In-Memory Caching', () => {
    it('constructs deterministic cache keys based on bounded prefix and suffix', () => {
      const key1 = coordinator.buildCacheKey('index.ts', 'typescript', 'const a = 1;', '\nconsole.log(a);');
      const key2 = coordinator.buildCacheKey('index.ts', 'typescript', 'const a = 1;', '\nconsole.log(a);');
      const key3 = coordinator.buildCacheKey('other.ts', 'typescript', 'const a = 1;', '\nconsole.log(a);');

      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
    });

    it('stores completion and returns cache hit with 0ms latency', () => {
      const key = coordinator.buildCacheKey('src/main.ts', 'typescript', 'function hello() {', '}');
      const prediction = coordinator.recordCompletion(key, '  return "world";', 'src/main.ts', '}', 120);

      expect(prediction.completionText).toBe('  return "world";');
      expect(prediction.cacheHit).toBe(false);
      expect(prediction.latencyMs).toBe(120);

      // Subsequent query should hit cache
      const cached = coordinator.getCached(key);
      expect(cached).toBeDefined();
      expect(cached?.completionText).toBe('  return "world";');
      expect(cached?.cacheHit).toBe(true);
      expect(cached?.latencyMs).toBe(0);

      const metrics = coordinator.getMetrics();
      expect(metrics.cacheHits).toBe(1);
      expect(metrics.totalRequests).toBe(2);
    });

    it('parses multi-line completions and partial word/line acceptance', () => {
      const key = coordinator.buildCacheKey('test.py', 'python', 'def add(a, b):', '');
      const prediction = coordinator.recordCompletion(
        key,
        '    """Add two numbers."""\n    return a + b',
        'test.py',
        '',
        150
      );

      expect(prediction.isMultiLine).toBe(true);
      expect(prediction.partialLineAcceptText).toBe('    """Add two numbers."""');
      expect(prediction.partialWordAcceptText).toBe('    """Add');
    });

    it('detects follow-up TODO marker jump in suffix', () => {
      const key = coordinator.buildCacheKey('service.ts', 'typescript', 'const user = fetchUser();', '\n\n// TODO: handle null user');
      const prediction = coordinator.recordCompletion(
        key,
        '\nif (!user) throw new Error();',
        'service.ts',
        '\n\n// TODO: handle null user',
        80
      );

      expect(prediction.nextEditJump).toBeDefined();
      expect(prediction.nextEditJump?.reason).toContain('TODO marker detected');
      expect(prediction.nextEditJump?.targetLine).toBe(4);
    });
  });

  describe('Acceptance & Telemetry Metrics', () => {
    it('tracks acceptances, rejections, and cancellations accurately', () => {
      coordinator.recordAcceptance(true);
      coordinator.recordAcceptance(true);
      coordinator.recordAcceptance(false);
      coordinator.recordCancellation();

      const metrics = coordinator.getMetrics();
      expect(metrics.acceptedCount).toBe(2);
      expect(metrics.rejectedCount).toBe(1);
      expect(metrics.cancelledCount).toBe(1);
    });
  });
});
