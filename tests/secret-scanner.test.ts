/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import {
  scanFileForSecrets,
  containsSecrets,
  redactSecretsInText,
} from '../src/services/git/secretScanner';

describe('Pre-Commit Secret Scanner Engine (Phase 1 SEC-05)', () => {
  it('detects OpenAI API key and returns redacted line report', () => {
    const content = 'const key = "sk-proj-123456789012345678901234567890";';
    const leaks = scanFileForSecrets('src/config.ts', content);

    expect(leaks.length).toBe(1);
    expect(leaks[0].ruleName).toBe('OpenAI API Key');
    expect(leaks[0].path).toBe('src/config.ts');
    expect(leaks[0].redactedSnippet).toContain('[LEAKED_OPENAI_API_KEY:');
  });

  it('detects GitHub Personal Access Tokens and fine-grained tokens', () => {
    const classicContent = 'export const GITHUB_TOKEN = "ghp_123456789012345678901234567890123456";';
    const leaksClassic = scanFileForSecrets('.env', classicContent);
    expect(leaksClassic.length).toBe(1);
    expect(leaksClassic[0].ruleName).toBe('GitHub Personal Access Token');

    const fineGrainedContent = 'export const GH_PAT = "github_pat_11ABCD1234567890abcdefghijklmnopqrstuvwxyz1234567890";';
    const leaksFine = scanFileForSecrets('.env', fineGrainedContent);
    expect(leaksFine.length).toBe(1);
    expect(leaksFine[0].ruleName).toBe('GitHub Personal Access Token');
  });

  it('detects JSON Web Tokens (JWTs)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const content = `const userToken = "${jwt}";`;
    const leaks = scanFileForSecrets('auth.ts', content);
    expect(leaks.length).toBe(1);
    expect(leaks[0].ruleName).toBe('JSON Web Token (JWT)');
  });

  it('detects unencrypted private key blocks', () => {
    const rsaContent = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----';
    expect(containsSecrets(rsaContent)).toBe(true);

    const opensshContent = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAA...\n-----END OPENSSH PRIVATE KEY-----';
    expect(containsSecrets(opensshContent)).toBe(true);
  });

  it('detects Google, AWS, and Stripe credentials', () => {
    const content = `
      GOOGLE_KEY=AIzaSyD9876543210abcdefghijklmnop123
      AWS_KEY=AKIAIOSFODNN7EXAMPLE
      STRIPE_SECRET=sk_test_51Abcd1234567890abcdef123456
    `;
    const leaks = scanFileForSecrets('credentials.env', content);
    expect(leaks.length).toBe(3);
    const rules = leaks.map(l => l.ruleName);
    expect(rules).toContain('Google API Key');
    expect(rules).toContain('AWS Access Key ID');
    expect(rules).toContain('Stripe Secret Key');
  });

  it('returns zero leaks for standard clean code', () => {
    const content = `
      import express from 'express';
      const app = express();
      app.get('/health', (req, res) => res.json({ status: 'ok' }));
      export default app;
    `;
    const leaks = scanFileForSecrets('src/app.ts', content);
    expect(leaks.length).toBe(0);
    expect(containsSecrets(content)).toBe(false);
  });

  describe('redactSecretsInText utility function', () => {
    it('redacts API keys, JWTs, private keys, and cloud tokens from text payloads', () => {
      const rawText = `
        Logging session details:
        JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz1234567890
        OpenAI: sk-proj-123456789012345678901234567890
        GitHub: ghp_1234567890abcdef1234567890123456
        Google: AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6
        Key:
        -----BEGIN RSA PRIVATE KEY-----
        MIIEowIBAAKCAQEA0
        -----END RSA PRIVATE KEY-----
      `;

      const redacted = redactSecretsInText(rawText);
      expect(redacted).not.toContain('eyJhbGci');
      expect(redacted).not.toContain('sk-proj-');
      expect(redacted).not.toContain('ghp_');
      expect(redacted).not.toContain('AIzaSy');
      expect(redacted).not.toContain('MIIEowIBAAKCAQEA0');
      expect(redacted).toContain('[REDACTED_JWT]');
      expect(redacted).toContain('[REDACTED_SECRET]');
      expect(redacted).toContain('[REDACTED_PRIVATE_KEY]');
    });
  });
});
