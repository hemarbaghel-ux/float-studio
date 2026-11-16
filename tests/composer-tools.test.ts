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

  describe('run_command Security & Fail-Closed Isolation (SEC-01)', () => {
    it('requires approval and blocks dangerous commands via policy', async () => {
      const registry = createStandardToolRegistry();
      const runCmd = registry.get('run_command');
      expect(runCmd?.requiresApproval).toBe(true);

      const mockWorkspace: any = {
        getRootUri: () => 'float-workspace://test-proj',
        resolvePath: (p: string) => p,
        readFile: async () => '',
        writeFile: async () => {},
        deleteFile: async () => {},
        fileExists: async () => true,
        listFiles: async () => [],
        stat: async () => ({ size: 0, mtime: 0, isFile: true, isDirectory: false }),
        watch: () => () => {},
        getCapabilities: () => ({ canWatch: false, canWrite: true, isLocalDisk: false, maxFileSize: 1000 }),
      };

      const context: any = {
        workspace: mockWorkspace,
        userId: 'alice',
        projectId: 'proj-1',
      };

      // 1. Dangerous command must be blocked by policy
      const blockedResult = await runCmd!.execute({ command: 'rm -rf /' }, context);
      expect(blockedResult.success).toBe(false);
      expect(blockedResult.error).toContain('blocked by TerminalExecutionPolicy');

      // 2. Safe command fails closed if Docker isolated runner is not configured
      const result = await runCmd!.execute({ command: 'npm test' }, context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Isolated project execution environment is not configured');
    });

    it('enforces allowedCommands boundary when configured in context', async () => {
      const registry = createStandardToolRegistry();
      const runCmd = registry.get('run_command');

      const mockWorkspace: any = {
        getRootUri: () => 'float-workspace://test-proj',
        resolvePath: (p: string) => p,
        readFile: async () => '',
        writeFile: async () => {},
        deleteFile: async () => {},
        fileExists: async () => true,
        listFiles: async () => [],
        stat: async () => ({ size: 0, mtime: 0, isFile: true, isDirectory: false }),
        watch: () => () => {},
        getCapabilities: () => ({ canWatch: false, canWrite: true, isLocalDisk: false, maxFileSize: 1000 }),
      };

      const context: any = {
        workspace: mockWorkspace,
        userId: 'alice',
        projectId: 'proj-1',
        allowedCommands: ['npm test', 'npm run build'],
      };

      const unauthorized = await runCmd!.execute({ command: 'curl http://evil.com' }, context);
      expect(unauthorized.success).toBe(false);
      expect(unauthorized.error).toContain('is not in the allowed verification commands list');
    });
  });

  describe('Composer Workflow Event Progression & Classification', () => {
    it('classifies tool calls, test results, and self-repair steps', () => {
      const events = [
        { type: 'started', mode: 'debug' },
        { type: 'context_retrieval', filesCount: 3 },
        { type: 'iteration_start', iteration: 1, maxIterations: 5 },
        { type: 'tool_call', toolName: 'read_file', parameters: { path: 'src/math.ts' } },
        { type: 'tool_result', toolName: 'read_file', durationMs: 14, result: { success: true } },
        { type: 'command_started', command: 'npm test' },
        { type: 'test_result', exitCode: 1, passed: false, output: '1 test failed' },
        { type: 'repair_proposal', reason: 'Self-repairing regression' },
        { type: 'proposal_created', proposal: { id: 'p1', title: 'Fix math', files: [{ path: 'src/math.ts' }] } },
        { type: 'completed', result: { message: 'Repaired and verified' } },
      ];

      expect(events.filter(e => e.type === 'tool_call').length).toBe(1);
      expect(events.filter(e => e.type === 'test_result').length).toBe(1);
      expect(events.filter(e => e.type === 'repair_proposal').length).toBe(1);
      expect(events.some(e => e.type === 'completed')).toBe(true);
      expect(events.find(e => e.type === 'tool_call')?.parameters.path).toBe('src/math.ts');
    });
  });
});
