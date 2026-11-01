import assert from 'node:assert/strict';
import { OpenAIAdapter } from '../src/server/providers/openai';

async function main() {
  const adapter = new OpenAIAdapter();
  (adapter as any).isConfigured = () => true;

  (adapter as any).getClient = () => ({
    models: {
      list: async () => ({ data: [
        { id: 'gpt-6-astra' },
        { id: 'gpt-6.1-sol' },
        { id: 'gpt-4o' },
      ] }),
    },
  });
  const exactMatches = await adapter.checkHealth();
  assert.equal(exactMatches.authenticated, true);
  assert.equal(exactMatches.modelAvailable, false, 'model listing does not claim a successful generation');
  assert.equal(exactMatches.accessibleModelIds?.length, 2, 'exact model listing is reported separately from generation availability');
  assert.equal(exactMatches.defaultModel, 'gpt-6-astra');
  assert.deepEqual(exactMatches.accessibleModelIds, ['gpt-6-astra', 'gpt-6.1-sol']);
  assert.equal(exactMatches.modelAccess?.['gpt-6-astra']?.status, 'listed');
  assert.equal(exactMatches.modelAccess?.['gpt-6.1-sol']?.status, 'listed');
  assert.match(exactMatches.modelAccess?.['gpt-6-astra']?.detail || '', /generation access has not been verified/i);
  assert.equal(exactMatches.modelAccess?.['gpt-4o'], undefined, 'legacy IDs are not reported as selectable model access');

  (adapter as any).getClient = () => ({ models: { list: async () => ({ data: [{ id: 'gpt-4o' }, { id: 'o1' }] }) } });
  const legacyOnly = await adapter.checkHealth();
  assert.equal(legacyOnly.authenticated, true);
  assert.equal(legacyOnly.modelAvailable, false, 'unrelated legacy models do not imply selectable model access');
  assert.equal(legacyOnly.modelAccess?.['gpt-6-astra']?.status, 'not_listed');
  assert.equal(legacyOnly.modelAccess?.['gpt-6.1-sol']?.status, 'not_listed');

  (adapter as any).getClient = () => ({ models: { list: async () => { throw { status: 401, message: 'Invalid API key' }; } } });
  const authenticationFailure = await adapter.checkHealth();
  assert.equal(authenticationFailure.authenticated, false);
  assert.equal(authenticationFailure.modelAvailable, false);
  assert.equal(authenticationFailure.modelAccess?.['gpt-6-astra']?.status, 'unverified');
  assert.match(authenticationFailure.error || '', /authentication failed/i);

  (adapter as any).isConfigured = () => false;
  const unconfigured = await adapter.checkHealth();
  assert.equal(unconfigured.configured, false);
  assert.equal(unconfigured.modelAccess?.['gpt-6-astra']?.status, 'configuration_required');
  assert.equal(unconfigured.modelAccess?.['gpt-6.1-sol']?.status, 'configuration_required');
  console.log('OpenAI per-model access checks: 19 assertions passed.');
}

main()
  .catch((error) => {
    console.error('OpenAI per-model access checks failed:', error);
    process.exitCode = 1;
  });
