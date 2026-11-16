/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CanonicalToolRegistry,
  IToolDefinition,
  ToolExecutionContext,
  InMemoryNonceStore,
} from '../src/shared/contracts/tools';
import { ToolApprovalService } from '../src/server/composer/toolApprovalService';
import { ComposerAgent } from '../src/services/composer/composerAgent';
import { IModelGateway, ModelGatewayRequest, ModelGatewayResponse } from '../src/shared/contracts/gateway';

describe('Authoritative Approval Enforcement Suite (P0 Regression Tests)', () => {
  let registry: CanonicalToolRegistry;
  let approvalService: ToolApprovalService;
  let mockContext: ToolExecutionContext;
  const testSecret = 'authoritative-approval-test-secret-32bytes-entropy!';
  let executeSpy: any;

  beforeEach(() => {
    registry = new CanonicalToolRegistry();
    approvalService = new ToolApprovalService({
      secret: testSecret,
      nonceStore: new InMemoryNonceStore(),
    });

    const mockWorkspace: any = {
      getRootUri: () => 'float-workspace://proj-secure',
      resolvePath: (p: string) => p,
      readFile: async () => 'data',
      writeFile: async () => {},
      deleteFile: async () => {},
      fileExists: async () => true,
      listFiles: async () => [],
      stat: async () => ({ size: 10, mtime: Date.now(), isFile: true, isDirectory: false }),
    };

    mockContext = {
      workspace: mockWorkspace,
      userId: 'user-alice',
      projectId: 'proj-secure',
      approvalSecret: testSecret,
      nonceStore: approvalService.getNonceStore(),
    };

    executeSpy = vi.fn().mockImplementation(async (args: any) => ({
      toolName: 'privileged_action',
      success: true,
      data: { result: 'executed', target: args.target },
      durationMs: 5,
      timestamp: Date.now(),
    }));

    const privilegedTool: IToolDefinition = {
      name: 'privileged_action',
      description: 'Executes sensitive protected operation',
      parametersSchema: { type: 'object', properties: { target: { type: 'string' } } },
      requiresApproval: true,
      execute: executeSpy,
    };

    registry.register(privilegedTool);
  });

  // 1. Protected tool with no token and no actionId is rejected
  it('1. Rejects protected tool execution when both token and actionId are missing', async () => {
    const result = await registry.execute('privileged_action', { target: 'database' }, mockContext);
    expect(result.success).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(result.error).toContain('requires explicit user approval');
  });

  // 2. The tool's execute function is NOT invoked in that case
  it('2. Does NOT invoke tool execute function when approval token is missing', async () => {
    await registry.execute('privileged_action', { target: 'database' }, mockContext);
    expect(executeSpy).not.toHaveBeenCalled();
  });

  // 3. Protected tool with an invalid token signature is rejected
  it('3. Rejects execution when token signature is invalid', async () => {
    const invalidToken = 'eyJhbGciOiJIUzI1NiJ9.eyJ0b29sTmFtZSI6InByaXZpbGVnZWRfYWN0aW9uIn0.invalidSignature';
    const result = await registry.execute('privileged_action', { target: 'database' }, {
      ...mockContext,
      approvalToken: invalidToken,
    });
    expect(result.success).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(result.error).toContain('Approval token verification failed');
    expect(executeSpy).not.toHaveBeenCalled();
  });

  // 4. Wrong user is rejected
  it('4. Rejects token issued to a different user', async () => {
    const token = approvalService.generateToken({
      toolName: 'privileged_action',
      params: { target: 'database' },
      userId: 'user-bob-attacker', // Different user
      projectId: 'proj-secure',
    });

    const result = await registry.execute('privileged_action', { target: 'database' }, {
      ...mockContext,
      approvalToken: token,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('userId does not match execution context');
    expect(executeSpy).not.toHaveBeenCalled();
  });

  // 5. Wrong project is rejected
  it('5. Rejects token issued to a different project', async () => {
    const token = approvalService.generateToken({
      toolName: 'privileged_action',
      params: { target: 'database' },
      userId: 'user-alice',
      projectId: 'proj-other-tenant', // Different tenant project
    });

    const result = await registry.execute('privileged_action', { target: 'database' }, {
      ...mockContext,
      approvalToken: token,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('projectId does not match execution context');
    expect(executeSpy).not.toHaveBeenCalled();
  });

  // 6. Wrong tool name is rejected
  it('6. Rejects token issued for a different tool', async () => {
    const token = approvalService.generateToken({
      toolName: 'other_benign_tool',
      params: { target: 'database' },
      userId: 'user-alice',
      projectId: 'proj-secure',
    });

    const result = await registry.execute('privileged_action', { target: 'database' }, {
      ...mockContext,
      approvalToken: token,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('does not match requested "privileged_action"');
    expect(executeSpy).not.toHaveBeenCalled();
  });

  // 7. Changed parameters are rejected
  it('7. Rejects token if execution arguments were altered after approval', async () => {
    const token = approvalService.generateToken({
      toolName: 'privileged_action',
      params: { target: 'staging-db' }, // Approved staging
      userId: 'user-alice',
      projectId: 'proj-secure',
    });

    const result = await registry.execute('privileged_action', { target: 'production-db' }, { // Tampered to prod
      ...mockContext,
      approvalToken: token,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('parameters hash does not match');
    expect(executeSpy).not.toHaveBeenCalled();
  });

  // 8. Expired token is rejected
  it('8. Rejects token that has passed its expiration time', async () => {
    const token = approvalService.generateToken({
      toolName: 'privileged_action',
      params: { target: 'database' },
      userId: 'user-alice',
      projectId: 'proj-secure',
      expiresInMs: 1, // 1 ms TTL
    });

    await new Promise(r => setTimeout(r, 15));

    const result = await registry.execute('privileged_action', { target: 'database' }, {
      ...mockContext,
      approvalToken: token,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Approval token has expired');
    expect(executeSpy).not.toHaveBeenCalled();
  });

  // 9. Replayed token is rejected
  it('9. Rejects replayed token on second invocation', async () => {
    const token = approvalService.generateToken({
      toolName: 'privileged_action',
      params: { target: 'database' },
      userId: 'user-alice',
      projectId: 'proj-secure',
    });

    // First execution succeeds
    const firstResult = await registry.execute('privileged_action', { target: 'database' }, {
      ...mockContext,
      approvalToken: token,
    });
    expect(firstResult.success).toBe(true);
    expect(executeSpy).toHaveBeenCalledTimes(1);

    // Second execution with same token MUST be rejected
    const secondResult = await registry.execute('privileged_action', { target: 'database' }, {
      ...mockContext,
      approvalToken: token,
    });
    expect(secondResult.success).toBe(false);
    expect(secondResult.error).toContain('already been consumed');
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  // 10. Two concurrent requests cannot execute the same approved action
  it('10. Allows only one execution when two concurrent requests race with the same token', async () => {
    const token = approvalService.generateToken({
      actionId: 'act-race-1',
      toolName: 'privileged_action',
      params: { target: 'database' },
      userId: 'user-alice',
      projectId: 'proj-secure',
    });

    const ctx = {
      ...mockContext,
      actionId: 'act-race-1',
      approvalToken: token,
    };

    const [r1, r2] = await Promise.all([
      registry.execute('privileged_action', { target: 'database' }, ctx),
      registry.execute('privileged_action', { target: 'database' }, ctx),
    ]);

    const successes = (r1.success ? 1 : 0) + (r2.success ? 1 : 0);
    const failures = (!r1.success ? 1 : 0) + (!r2.success ? 1 : 0);

    expect(successes).toBe(1);
    expect(failures).toBe(1);
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  // 11. Normal Composer tool calls pause and request approval
  it('11. Composer agent automatically pauses and returns approval_required when privileged tool is invoked', async () => {
    const mockGateway: IModelGateway = {
      generate: async () => ({
        text: 'I will execute the privileged tool:\n```tool:privileged_action\n{"target":"prod"}\n```',
      }),
      generateStream: async () => ({ text: '' }),
      checkHealth: async () => ({ status: 'healthy', provider: 'mock', latencyMs: 5 }),
    };

    const progressEvents: any[] = [];
    const agent = new ComposerAgent(mockGateway, registry, mockContext.workspace);

    const result = await agent.run({
      task: 'Run production migration',
      userId: 'user-alice',
      projectId: 'proj-secure',
      approvalSecret: testSecret,
      nonceStore: approvalService.getNonceStore(),
      onProgress: (ev) => progressEvents.push(ev),
    });

    expect(result.status).toBe('approval_required');
    expect(result.pendingApproval).toBeDefined();
    expect(result.pendingApproval?.toolName).toBe('privileged_action');
    expect(result.pendingApproval?.params).toEqual({ target: 'prod' });
    expect(executeSpy).not.toHaveBeenCalled();

    const approvalEvent = progressEvents.find(e => e.type === 'approval_requested');
    expect(approvalEvent).toBeDefined();
    expect(approvalEvent.toolName).toBe('privileged_action');
  });

  // 12. Composer resumes only after authenticated user approval
  it('12. Composer agent executes privileged tool only when requestApproval callback returns valid token', async () => {
    const mockGateway: IModelGateway = {
      generate: async (req: ModelGatewayRequest) => {
        const lastMsg = req.messages[req.messages.length - 1];
        if (lastMsg.role === 'user' && typeof lastMsg.content === 'string' && lastMsg.content.includes('Tool Execution Result')) {
          return { text: 'Privileged tool executed successfully. Concluding task.' };
        }
        return { text: 'Calling tool:\n```tool:privileged_action\n{"target":"cluster"}\n```' };
      },
      generateStream: async () => ({ text: '' }),
      checkHealth: async () => ({ status: 'healthy', provider: 'mock', latencyMs: 5 }),
    };

    const agent = new ComposerAgent(mockGateway, registry, mockContext.workspace);

    const result = await agent.run({
      task: 'Deploy cluster',
      userId: 'user-alice',
      projectId: 'proj-secure',
      approvalSecret: testSecret,
      nonceStore: approvalService.getNonceStore(),
      requestApproval: async (req) => {
        // User confirms and issues token
        return approvalService.generateToken({
          actionId: req.actionId,
          toolName: req.toolName,
          params: req.params,
          userId: 'user-alice',
          projectId: 'proj-secure',
        });
      },
    });

    expect(result.status).toBe('completed');
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledWith({ target: 'cluster' }, expect.anything());
  });

  // 13. Explicit rejection prevents execution
  it('13. Composer agent does not execute privileged tool when user rejects approval request', async () => {
    const mockGateway: IModelGateway = {
      generate: async () => ({ text: 'Calling tool:\n```tool:privileged_action\n{"target":"destroy"}\n```' }),
      generateStream: async () => ({ text: '' }),
      checkHealth: async () => ({ status: 'healthy', provider: 'mock', latencyMs: 5 }),
    };

    const agent = new ComposerAgent(mockGateway, registry, mockContext.workspace);

    await agent.run({
      task: 'Destroy database',
      userId: 'user-alice',
      projectId: 'proj-secure',
      approvalSecret: testSecret,
      nonceStore: approvalService.getNonceStore(),
      requestApproval: async () => null, // User rejects
    });

    expect(executeSpy).not.toHaveBeenCalled();
  });

  // 14. Legitimate approval consumes the token exactly once
  it('14. Consumes the nonce exactly once upon successful registry execution', async () => {
    const token = approvalService.generateToken({
      actionId: 'act-once',
      toolName: 'privileged_action',
      params: { target: 'db' },
      userId: 'user-alice',
      projectId: 'proj-secure',
    });

    const res = await registry.execute('privileged_action', { target: 'db' }, {
      ...mockContext,
      actionId: 'act-once',
      approvalToken: token,
    });

    expect(res.success).toBe(true);
    expect(executeSpy).toHaveBeenCalledTimes(1);

    // Verify token can no longer be verified by service
    const verifyAgain = await approvalService.verifyAndConsume(token, {
      actionId: 'act-once',
      toolName: 'privileged_action',
      params: { target: 'db' },
      userId: 'user-alice',
      projectId: 'proj-secure',
    });
    expect(verifyAgain.valid).toBe(false);
    expect(verifyAgain.error).toContain('already been consumed');
  });
});
