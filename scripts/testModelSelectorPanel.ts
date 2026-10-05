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

// 1. Verify 10 models in order
assert(DASHBOARD_MODELS.length === 10, `DASHBOARD_MODELS contains exactly 10 models (found ${DASHBOARD_MODELS.length})`);

const expectedNames = [
  'Grok 4.7 High Fast',
  'Grok 4.6 High Fast',
  'Composer 2.5 Fast',
  'Claude Opus 5.5 Medium',
  'Claude Opus 5 High',
  'GPT-5.6 Sol Medium',
  'Claude Fable 5.1 High',
  'Gemini 3.8 Flash High',
  'Muse Spark 1.3 High',
  'Claude Sonnet 5.5 High'
];

expectedNames.forEach((expected, i) => {
  assert(DASHBOARD_MODELS[i]?.displayName === expected, `Model ${i + 1} is "${expected}"`);
});

// 2. Grok 4.7 NEW badge & metadata
const grok47 = DASHBOARD_MODELS[0];
assert(grok47.isNew === true, 'Grok 4.7 has isNew: true');
assert(grok47.reasoningLevel === 'High Fast', 'Grok 4.7 reasoningLevel is "High Fast"');
assert(grok47.version === 'high effort', 'Grok 4.7 version is "high effort"');
assert(formatContextWindow(grok47.contextWindow) === '256k context window', `Grok 4.7 context window formatted as 256k context window (got: ${formatContextWindow(grok47.contextWindow)})`);
assert(grok47.provider === 'xAI', 'Grok 4.7 provider is xAI');

// 3. Metadata presence across all models in registry
INITIAL_MODELS.slice(0, 10).forEach(m => {
  assert(Boolean(m.id), `${m.displayName} has id`);
  assert(Boolean(m.displayName), `${m.displayName} has displayName`);
  assert(Boolean(m.description), `${m.displayName} has description`);
  assert(Boolean(m.contextWindow), `${m.displayName} has contextWindow`);
  assert(Boolean(m.apiModelId || m.exactModelId), `${m.displayName} has valid backend apiModelId`);
  assert(Boolean(m.status), `${m.displayName} has status`);
});

// 4. Test formatContextWindow helper
assert(formatContextWindow(262144) === '256k context window', 'formatContextWindow handles 262144 as 256k');
assert(formatContextWindow(1048576) === '1M context window', 'formatContextWindow handles 1048576 as 1M');
assert(formatContextWindow(undefined) === 'Information unavailable', 'formatContextWindow returns Information unavailable for undefined');

// 5. Test getVersionOrEffort helper
assert(getVersionOrEffort(grok47) === 'Version: high effort', 'getVersionOrEffort extracts version');
assert(getVersionOrEffort({} as any) === 'Information unavailable', 'getVersionOrEffort returns Information unavailable for empty model');

// 6. Test getModelCapabilitiesList helper
const grokCaps = getModelCapabilitiesList(grok47);
assert(grokCaps.includes('Coding'), 'Grok 4.7 capabilities includes Coding');
assert(grokCaps.includes('Reasoning'), 'Grok 4.7 capabilities includes Reasoning');
assert(grokCaps.includes('Tool use'), 'Grok 4.7 capabilities includes Tool use');

// 7. Test getAvailabilityDisplay helper
const grokAvail = getAvailabilityDisplay(grok47);
assert(grokAvail.label === 'Available', 'Grok 4.7 availability label is Available');
assert(grokAvail.color === 'green', 'Grok 4.7 availability color is green');

// 8. Test clean model name helper
assert(getCleanModelName('Auto (FLOAT Dynamic Router)') === 'Auto', 'getCleanModelName strips Router suffix');
assert(getCleanModelName('OpenAI GPT-4o') === 'GPT-4o', 'getCleanModelName strips OpenAI prefix');

// 9. Model provider display name
assert(getModelProviderName(grok47) === 'xAI', 'getModelProviderName returns xAI');

console.log(`\n======================================================`);
console.log(`Model Selector Panel Test Results: ${passed} passed, ${failed} failed.`);
console.log(`======================================================`);

if (failed > 0) {
  process.exit(1);
}
