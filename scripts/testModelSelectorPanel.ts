import { INITIAL_MODELS } from '../src/features/ai/registry';
import { DASHBOARD_MODELS } from '../src/features/dashboard/dashboardModels';
import { filterVisibleModelsForUI } from '../src/store/aiStore';
import {
  formatContextWindow,
  getModelCapabilitiesList,
  getVersionOrEffort,
  getAvailabilityDisplay,
  getCleanModelName,
  getModelProviderName
} from '../src/features/ai/modelSelector/ModelInfoCard';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

console.log('=== Testing FLOAT AI Model Selector & Hover Information Panel (Phase 2) ===\n');

// 1. Verify flagship models in DASHBOARD_MODELS (Gemini 4 Argon, GPT-6 Astra, GPT-6 Sol)
assert(DASHBOARD_MODELS.length === 3, `DASHBOARD_MODELS contains 3 flagship models (found ${DASHBOARD_MODELS.length})`);

const argon = DASHBOARD_MODELS.find((m) => m.id === 'gemini-4-argon')!;
assert(Boolean(argon), 'Gemini 4 Argon is present in DASHBOARD_MODELS');
assert(argon?.displayName === 'Gemini 4 Argon', 'Gemini 4 Argon displayName is "Gemini 4 Argon"');
assert(argon?.id === 'gemini-4-argon' && argon?.apiModelId === 'gemini-4-argon', 'Gemini 4 Argon id equals real upstream apiModelId');
assert(argon?.provider === 'Google Gemini' && argon?.providerId === 'google', 'Gemini 4 Argon provider is Google Gemini');
assert(argon?.limits?.maxOutputTokens === 1000000, 'Gemini 4 Argon maxOutputTokens is 1M (1,000,000)');
assert(formatContextWindow(argon?.contextWindow) === '1M context window', 'Gemini 4 Argon context window is 1M');

const astra = DASHBOARD_MODELS.find((m) => m.id === 'gpt-6-astra')!;
assert(Boolean(astra), 'GPT-6 Astra is present in DASHBOARD_MODELS');
assert(astra?.displayName.includes('GPT-6 Astra'), 'GPT-6 Astra displayName includes "GPT-6 Astra"');
assert(astra?.id === 'gpt-6-astra' && astra?.apiModelId === 'gpt-6-astra', 'GPT-6 Astra id equals real upstream apiModelId');
assert(astra?.reasoningLevel === 'Balanced', 'GPT-6 Astra reasoningLevel is "Balanced"');
assert(astra?.version === 'gpt-6-astra', 'GPT-6 Astra version is gpt-6-astra');
assert(formatContextWindow(astra?.contextWindow) === '1M context window', `GPT-6 Astra context window formatted as 1M context window (got: ${formatContextWindow(astra?.contextWindow)})`);
assert(astra?.provider === 'OpenAI', 'GPT-6 Astra provider is OpenAI');

const sol = DASHBOARD_MODELS.find((m) => m.id === 'gpt-6-sol')!;
assert(Boolean(sol), 'GPT-6 Sol is present in DASHBOARD_MODELS');
assert(sol?.isNew === true, 'GPT-6 Sol has isNew: true');
assert(sol?.reasoningLevel === 'High', 'GPT-6 Sol reasoningLevel is "High"');
assert(sol?.version === 'gpt-6-sol', 'GPT-6 Sol version is gpt-6-sol');
assert(formatContextWindow(sol?.contextWindow) === '1M context window', `GPT-6 Sol context window formatted as 1M context window (got: ${formatContextWindow(sol?.contextWindow)})`);
assert(sol?.provider === 'OpenAI', 'GPT-6 Sol provider is OpenAI');

