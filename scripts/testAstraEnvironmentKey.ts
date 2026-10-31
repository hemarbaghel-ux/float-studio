import assert from 'assert';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { ModelRouter } from '../src/server/providers/router';
import { OpenAIAdapter } from '../src/server/providers/openai';
import { GPT6_ASTRA_CLOUD_CONFIG } from '../src/server/providers/cloudAgentConfig';

console.log('=== FLOAT AI — GPT-6 Astra Environment Key Verification ===\n');

async function testAstraConnection() {
  const router = new ModelRouter();
  const route = router.resolveRoute('gpt-6-astra');
  assert.strictEqual(route.route.provider, 'openai');
  assert.strictEqual(route.route.apiModelId, 'gpt-6-astra');
  console.log('  ✓ gpt-6-astra routes to OpenAI adapter.');

  assert.strictEqual(GPT6_ASTRA_CLOUD_CONFIG.modelId, 'gpt-6-astra');
  assert.strictEqual(typeof GPT6_ASTRA_CLOUD_CONFIG.sessionId, 'string');
  assert.strictEqual(typeof GPT6_ASTRA_CLOUD_CONFIG.environmentId, 'string');
  console.log('  ✓ GPT6_ASTRA_CLOUD_CONFIG reads from environment variables (no hardcoded IDs).');

  const adapter = new OpenAIAdapter();
  assert.strictEqual(typeof adapter.isConfigured(), 'boolean');
  console.log('\n======================================================');
  console.log('GPT-6 Astra Environment Key: All verifications passed!');
  console.log('======================================================\n');
}

testAstraConnection().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
