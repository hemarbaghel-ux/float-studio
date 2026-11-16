/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CanonicalToolRegistry,
  IToolDefinition,
  ToolExecutionContext,
} from '../src/shared/contracts/tools';
import { ToolApprovalService } from '../src/server/composer/toolApprovalService';

describe('Composer End-to-End Tool Approval Lifecycle (Phase 1.1 Task 3)', () => {
  let approvalService: ToolApprovalService;
  let registry: CanonicalToolRegistry;
  let mockContext: ToolExecutionContext;
  const testSecret = 'composer-approval-test-secret-with-high-entropy-32b';

  beforeEach(async () => {
    approvalService = new ToolApprovalService({ secret: testSecret });
    await approvalService.clearConsumedTokens();
    registry = new CanonicalToolRegistry();

    const mockWorkspace: any = {
      getRootUri: () => 'float-workspace://proj-123',
      resolvePath: (p: string) => p,
      readFile: async () => 'code',
      writeFile: async () => {},
      deleteFile: async () => {},
      fileExists: async () => true,
      listFiles: async () => [],
      stat: async () => ({ size: 10, mtime: Date.now(), isFile: true, isDirectory: false }),
    };

    mockContext = {
      workspace: mockWorkspace,
      userId: 'user-charlie',
      projectId: 'proj-123',
      approvalSecret: testSecret,
      nonceStore: approvalService.getNonceStore(),
    };

    const runCommandMock: IToolDefinition = {
      name: 'run_command',
      description: 'Executes verified command',
      parametersSchema: { type: 'object', properties: { command: { type: 'string' } } },
      requiresApproval: true,
      async execute(args: any) {
        return {
          toolName: 'run_command',
          success: true,
          data: { stdout: `Executed: ${args.command}`, exitCode: 0 },
          durationMs: 15,
          timestamp: Date.now(),
        };
      },
    };

    registry.register(runCommandMock);
  });

  it('runs complete lifecycle: register request -> user confirms -> token issued -> execution succeeds', async () => {
    const commandArgs = { command: 'npm run test:release' };

    // 1. Agent registers pending approval request
    const pending = approvalService.registerRequest({
      toolName: 'run_command',
      params: commandArgs,
      userId: 'user-charlie',
      projectId: 'proj-123',
      reason: 'Verify release packaging integrity',
    });

    expect(pending.actionId).toBeDefined();
    expect(pending.status).toBe('pending');

    // 2. User confirms the request
    const confirmation = approvalService.confirmRequest(
      pending.actionId,
      true,
      'user-charlie',
      'proj-123'
    );

    expect(confirmation.success).toBe(true);
    expect(confirmation.approved).toBe(true);
    expect(confirmation.approvalToken).toBeDefined();

    // 3. Agent executes tool with the issued token
    const executionResult = await registry.execute('run_command', commandArgs, {
      ...mockContext,
      actionId: pending.actionId,
      approvalToken: confirmation.approvalToken,
    });

    expect(executionResult.success).toBe(true);
    expect(executionResult.data.stdout).toBe('Executed: npm run test:release');

    // 4. Immediate replay attempt MUST fail
    const replayResult = await registry.execute('run_command', commandArgs, {
      ...mockContext,
      actionId: pending.actionId,
      approvalToken: confirmation.approvalToken,
    });

    expect(replayResult.success).toBe(false);
    expect(replayResult.error).toContain('already been consumed');
  });

  it('rejects confirmation if approver userId does not match request owner', () => {
    const pending = approvalService.registerRequest({
      toolName: 'run_command',
      params: { command: 'rm -rf /' },
      userId: 'user-charlie',
      projectId: 'proj-123',
    });

    const confirmation = approvalService.confirmRequest(
      pending.actionId,
      true,
      'malicious-attacker',
      'proj-123'
    );

    expect(confirmation.success).toBe(false);
    expect(confirmation.error).toContain('Unauthorized approver: userId');
  });

  it('rejects confirmation if approver projectId does not match request', () => {
    const pending = approvalService.registerRequest({
      toolName: 'run_command',
      params: { command: 'ls -la' },
      userId: 'user-charlie',
      projectId: 'proj-123',
    });

    const confirmation = approvalService.confirmRequest(
      pending.actionId,
      true,
      'user-charlie',
      'other-tenant-project'
    );

    expect(confirmation.success).toBe(false);
    expect(confirmation.error).toContain('Unauthorized approver: projectId');
  });

  it('handles explicit user rejection, preventing token issuance', async () => {
    const pending = approvalService.registerRequest({
      toolName: 'run_command',
      params: { command: 'destructive-command' },
      userId: 'user-charlie',
      projectId: 'proj-123',
    });

    const confirmation = approvalService.confirmRequest(
      pending.actionId,
      false, // User explicitly rejects
      'user-charlie',
      'proj-123'
    );

    expect(confirmation.success).toBe(true);
    expect(confirmation.approved).toBe(false);
    expect(confirmation.approvalToken).toBeUndefined();

    const state = approvalService.getRequest(pending.actionId);
    expect(state?.status).toBe('rejected');
  });

  it('expires pending requests after TTL ceiling', async () => {
    const pending = approvalService.registerRequest({
      toolName: 'run_command',
      params: { command: 'npm test' },
      userId: 'user-charlie',
      projectId: 'proj-123',
      ttlMs: 5, // 5 ms TTL
    });

    await new Promise(r => setTimeout(r, 15));

    const confirmation = approvalService.confirmRequest(
      pending.actionId,
      true,
      'user-charlie',
      'proj-123'
    );

    expect(confirmation.success).toBe(false);
    expect(confirmation.error).toMatch(/expired/i);
  });
});