// 2. Verify no fake aliases and no gpt-6.1-sol in INITIAL_MODELS
assert(!INITIAL_MODELS.some((m) => m.id === 'float-basic'), 'float-basic alias is absent from INITIAL_MODELS');
assert(!INITIAL_MODELS.some((m) => m.id === 'gpt-6.1-sol'), 'gpt-6.1-sol is removed from INITIAL_MODELS');
for (const expectedId of ['gemini-4-argon', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5']) {
  assert(INITIAL_MODELS.some((m) => m.id === expectedId), `INITIAL_MODELS includes catalog model ${expectedId}`);
}
INITIAL_MODELS.forEach((m) => {
  assert(Boolean(m.id), `${m.displayName} has id`);
  assert(m.id === (m.apiModelId || m.exactModelId), `${m.displayName} id (${m.id}) matches exact upstream ID (${m.apiModelId || m.exactModelId})`);
  assert(Boolean(m.displayName), `${m.displayName} has displayName`);
  assert(Boolean(m.description), `${m.displayName} has description`);
  assert(Boolean(m.contextWindow), `${m.displayName} has contextWindow`);
  assert(Boolean(m.status), `${m.displayName} has status`);
});

// 3. Verify UI hides models when provider key is missing or health check fails
const visibleWhenUnconfigured = filterVisibleModelsForUI(
  INITIAL_MODELS.map((m) => ({
    ...m,
    status: m.providerId === 'google' ? 'AVAILABLE' : 'CONFIG_REQUIRED'
  })),
  {
    google: { enabled: true, configured: true, defaultModel: 'gemini-4-argon' },
    openai: { enabled: true, configured: false, defaultModel: 'gpt-6-astra' },
    anthropic: { enabled: true, configured: false, defaultModel: 'claude-sonnet-5-5' }
  },
  {},
  true
);
assert(
  visibleWhenUnconfigured.length === 1 && visibleWhenUnconfigured[0].id === 'gemini-4-argon',
  'UI filter hides models whose provider key is missing'
);

const visibleWhenHealthFails = filterVisibleModelsForUI(
  INITIAL_MODELS.map((m) => ({ ...m, status: 'AVAILABLE' })),
  {
    google: { enabled: true, configured: true, defaultModel: 'gemini-4-argon' },
    openai: { enabled: true, configured: true, defaultModel: 'gpt-6-astra' },
    anthropic: { enabled: true, configured: true, defaultModel: 'claude-sonnet-5-5' }
  },
  { 'gpt-6-sol': 'error' },
  true
);
assert(
  !visibleWhenHealthFails.some((m) => m.id === 'gpt-6-sol'),
  'UI filter hides models whose health check failed'
);

// 4. Test formatContextWindow helper
assert(formatContextWindow(128000) === '128k context window', 'formatContextWindow handles 128000 as 128k');
assert(formatContextWindow(200000) === '200k context window', 'formatContextWindow handles 200000 as 200k');
assert(formatContextWindow(262144) === '256k context window', 'formatContextWindow handles 262144 as 256k');
assert(formatContextWindow(1048576) === '1M context window', 'formatContextWindow handles 1048576 as 1M');
assert(formatContextWindow(undefined) === 'Information unavailable', 'formatContextWindow returns Information unavailable for undefined');

// 5. Test getVersionOrEffort helper
assert(getVersionOrEffort(astra) === 'Version: gpt-6-astra', 'getVersionOrEffort extracts version');
assert(getVersionOrEffort({} as any) === 'Information unavailable', 'getVersionOrEffort returns Information unavailable for empty model');

// 6. Test getModelCapabilitiesList helper
const astraCaps = getModelCapabilitiesList(astra);
assert(astraCaps.includes('Coding'), 'GPT-6 Astra capabilities includes Coding');
assert(astraCaps.includes('Reasoning'), 'GPT-6 Astra capabilities includes Reasoning');
assert(astraCaps.includes('Tool use'), 'GPT-6 Astra capabilities includes Tool use');
assert(astraCaps.includes('Vision'), 'GPT-6 Astra capabilities includes Vision');

// 7. Test getAvailabilityDisplay helper ("Available" when key present, "Add key to enable" when missing)
const availConfigured = getAvailabilityDisplay({ ...astra, status: 'AVAILABLE', availability: 'Available' });
assert(availConfigured.label === 'Available', 'Configured model availability label is Available');
assert(availConfigured.color === 'green', 'Configured model availability color is green');

const availUnconfigured = getAvailabilityDisplay({ ...astra, status: 'CONFIG_REQUIRED', availability: 'Add key to enable' });
assert(availUnconfigured.label === 'Add key to enable', 'Unconfigured model availability label is "Add key to enable"');
assert(availUnconfigured.color === 'amber', 'Unconfigured model availability color is amber');

// 8. Test clean model name helper
assert(getCleanModelName('Auto Dynamic Balanced', 'Auto') === 'Auto', 'getCleanModelName strips Router suffix');
assert(getCleanModelName('OpenAI GPT-4o', 'GPT-4o') === 'GPT-4o', 'getCleanModelName strips OpenAI prefix');

// 9. Model provider display name
assert(getModelProviderName(astra) === 'OpenAI', 'getModelProviderName returns OpenAI for GPT-6 Astra');
assert(getModelProviderName(argon) === 'Google Gemini', 'getModelProviderName returns Google Gemini for Gemini 4 Argon');

console.log(`\n======================================================`);
console.log(`Model Selector Panel Test Results: ${passed} passed, ${failed} failed.`);
console.log(`======================================================`);

if (failed > 0) {
  process.exit(1);
}
