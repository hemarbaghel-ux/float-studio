/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
  computeToolParamsHash,
  createToolApprovalToken,
  verifyAndConsumeToolApprovalToken,
  clearConsumedApprovalTokensForTests,
  getApprovalSecret,
  INonceStore,
  InMemoryNonceStore,
  defaultInMemoryNonceStore,
} from '../../shared/contracts/tools';

export interface GenerateApprovalTokenOptions {
  actionId?: string;
  toolName: string;
  params: any;
  userId: string;
  projectId: string;
  expiresInMs?: number;
}

export interface VerifyApprovalTokenOptions {
  actionId?: string;
  toolName: string;
  params: any;
  userId: string;
  projectId: string;
}

export interface ApprovalVerificationResult {
  valid: boolean;
  error?: string;
}

export interface PendingApprovalRequest {
  actionId: string;
  toolName: string;
  params: any;
  userId: string;
  projectId: string;
  reason?: string;
  target?: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: number;
  expiresAt: number;
  approvalToken?: string;
}

/**
 * Redis-backed atomic nonce store (Phase 1.1 Task 2).
 * Uses Redis `SET approval_nonce:<nonce> 1 NX PX <ttlMs>` for distributed single-use atomic consumption.
 */
export class RedisNonceStore implements INonceStore {
  private readonly redisClient: any;
  private readonly keyPrefix: string;

  constructor(redisClient: any, keyPrefix = 'approval_nonce:') {
    this.redisClient = redisClient;
    this.keyPrefix = keyPrefix;
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (!this.redisClient) return false;
      if (typeof this.redisClient.ping === 'function') {
        const res = await this.redisClient.ping();
        return res === 'PONG' || res === true;
      }
      return Boolean(this.redisClient.connected || this.redisClient.status === 'ready');
    } catch {
      return false;
    }
  }

  async consumeNonce(nonce: string, ttlMs: number): Promise<boolean> {
    if (!this.redisClient) {
      throw new Error('REDIS_STORE_UNAVAILABLE: Redis client is not configured.');
    }
    const key = `${this.keyPrefix}${nonce}`;
    // SET key 1 PX <ttlMs> NX returns 'OK' if key did not exist, null/false otherwise
    const res = await this.redisClient.set(key, '1', 'PX', Math.max(ttlMs, 1000), 'NX');
    return res === 'OK' || res === 1 || res === true;
  }

  async clear(): Promise<void> {
    if (this.redisClient && typeof this.redisClient.flushdb === 'function') {
      await this.redisClient.flushdb();
    }
  }
}

/**
 * Firestore transaction-based atomic nonce store (Phase 1.1 Task 2).
 * Consumes nonces in an atomic ACID transaction.
 */
export class FirestoreNonceStore implements INonceStore {
  private readonly firestore: any;
  private readonly collectionName: string;

  constructor(firestore: any, collectionName = '_approval_nonces') {
    this.firestore = firestore;
    this.collectionName = collectionName;
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.firestore);
  }

  async consumeNonce(nonce: string, ttlMs: number): Promise<boolean> {
    if (!this.firestore) {
      throw new Error('FIRESTORE_STORE_UNAVAILABLE: Firestore is not configured.');
    }
    const now = Date.now();
    const docRef = this.firestore.collection(this.collectionName).doc(nonce);

    return await this.firestore.runTransaction(async (transaction: any) => {
      const snapshot = await transaction.get(docRef);
      if (snapshot.exists) {
        const data = snapshot.data();
        if (data && data.expiresAt > now) {
          return false; // Replay detected
        }
      }
      transaction.set(docRef, {
        expiresAt: now + ttlMs,
        consumedAt: now,
      });
      return true;
    });
  }

  async clear(): Promise<void> {
    // No-op or test cleanup
  }
}

/**
 * Server-Side Cryptographic Tool Approval & Lifecycle Service (Phase 1.1 Tasks 1, 2, 3)
 *
 * Guarantees:
 * 1. Requires high-entropy secret (>= 32 bytes). Fails closed if missing.
 * 2. Uses durable atomic nonce store (Redis, Firestore, or isolated InMemory for tests).
 * 3. Manages end-to-end pending approval requests, issuing signed tokens only after explicit user confirmation.
 * 4. Binds actionId, toolName, parameter hash, userId, and projectId.
 * 5. Constant-time signature verification preventing timing leaks.
 */
export class ToolApprovalService {
  private explicitSecret?: string;
  private readonly nonceStore: INonceStore;
  private readonly pendingRequests = new Map<string, PendingApprovalRequest>();

