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
assert(astra?.displayName.includes('GPT-6 Astra'), 'Model 1 is "GPT-6 Astra Flagship Coding"');
assert(astra?.id === 'gpt-6-astra', 'Model 1 id is gpt-6-astra');
assert(astra?.reasoningLevel === 'Balanced', 'GPT-6 Astra reasoningLevel is "Balanced"');
assert(astra?.version === 'preview-rt_7k2m', 'GPT-6 Astra version is preview-rt_7k2m');
assert(formatContextWindow(astra?.contextWindow) === '1M context window', `GPT-6 Astra context window formatted as 1M context window (got: ${formatContextWindow(astra?.contextWindow)})`);
assert(astra?.provider === 'OpenAI', 'GPT-6 Astra provider is OpenAI');

const sol = DASHBOARD_MODELS.find(m => m.id === 'gpt-6.1-sol')!;
assert(Boolean(sol), 'GPT-6.1 Sol is present in DASHBOARD_MODELS');
assert(sol?.isNew === true, 'GPT-6.1 Sol has isNew: true');
assert(sol?.reasoningLevel === 'High', 'GPT-6.1 Sol reasoningLevel is "High"');
assert(sol?.version === 'preview-sol-2025', 'GPT-6.1 Sol version is preview-sol-2025');
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
assert(getVersionOrEffort(astra) === 'Version: preview-rt_7k2m', 'getVersionOrEffort extracts version');
assert(getVersionOrEffort({} as any) === 'Information unavailable', 'getVersionOrEffort returns Information unavailable for empty model');

// 7. Test getModelCapabilitiesList helper
const astraCaps = getModelCapabilitiesList(astra);
assert(astraCaps.includes('Coding'), 'GPT-6 Astra capabilities includes Coding');
assert(astraCaps.includes('Reasoning'), 'GPT-6 Astra capabilities includes Reasoning');
assert(astraCaps.includes('Tool use'), 'GPT-6 Astra capabilities includes Tool use');
assert(astraCaps.includes('Vision'), 'GPT-6 Astra capabilities includes Vision');

// 8. Test getAvailabilityDisplay helper
const astraAvail = getAvailabilityDisplay(astra);
assert(astraAvail.label === 'Available', 'GPT-6 Astra availability label is Available');
assert(astraAvail.color === 'green', 'GPT-6 Astra availability color is green');

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
