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
import { adminDb, hasAdminCredentials } from '../adminFirebase';

export type ApprovalRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'executing'
  | 'consumed'
  | 'failed';

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
  paramsHash: string;
  userId: string;
  projectId: string;
  reason?: string;
  target?: string;
  status: ApprovalRequestStatus;
  createdAt: number;
  expiresAt: number;
  approvalToken?: string;
  consumedAt?: number;
  failureReason?: string;
}

/**
 * Interface for durable pending approval request storage.
 */
export interface IPendingApprovalStore {
  registerRequest(req: PendingApprovalRequest): Promise<void>;
  getRequest(actionId: string): Promise<PendingApprovalRequest | undefined>;
  transitionStatus(
    actionId: string,
    fromStatus: ApprovalRequestStatus | ApprovalRequestStatus[],
    toStatus: ApprovalRequestStatus,
    updates?: Partial<PendingApprovalRequest>
  ): Promise<{ success: boolean; request?: PendingApprovalRequest; error?: string }>;
  clear(): Promise<void>;
}

/**
 * In-memory pending approval store for isolated unit tests and local development.
 */
export class InMemoryPendingApprovalStore implements IPendingApprovalStore {
  private readonly requests = new Map<string, PendingApprovalRequest>();

  async registerRequest(req: PendingApprovalRequest): Promise<void> {
    this.requests.set(req.actionId, { ...req });
  }

  async getRequest(actionId: string): Promise<PendingApprovalRequest | undefined> {
    const req = this.requests.get(actionId);
    if (!req) return undefined;
    if (req.status === 'pending' && req.expiresAt < Date.now()) {
      req.status = 'expired';
    }
    return { ...req };
  }

  async transitionStatus(
    actionId: string,
    fromStatus: ApprovalRequestStatus | ApprovalRequestStatus[],
    toStatus: ApprovalRequestStatus,
    updates?: Partial<PendingApprovalRequest>
  ): Promise<{ success: boolean; request?: PendingApprovalRequest; error?: string }> {
    const req = this.requests.get(actionId);
    if (!req) {
      return { success: false, error: `Approval request "${actionId}" not found.` };
    }
    const fromList = Array.isArray(fromStatus) ? fromStatus : [fromStatus];
    if (!fromList.includes(req.status)) {
      return {
        success: false,
        error: `Invalid approval state transition: expected "${fromList.join(' or ')}" but current status is "${req.status}".`,
        request: { ...req },
      };
    }
    if (req.status === 'pending' && req.expiresAt < Date.now()) {
      req.status = 'expired';
      return {
        success: false,
        error: 'Approval request has expired.',
        request: { ...req },
      };
    }
    const updated: PendingApprovalRequest = {
      ...req,
      ...updates,
      status: toStatus,
    };
    this.requests.set(actionId, updated);
    return { success: true, request: { ...updated } };
  }

  async clear(): Promise<void> {
    this.requests.clear();
  }
}

/**
 * Firestore-backed durable pending approval store with atomic transaction transitions.
 */
export class FirestorePendingApprovalStore implements IPendingApprovalStore {
  private readonly firestore: any;
  private readonly collectionName: string;

  constructor(firestore: any, collectionName = '_approval_requests') {
    this.firestore = firestore;
    this.collectionName = collectionName;
  }

  async registerRequest(req: PendingApprovalRequest): Promise<void> {
    if (!this.firestore) {
      throw new Error('FIRESTORE_STORE_UNAVAILABLE: Firestore is not configured.');
    }
    await this.firestore.collection(this.collectionName).doc(req.actionId).set({ ...req });
  }

  async getRequest(actionId: string): Promise<PendingApprovalRequest | undefined> {
    if (!this.firestore) {
      throw new Error('FIRESTORE_STORE_UNAVAILABLE: Firestore is not configured.');
    }
    const snap = await this.firestore.collection(this.collectionName).doc(actionId).get();
    if (!snap.exists) return undefined;
    const data = snap.data() as PendingApprovalRequest;
    if (data.status === 'pending' && data.expiresAt < Date.now()) {
      data.status = 'expired';
      await this.firestore.collection(this.collectionName).doc(actionId).update({ status: 'expired' });
    }
    return data;
  }

