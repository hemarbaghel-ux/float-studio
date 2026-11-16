/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'node:crypto';
import { adminDb, hasAdminCredentials } from '../adminFirebase';

export type ByokProviderId = 'openai' | 'anthropic' | 'google' | 'xai' | 'deepseek';

export interface UserApiKeyRecord {
  readonly provider: ByokProviderId;
  readonly masked: string;
  readonly isConfigured: boolean;
  readonly verified: boolean;
  readonly accessibleModels?: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

interface EncryptedVaultEntry {
  readonly iv: string;
  readonly authTag: string;
  readonly ciphertext: string;
  readonly masked: string;
  readonly provider: ByokProviderId;
  readonly accessibleModels?: string[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export class UserKeyVaultService {
  // In-memory fallback vault when Firestore is unavailable
  private readonly memoryVault = new Map<string, Map<ByokProviderId, EncryptedVaultEntry>>();

  private getMasterEncryptionKey(): Buffer {
    const rawSecret =
      process.env.FLOAT_APPROVAL_SECRET ||
      process.env.FLOAT_ENCRYPTION_KEY ||
      'float_secure_default_master_byok_encryption_secret_2026';
    return crypto.scryptSync(rawSecret, 'float_byok_salt_vector_v1', 32);
  }

  private encrypt(plaintext: string): { iv: string; authTag: string; ciphertext: string } {
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
    };
  }

  private decrypt(entry: { iv: string; authTag: string; ciphertext: string }): string {
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
            error: body?.error?.message || `OpenAI rejected key (HTTP ${res.status}).`,
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
            error: body?.error?.message || `Anthropic rejected key (HTTP ${res.status}).`,
          };
        }
        const data: any = await res.json();
        const models = (data.data || []).map((m: any) => m.id);
        return { valid: true, accessibleModels: models };
      }

      if (provider === 'google') {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          const body: any = await res.json().catch(() => ({}));
          return {
            valid: false,
            accessibleModels: [],
            error: body?.error?.message || `Google Gemini rejected key (HTTP ${res.status}).`,
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
            error: body?.error?.message || `DeepSeek rejected key (HTTP ${res.status}).`,
          };
        }
        const data: any = await res.json();
        const models = (data.data || []).map((m: any) => m.id);
        return { valid: true, accessibleModels: models };
      }

      if (provider === 'xai') {
        const res = await fetch('https://api.x.ai/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
          signal: controller.signal,
        });
        if (!res.ok) {
          const body: any = await res.json().catch(() => ({}));
          return {
            valid: false,
            accessibleModels: [],
            error: body?.error?.message || `xAI rejected key (HTTP ${res.status}).`,
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
      createdAt: now,
      updatedAt: now,
    };

    // 1. In-memory storage
    let userMap = this.memoryVault.get(userId);
    if (!userMap) {
      userMap = new Map();
      this.memoryVault.set(userId, userMap);
    }
    userMap.set(provider, vaultEntry);

    // 2. Persistent Firestore storage if available
    if (hasAdminCredentials() && adminDb) {
      try {
        await adminDb
          .collection('user_key_vaults')
          .doc(userId)
          .collection('keys')
          .doc(provider)
          .set(vaultEntry);
      } catch (err) {
        console.warn(`[UserKeyVault] Failed to persist key to Firestore: ${err}`);
      }
    }

    return {
      provider,
      masked,
      isConfigured: true,
      verified: true,
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
        } catch {}
      }
    }

    // Load from Firestore if missing from memory
    if (hasAdminCredentials() && adminDb && Object.keys(result).length === 0) {
      try {
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
            } catch {}
          }
        }
      } catch (err) {
        console.warn(`[UserKeyVault] Error fetching keys from Firestore: ${err}`);
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
        records.push({
          provider: p,
          masked: entry.masked,
          isConfigured: true,
          verified: true,
          accessibleModels: entry.accessibleModels,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        });
      }
    }

    // If memory had nothing, check Firestore
    if (records.length === 0 && hasAdminCredentials() && adminDb) {
      try {
        const snap = await adminDb
          .collection('user_key_vaults')
          .doc(userId)
          .collection('keys')
          .get();
        for (const doc of snap.docs) {
          const entry = doc.data() as EncryptedVaultEntry;
          records.push({
            provider: entry.provider,
            masked: entry.masked,
            isConfigured: true,
            verified: true,
            accessibleModels: entry.accessibleModels,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
          });
        }
      } catch {}
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
      try {
        await adminDb
          .collection('user_key_vaults')
          .doc(userId)
          .collection('keys')
          .doc(provider)
          .delete();
      } catch {}
    }

    return true;
  }
}

export const defaultUserKeyVault = new UserKeyVaultService();
