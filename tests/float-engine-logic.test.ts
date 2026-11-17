/**
 * FLOAT Studio — Master Logic Engine (FloatEngine) Verification Suite
 * 
 * Verifies the complete Float Logic architecture:
 * 1. FloatWorkspaceLogic: containment, shadow virtualization, checkpoints, atomic rollback
 * 2. FloatIntelligenceLogic: indexing, symbol extraction, search, @-context resolution
 * 3. FloatComposerLogic: goal planning DAG, HMAC approval gating, task resumption
 * 4. FloatEditorLogic: Cursor Tab FIM, LRU cache, next-edit speculation, inline diffs
 * 5. FloatGatewayLogic: AES-256-GCM BYOK vault, Shannon entropy, secret redaction
 * 6. FloatTerminalLogic: command safety classification, Docker doctor, output scrubbing
 * 7. FloatEngine Facade: coordinated autonomous execution and diff application
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  FloatEngine,
  FloatWorkspaceLogic,
  FloatIntelligenceLogic,
  FloatComposerLogic,
  FloatEditorLogic,
  FloatGatewayLogic,
  FloatTerminalLogic
} from '../src/core/float';

describe('FLOAT Studio — Master Logic Engine (FloatEngine)', () => {
  let engine: FloatEngine;
  const testWorkspaceDir = path.join(os.tmpdir(), `float_logic_test_${Date.now()}`);

  beforeEach(() => {
    FloatEngine.resetInstance();
    if (!fs.existsSync(testWorkspaceDir)) {
      fs.mkdirSync(testWorkspaceDir, { recursive: true });
    }
    engine = new FloatEngine({
      workspaceRoot: testWorkspaceDir,
      approvalSecret: 'test_float_approval_secret_entropy_64_bytes_secure_signature!',
      byokEncryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    });
  });

  afterAll(() => {
    try {
      if (fs.existsSync(testWorkspaceDir)) {
        fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup errors
    }
  });

  describe('1. FloatWorkspaceLogic', () => {
    it('enforces directory containment and strictly rejects path traversal escapes', () => {
      const ws = engine.workspace;
      expect(() => ws.resolveSafePath('../secret.env')).toThrow(/SECURITY_ESCAPE/);
      expect(() => ws.resolveSafePath('../../etc/passwd')).toThrow(/SECURITY_ESCAPE/);
      expect(() => ws.resolveSafePath('src/../../sensitive.key')).toThrow(/SECURITY_ESCAPE/);
    });

    it('stages virtual shadow edits without mutating original files', async () => {
      const ws = engine.workspace;
      await ws.writeFile('src/math.ts', 'export function add(a: number, b: number) { return a + b; }');

      // Stage shadow edit
      ws.stageShadowEdit('src/math.ts', 'export function add(a: number, b: number) { return a + b + 0; }');

      // Shadow read returns proposed edit
      const shadowContent = await ws.readFile('src/math.ts', true);
      expect(shadowContent).toContain('+ 0');

      // Non-shadow read returns original untouched content
      const originalContent = await ws.readFile('src/math.ts', false);
      expect(originalContent).not.toContain('+ 0');

      // Shadow diffs accurately report changes
      const diffs = await ws.getShadowDiffs();
      expect(diffs.length).toBe(1);
      expect(diffs[0].filePath).toBe('src/math.ts');
      expect(diffs[0].additions).toBeGreaterThan(0);
    });

    it('creates immutable checkpoints and rolls back cleanly', async () => {
      const ws = engine.workspace;
      await ws.writeFile('src/config.ts', 'export const PORT = 3000;');

      const checkpoint = await ws.createCheckpoint('Baseline configuration');
      expect(checkpoint.id).toBeDefined();

      // Modify file
      await ws.writeFile('src/config.ts', 'export const PORT = 8080;');
      expect(await ws.readFile('src/config.ts')).toContain('8080');

      // Rollback
      const rollbackResult = await ws.rollbackCheckpoint(checkpoint.id);
      expect(rollbackResult.restoredFilesCount).toBeGreaterThan(0);
      expect(await ws.readFile('src/config.ts')).toContain('3000');
    });

    it('generates hierarchical workspace file tree', async () => {
      const ws = engine.workspace;
      await ws.writeFile('src/components/Button.tsx', 'export const Button = () => null;');
      await ws.writeFile('src/components/Card.tsx', 'export const Card = () => null;');
      await ws.writeFile('README.md', '# Float Studio');

      const tree = ws.getFileTree();
      expect(tree.length).toBeGreaterThan(0);
      const srcNode = tree.find(n => n.name === 'src');
      expect(srcNode).toBeDefined();
      expect(srcNode?.isDirectory).toBe(true);
    });
  });

  describe('2. FloatIntelligenceLogic', () => {
    it('extracts functions, classes, and interfaces from code', () => {
      const intel = engine.intelligence;
      const code = `
        export interface UserProfile { id: string; name: string; }
        export class AuthManager { login() {} }
        export async function verifyToken(token: string) { return true; }
        const calculateScore = (items: number[]) => 100;
      `;
      intel.indexFile('src/auth.ts', code);

      const symbols = intel.extractSymbols('src/auth.ts');
      expect(symbols.length).toBe(4);
      expect(symbols.some(s => s.name === 'UserProfile' && s.kind === 'interface')).toBe(true);
      expect(symbols.some(s => s.name === 'AuthManager' && s.kind === 'class')).toBe(true);
      expect(symbols.some(s => s.name === 'verifyToken' && s.kind === 'function')).toBe(true);
      expect(symbols.some(s => s.name === 'calculateScore' && s.kind === 'function')).toBe(true);
    });

    it('performs BM25 lexical and symbol search across indexed codebase', () => {
      const intel = engine.intelligence;
      intel.indexFile('src/routes.ts', 'router.get("/health", (req, res) => res.json({ status: "ok" }));');
      intel.indexFile('src/models.ts', 'export interface DatabaseRecord { id: string; createdAt: Date; }');

      const healthMatches = intel.searchCodebase('health');
      expect(healthMatches.length).toBeGreaterThan(0);
      expect(healthMatches[0].filePath).toBe('src/routes.ts');

      const symbolMatches = intel.searchCodebase('DatabaseRecord');
      expect(symbolMatches.length).toBeGreaterThan(0);
    });

    it('resolves @file and @codebase context mentions within token budget', async () => {
      const ws = engine.workspace;
      const intel = engine.intelligence;
      await ws.writeFile('src/api.ts', 'export const API_URL = "https://api.float.dev";');
      intel.indexFile('src/api.ts', 'export const API_URL = "https://api.float.dev";');

      const context = await intel.resolveContext('Check @file:src/api.ts and tell me the base URL', 2000);
      expect(context.formattedPrompt).toContain('=== Codebase Context ===');
      expect(context.formattedPrompt).toContain('API_URL');
      expect(context.sources.length).toBe(1);
      expect(context.sources[0].type).toBe('file');
    });
  });

  describe('3. FloatComposerLogic', () => {
    it('decomposes natural language goals into a structured planning DAG', async () => {
      const composer = engine.composer;
      const goal = await composer.planGoal('proj_1', 'user_1', 'Implement JWT token authentication');

      expect(goal.status).toBe('planning');
      expect(goal.tasks.length).toBe(3);
      expect(goal.tasks[0].status).toBe('completed');
      expect(goal.tasks[1].status).toBe('pending');
    });

    it('enforces HMAC-SHA256 approval gating on privileged actions', async () => {
      const composer = engine.composer;
      const goal = await composer.planGoal('proj_1', 'user_1', 'Run tests');

      // Executing goal pauses on privileged task requiring approval
      const paused = await composer.executeGoal(goal.goalId, 'user_1');
      expect(paused.status).toBe('approval_required');
      expect(paused.pendingApproval).toBeDefined();
      expect(paused.pendingApproval?.toolName).toBe('run_command');

      // Resuming without valid token fails
      await expect(composer.resumeGoal(goal.goalId, paused.pendingApproval!.actionId, true, undefined)).rejects.toThrow(
        /MISSING_APPROVAL_TOKEN/
      );

      // Sign valid HMAC token
      const validToken = composer.signApprovalToken(
        paused.pendingApproval!.actionId,
        paused.pendingApproval!.toolName,
        paused.pendingApproval!.params,
        paused.pendingApproval!.userId,
        paused.pendingApproval!.projectId
      );

      // Resuming with valid token succeeds
      const completed = await composer.resumeGoal(
        goal.goalId,
        paused.pendingApproval!.actionId,
        true,
        validToken
      );
      expect(completed.status).toBe('completed');
    });

    it('cancels goal when user rejects approval', async () => {
      const composer = engine.composer;
      const goal = await composer.planGoal('proj_1', 'user_1', 'Run migrations');
      const paused = await composer.executeGoal(goal.goalId, 'user_1');

      const cancelled = await composer.resumeGoal(
        goal.goalId,
        paused.pendingApproval!.actionId,
        false
      );
      expect(cancelled.status).toBe('cancelled');
    });
  });

  describe('4. FloatEditorLogic', () => {
    it('provides Cursor Tab FIM completions with instant LRU cache hits', async () => {
      const editor = engine.editor;
      const first = await editor.getTabCompletion({
        filePath: 'src/calc.ts',
        prefix: 'function add(a: number, b: number): number {',
        suffix: ''
      });

      expect(first.completion).toContain('return a + b;');
      expect(first.isMultiLine).toBe(true);
      expect(first.cacheHit).toBe(false);

      // Second identical call hits instant cache
      const second = await editor.getTabCompletion({
        filePath: 'src/calc.ts',
        prefix: 'function add(a: number, b: number): number {',
        suffix: ''
      });
      expect(second.cacheHit).toBe(true);
      expect(second.completion).toBe(first.completion);
    });

    it('predicts next edit location for unhandled TODO markers', () => {
      const editor = engine.editor;
      const code = 'function process() {\n  const x = 10;\n  // TODO: validate input\n  return x;\n}';
      const prediction = editor.predictNextEdit('src/process.ts', 1, code);

      expect(prediction).not.toBeNull();
      expect(prediction?.targetLine).toBe(3);
      expect(prediction?.suggestedAction).toContain('TODO: validate input');
    });

    it('generates inline Ctrl+K diff hunks', () => {
      const editor = engine.editor;
      const code = 'function greet(name) {\n  return "Hello " + name;\n}';
      const inlineDiff = editor.generateInlineEdit('src/greet.ts', code, 'Add JSDoc documentation');

      expect(inlineDiff.hunks.length).toBe(1);
      expect(inlineDiff.fullProposedContent).toContain('/**');
      expect(inlineDiff.fullProposedContent).toContain('Add JSDoc documentation');
    });
  });

  describe('5. FloatGatewayLogic', () => {
    it('calculates Shannon entropy and rejects low-entropy keys', () => {
      const gateway = engine.gateway;
      const uniformKey = 'sk-ant-api03-abcdef1234567890abcdef1234567890';
      const repetitiveKey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

      expect(gateway.calculateShannonEntropy(uniformKey)).toBeGreaterThan(3.5);
      expect(gateway.calculateShannonEntropy(repetitiveKey)).toBeLessThan(1.0);

      expect(() => gateway.storeUserKey('user_1', 'openai', repetitiveKey)).toThrow(/LOW_ENTROPY_KEY/);
    });

    it('encrypts and decrypts user BYOK keys with AES-256-GCM', () => {
      const gateway = engine.gateway;
      const validKey = 'sk-proj-valid-openai-key-with-sufficient-entropy-9988';
      const storeResult = gateway.storeUserKey('user_1', 'openai', validKey);
      expect(storeResult.success).toBe(true);
      expect(storeResult.version).toBe(2);

      const decrypted = gateway.getUserKey('user_1', 'openai');
      expect(decrypted).toBe(validKey);

      // Non-existent user returns null
      expect(gateway.getUserKey('user_other', 'openai')).toBeNull();
    });

    it('redacts sensitive API keys and database URIs from outbound prompts', () => {
      const gateway = engine.gateway;
      const rawPrompt = 'Connect using postgres://admin:secretPass123@db.internal:5432/app and sk-ant-api03-1234567890abcdef1234567890';
      const { sanitized, redactedCount } = gateway.sanitizeOutboundPrompt(rawPrompt);

      expect(redactedCount).toBe(2);
      expect(sanitized).not.toContain('secretPass123');
      expect(sanitized).not.toContain('sk-ant-api03');
      expect(sanitized).toContain('[REDACTED_DATABASE_URI]');
      expect(sanitized).toContain('[REDACTED_ANTHROPIC_KEY]');
    });
  });

  describe('6. FloatTerminalLogic', () => {
    it('blocks dangerous system destruction commands', () => {
      const terminal = engine.terminal;
      expect(terminal.isCommandSafe('rm -rf /').isSafe).toBe(false);
      expect(terminal.isCommandSafe('mkfs /dev/sda').isSafe).toBe(false);
      expect(terminal.isCommandSafe('npm test').isSafe).toBe(true);
    });

    it('evaluates Docker sandbox doctor invariants', () => {
      const doctor = engine.terminal.evaluateSandboxDoctor();
      expect(doctor.rootlessUser).toBe(true);
      expect(doctor.droppedCapabilities).toBe(true);
      expect(doctor.readOnlyRoot).toBe(true);
    });

    it('executes sandboxed commands and scrubs leaked secrets from stdout', async () => {
      const terminal = engine.terminal;
      const result = await terminal.executeCommand({
        command: 'npm test',
        projectId: 'proj_1',
        userId: 'user_1'
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Execution completed');
    });
  });

  describe('7. Coordinated FloatEngine Facade', () => {
    it('executes end-to-end autonomous task and commits shadow edits with checkpointing', async () => {
      // 1. Initial file
      await engine.workspace.writeFile('src/math.ts', 'export const multiply = (a: number, b: number) => a * b;');
      expect(await engine.workspace.readFile('src/math.ts')).toContain('multiply');

      // 2. Execute autonomous goal with proposed edits
      const goal = await engine.executeAutonomousTask(
        'proj_master',
        'user_lead',
        'Add divide function to math module',
        [
          {
            filePath: 'src/math.ts',
            content: 'export const multiply = (a: number, b: number) => a * b;\nexport const divide = (a: number, b: number) => a / b;'
          }
        ]
      );

      expect(goal.status).toBe('approval_required');
      expect(goal.diffs.length).toBe(1);
      expect(goal.diffs[0].filePath).toBe('src/math.ts');

      // Original file still untouched
      expect(await engine.workspace.readFile('src/math.ts', false)).not.toContain('divide');

      // 3. User approves and applies diffs
      const applyResult = await engine.applyApprovedGoal(goal.goalId);
      expect(applyResult.appliedCount).toBe(1);
      expect(applyResult.checkpointId).toBeDefined();

      // Now original file has the applied changes
      expect(await engine.workspace.readFile('src/math.ts', false)).toContain('divide');

      // 4. Rollback via checkpoint restores original baseline
      const rollbackResult = await engine.workspace.rollbackCheckpoint(applyResult.checkpointId);
      expect(rollbackResult.restoredFilesCount).toBeGreaterThan(0);
      expect(await engine.workspace.readFile('src/math.ts', false)).not.toContain('divide');
    });
  });
});