  async transitionStatus(
    actionId: string,
    fromStatus: ApprovalRequestStatus | ApprovalRequestStatus[],
    toStatus: ApprovalRequestStatus,
    updates?: Partial<PendingApprovalRequest>
  ): Promise<{ success: boolean; request?: PendingApprovalRequest; error?: string }> {
    if (!this.firestore) {
      throw new Error('FIRESTORE_STORE_UNAVAILABLE: Firestore is not configured.');
    }
    const docRef = this.firestore.collection(this.collectionName).doc(actionId);
    return await this.firestore.runTransaction(async (transaction: any) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists) {
        return { success: false, error: `Approval request "${actionId}" not found.` };
      }
      const data = snap.data() as PendingApprovalRequest;
      const fromList = Array.isArray(fromStatus) ? fromStatus : [fromStatus];
      if (!fromList.includes(data.status)) {
        return {
          success: false,
          error: `Invalid approval state transition: expected "${fromList.join(' or ')}" but current status is "${data.status}".`,
          request: data,
        };
      }
      if (data.status === 'pending' && data.expiresAt < Date.now()) {
        transaction.update(docRef, { status: 'expired' });
        return {
          success: false,
          error: 'Approval request has expired.',
          request: { ...data, status: 'expired' },
        };
      }
      const updated: PendingApprovalRequest = {
        ...data,
        ...updates,
        status: toStatus,
      };
      transaction.update(docRef, updated);
      return { success: true, request: updated };
    });
  }

  async clear(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FIRESTORE_CLEAR_FORBIDDEN: clear() is forbidden in production environments.');
    }
    // Test cleanup: delete documents in test collection
    if (this.firestore) {
      const snapshot = await this.firestore.collection(this.collectionName).limit(100).get();
      const batch = this.firestore.batch();
      snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
      await batch.commit();
    }
  }
}

/**
 * Redis-backed atomic nonce store.
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
    if (process.env.NODE_ENV === 'production') {
      throw new Error('REDIS_CLEAR_FORBIDDEN: clear() is forbidden on production Redis databases.');
    }
    if (this.redisClient && typeof this.redisClient.keys === 'function' && typeof this.redisClient.del === 'function') {
      const keys = await this.redisClient.keys(`${this.keyPrefix}*`);
      if (Array.isArray(keys) && keys.length > 0) {
        await this.redisClient.del(keys);
      }
    }
  }
}

/**
 * Firestore transaction-based atomic nonce store.
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
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FIRESTORE_CLEAR_FORBIDDEN: clear() is forbidden on production Firestore databases.');
    }
    if (this.firestore) {
      const snapshot = await this.firestore.collection(this.collectionName).limit(100).get();
      const batch = this.firestore.batch();
      snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
      await batch.commit();
    }
  }
}

/**
 * Server-Side Cryptographic Tool Approval & Lifecycle Service (Phase 1.1)
 *
 * Guarantees:
 * 1. Requires high-entropy secret (>= 32 bytes). Fails closed if missing.
 * 2. Uses durable atomic nonce store (Redis, Firestore, or isolated InMemory for tests).
 * 3. Manages end-to-end pending approval requests with explicit state machine.
 * 4. Binds actionId, toolName, parameter hash, userId, and projectId.
 * 5. Single authoritative token verification and nonce consumption boundary in CanonicalToolRegistry.
 */
export class ToolApprovalService {
  private explicitSecret?: string;
  private readonly nonceStore: INonceStore;
  private readonly approvalStore: IPendingApprovalStore;

  constructor(options?: {
    secret?: string;
    nonceStore?: INonceStore;
    approvalStore?: IPendingApprovalStore;
  }) {
    this.explicitSecret = options?.secret;

    if (process.env.NODE_ENV === 'production') {
      if (options?.nonceStore && options?.approvalStore) {
        this.nonceStore = options.nonceStore;
        this.approvalStore = options.approvalStore;
      } else if (hasAdminCredentials() && adminDb) {
        this.nonceStore = new FirestoreNonceStore(adminDb);
        this.approvalStore = new FirestorePendingApprovalStore(adminDb);
      } else {
        throw new Error(
          'PRODUCTION_APPROVAL_STORE_UNCONFIGURED: Production approval service requires durable Firestore or Redis storage. In-memory storage is prohibited.'
        );
      }
    } else {
      this.nonceStore =
        options?.nonceStore ||
        (hasAdminCredentials() && adminDb ? new FirestoreNonceStore(adminDb) : defaultInMemoryNonceStore);
      this.approvalStore =
        options?.approvalStore ||
        (hasAdminCredentials() && adminDb
          ? new FirestorePendingApprovalStore(adminDb)
          : new InMemoryPendingApprovalStore());
    }
  }

  public setSecret(secret: string): void {
    getApprovalSecret(secret);
    this.explicitSecret = secret;
  }

  public getSecret(): string {
    return getApprovalSecret(this.explicitSecret);
  }

