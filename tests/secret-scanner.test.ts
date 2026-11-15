/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import { scanFileForSecrets, containsSecrets } from '../src/services/git/secretScanner';

describe('Pre-Commit Secret Scanner Engine', () => {
  it('detects OpenAI API key and returns redacted line report', () => {
    const content = 'const key = "sk-proj-123456789012345678901234567890";';
    const leaks = scanFileForSecrets('src/config.ts', content);

    expect(leaks.length).toBe(1);
    expect(leaks[0].ruleName).toBe('OpenAI API Key');
    expect(leaks[0].path).toBe('src/config.ts');
    expect(leaks[0].redactedSnippet).toContain('[LEAKED_OPENAI_API_KEY:');
  });

  it('detects GitHub Personal Access Tokens', () => {
    const content = 'export const GITHUB_TOKEN = "ghp_123456789012345678901234567890123456";';
    const leaks = scanFileForSecrets('.env', content);

    expect(leaks.length).toBe(1);
    expect(leaks[0].ruleName).toBe('GitHub Personal Access Token');
  });

  it('detects unencrypted private key blocks', () => {
    const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----';
    expect(containsSecrets(content)).toBe(true);
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
});
