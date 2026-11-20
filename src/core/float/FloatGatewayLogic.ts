/**
 * FLOAT Studio — Model Gateway & BYOK Encryption Engine
 * 
 * Provides multi-model provider routing, 256-bit AES-GCM BYOK credential vaults,
 * Shannon entropy validation, and outbound payload secret scrubbing.
 */

import * as crypto from 'crypto';
import { ModelGatewayRequest, ModelGatewayResponse } from './types';

export class FloatGatewayLogic {
  private encryptionKey: Buffer;
  private byokVault = new Map<string, { encryptedKey: string; iv: string; tag: string; version: number }>();

  constructor(encryptionKeyHex?: string) {
    if (encryptionKeyHex && encryptionKeyHex.length >= 64) {
      this.encryptionKey = Buffer.from(encryptionKeyHex.slice(0, 64), 'hex');
    } else {
      // Ephemeral 256-bit AES key for runtime testing
      this.encryptionKey = crypto.randomBytes(32);
    }
  }

  /**
   * Calculate Shannon entropy in bits per character
   * H = - sum(p_i * log2(p_i))
   */
  public calculateShannonEntropy(input: string): number {
    if (!input || input.length === 0) return 0;
    const freqs = new Map<string, number>();
    for (const ch of input) {
      freqs.set(ch, (freqs.get(ch) || 0) + 1);
    }
    let entropy = 0;
    const len = input.length;
    for (const count of freqs.values()) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  /**
   * Store user BYOK key with AES-256-GCM encryption and entropy validation
   */
  public storeUserKey(userId: string, provider: string, apiKey: string): { success: boolean; version: number } {
    if (!apiKey || apiKey.trim().length < 16) {
      throw new Error('INVALID_KEY: API key must be at least 16 characters.');
    }

    const entropy = this.calculateShannonEntropy(apiKey);
    if (entropy < 2.5) {
      throw new Error(`LOW_ENTROPY_KEY: Key entropy (${entropy.toFixed(2)} bits/char) is inadequate.`);
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    const vaultKey = `${userId}::${provider.toLowerCase()}`;
    this.byokVault.set(vaultKey, {
      encryptedKey: encrypted,
      iv: iv.toString('hex'),
      tag,
      version: 2
    });

    return { success: true, version: 2 };
  }

  /**
   * Retrieve and decrypt user BYOK key
   */
  public getUserKey(userId: string, provider: string): string | null {
    const vaultKey = `${userId}::${provider.toLowerCase()}`;
    const record = this.byokVault.get(vaultKey);
    if (!record) return null;

    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(record.iv, 'hex'));
      decipher.setAuthTag(Buffer.from(record.tag, 'hex'));
      let decrypted = decipher.update(record.encryptedKey, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      throw new Error('DECRYPTION_FAILED: Vault decryption failed. Key may have been re-keyed.');
    }
  }

  /**
   * Sanitize outbound payloads to prevent secret leakage
   */
  public sanitizeOutboundPrompt(prompt: string): { sanitized: string; redactedCount: number } {
    let sanitized = prompt;
    let redactedCount = 0;

    // Redact Anthropic keys: sk-ant-...
    const anthropicRegex = /sk-ant-[a-zA-Z0-9_\-]{30,}/g;
    sanitized = sanitized.replace(anthropicRegex, () => {
      redactedCount++;
      return '[REDACTED_ANTHROPIC_KEY]';
    });

    // Redact OpenAI keys: sk-proj-... or sk-...
    const openaiRegex = /sk-(?:proj-)?[a-zA-Z0-9_\-]{30,}/g;
    sanitized = sanitized.replace(openaiRegex, () => {
      redactedCount++;
      return '[REDACTED_OPENAI_KEY]';
    });

    // Redact database URIs: postgres://..., mongodb://..., redis://...
    const dbUriRegex = /(?:postgres|postgresql|mongodb|mysql|redis):\/\/[^\s"'`]+/g;
    sanitized = sanitized.replace(dbUriRegex, () => {
      redactedCount++;
      return '[REDACTED_DATABASE_URI]';
    });

    return { sanitized, redactedCount };
  }

  /**
   * Dispatch request through model gateway
   */
  public async executePrompt(request: ModelGatewayRequest): Promise<ModelGatewayResponse> {
    const startTime = Date.now();
    const { sanitized } = this.sanitizeOutboundPrompt(request.prompt);

    // Resolve provider from model name
    let provider = 'openai';
    if (request.model.includes('claude')) provider = 'anthropic';
    else if (request.model.includes('gemini')) provider = 'google';
    else if (request.model.includes('deepseek')) provider = 'deepseek';

    return {
      model: request.model,
      provider,
      text: `[Float AI Gateway: ${request.model}] Processed request: "${sanitized.slice(0, 100)}"`,
      usage: {
        promptTokens: Math.ceil(sanitized.length / 4),
        completionTokens: 25,
        totalTokens: Math.ceil(sanitized.length / 4) + 25
      },
      durationMs: Date.now() - startTime
    };
  }
}