  public getNonceStore(): INonceStore {
    return this.nonceStore;
  }

  public getApprovalStore(): IPendingApprovalStore {
    return this.approvalStore;
  }

  public computeParamsHash(params: any): string {
    return computeToolParamsHash(params);
  }

  /**
   * Registers a pending human approval request.
   */
  public async registerRequest(req: {
    actionId?: string;
    toolName: string;
    params: any;
    userId: string;
    projectId: string;
    reason?: string;
    target?: string;
    ttlMs?: number;
  }): Promise<PendingApprovalRequest> {
    const actionId = req.actionId || `appr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const ttlMs = req.ttlMs ?? 5 * 60 * 1000;
    const paramsHash = this.computeParamsHash(req.params);

    const pending: PendingApprovalRequest = {
      actionId,
      toolName: req.toolName,
      params: req.params,
      paramsHash,
      userId: req.userId,
      projectId: req.projectId,
      reason: req.reason,
      target: req.target,
      status: 'pending',
      createdAt: now,
      expiresAt: now + ttlMs,
    };

    await this.approvalStore.registerRequest(pending);
    return pending;
  }

  public async getRequest(actionId: string): Promise<PendingApprovalRequest | undefined> {
    return await this.approvalStore.getRequest(actionId);
  }

  /**
   * Confirms or rejects a pending human approval request.
   * Generates and returns a cryptographic approval token upon explicit user confirmation.
   */
  public async confirmRequest(
    actionId: string,
    approved: boolean,
    approverUserId: string,
    approverProjectId: string
  ): Promise<{ success: boolean; approved: boolean; approvalToken?: string; error?: string }> {
    const req = await this.getRequest(actionId);
    if (!req) {
      return { success: false, approved: false, error: 'Approval request not found.' };
    }
    if (req.status !== 'pending') {
      return { success: false, approved: false, error: `Approval request is already in status "${req.status}".` };
    }
    if (req.expiresAt < Date.now()) {
      await this.approvalStore.transitionStatus(actionId, 'pending', 'expired');
      return { success: false, approved: false, error: 'Approval request has expired.' };
    }
    if (req.userId !== approverUserId) {
      return { success: false, approved: false, error: 'Unauthorized approver: userId does not match request owner.' };
    }
    if (req.projectId !== approverProjectId) {
      return { success: false, approved: false, error: 'Unauthorized approver: projectId does not match request.' };
    }

    if (!approved) {
      const res = await this.approvalStore.transitionStatus(actionId, 'pending', 'rejected');
      if (!res.success) {
        return { success: false, approved: false, error: res.error };
      }
      return { success: true, approved: false };
    }

    const token = this.generateToken({
      actionId: req.actionId,
      toolName: req.toolName,
      params: req.params,
      userId: req.userId,
      projectId: req.projectId,
      expiresInMs: Math.max(req.expiresAt - Date.now(), 1000),
    });

    const res = await this.approvalStore.transitionStatus(actionId, 'pending', 'approved', {
      approvalToken: token,
    });

    if (!res.success) {
      return { success: false, approved: false, error: res.error };
    }

    return {
      success: true,
      approved: true,
      approvalToken: token,
    };
  }

  public async markExecuting(
    actionId: string,
    userId: string,
    projectId: string
  ): Promise<{ success: boolean; error?: string }> {
    const req = await this.getRequest(actionId);
    if (!req) return { success: false, error: 'Approval request not found.' };
    if (req.userId !== userId || req.projectId !== projectId) {
      return { success: false, error: 'Unauthorized: context does not match approval request.' };
    }
    const res = await this.approvalStore.transitionStatus(actionId, 'approved', 'executing');
    return { success: res.success, error: res.error };
  }

  public async markConsumed(
    actionId: string,
    userId: string,
    projectId: string
  ): Promise<{ success: boolean; error?: string }> {
    const req = await this.getRequest(actionId);
    if (!req) return { success: false, error: 'Approval request not found.' };
    if (req.userId !== userId || req.projectId !== projectId) {
      return { success: false, error: 'Unauthorized: context does not match approval request.' };
    }
    const res = await this.approvalStore.transitionStatus(actionId, ['approved', 'executing'], 'consumed', {
      consumedAt: Date.now(),
    });
    return { success: res.success, error: res.error };
  }

  public async markFailed(actionId: string, failureReason: string): Promise<void> {
    await this.approvalStore.transitionStatus(actionId, ['pending', 'approved', 'executing'], 'failed', {
      failureReason,
    });
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
    await this.approvalStore.clear();
  }
}

export const defaultToolApprovalService = new ToolApprovalService();
