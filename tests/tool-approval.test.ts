/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CanonicalToolRegistry,
  IToolDefinition,
  createToolApprovalToken,
  computeToolParamsHash,
  clearConsumedApprovalTokensForTests,
  ToolExecutionContext,
} from '../src/shared/contracts/tools';
import { ToolApprovalService } from '../src/server/composer/toolApprovalService';

describe('Tool Approval Security Engine (Phase 1 SEC-02)', () => {
  let registry: CanonicalToolRegistry;
  let mockContext: ToolExecutionContext;
  let approvalService: ToolApprovalService;
  const mockSecret = 'test-approval-secret-key-12345';

  beforeEach(() => {
    clearConsumedApprovalTokensForTests();
    registry = new CanonicalToolRegistry();
    approvalService = new ToolApprovalService(mockSecret);

    const mockWorkspace: any = {
      getRootUri: () => 'float-workspace://proj-1',
      resolvePath: (p: string) => p,
      readFile: async () => 'content',
      writeFile: async () => {},
      deleteFile: async () => {},
      fileExists: async () => true,
      listFiles: async () => [],
      stat: async () => ({ size: 10, mtime: Date.now(), isFile: true, isDirectory: false }),
      watch: () => () => {},
      getCapabilities: () => ({ canWatch: true, canWrite: true, isLocalDisk: false, maxFileSize: 1000 }),
    };

    mockContext = {
      workspace: mockWorkspace,
      userId: 'user-alice',
      projectId: 'proj-omega',
      approvalSecret: mockSecret,
    };

    const privilegedTool: IToolDefinition = {
      name: 'deploy_production',
      description: 'Deploys artifacts to production environment',
      parametersSchema: { type: 'object', properties: { target: { type: 'string' } } },
      requiresApproval: true,
      async execute(args: any) {
        return {
          toolName: 'deploy_production',
          success: true,
          data: { deployed: true, target: args.target },
          durationMs: 10,
          timestamp: Date.now(),
        };
      },
    };

    registry.register(privilegedTool);
  });

  it('fails closed when an approval-required tool is executed without an approval token', async () => {
    const result = await registry.execute('deploy_production', { target: 'us-east-1' }, mockContext);
    expect(result.success).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(result.error).toContain('requires explicit user approval');
  });

  it('succeeds when a valid cryptographically-signed approval token matching exact parameters is provided', async () => {
    const args = { target: 'us-east-1' };
    const paramsHash = computeToolParamsHash(args);
    const token = createToolApprovalToken(
      {
        actionId: 'act-12345',
        toolName: 'deploy_production',
        paramsHash,
        userId: 'user-alice',
        projectId: 'proj-omega',
        expiresInMs: 60_000,
      },
      mockSecret
    );

    const contextWithToken: ToolExecutionContext = {
      ...mockContext,
      approvalToken: token,
    };

    const result = await registry.execute('deploy_production', args, contextWithToken);
    expect(result.success).toBe(true);
    expect(result.data.deployed).toBe(true);
  });

  it('fails if the token parameters hash does not match modified execution arguments', async () => {
    const originalArgs = { target: 'us-east-1' };
    const paramsHash = computeToolParamsHash(originalArgs);
    const token = createToolApprovalToken(
      {
        actionId: 'act-12345',
        toolName: 'deploy_production',
        paramsHash,
        userId: 'user-alice',
        projectId: 'proj-omega',
      },
      mockSecret
    );

    // Caller tampers with args after approval
    const tamperedArgs = { target: 'eu-central-1' };
    const contextWithToken: ToolExecutionContext = {
      ...mockContext,
      approvalToken: token,
    };

    const result = await registry.execute('deploy_production', tamperedArgs, contextWithToken);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Token parameters hash does not match execution arguments');
  });

  it('fails if the token has expired', async () => {
    const args = { target: 'us-east-1' };
    const paramsHash = computeToolParamsHash(args);
    const token = createToolApprovalToken(
      {
        toolName: 'deploy_production',
        paramsHash,
        userId: 'user-alice',
        projectId: 'proj-omega',
        expiresInMs: -1000, // already expired
      },
      mockSecret
    );

    const contextWithToken: ToolExecutionContext = {
      ...mockContext,
      approvalToken: token,
    };

    const result = await registry.execute('deploy_production', args, contextWithToken);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Approval token has expired');
  });

  it('enforces a 5-minute maximum validity ceiling even if a larger expiresInMs is requested', () => {
    const args = { target: 'us-east-1' };
    const paramsHash = computeToolParamsHash(args);
    // Request 1 hour validity (should be clamped to 5 minutes)
    const token = createToolApprovalToken(
      {
        toolName: 'deploy_production',
        paramsHash,
        userId: 'user-alice',
        projectId: 'proj-omega',
        expiresInMs: 60 * 60 * 1000,
      },
      mockSecret
    );

    const [payloadBase64] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
    const maxExpiry = Date.now() + 5 * 60 * 1000 + 1000; // 5 min + 1s tolerance
    expect(payload.expiresAt).toBeLessThanOrEqual(maxExpiry);
  });

  it('prevents replay attacks by rejecting a second execution with the same single-use token', async () => {
    const args = { target: 'us-east-1' };
    const paramsHash = computeToolParamsHash(args);
    const token = createToolApprovalToken(
      {
        toolName: 'deploy_production',
        paramsHash,
        userId: 'user-alice',
        projectId: 'proj-omega',
      },
      mockSecret
    );

    const contextWithToken: ToolExecutionContext = {
      ...mockContext,
      approvalToken: token,
    };

    // First call succeeds and consumes the token
    const firstResult = await registry.execute('deploy_production', args, contextWithToken);
    expect(firstResult.success).toBe(true);

    // Second call with same token must fail
    const replayResult = await registry.execute('deploy_production', args, contextWithToken);
    expect(replayResult.success).toBe(false);
    expect(replayResult.error).toContain('replay attack detected');
  });

  it('rejects tokens signed with an invalid or mismatched secret', async () => {
    const args = { target: 'us-east-1' };
    const paramsHash = computeToolParamsHash(args);
    const forgedToken = createToolApprovalToken(
      {
        toolName: 'deploy_production',
        paramsHash,
        userId: 'user-alice',
        projectId: 'proj-omega',
      },
      'attacker-forged-secret-key'
    );

    const contextWithToken: ToolExecutionContext = {
      ...mockContext,
      approvalToken: forgedToken,
    };

    const result = await registry.execute('deploy_production', args, contextWithToken);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid approval token signature');
  });

  describe('Dedicated ToolApprovalService integration', () => {
    it('generates, verifies, and single-use consumes tokens end-to-end', () => {
      const params = { command: 'npm test', timeoutMs: 15000 };
      const token = approvalService.generateToken({
        actionId: 'action-exec-1',
        toolName: 'run_command',
        params,
        userId: 'user-alice',
        projectId: 'proj-omega',
      });

      // Valid check with matching actionId and params
      const firstCheck = approvalService.verifyAndConsume(token, {
        actionId: 'action-exec-1',
        toolName: 'run_command',
        params,
        userId: 'user-alice',
        projectId: 'proj-omega',
      });
      expect(firstCheck.valid).toBe(true);

      // Replay attempt must fail
      const replayCheck = approvalService.verifyAndConsume(token, {
        actionId: 'action-exec-1',
        toolName: 'run_command',
        params,
        userId: 'user-alice',
        projectId: 'proj-omega',
      });
      expect(replayCheck.valid).toBe(false);
      expect(replayCheck.error).toContain('replay attack detected');
    });

    it('rejects token when actionId does not match expected action', () => {
      const params = { path: 'dist/bundle.js' };
      const token = approvalService.generateToken({
        actionId: 'action-expected',
        toolName: 'delete_file',
        params,
        userId: 'user-alice',
        projectId: 'proj-omega',
      });

      const check = approvalService.verifyAndConsume(token, {
        actionId: 'action-different',
        toolName: 'delete_file',
        params,
        userId: 'user-alice',
        projectId: 'proj-omega',
      });
      expect(check.valid).toBe(false);
      expect(check.error).toContain('does not match requested');
    });
  });
});
