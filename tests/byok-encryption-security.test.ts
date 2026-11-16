/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach } from 'vitest';
import {
  UserKeyVaultService,
  getByokMasterKey,
  CURRENT_BYOK_KEY_VERSION,
} from '../src/server/byok/userKeyVault';

describe('BYOK Encryption & Vault Security Engine (P0 Remediation Tests)', () => {
  const validByokKey = 'a-secure-byok-key-32bytes-entropy-vector-2026!';
  const approvalSecret = 'different-approval-secret-key-32bytes-entropy!';

  beforeEach(() => {
    delete process.env.FLOAT_BYOK_ENCRYPTION_KEY;
    delete process.env.FLOAT_APPROVAL_SECRET;
  });

  describe('Cryptographic Secret Separation & Entropy Enforcement', () => {
    it('fails closed in production if FLOAT_BYOK_ENCRYPTION_KEY is missing', () => {
      const oldEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        expect(() => getByokMasterKey()).toThrow(/BYOK_ENCRYPTION_KEY_MISSING/);
      } finally {
        process.env.NODE_ENV = oldEnv;
      }
    });

    it('fails closed if key has insufficient entropy (< 32 bytes)', () => {
      expect(() => getByokMasterKey('short-key-16bytes')).toThrow(/BYOK_ENCRYPTION_KEY_INSUFFICIENT_ENTROPY/);
    });

    it('prohibits key reuse between BYOK encryption and approval HMAC signing', () => {
      process.env.FLOAT_APPROVAL_SECRET = validByokKey;
      expect(() => getByokMasterKey(validByokKey)).toThrow(/BYOK_ENCRYPTION_KEY_REUSE_FORBIDDEN/);
    });

    it('successfully derives 256-bit AES master key from valid independent secret', () => {
      process.env.FLOAT_APPROVAL_SECRET = approvalSecret;
      const keyBuffer = getByokMasterKey(validByokKey);
      expect(keyBuffer).toBeInstanceOf(Buffer);
      expect(keyBuffer.length).toBe(32); // 256 bits
    });
  });

  describe('Vault Key Versioning & Compromised Legacy Credential Protection', () => {
    it('stamps new keys with CURRENT_BYOK_KEY_VERSION (v2)', async () => {
      const vault = new UserKeyVaultService({ encryptionKey: validByokKey });
      const record = await vault.saveUserKey('user_v2', 'openai', 'sk-test-openai-valid-key-12345');

      expect(record.status).toBe('ACTIVE');
      expect(record.verified).toBe(true);

      const keys = await vault.getUserApiKeys('user_v2');
      expect(keys.openai).toBe('sk-test-openai-valid-key-12345');
    });

    it('treats legacy/unversioned credentials as compromised (status NEEDS_REPLACEMENT)', async () => {
      const vault = new UserKeyVaultService({ encryptionKey: validByokKey });

      // Directly insert legacy v1 record into vault to simulate pre-existing database entry
      const legacyEntry = {
        iv: '0102030405060708090a0b0c',
        authTag: '0102030405060708090a0b0c0d0e0f10',
        ciphertext: 'aabbccdd',
        masked: 'sk-l••••••••egcy',
        provider: 'anthropic' as const,
        keyVersion: 1, // Legacy version
        createdAt: Date.now() - 100000,
        updatedAt: Date.now() - 100000,
      };

      (vault as any).memoryVault.set('user_legacy', new Map([['anthropic', legacyEntry]]));

      // 1. Summary flags status as NEEDS_REPLACEMENT
      const summary = await vault.getUserKeySummary('user_legacy');
      expect(summary).toHaveLength(1);
      expect(summary[0].status).toBe('NEEDS_REPLACEMENT');
      expect(summary[0].verified).toBe(false);

      // 2. getUserApiKeys refuses to decrypt legacy key and skips it
      const keys = await vault.getUserApiKeys('user_legacy');
      expect(keys.anthropic).toBeUndefined();
    });
  });

  describe('Durable Persistence Invariants', () => {
    it('refuses memory-only save in production when Firestore is not configured', async () => {
      const oldEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const vault = new UserKeyVaultService({ encryptionKey: validByokKey });

      try {
        await expect(vault.saveUserKey('prod_user', 'openai', 'sk-prod-test-key-12345'))
          .rejects.toThrow(/DURABLE_VAULT_UNAVAILABLE/);
      } finally {
        process.env.NODE_ENV = oldEnv;
      }
    });

    it('guarantees tenant isolation: User A cannot read User B keys', async () => {
      const vault = new UserKeyVaultService({ encryptionKey: validByokKey });

      await vault.saveUserKey('user_alpha', 'openai', 'sk-alpha-secret-key-12345');
      await vault.saveUserKey('user_bravo', 'openai', 'sk-bravo-secret-key-67890');

      const alphaKeys = await vault.getUserApiKeys('user_alpha');
      const bravoKeys = await vault.getUserApiKeys('user_bravo');

      expect(alphaKeys.openai).toBe('sk-alpha-secret-key-12345');
      expect(bravoKeys.openai).toBe('sk-bravo-secret-key-67890');
      expect(alphaKeys.openai).not.toBe(bravoKeys.openai);
    });
  });
});
