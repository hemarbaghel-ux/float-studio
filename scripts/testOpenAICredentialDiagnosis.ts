import dotenv from 'dotenv';
import path from 'path';
import { OpenAIAdapter, normalizeOpenAIError } from '../src/server/providers/openai';
import { AIProviderError } from '../src/server/providers/base';

// Load local environment files
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`  PASS: ${message}`);
}

async function runDiagnosisSuite() {
  console.log('\n======================================================');
  console.log('FLOAT OPENAI CREDENTIAL SELECTION & DIAGNOSIS TEST');
  console.log('======================================================');

  // --- Suite 1: Credential Resolution Consistency & Precedence ---
  console.log('\n--- Suite 1: Credential Precedence & Consistency ---');
  const originalEnv = { ...process.env };

  try {
    const adapter = new OpenAIAdapter();

    // Case 1A: Only OPENAI_API_KEY set
    process.env.OPENAI_API_KEY = '  sk-primary-test-key-12345  ';
    delete process.env.CODEX_API_KEY;
    delete process.env.OPENAI_ENVIRONMENT_KEY;

    assert(adapter.isConfigured() === true, 'adapter.isConfigured() returns true when OPENAI_API_KEY is present');
    assert(adapter.resolveApiKey('gpt-4o') === 'sk-primary-test-key-12345', 'resolveApiKey for gpt-4o returns trimmed OPENAI_API_KEY');
    assert(adapter.resolveApiKey('gpt-4o-mini') === 'sk-primary-test-key-12345', 'resolveApiKey for gpt-4o-mini returns trimmed OPENAI_API_KEY');
    assert(adapter.resolveApiKey('float-basic') === 'sk-primary-test-key-12345', 'resolveApiKey for float-basic returns trimmed OPENAI_API_KEY');

    // Case 1B: Precedence - OPENAI_API_KEY overrides CODEX_API_KEY for standard models
    process.env.CODEX_API_KEY = 'sk-legacy-codex-key';
    assert(adapter.resolveApiKey('gpt-4o') === 'sk-primary-test-key-12345', 'OPENAI_API_KEY takes precedence over CODEX_API_KEY for gpt-4o');

    // Case 1C: Cloud preview model selects CODEX_API_KEY when specified
    assert(adapter.resolveApiKey('gpt-6-astra') === 'sk-legacy-codex-key', 'Cloud preview model selects cloud key');

    // Case 1D: Placeholder values are rejected
    process.env.OPENAI_API_KEY = 'replace_with_your_key';
    delete process.env.CODEX_API_KEY;
    delete process.env.OPENAI_ENVIRONMENT_KEY;
    assert(adapter.isConfigured() === false, 'Placeholder keys with replace_with are rejected as unconfigured');
    assert(adapter.resolveApiKey() === undefined, 'Placeholder keys return undefined from resolveApiKey');

    // Case 1E: Completely unset
    delete process.env.OPENAI_API_KEY;
    assert(adapter.isConfigured() === false, 'Unset environment reports configured: false');
    assert(adapter.resolveApiKey() === undefined, 'Unset environment returns undefined');
  } finally {
    process.env = originalEnv;
  }

  // --- Suite 2: Error Normalization, Status Mapping, and Secret Redaction ---
  console.log('\n--- Suite 2: Error Normalization & Secret Redaction ---');
  
  // 401 with raw secret embedded in message
  const raw401Error = {
    status: 401,
    message: 'Incorrect API key provided: sk-abcdef1234567890abcdef. Please check your account.'
  };
  const norm401 = normalizeOpenAIError(raw401Error);
  assert(norm401 instanceof AIProviderError, 'Normalized error is AIProviderError instance');
  assert(norm401.code === 'AUTH_ERROR', 'HTTP 401 normalizes to AUTH_ERROR');
  assert(norm401.statusCode === 401, 'HTTP 401 maps to status code 401');
  assert(!JSON.stringify(norm401).includes('sk-abcdef1234567890abcdef'), 'Secret value in error message is strictly redacted');
  assert(JSON.stringify(norm401).includes('sk-[REDACTED]'), 'Redacted marker is present in sanitized error');

  // 403 Permission Denied
  const raw403Error = {
    status: 403,
    message: 'Country, region, or territory not supported or permission_denied.'
  };
  const norm403 = normalizeOpenAIError(raw403Error);
  assert(norm403.code === 'AUTH_ERROR', 'HTTP 403 normalizes to AUTH_ERROR');
  assert(norm403.statusCode === 403, 'HTTP 403 maps to status code 403');

  // 404 Model Not Found
  const raw404Error = {
    status: 404,
    message: 'The model gpt-unknown does not exist or you do not have access.'
  };
  const norm404 = normalizeOpenAIError(raw404Error);
  assert(norm404.code === 'MODEL_NOT_FOUND', 'HTTP 404 normalizes to MODEL_NOT_FOUND');
  assert(norm404.statusCode === 404, 'HTTP 404 maps to status code 404');

  // 429 Quota Exceeded vs Rate Limited
  const rawQuotaError = {
    status: 429,
    message: 'You exceeded your current quota, please check your plan and billing details.'
  };
  const normQuota = normalizeOpenAIError(rawQuotaError);
  assert(normQuota.code === 'QUOTA_EXCEEDED', 'Quota message normalizes to QUOTA_EXCEEDED');

  const rawRateError = {
    status: 429,
    message: 'Rate limit reached for requests per min.'
  };
  const normRate = normalizeOpenAIError(rawRateError);
  assert(normRate.code === 'RATE_LIMITED', 'Rate limit message normalizes to RATE_LIMITED');

  // Network / 502 error
  const raw502Error = {
    status: 502,
    message: 'Bad gateway connecting to upstream cluster.'
  };
  const norm502 = normalizeOpenAIError(raw502Error);
  assert(norm502.code === 'PROVIDER_ERROR', '502 maps to PROVIDER_ERROR');
  assert(norm502.statusCode === 502, '502 maps to statusCode 502');

  // --- Suite 3: Safe Diagnostic Probe of Actual Configured Environment ---
  console.log('\n--- Suite 3: Safe Live Authentication Diagnostic Probe ---');
  const realAdapter = new OpenAIAdapter();
  const isConfigured = realAdapter.isConfigured();
  console.log(`  Configured in current environment: ${isConfigured}`);

  if (!isConfigured) {
    console.log('  [DIAGNOSTIC RESULT] OpenAI is NOT configured (no key present or placeholder).');
  } else {
    try {
      const health = await realAdapter.checkHealth();
      if (health.authenticated && health.modelAvailable) {
        console.log('  [DIAGNOSTIC RESULT] LIVE AUTHENTICATION SUCCESSFUL: Upstream OpenAI models listed and accessible.');
      } else {
        console.log(`  [DIAGNOSTIC RESULT] LIVE AUTHENTICATION FAILED: ${health.error}`);
        assert(health.configured === true, 'Health check indicates configured: true');
        assert(health.authenticated === false, 'Health check indicates authenticated: false');
        assert(health.modelAvailable === false, 'Health check indicates modelAvailable: false');
      }
    } catch (err: any) {
      console.log(`  [DIAGNOSTIC RESULT] Caught unexpected health check failure: ${err.message}`);
    }
  }

  console.log('\n======================================================');
  console.log('ALL DIAGNOSIS & REGRESSION CHECKS PASSED');
  console.log('======================================================\n');
}

runDiagnosisSuite().catch(err => {
  console.error('Fatal error in diagnosis suite:', err);
  process.exit(1);
});
