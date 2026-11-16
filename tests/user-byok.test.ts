/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserKeyVaultService } from '../src/server/byok/userKeyVault';
import { ModelRouter } from '../src/server/providers/router';
import { AIProviderAdapter, AIProviderRequest, AIProviderResponse } from '../src/server/providers/base';

describe('User BYOK Key Vault (Bring Your Own Key)', () => {
  let vault: UserKeyVaultService;

  beforeEach(() => {
    vault = new UserKeyVaultService();
  });

  describe('Key Masking and Encryption', () => {
    it('masks keys preserving only prefix and suffix', () => {
      expect(vault.maskKey('sk-proj-1234567890abcdef')).toBe('sk-p••••••••cdef');
      expect(vault.maskKey('AIzaSyAbcdef1234567890xyz')).toBe('AIza••••••••0xyz');
      expect(vault.maskKey('short')).toBe('••••••••');
    });

    it('encrypts, stores, and decrypts user API keys securely', async () => {
      const userId = 'user_test_byok_01';
      const rawKey = 'sk-proj-secret-test-openai-key-2026';

      await vault.saveUserKey(userId, 'openai', rawKey, ['gpt-4o', 'o1']);

      // 1. Summary should NEVER leak plaintext
      const summary = await vault.getUserKeySummary(userId);
      expect(summary).toHaveLength(1);
      expect(summary[0].provider).toBe('openai');
      expect(summary[0].masked).toContain('••••••••');
      expect(summary[0].masked).not.toBe(rawKey);

      // 2. Decryption should recover the exact original plaintext for server execution
      const decryptedKeys = await vault.getUserApiKeys(userId);
      expect(decryptedKeys.openai).toBe(rawKey);

      // 3. Delete should cleanly remove the key
      await vault.deleteUserKey(userId, 'openai');
      const emptyKeys = await vault.getUserApiKeys(userId);
      expect(emptyKeys.openai).toBeUndefined();
    });
  });

  describe('Live Provider Key Validation', () => {
    it('validates OpenAI key against models endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: 'gpt-4o' }, { id: 'o1' }, { id: 'o3-mini' }],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const res = await vault.validateProviderKey('openai', 'sk-test-valid-key');
      expect(res.valid).toBe(true);
      expect(res.accessibleModels).toContain('gpt-4o');
      expect(res.accessibleModels).toContain('o1');

      vi.unstubAllGlobals();
    });

    it('handles unauthorized/invalid key response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: { message: 'Incorrect API key provided' },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const res = await vault.validateProviderKey('anthropic', 'sk-ant-invalid');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Incorrect API key provided');

      vi.unstubAllGlobals();
    });
  });

  describe('Model Execution with User BYOK Override', () => {
    it('executes model request using userApiKeys override', async () => {
      const router = new ModelRouter();

      let receivedKey: string | undefined;

      const mockAdapter: AIProviderAdapter = {
        id: 'openai',
        name: 'OpenAI Mock',
        isConfigured: (keyOverride?: string) => Boolean(keyOverride),
        generateContent: async (req: AIProviderRequest): Promise<AIProviderResponse> => {
          receivedKey = req.apiKeyOverride;
          return { text: `Generated response using custom key: ${req.apiKeyOverride}` };
        },
      };

      router.registerAdapter(mockAdapter);

      const response = await router.generateContent({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hello' }],
        userApiKeys: { openai: 'sk-user-custom-key-12345' },
      });

      expect(receivedKey).toBe('sk-user-custom-key-12345');
      // Secret scanner automatically redacts raw API key from generated output for security
      expect(response.text).toContain('[REDACTED_SECRET]');
    });
  });
});
