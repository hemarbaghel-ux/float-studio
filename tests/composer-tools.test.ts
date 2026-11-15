/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import {
  sanitizeToolOutputText,
  validateToolArgs,
  createStandardToolRegistry,
} from '../src/services/composer/canonicalTools';
import { generateUnifiedDiff, computeDiffStats } from '../src/shared/contracts/proposals';

describe('Composer Canonical Tools & Diff Engine', () => {
  describe('Secret Sanitization in Tool Outputs', () => {
    it('redacts OpenAI, GitHub, AWS, and Google API keys from tool output text', () => {
      const dirtyOutput = `
        Error connecting to API.
        OpenAI: sk-proj-abc1234567890abcdef12345
        GitHub: ghp_1234567890abcdef123456
        Google: AIzaSyD9876543210abcdefghijklmnop
        AWS: AKIAIOSFODNN7EXAMPLE
      `;

      const clean = sanitizeToolOutputText(dirtyOutput);
      expect(clean).not.toContain('sk-proj-');
      expect(clean).not.toContain('ghp_');
      expect(clean).not.toContain('AIzaSy');
      expect(clean).not.toContain('AKIA');
      expect(clean).toContain('[REDACTED_SECRET]');
    });
  });

  describe('Tool Parameter Validation', () => {
    it('validates read_file parameters', () => {
      expect(validateToolArgs('read_file', { path: 'src/index.ts' })).toBeNull();
      expect(validateToolArgs('read_file', {})).toContain('Missing required parameter "path"');
    });

    it('validates propose_changes parameters', () => {
      expect(validateToolArgs('propose_changes', {
        title: 'Fix typo',
        changes: [{ path: 'a.txt', content: 'hello' }],
      })).toBeNull();

      expect(validateToolArgs('propose_changes', { title: 'Fix typo' })).toContain('Missing required parameter "changes"');
    });
  });

  describe('Unified Diff & Diff Stats Calculation', () => {
    it('generates standard unified diff with line hunks and headers', () => {
      const oldContent = 'line 1\nline 2\nline 3\n';
      const newContent = 'line 1\nline 2 modified\nline 3\n';
      const diff = generateUnifiedDiff('test.ts', oldContent, newContent);

      expect(diff).toContain('--- a/test.ts');
      expect(diff).toContain('+++ b/test.ts');
      expect(diff).toContain('-line 2');
      expect(diff).toContain('+line 2 modified');
    });

    it('computes accurate additions and deletions count', () => {
      const oldContent = 'const a = 1;\nconst b = 2;\n';
      const newContent = 'const a = 1;\nconst b = 3;\nconst c = 4;\n';
      const stats = computeDiffStats(oldContent, newContent);

      expect(stats.additions).toBe(2);
      expect(stats.deletions).toBe(1);
    });
  });

  describe('Standard Tool Registry Initialization', () => {
    it('registers canonical tools: read_file, list_dir, search_codebase, propose_changes, run_command', () => {
      const registry = createStandardToolRegistry();
      expect(registry.get('read_file')).toBeDefined();
      expect(registry.get('list_dir')).toBeDefined();
      expect(registry.get('search_codebase')).toBeDefined();
      expect(registry.get('propose_changes')).toBeDefined();
      expect(registry.get('run_command')).toBeDefined();
    });
  });
});
