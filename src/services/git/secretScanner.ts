/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Secret Leak Scanner for Git Commits & Pushes (Phase 8)
 *
 * Scans staged file content before commits and remote pushes to prevent accidental
 * credential leakage. Detects API keys, tokens, and private keys with line-level reporting.
 */

export interface SecretLeakMatch {
  readonly path: string;
  readonly line: number;
  readonly ruleName: string;
  readonly redactedSnippet: string;
}

export interface SecretRule {
  readonly name: string;
  readonly pattern: RegExp;
  readonly description: string;
}

export const SECRET_SCAN_RULES: readonly SecretRule[] = [
  {
    name: 'OpenAI API Key',
    pattern: /sk-(?:proj-|live-|test-)?[a-zA-Z0-9_-]{20,}/,
    description: 'OpenAI project or secret API key',
  },
  {
    name: 'Anthropic API Key',
    pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/,
    description: 'Anthropic Claude API key',
  },
  {
    name: 'Database URL with Password',
    pattern: /(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^:\s]+:[^@\s]+@[^\s]+/,
    description: 'Database connection URI containing authentication credentials',
  },
  {
    name: 'GitHub Personal Access Token',
    pattern: /(?:gh[pousr]_[a-zA-Z0-9]{16,}|github_pat_[a-zA-Z0-9_]{30,})/,
    description: 'GitHub personal access token or fine-grained token',
  },
  {
    name: 'Google API Key',
    pattern: /AIzaSy[a-zA-Z0-9_-]{25,}/,
    description: 'Google Cloud / Gemini API key',
  },
  {
    name: 'AWS Access Key ID',
    pattern: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/,
    description: 'AWS access key identifier',
  },
  {
    name: 'Slack Token',
    pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/,
    description: 'Slack bot or user access token',
  },
  {
    name: 'Stripe Secret Key',
    pattern: /sk_(?:live|test)_[0-9a-zA-Z]{24,}/,
    description: 'Stripe secret API key',
  },
  {
    name: 'Private Key Block',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/,
    description: 'Unencrypted cryptographic private key block',
  },
  {
    name: 'JSON Web Token (JWT)',
    pattern: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/,
    description: 'Signed JSON Web Token credential',
  },
];

/**
 * Scans a single file's text content line by line against active secret rules.
 */
export function scanFileForSecrets(filePath: string, content: string): SecretLeakMatch[] {
  if (!content || typeof content !== 'string') return [];

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const matches: SecretLeakMatch[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comment placeholders or documentation examples
    if (line.includes('your_api_key_here') || line.includes('sk-xxx') || line.includes('REDACTED')) {
      continue;
    }

    for (const rule of SECRET_SCAN_RULES) {
      const match = rule.pattern.exec(line);
      if (match) {
        const rawSecret = match[0];
        const redacted = rawSecret.length > 8
          ? `${rawSecret.slice(0, 4)}...${rawSecret.slice(-4)}`
          : '***';

        matches.push({
          path: filePath,
          line: i + 1,
          ruleName: rule.name,
          redactedSnippet: line.replace(rawSecret, `[LEAKED_${rule.name.toUpperCase().replace(/\s+/g, '_')}: ${redacted}]`).trim(),
        });
      }
    }
  }

  return matches;
}

/**
 * Scans a map of file paths to proposed content.
 */
export function scanChangesForSecrets(files: Map<string, string> | Record<string, string>): SecretLeakMatch[] {
  const matches: SecretLeakMatch[] = [];
  const entries = files instanceof Map ? files.entries() : Object.entries(files);

  for (const [filePath, content] of entries) {
    matches.push(...scanFileForSecrets(filePath, content));
  }

  return matches;
}

/**
 * Checks whether the given string content contains any detectable secrets.
 */
export function containsSecrets(content: string): boolean {
  return scanFileForSecrets('buffer', content).length > 0;
}

/**
 * Redacts detectable secrets (API keys, JWTs, private keys, cloud tokens)
 * from arbitrary text buffers, terminal outputs, and prompt payloads.
 */
export function redactSecretsInText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let sanitized = text;
  // Redact private key blocks completely
  sanitized = sanitized.replace(/-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/g, '[REDACTED_PRIVATE_KEY]');
  // Redact single-line private key headers if not closed
  sanitized = sanitized.replace(/-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/g, '[REDACTED_PRIVATE_KEY]');
  // Redact JWTs
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, '[REDACTED_JWT]');
  // Redact API keys and tokens
  sanitized = sanitized.replace(/sk-(?:proj-|live-|test-)?[a-zA-Z0-9_-]{20,}/g, '[REDACTED_SECRET]');
  sanitized = sanitized.replace(/sk-ant-[a-zA-Z0-9_-]{20,}/g, '[REDACTED_SECRET]');
  sanitized = sanitized.replace(/(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^:\s]+:[^@\s]+@[^\s]+/gi, '[REDACTED_DB_URL]');
  sanitized = sanitized.replace(/(?:gh[pousr]_[a-zA-Z0-9]{16,}|github_pat_[a-zA-Z0-9_]{30,})/g, '[REDACTED_SECRET]');
  sanitized = sanitized.replace(/AIzaSy[a-zA-Z0-9_-]{25,}/g, '[REDACTED_SECRET]');
  sanitized = sanitized.replace(/(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g, '[REDACTED_SECRET]');
  sanitized = sanitized.replace(/xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g, '[REDACTED_SECRET]');
  sanitized = sanitized.replace(/sk_(?:live|test)_[0-9a-zA-Z]{24,}/g, '[REDACTED_SECRET]');
  return sanitized;
}

/**
 * Deeply sanitizes arbitrary nested objects (messages, tool arguments, metadata)
 * by applying secret redaction without mutating original input objects or workspace files.
 */
export function sanitizeOutboundPayload<T>(payload: T): T {
  if (typeof payload === 'string') {
    return redactSecretsInText(payload) as unknown as T;
  }
  if (payload === null || typeof payload !== 'object') {
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload.map(item => sanitizeOutboundPayload(item)) as unknown as T;
  }
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(payload)) {
    result[key] = sanitizeOutboundPayload(val);
  }
  return result as T;
}
