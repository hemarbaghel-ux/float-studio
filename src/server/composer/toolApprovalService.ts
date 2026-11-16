/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
  computeToolParamsHash,
  createToolApprovalToken,
  verifyAndConsumeToolApprovalToken,
  clearConsumedApprovalTokensForTests,
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

/**
 * Dedicated Server-Side Cryptographic Tool Approval Service (Phase 1 SEC-02)
 *
 * Implements HMAC-SHA256 signature generation and constant-time verification for
 * privileged agent operations (run_command, apply_diff, write_file).
 *
 * Guarantees:
 * 1. Binds unique action ID, tool name, canonical parameter hash, user ID, project ID, expiration, and nonce.
 * 2. Five-minute maximum validity ceiling.
 * 3. Constant-time signature verification preventing timing leaks.
 * 4. Single-use nonce enforcement preventing replay attacks.
 * 5. Rejection of expired, forged, modified, or mismatched tokens.
 */
export class ToolApprovalService {
  private readonly defaultSecret: string;

  constructor(secret?: string) {
    this.defaultSecret = secret || process.env.FLOAT_APPROVAL_SECRET || 'float-tool-approval-secret-key-2026';
  }

  public computeParamsHash(params: any): string {
    return computeToolParamsHash(params);
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
      secret || this.defaultSecret
    );
  }

  public verifyAndConsume(
    token: string,
    expected: VerifyApprovalTokenOptions,
    secret?: string
  ): ApprovalVerificationResult {
    const paramsHash = this.computeParamsHash(expected.params);
    return verifyAndConsumeToolApprovalToken(
      token,
      {
        actionId: expected.actionId,
        toolName: expected.toolName,
        paramsHash,
        userId: expected.userId,
        projectId: expected.projectId,
      },
      secret || this.defaultSecret
    );
  }

  public clearConsumedTokens(): void {
    clearConsumedApprovalTokensForTests();
  }
}

export const defaultToolApprovalService = new ToolApprovalService();
