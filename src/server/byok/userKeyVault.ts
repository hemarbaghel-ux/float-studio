/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'node:crypto';
import { adminDb, hasAdminCredentials } from '../adminFirebase';

export type ByokProviderId = 'openai' | 'anthropic' | 'google' | 'xai' | 'deepseek';

export const CURRENT_BYOK_KEY_VERSION = 2;

export interface UserApiKeyRecord {
  readonly provider: ByokProviderId;
  readonly masked: string;
  readonly isConfigured: boolean;
  readonly verified: boolean;
  readonly status?: 'ACTIVE' | 'NEEDS_REPLACEMENT';
  readonly accessibleModels?: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface EncryptedVaultEntry {
  readonly iv: string;
  readonly authTag: string;
  readonly ciphertext: string;
  readonly masked: string;
  readonly provider: ByokProviderId;
  readonly accessibleModels?: string[];
  readonly keyVersion: number;
  readonly status?: 'ACTIVE' | 'NEEDS_REPLACEMENT';
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * Derives the 256-bit AES master encryption key exclusively from FLOAT_BYOK_ENCRYPTION_KEY.
 *
 * Invariants:
 * 1. Independent key: never reuses FLOAT_APPROVAL_SECRET or provider keys.
 * 2. High entropy: enforces >= 32 characters (256 bits) AND Shannon entropy >= 3.5 bits/char.
 * 3. Fails closed in production if missing or insufficient.
 * 4. Zero static hardcoded secrets: ephemeral random 256-bit key used exclusively in test mode.
 */
export function calculateShannonEntropy(input: string): number {
  if (!input || input.length === 0) return 0;
  const frequencies = new Map<string, number>();
  for (const char of input) {
    frequencies.set(char, (frequencies.get(char) || 0) + 1);
  }
  let entropy = 0;
  const len = input.length;
  for (const count of frequencies.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

let ephemeralTestKey: string | undefined;

export function getByokMasterKey(explicitKey?: string): Buffer {
  const rawKey = explicitKey || process.env.FLOAT_BYOK_ENCRYPTION_KEY;
  if (!rawKey) {
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
      throw new Error(
        'BYOK_ENCRYPTION_KEY_MISSING: FLOAT_BYOK_ENCRYPTION_KEY environment secret is required in production.'
      );
    }
    // Only in explicit test environments, generate a high-entropy ephemeral random key per process
    if (process.env.NODE_ENV === 'test') {
      if (!ephemeralTestKey) {
        ephemeralTestKey = crypto.randomBytes(32).toString('hex');
      }
      return crypto.scryptSync(ephemeralTestKey, 'float_byok_salt_v2', 32);
    }
    throw new Error(
      'BYOK_ENCRYPTION_KEY_MISSING: FLOAT_BYOK_ENCRYPTION_KEY is required. Generate a 256-bit key using "openssl rand -hex 32".'
    );
  }

  const trimmed = rawKey.trim();
  if (trimmed.length < 32) {
    throw new Error(
      `BYOK_ENCRYPTION_KEY_INSUFFICIENT_LENGTH: FLOAT_BYOK_ENCRYPTION_KEY must provide at least 32 characters (256 bits), received ${trimmed.length}.`
    );
  }

  const entropy = calculateShannonEntropy(trimmed);
  if (entropy < 3.5) {
    throw new Error(
      `BYOK_ENCRYPTION_KEY_INSUFFICIENT_ENTROPY: FLOAT_BYOK_ENCRYPTION_KEY must provide adequate Shannon entropy (expected >= 3.5 bits/char, received ${entropy.toFixed(2)} bits/char).`
    );
  }

  const approvalSecret = process.env.FLOAT_APPROVAL_SECRET?.trim();
  if (approvalSecret && trimmed === approvalSecret) {
    throw new Error(
      'BYOK_ENCRYPTION_KEY_REUSE_FORBIDDEN: FLOAT_BYOK_ENCRYPTION_KEY must not reuse FLOAT_APPROVAL_SECRET.'
    );
  }

  return crypto.scryptSync(trimmed, 'float_byok_salt_v2', 32);
}

export class UserKeyVaultService {
  // In-memory fallback vault when running in non-production test environments
  private readonly memoryVault = new Map<string, Map<ByokProviderId, EncryptedVaultEntry>>();
  private explicitKey?: string;

  constructor(options?: { encryptionKey?: string }) {
    this.explicitKey = options?.encryptionKey;
  }

  public setEncryptionKey(key: string): void {
    getByokMasterKey(key);
    this.explicitKey = key;
  }

  private getMasterEncryptionKey(): Buffer {
    return getByokMasterKey(this.explicitKey);
  }

  private encrypt(plaintext: string): { iv: string; authTag: string; ciphertext: string; keyVersion: number } {
    const key = this.getMasterEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return {
      iv: iv.toString('hex'),
      authTag,
      ciphertext,
      keyVersion: CURRENT_BYOK_KEY_VERSION,
    };
  }

  private decrypt(entry: EncryptedVaultEntry): string {
    // Legacy credentials without keyVersion or encrypted under legacy version are considered compromised
    if (!entry.keyVersion || entry.keyVersion < CURRENT_BYOK_KEY_VERSION) {
      throw new Error(
        'LEGACY_BYOK_KEY_COMPROMISED: This credential was stored under a legacy or compromised secret version. Please replace your API key in Settings -> Models.'
      );
    }

    const key = this.getMasterEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(entry.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(entry.authTag, 'hex'));
    let decrypted = decipher.update(entry.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  public maskKey(apiKey: string): string {
    if (!apiKey) return '';
    const trimmed = apiKey.trim();
    if (trimmed.length <= 8) return '••••••••';
    const prefix = trimmed.slice(0, 4);
    const suffix = trimmed.slice(-4);
    return `${prefix}••••••••${suffix}`;
  }

  /**
   * Validates a provider API key against official upstream endpoints.
   */
  public async validateProviderKey(
    provider: ByokProviderId,
    apiKey: string
  ): Promise<{ valid: boolean; accessibleModels: string[]; error?: string }> {
    const key = apiKey.trim();
    if (!key) {
      return { valid: false, accessibleModels: [], error: 'API key cannot be empty.' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      if (provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
          signal: controller.signal,
        });
        if (!res.ok) {
          const body: any = await res.json().catch(() => ({}));
          return {
            valid: false,
            accessibleModels: [],
            error: body.error?.message || `OpenAI validation failed with status ${res.status}`,
          };
        }
        const data: any = await res.json();
        const models = (data.data || []).map((m: any) => m.id);
        return { valid: true, accessibleModels: models };
      }

      if (provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
          },
          signal: controller.signal,
        });
        if (!res.ok) {
          const body: any = await res.json().catch(() => ({}));
          return {
            valid: false,
            accessibleModels: [],
            error: body.error?.message || `Anthropic validation failed with status ${res.status}`,
          };
        }
        const data: any = await res.json();
        const models = (data.data || []).map((m: any) => m.id);
        return { valid: true, accessibleModels: models };
      }

      if (provider === 'google') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const body: any = await res.json().catch(() => ({}));
          return {
            valid: false,
            accessibleModels: [],
            error: body.error?.message || `Google validation failed with status ${res.status}`,
          };
        }
        const data: any = await res.json();
        const models = (data.models || []).map((m: any) => m.name.replace(/^models\//, ''));
        return { valid: true, accessibleModels: models };
      }

      if (provider === 'deepseek') {
        const res = await fetch('https://api.deepseek.com/models', {
          headers: { Authorization: `Bearer ${key}` },
          signal: controller.signal,
        });
        if (!res.ok) {
          const body: any = await res.json().catch(() => ({}));
          return {
            valid: false,
            accessibleModels: [],
            error: body.error?.message || `DeepSeek validation failed with status ${res.status}`,
          };
        }
        const data: any = await res.json();
        const models = (data.data || []).map((m: any) => m.id);
        return { valid: true, accessibleModels: models };
      }

      return { valid: false, accessibleModels: [], error: `Unsupported provider ${provider}` };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { valid: false, accessibleModels: [], error: 'Connection to provider API timed out.' };
      }
      return { valid: false, accessibleModels: [], error: err.message || 'Key validation request failed.' };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Encrypts and saves a user API key.
   * Fails closed if durable persistence cannot be guaranteed in production.
   */
  public async saveUserKey(
    userId: string,
    provider: ByokProviderId,
    apiKey: string,
    accessibleModels?: string[]
  ): Promise<UserApiKeyRecord> {
    const trimmed = apiKey.trim();
    if (!trimmed) throw new Error('API key cannot be empty');

    const encrypted = this.encrypt(trimmed);
    const masked = this.maskKey(trimmed);
    const now = Date.now();

    const vaultEntry: EncryptedVaultEntry = {
      ...encrypted,
      masked,
      provider,
      accessibleModels,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };

    // 1. Persistent Firestore storage
    if (hasAdminCredentials() && adminDb) {
      await adminDb
        .collection('user_key_vaults')
        .doc(userId)
        .collection('keys')
        .doc(provider)
        .set(vaultEntry);
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'DURABLE_VAULT_UNAVAILABLE: Firestore persistence is required in production. Refusing memory-only save.'
      );
    }

    // 2. Cache in memory
    let userMap = this.memoryVault.get(userId);
    if (!userMap) {
      userMap = new Map();
      this.memoryVault.set(userId, userMap);
    }
    userMap.set(provider, vaultEntry);

    return {
      provider,
      masked,
      isConfigured: true,
      verified: true,
      status: 'ACTIVE',
      accessibleModels,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Retrieves all decrypted plaintext keys for a user during model execution.
   */
  public async getUserApiKeys(userId: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    // Check memory vault
    const userMap = this.memoryVault.get(userId);
    if (userMap) {
      for (const [provider, entry] of userMap.entries()) {
        try {
          result[provider] = this.decrypt(entry);
        } catch (err: any) {
          console.warn(`[UserKeyVault] Failed to decrypt ${provider} key for user ${userId}: ${err.message}`);
        }
      }
    }

    // Load from Firestore if missing from memory
    if (hasAdminCredentials() && adminDb && Object.keys(result).length === 0) {
      const snap = await adminDb
        .collection('user_key_vaults')
        .doc(userId)
        .collection('keys')
        .get();
      for (const doc of snap.docs) {
        const entry = doc.data() as EncryptedVaultEntry;
        if (entry.provider && entry.ciphertext) {
          try {
            const decrypted = this.decrypt(entry);
            result[entry.provider] = decrypted;
            // Cache in memory
            if (!userMap) {
              const newMap = new Map<ByokProviderId, EncryptedVaultEntry>();
              this.memoryVault.set(userId, newMap);
              newMap.set(entry.provider, entry);
            } else {
              userMap.set(entry.provider, entry);
            }
          } catch (err: any) {
            console.warn(`[UserKeyVault] Failed to decrypt Firestore key for ${entry.provider}: ${err.message}`);
          }
        }
      }
    }

    return result;
  }

  /**
   * Retrieves user key summaries (only masked representations, never raw secrets).
   */
  public async getUserKeySummary(userId: string): Promise<UserApiKeyRecord[]> {
    const records: UserApiKeyRecord[] = [];
    const providers: ByokProviderId[] = ['openai', 'anthropic', 'google', 'deepseek', 'xai'];

    const userMap = this.memoryVault.get(userId);
    for (const p of providers) {
      const entry = userMap?.get(p);
      if (entry) {
        const isLegacy = !entry.keyVersion || entry.keyVersion < CURRENT_BYOK_KEY_VERSION;
        records.push({
          provider: p,
          masked: entry.masked,
          isConfigured: true,
          verified: !isLegacy,
          status: isLegacy ? 'NEEDS_REPLACEMENT' : 'ACTIVE',
          accessibleModels: entry.accessibleModels,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        });
      }
    }

    // If memory had nothing, check Firestore
    if (records.length === 0 && hasAdminCredentials() && adminDb) {
      const snap = await adminDb
        .collection('user_key_vaults')
        .doc(userId)
        .collection('keys')
        .get();
      for (const doc of snap.docs) {
        const entry = doc.data() as EncryptedVaultEntry;
        const isLegacy = !entry.keyVersion || entry.keyVersion < CURRENT_BYOK_KEY_VERSION;
        records.push({
          provider: entry.provider,
          masked: entry.masked,
          isConfigured: true,
          verified: !isLegacy,
          status: isLegacy ? 'NEEDS_REPLACEMENT' : 'ACTIVE',
          accessibleModels: entry.accessibleModels,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        });
      }
    }

    return records;
  }

  /**
   * Removes a user API key.
   */
  public async deleteUserKey(userId: string, provider: ByokProviderId): Promise<boolean> {
    const userMap = this.memoryVault.get(userId);
    if (userMap) {
      userMap.delete(provider);
    }

    if (hasAdminCredentials() && adminDb) {
      await adminDb
        .collection('user_key_vaults')
        .doc(userId)
        .collection('keys')
        .doc(provider)
        .delete();
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error('DURABLE_VAULT_UNAVAILABLE: Firestore deletion is required in production.');
    }

    return true;
  }
}

export const defaultUserKeyVault = new UserKeyVaultService();
