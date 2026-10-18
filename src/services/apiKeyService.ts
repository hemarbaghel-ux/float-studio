/**
 * Centralized User API Key Service (Cursor-style BYOK)
 *
 * Manages user-provided API keys for multiple providers (OpenAI, Anthropic, Gemini, DeepSeek)
 * stored securely in the browser and passed to backend routes when available.
 */

export interface UserApiKeys {
  openai?: string;
  anthropic?: string;
  deepseek?: string;
  gemini?: string;
}

export interface KeyVerificationResult {
  valid: boolean;
  message: string;
  provider: string;
}

const STORAGE_KEY = 'float_user_api_keys_v1';

export function getUserApiKeys(): UserApiKeys {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('[apiKeyService] Failed to read user keys from storage:', e);
    return {};
  }
}

export function saveUserApiKeys(keys: Partial<UserApiKeys>): UserApiKeys {
  const current = getUserApiKeys();
  const updated: UserApiKeys = {
    openai: keys.openai !== undefined ? keys.openai.trim() : current.openai,
    anthropic: keys.anthropic !== undefined ? keys.anthropic.trim() : current.anthropic,
    deepseek: keys.deepseek !== undefined ? keys.deepseek.trim() : current.deepseek,
    gemini: keys.gemini !== undefined ? keys.gemini.trim() : current.gemini,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('float-api-keys-changed', { detail: updated }));
  } catch (e) {
    console.warn('[apiKeyService] Failed to save user keys to storage:', e);
  }

  return updated;
}

export function clearUserApiKeys(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('float-api-keys-changed', { detail: {} }));
  } catch (e) {
    console.warn('[apiKeyService] Failed to clear user keys:', e);
  }
}

/**
 * Check if a provider has an active key configured.
 * Google Gemini always returns true due to built-in free tier.
 */
export function isProviderConfigured(provider: 'openai' | 'anthropic' | 'deepseek' | 'gemini'): boolean {
  if (provider === 'gemini') return true; // Built-in free tier active
  const keys = getUserApiKeys();
  return Boolean(keys[provider]?.trim());
}

/**
 * Verify a key via the server-side verification proxy.
 */
export async function verifyApiKey(provider: string, key: string): Promise<KeyVerificationResult> {
  if (!key.trim()) {
    return { valid: false, message: 'API key cannot be empty.', provider };
  }

  try {
    const response = await fetch('/api/ai/verify-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, key: key.trim() }),
    });

    const data = await response.json().catch(() => ({}));
    if (data.valid) {
      return { valid: true, message: data.message || `${provider} key verified successfully!`, provider };
    }
    return { valid: false, message: data.message || `Verification failed (${response.status})`, provider };
  } catch (err: any) {
    return { valid: false, message: err.message || 'Network error during verification', provider };
  }
}
