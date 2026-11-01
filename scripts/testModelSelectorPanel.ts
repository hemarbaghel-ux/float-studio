import { INITIAL_MODELS } from '../src/features/ai/registry';
import { DASHBOARD_MODELS } from '../src/features/dashboard/dashboardModels';
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

console.log('=== Testing FLOAT AI Model Selector & Hover Information Panel ===\n');

// 1. Verify dual-model focus in DASHBOARD_MODELS (GPT-6 Astra & GPT-6.1 Sol)
assert(DASHBOARD_MODELS.length === 2, `DASHBOARD_MODELS contains exactly 2 models (found ${DASHBOARD_MODELS.length})`);

const astra = DASHBOARD_MODELS.find(m => m.id === 'gpt-6-astra')!;
assert(Boolean(astra), 'GPT-6 Astra is present in DASHBOARD_MODELS');
assert(astra?.displayName === 'GPT-6 Astra', 'Model 1 uses the requested GPT-6 Astra display name');
assert(astra?.id === 'gpt-6-astra', 'Model 1 id is gpt-6-astra');
assert(astra?.reasoningLevel === undefined, 'GPT-6 Astra does not display an unverified speed or effort rating');
assert(astra?.version === 'gpt-6-astra', 'GPT-6 Astra version label uses the verified API model ID');
assert(formatContextWindow(astra?.contextWindow) === '1M context window', `GPT-6 Astra context window formatted as 1M context window (got: ${formatContextWindow(astra?.contextWindow)})`);
assert(astra?.provider === 'OpenAI', 'GPT-6 Astra provider is OpenAI');

const sol = DASHBOARD_MODELS.find(m => m.id === 'gpt-6.1-sol')!;
assert(Boolean(sol), 'GPT-6.1 Sol is present in DASHBOARD_MODELS');
assert(sol?.isNew !== true, 'GPT-6.1 Sol does not invent an unverified release badge');
assert(sol?.reasoningLevel === undefined, 'GPT-6.1 Sol does not display an unverified speed or effort rating');
assert(sol?.version === 'gpt-6.1-sol', 'GPT-6.1 Sol version label uses the verified API model ID');
assert(formatContextWindow(sol?.contextWindow) === '1M context window', `GPT-6.1 Sol context window formatted as 1M context window (got: ${formatContextWindow(sol?.contextWindow)})`);
assert(sol?.provider === 'OpenAI', 'GPT-6.1 Sol provider is OpenAI');

// 4. Metadata presence across models in registry
INITIAL_MODELS.forEach(m => {
  assert(Boolean(m.id), `${m.displayName} has id`);
  assert(Boolean(m.displayName), `${m.displayName} has displayName`);
  assert(Boolean(m.description), `${m.displayName} has description`);
  assert(Boolean(m.contextWindow), `${m.displayName} has contextWindow`);
  assert(Boolean(m.apiModelId || m.exactModelId), `${m.displayName} has valid backend apiModelId`);
  assert(Boolean(m.status), `${m.displayName} has status`);
});

// 5. Test formatContextWindow helper
assert(formatContextWindow(128000) === '128k context window', 'formatContextWindow handles 128000 as 128k');
assert(formatContextWindow(200000) === '200k context window', 'formatContextWindow handles 200000 as 200k');
assert(formatContextWindow(262144) === '256k context window', 'formatContextWindow handles 262144 as 256k');
assert(formatContextWindow(1048576) === '1M context window', 'formatContextWindow handles 1048576 as 1M');
assert(formatContextWindow(undefined) === 'Information unavailable', 'formatContextWindow returns Information unavailable for undefined');

// 6. Test getVersionOrEffort helper
assert(getVersionOrEffort(astra) === 'Version: gpt-6-astra', 'getVersionOrEffort displays the verified model ID when no effort level is selected');
assert(getVersionOrEffort({} as any) === 'Information unavailable', 'getVersionOrEffort returns Information unavailable for empty model');

// 7. Test getModelCapabilitiesList helper
const astraCaps = getModelCapabilitiesList(astra);
assert(astraCaps.includes('Coding'), 'GPT-6 Astra capabilities includes Coding');
assert(astraCaps.includes('Reasoning'), 'GPT-6 Astra capabilities includes Reasoning');
assert(astraCaps.includes('Tool use'), 'GPT-6 Astra capabilities includes Tool use');
assert(astraCaps.includes('Vision'), 'GPT-6 Astra capabilities includes Vision');

// 8. Test getAvailabilityDisplay helper
const astraAvail = getAvailabilityDisplay(astra);
assert(astraAvail.label === 'Access unverified', 'GPT-6 Astra does not claim account access without a provider check');
assert(astraAvail.color === 'slate', 'Unverified model access is not shown as successful');

// 9. Test clean model name helper
assert(getCleanModelName('Auto Dynamic Balanced', 'Auto') === 'Auto', 'getCleanModelName strips Router suffix');
assert(getCleanModelName('OpenAI GPT-4o', 'GPT-4o') === 'GPT-4o', 'getCleanModelName strips OpenAI prefix');

// 10. Model provider display name
assert(getModelProviderName(astra) === 'OpenAI', 'getModelProviderName returns OpenAI');

console.log(`\n======================================================`);
console.log(`Model Selector Panel Test Results: ${passed} passed, ${failed} failed.`);
console.log(`======================================================`);

if (failed > 0) {
  process.exit(1);
}