  constructor(options?: { secret?: string; nonceStore?: INonceStore }) {
    this.explicitSecret = options?.secret;
    this.nonceStore = options?.nonceStore || defaultInMemoryNonceStore;
  }

  public setSecret(secret: string): void {
    // Validates entropy immediately
    getApprovalSecret(secret);
    this.explicitSecret = secret;
  }

  public getSecret(): string {
    return getApprovalSecret(this.explicitSecret);
  }

  public getNonceStore(): INonceStore {
    return this.nonceStore;
  }

  public computeParamsHash(params: any): string {
    return computeToolParamsHash(params);
  }

  /**
   * Registers a pending human approval request (Phase 1.1 Task 3).
   */
  public registerRequest(req: {
    actionId?: string;
    toolName: string;
    params: any;
    userId: string;
    projectId: string;
    reason?: string;
    target?: string;
    ttlMs?: number;
  }): PendingApprovalRequest {
    const actionId = req.actionId || `appr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const ttlMs = req.ttlMs ?? 5 * 60 * 1000;
    const pending: PendingApprovalRequest = {
      actionId,
      toolName: req.toolName,
      params: req.params,
      userId: req.userId,
      projectId: req.projectId,
      reason: req.reason,
      target: req.target,
      status: 'pending',
      createdAt: now,
      expiresAt: now + ttlMs,
    };
    this.pendingRequests.set(actionId, pending);
    return pending;
  }

  public getRequest(actionId: string): PendingApprovalRequest | undefined {
    const req = this.pendingRequests.get(actionId);
    if (req && req.expiresAt < Date.now() && req.status === 'pending') {
      req.status = 'expired';
    }
    return req;
  }

  /**
   * Confirms or rejects a pending human approval request (Phase 1.1 Task 3).
   * Generates and returns a cryptographic approval token upon explicit user confirmation.
   */
  public confirmRequest(
    actionId: string,
    approved: boolean,
    approverUserId: string,
    approverProjectId: string
  ): { success: boolean; approved: boolean; approvalToken?: string; error?: string } {
    const req = this.getRequest(actionId);
    if (!req) {
      return { success: false, approved: false, error: 'Approval request not found.' };
    }
    if (req.status !== 'pending') {
      return { success: false, approved: false, error: `Approval request is already in status "${req.status}".` };
    }
    if (req.expiresAt < Date.now()) {
      req.status = 'expired';
      return { success: false, approved: false, error: 'Approval request has expired.' };
    }
    if (req.userId !== approverUserId) {
      return { success: false, approved: false, error: 'Unauthorized approver: userId does not match request owner.' };
    }
    if (req.projectId !== approverProjectId) {
      return { success: false, approved: false, error: 'Unauthorized approver: projectId does not match request.' };
    }

    if (!approved) {
      req.status = 'rejected';
      return { success: true, approved: false };
    }

    req.status = 'approved';
    const token = this.generateToken({
      actionId: req.actionId,
      toolName: req.toolName,
      params: req.params,
      userId: req.userId,
      projectId: req.projectId,
      expiresInMs: Math.max(req.expiresAt - Date.now(), 1000),
    });
    req.approvalToken = token;

    return {
      success: true,
      approved: true,
      approvalToken: token,
    };
  }

  public generateToken(options: GenerateApprovalTokenOptions, secret?: string): string {
    const paramsHash = this.computeParamsHash(options.params);
    return createToolApprovalToken(
      {
        actionId: options.actionId,
        toolName: options.toolName,
        paramsHash,
        userId: options.userId,
        projectId: options.projectId,
        expiresInMs: options.expiresInMs,
      },
      secret || this.getSecret()
    );
  }

  public async verifyAndConsume(
    token: string,
    expected: VerifyApprovalTokenOptions,
    secret?: string
  ): Promise<ApprovalVerificationResult> {
    const paramsHash = this.computeParamsHash(expected.params);
    return await verifyAndConsumeToolApprovalToken(
      token,
      {
        actionId: expected.actionId,
        toolName: expected.toolName,
        paramsHash,
        userId: expected.userId,
        projectId: expected.projectId,
      },
      secret || this.getSecret(),
      this.nonceStore
    );
  }

  public async clearConsumedTokens(): Promise<void> {
    await this.nonceStore.clear();
    this.pendingRequests.clear();
  }
}

export const defaultToolApprovalService = new ToolApprovalService();
