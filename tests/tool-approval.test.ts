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
  InMemoryNonceStore,
  getApprovalSecret,
  MIN_APPROVAL_SECRET_BYTES,
} from '../src/shared/contracts/tools';
import { ToolApprovalService, RedisNonceStore } from '../src/server/composer/toolApprovalService';

describe('Tool Approval Security Engine (Phase 1.1 Tasks 1 & 2)', () => {
  let registry: CanonicalToolRegistry;
  let mockContext: ToolExecutionContext;
  let approvalService: ToolApprovalService;
  // Valid 32-byte (256-bit) high-entropy secret
  const validSecret = 'test-approval-secret-key-12345-with-sufficient-entropy-32b';

  beforeEach(() => {
    clearConsumedApprovalTokensForTests();
    registry = new CanonicalToolRegistry();
    approvalService = new ToolApprovalService({ secret: validSecret });

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
      approvalSecret: validSecret,
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

  describe('Task 1: Insecure HMAC Secret Fallback Elimination & Entropy Checks', () => {
    it('fails closed when no secret is configured', () => {
      const oldEnv = process.env.FLOAT_APPROVAL_SECRET;
      delete process.env.FLOAT_APPROVAL_SECRET;
      try {
        expect(() => getApprovalSecret()).toThrow(/APPROVAL_SECRET_UNAVAILABLE/);
      } finally {
        if (oldEnv) process.env.FLOAT_APPROVAL_SECRET = oldEnv;
      }
    });

    it('fails closed when secret has insufficient entropy (< 32 bytes)', () => {
      const shortSecret = 'too-short-secret';
      expect(Buffer.byteLength(shortSecret, 'utf8')).toBeLessThan(MIN_APPROVAL_SECRET_BYTES);
      expect(() => getApprovalSecret(shortSecret)).toThrow(/APPROVAL_SECRET_INSUFFICIENT_ENTROPY/);
    });

    it('accepts explicitly injected secret with >= 32 bytes entropy', () => {
      expect(getApprovalSecret(validSecret)).toBe(validSecret);
    });
  });

  describe('Task 2: Distributed Single-Use Nonce Store & Concurrency Enforcement', () => {
    it('succeeds when a valid token matching parameters is provided', async () => {
      const args = { target: 'us-east-1' };
      const token = approvalService.generateToken({
        actionId: 'act-12345',
        toolName: 'deploy_production',
        params: args,
        userId: 'user-alice',
        projectId: 'proj-omega',
        expiresInMs: 60_000,
      });

      const contextWithToken: ToolExecutionContext = {
        ...mockContext,
        actionId: 'act-12345',
        approvalToken: token,
      };

      const result = await registry.execute('deploy_production', args, contextWithToken);
      expect(result.success).toBe(true);
      expect(result.data.deployed).toBe(true);
    });

    it('prevents replay attacks across two independent service instances sharing the nonce store', async () => {
      const sharedStore = new InMemoryNonceStore();
      const instanceA = new ToolApprovalService({ secret: validSecret, nonceStore: sharedStore });
      const instanceB = new ToolApprovalService({ secret: validSecret, nonceStore: sharedStore });

      const args = { target: 'us-west-2' };
      const token = instanceA.generateToken({
        actionId: 'act-instance-share',
        toolName: 'deploy_production',
        params: args,
        userId: 'user-alice',
        projectId: 'proj-omega',
      });

      // First verification on instance A succeeds
      const first = await instanceA.verifyAndConsume(token, {
        actionId: 'act-instance-share',
        toolName: 'deploy_production',
        params: args,
        userId: 'user-alice',
        projectId: 'proj-omega',
      });
      expect(first.valid).toBe(true);

      // Replay attempt on instance B MUST fail
      const replay = await instanceB.verifyAndConsume(token, {
        actionId: 'act-instance-share',
        toolName: 'deploy_production',
        params: args,
        userId: 'user-alice',
        projectId: 'proj-omega',
      });
      expect(replay.valid).toBe(false);
      expect(replay.error).toContain('already been consumed');
    });

    it('handles concurrent requests attempting to consume the same token, ensuring exactly one succeeds', async () => {
      const sharedStore = new InMemoryNonceStore();
      const instanceA = new ToolApprovalService({ secret: validSecret, nonceStore: sharedStore });
      const instanceB = new ToolApprovalService({ secret: validSecret, nonceStore: sharedStore });

      const args = { target: 'eu-central-1' };
      const token = instanceA.generateToken({
        actionId: 'act-concurrent',
        toolName: 'deploy_production',
        params: args,
        userId: 'user-alice',
        projectId: 'proj-omega',
      });

      const verifyOpts = {
        actionId: 'act-concurrent',
        toolName: 'deploy_production',
        params: args,
        userId: 'user-alice',
        projectId: 'proj-omega',
      };

      // Fire both verifications concurrently
      const [res1, res2] = await Promise.all([
        instanceA.verifyAndConsume(token, verifyOpts),
        instanceB.verifyAndConsume(token, verifyOpts),
      ]);

      const successCount = (res1.valid ? 1 : 0) + (res2.valid ? 1 : 0);
      const failureCount = (!res1.valid ? 1 : 0) + (!res2.valid ? 1 : 0);

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);
    });

    it('fails closed if the distributed nonce store is unavailable or offline', async () => {
      const brokenStore = new InMemoryNonceStore();
      brokenStore.setAvailable(false); // Simulate offline store
      const instance = new ToolApprovalService({ secret: validSecret, nonceStore: brokenStore });

      const args = { target: 'offline-test' };
      const token = instance.generateToken({
        actionId: 'act-offline',
        toolName: 'deploy_production',
        params: args,
        userId: 'user-alice',
        projectId: 'proj-omega',
      });

      const res = await instance.verifyAndConsume(token, {
        actionId: 'act-offline',
        toolName: 'deploy_production',
        params: args,
        userId: 'user-alice',
        projectId: 'proj-omega',
      });

      expect(res.valid).toBe(false);
      expect(res.error).toContain('Distributed nonce store unavailable');
    });

    it('RedisNonceStore fails closed if Redis client throws or is disconnected', async () => {
      const mockRedisClient = {
        set: async () => { throw new Error('ECONNREFUSED: Redis connection lost'); },
        ping: async () => { throw new Error('ECONNREFUSED'); },
      };
      const redisStore = new RedisNonceStore(mockRedisClient);
      const instance = new ToolApprovalService({ secret: validSecret, nonceStore: redisStore });

      const args = { target: 'redis-fail' };
      const token = instance.generateToken({
        actionId: 'act-redis-fail',
        toolName: 'deploy_production',
        params: args,
        userId: 'user-alice',
        projectId: 'proj-omega',
      });

      const res = await instance.verifyAndConsume(token, {
        actionId: 'act-redis-fail',
        toolName: 'deploy_production',
        params: args,
        userId: 'user-alice',
        projectId: 'proj-omega',
      });

      expect(res.valid).toBe(false);
      expect(res.error).toContain('Distributed nonce store unavailable');
    });
  });

  describe('Cryptographic Invariant & Tamper Rejection Checks', () => {
    it('fails if token parameters hash does not match modified execution arguments', async () => {
      const originalArgs = { target: 'us-east-1' };
      const token = approvalService.generateToken({
        actionId: 'act-tamper',
        toolName: 'deploy_production',
        params: originalArgs,
        userId: 'user-alice',
        projectId: 'proj-omega',
      });

      const tamperedArgs = { target: 'us-west-2' };
      const contextWithToken: ToolExecutionContext = {
        ...mockContext,
        actionId: 'act-tamper',
        approvalToken: token,
      };

      const result = await registry.execute('deploy_production', tamperedArgs, contextWithToken);
      expect(result.success).toBe(false);
      expect(result.error).toContain('parameters hash does not match');
    });

    it('fails if token tool name does not match requested tool', async () => {
      const token = approvalService.generateToken({
        actionId: 'act-mismatch',
        toolName: 'other_tool',
        params: { target: 'us-east-1' },
        userId: 'user-alice',
        projectId: 'proj-omega',
      });

      const contextWithToken: ToolExecutionContext = {
        ...mockContext,
        actionId: 'act-mismatch',
        approvalToken: token,
      };

      const result = await registry.execute('deploy_production', { target: 'us-east-1' }, contextWithToken);
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not match requested "deploy_production"');
    });

    it('rejects expired approval tokens', async () => {
      const token = approvalService.generateToken({
        actionId: 'act-expired',
        toolName: 'deploy_production',
        params: { target: 'us-east-1' },
        userId: 'user-alice',
        projectId: 'proj-omega',
        expiresInMs: 1, // 1 ms expiration
      });

      await new Promise(r => setTimeout(r, 10));

      const res = await approvalService.verifyAndConsume(token, {
        actionId: 'act-expired',
        toolName: 'deploy_production',
        params: { target: 'us-east-1' },
        userId: 'user-alice',
        projectId: 'proj-omega',
      });

      expect(res.valid).toBe(false);
      expect(res.error).toContain('has expired');
    });
  });
});
