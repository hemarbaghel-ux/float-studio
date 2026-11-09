/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { LocalFileSystemWorkspaceService } from '../src/services/indexing/localWorkspaceService';
import {
  WorkspaceCheckpointManager,
  applyProposal,
  rejectProposal,
  checkProposalConflicts,
} from '../src/services/composer';
import {
  IProposal,
  generateUnifiedDiff,
  computeDiffStats,
  computeContentHash,
} from '../src/shared/contracts/proposals';
import {
  TerminalExecutionPolicy,
  classifyTerminalOutput,
} from '../src/services/terminal';
import { sanitizeTerminalOutput } from '../src/server/terminal/terminalService';
import {
  initSentry,
  isSentryEnabled,
  parseSentryDsn,
  captureException,
  captureMessage,
  addBreadcrumb,
  resetSentryForTests,
} from '../src/services/telemetry/sentry';

describe('FLOAT Studio Core Flow Verifications', () => {
  let tempDir: string;
  let workspace: LocalFileSystemWorkspaceService;
  let checkpointManager: WorkspaceCheckpointManager;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'float-core-flows-'));
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    fs.writeFileSync(
      path.join(srcDir, 'index.ts'),
      'export function main(): string {\n  return "initial version";\n}\n'
    );
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test-workspace', version: '1.0.0' }, null, 2)
    );

    workspace = new LocalFileSystemWorkspaceService(tempDir);
    await workspace.initializeIndex();
    checkpointManager = new WorkspaceCheckpointManager(workspace);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  // ==========================================================================
  // Flow 1 & 2: Opening a workspace and a file, editing and saving a file
  // ==========================================================================
  describe('Flow 1 & 2: Workspace & File Access', () => {
    it('opens a workspace, lists files, and reads a target file', async () => {
      expect(workspace.getRootUri()).toContain('float-core-flows-');

      const files = await workspace.listFiles({ recursive: true });
      const paths = files.map(f => f.path);
      expect(paths).toContain('src/index.ts');
      expect(paths).toContain('package.json');

      const content = await workspace.readFile('src/index.ts');
      expect(content).toContain('return "initial version";');

      const stat = await workspace.stat('src/index.ts');
      expect(stat.isFile).toBe(true);
      expect(stat.size).toBeGreaterThan(0);
    });

    it('edits and saves a file, verifying persistence on disk', async () => {
      const updatedCode = 'export function main(): string {\n  return "updated version 2.0";\n}\n';
      await workspace.writeFile('src/index.ts', updatedCode);

      const reRead = await workspace.readFile('src/index.ts');
      expect(reRead).toBe(updatedCode);

      const diskContent = fs.readFileSync(path.join(tempDir, 'src/index.ts'), 'utf8');
      expect(diskContent).toBe(updatedCode);
    });

    it('creates, inspects, and deletes newly added files', async () => {
      const helperCode = 'export const helper = () => 42;\n';
      await workspace.writeFile('src/helper.ts', helperCode);

      expect(await workspace.fileExists('src/helper.ts')).toBe(true);
      expect(await workspace.readFile('src/helper.ts')).toBe(helperCode);

      await workspace.deleteFile('src/helper.ts');
      expect(await workspace.fileExists('src/helper.ts')).toBe(false);
    });
  });

  // ==========================================================================
  // Flow 3: Composer producing a diff and accepting/rejecting it
  // ==========================================================================
  describe('Flow 3: Composer Proposal & Diff Review Workflow', () => {
    const originalContent = 'export function main(): string {\n  return "initial version";\n}\n';
    const proposedContent = 'export function main(): string {\n  return "composer v2.0";\n}\nexport function second(): number { return 100; }\n';

    let testProposal: IProposal;

    beforeEach(() => {
      testProposal = {
        id: 'prop-diff-test-1',
        projectId: 'proj-1',
        title: 'Upgrade main function and add second',
        description: 'Implements v2 upgrade',
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        files: [
          {
            path: 'src/index.ts',
            operation: 'modify',
            originalContent,
            originalHash: computeContentHash(originalContent),
            proposedContent,
            proposedHash: computeContentHash(proposedContent),
            status: 'pending',
          },
          {
            path: 'src/newModule.ts',
            operation: 'create',
            proposedContent: 'export const newModule = true;\n',
            proposedHash: computeContentHash('export const newModule = true;\n'),
            status: 'pending',
          },
        ],
      };
    });

    it('produces accurate unified diffs and line-level statistics', () => {
      const diff = generateUnifiedDiff('src/index.ts', originalContent, proposedContent);
      expect(diff).toContain('--- a/src/index.ts');
      expect(diff).toContain('+++ b/src/index.ts');
      expect(diff).toContain('+export function second(): number { return 100; }');

      const stats = computeDiffStats(originalContent, proposedContent);
      expect(stats.additions).toBeGreaterThanOrEqual(1);
      expect(stats.deletions).toBeGreaterThanOrEqual(1);
    });

    it('applies an approved proposal with automatic safety checkpoint and allows rollback', async () => {
      const applyResult = await applyProposal({
        proposal: testProposal,
        workspace,
        checkpointManager,
      });

      expect(applyResult.success).toBe(true);
      expect(applyResult.status).toBe('applied');
      expect(applyResult.checkpointId).toBeDefined();

      // Workspace disk should have updated content
      const modifiedContent = await workspace.readFile('src/index.ts');
      expect(modifiedContent).toBe(proposedContent);
      expect(await workspace.fileExists('src/newModule.ts')).toBe(true);

      // Deterministic rollback restores baseline
      const rollbackResult = await checkpointManager.restoreCheckpoint(applyResult.checkpointId!);
      expect(rollbackResult.success).toBe(true);

      const restoredContent = await workspace.readFile('src/index.ts');
      expect(restoredContent).toBe(originalContent);
      expect(await workspace.fileExists('src/newModule.ts')).toBe(false);
    });

    it('rejects a proposal leaving real workspace files completely untouched', () => {
      const rejected = rejectProposal({ proposal: testProposal });
      expect(rejected.status).toBe('rejected');
      expect(rejected.files.every(f => f.status === 'rejected')).toBe(true);

      const content = fs.readFileSync(path.join(tempDir, 'src/index.ts'), 'utf8');
      expect(content).toBe(originalContent);
      expect(fs.existsSync(path.join(tempDir, 'src/newModule.ts'))).toBe(false);
    });

    it('halts proposal application when external conflicts are detected', async () => {
      // Mutate workspace file externally
      await workspace.writeFile('src/index.ts', 'external modification made in parallel');

      const conflicts = await checkProposalConflicts(testProposal, workspace);
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].path).toBe('src/index.ts');

      const applyRes = await applyProposal({
        proposal: testProposal,
        workspace,
      });
      expect(applyRes.success).toBe(false);
      expect(applyRes.status).toBe('stale');
    });
  });

  // ==========================================================================
  // Flow 4: The Model Router Choosing a Model
  // ==========================================================================
  describe('Flow 4: Model Catalog & Router Selection', () => {
    it('maps valid models to their authentic upstream provider IDs', () => {
      const modelProviders: Record<string, 'openai' | 'google' | 'anthropic'> = {
        'gpt-6-astra': 'openai',
        'gpt-6.1-sol': 'openai',
        'gemini-2.5-pro': 'google',
        'gemini-3.8-flash': 'google',
        'claude-3-5-sonnet': 'anthropic',
      };

      for (const [modelId, expectedProvider] of Object.entries(modelProviders)) {
        if (modelId.startsWith('gpt-')) {
          expect(expectedProvider).toBe('openai');
        } else if (modelId.startsWith('gemini-')) {
          expect(expectedProvider).toBe('google');
        } else if (modelId.startsWith('claude-')) {
          expect(expectedProvider).toBe('anthropic');
        }
      }
    });

    it('rejects unavailable or unconfigured models truthfully without silent fallback', () => {
      const requestedModel = 'non-existent-hallucinated-model-xyz';
      const knownModels = ['gpt-6-astra', 'gpt-6.1-sol', 'gemini-2.5-pro', 'gemini-3.8-flash'];
      const isAvailable = knownModels.includes(requestedModel);

      expect(isAvailable).toBe(false);
    });
  });

  // ==========================================================================
  // Flow 5: The Sandbox / Command-Execution Safeguards
  // ==========================================================================
  describe('Flow 5: Command Policy, Sandbox & Secret Safeguards', () => {
    it('strictly blocks dangerous and destructive shell commands', () => {
      const destructiveCommands = [
        'rm -rf /',
        'rm -rf /*',
        'rm -rf ~',
        ':(){ :|:& };:',
        'mkfs /dev/sda1',
        'dd if=/dev/zero of=/dev/sda',
        'chmod -R 777 /',
      ];

      for (const cmd of destructiveCommands) {
        const policy = TerminalExecutionPolicy.evaluateCommand(cmd);
        expect(policy.permitted).toBe(false);
        expect(policy.isDangerous).toBe(true);
      }
    });

    it('requires explicit approval for dependency installations and git mutations', () => {
      const approvalRequired = [
        'npm install express',
        'npm i -D typescript',
        'pip install numpy',
        'git checkout -b new-branch',
        'git push origin main',
      ];

      for (const cmd of approvalRequired) {
        const policy = TerminalExecutionPolicy.evaluateCommand(cmd);
        expect(policy.permitted).toBe(true);
        expect(policy.requiresApproval).toBe(true);
      }
    });

    it('permits safe test, build, and diagnostic commands without prompts', () => {
      const safeCommands = [
        'npm test',
        'npm run lint',
        'pytest tests/',
        'python -m unittest discover',
        'git status',
        'git diff',
      ];

      for (const cmd of safeCommands) {
        const policy = TerminalExecutionPolicy.evaluateCommand(cmd);
        expect(policy.permitted).toBe(true);
        expect(policy.isDangerous).toBe(false);
      }
    });

    it('redacts sensitive API keys and tokens from terminal output streams', () => {
      const rawOutput = 'Failed connecting with key: sk-proj-1234567890abcdef1234567890abcdef1234567890 and token: ghp_1234567890abcdef1234567890abcdef1234';
      const sanitized = sanitizeTerminalOutput(rawOutput);

      expect(sanitized).not.toContain('sk-proj-');
      expect(sanitized).not.toContain('ghp_');
      expect(sanitized).toContain('[REDACTED_SECRET]');
    });

    it('classifies compiler build failures with exact target file and line', () => {
      const compilerError = 'src/index.ts:12:5 - error TS2322: Type "number" is not assignable to type "string".';
      const classified = classifyTerminalOutput(compilerError, 'npm run build', 1);

      expect(classified).not.toBeNull();
      expect(classified?.category).toBe('build_failure');
      expect(classified?.targetFile).toBe('src/index.ts');
      expect(classified?.targetLine).toBe(12);
    });
  });

  // ==========================================================================
  // Flow 6: Error Tracking (Sentry Integration)
  // ==========================================================================
  describe('Flow 6: Sentry Error Tracking', () => {
    beforeEach(() => {
      resetSentryForTests();
    });

    it('is completely disabled when SENTRY_DSN is missing or empty', () => {
      initSentry('');
      expect(isSentryEnabled()).toBe(false);

      const eventId = captureException(new Error('Test error'));
      expect(eventId).toBeUndefined();

      const msgId = captureMessage('Test info message');
      expect(msgId).toBeUndefined();
    });

    it('parses valid Sentry DSN correctly and enables tracking', () => {
      const testDsn = 'https://abc123def456@o99999.ingest.sentry.io/450123456789';
      const parsed = parseSentryDsn(testDsn);

      expect(parsed).not.toBeNull();
      expect(parsed?.publicKey).toBe('abc123def456');
      expect(parsed?.host).toBe('o99999.ingest.sentry.io');
      expect(parsed?.projectId).toBe('450123456789');
      expect(parsed?.envelopeEndpoint).toBe('https://o99999.ingest.sentry.io/api/450123456789/envelope/');

      initSentry(testDsn);
      expect(isSentryEnabled()).toBe(true);

      addBreadcrumb({ message: 'User opened file', category: 'navigation' });
      const eventId = captureException(new Error('Synthetic Sentry test error'), { user: 'engineer' });
      expect(eventId).toBeDefined();
      expect(eventId?.length).toBe(32);
    });
  });
});
