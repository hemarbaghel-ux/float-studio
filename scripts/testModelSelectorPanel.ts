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
  'GPT-4o Flagship Balanced',
  'o3-mini Reasoning High Fast',
  'GPT-4o mini Fast Fast',
  'o1 Deep Reasoning High',
  'o1-mini Fast Reasoning',
  'GPT-4.5 Preview Flagship',
  'GPT-4 Turbo Medium',
  'ChatGPT-4o Latest Fast',
  'Auto Dynamic Balanced',
  'FLOAT Basic Free'
];

expectedNames.forEach((expected, i) => {
  assert(DASHBOARD_MODELS[i]?.displayName === expected, `Model ${i + 1} is "${expected}"`);
});

// 2. GPT-4o metadata matching Cursor-class workspace reference
const gpt4o = DASHBOARD_MODELS[0];
assert(gpt4o.id === 'gpt-4o', 'Model 1 id is gpt-4o');
assert(gpt4o.reasoningLevel === 'Balanced', 'GPT-4o reasoningLevel is "Balanced"');
assert(gpt4o.version === '2024-11-20', 'GPT-4o version is "2024-11-20"');
assert(formatContextWindow(gpt4o.contextWindow) === '128k context window', `GPT-4o context window formatted as 128k context window (got: ${formatContextWindow(gpt4o.contextWindow)})`);
assert(gpt4o.provider === 'OpenAI', 'GPT-4o provider is OpenAI');

// 3. o3-mini NEW badge & reasoning metadata
const o3mini = DASHBOARD_MODELS[1];
assert(o3mini.isNew === true, 'o3-mini has isNew: true');
assert(o3mini.reasoningLevel === 'High Fast', 'o3-mini reasoningLevel is "High Fast"');
assert(o3mini.version === 'high effort', 'o3-mini version is "high effort"');
assert(formatContextWindow(o3mini.contextWindow) === '200k context window', `o3-mini context window formatted as 200k context window (got: ${formatContextWindow(o3mini.contextWindow)})`);
assert(o3mini.provider === 'OpenAI', 'o3-mini provider is OpenAI');

// 4. Metadata presence across all models in registry
INITIAL_MODELS.slice(0, 10).forEach(m => {
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
assert(getVersionOrEffort(gpt4o) === 'Version: 2024-11-20', 'getVersionOrEffort extracts version');
assert(getVersionOrEffort({} as any) === 'Information unavailable', 'getVersionOrEffort returns Information unavailable for empty model');

// 7. Test getModelCapabilitiesList helper
const gpt4oCaps = getModelCapabilitiesList(gpt4o);
assert(gpt4oCaps.includes('Coding'), 'GPT-4o capabilities includes Coding');
assert(gpt4oCaps.includes('Reasoning'), 'GPT-4o capabilities includes Reasoning');
assert(gpt4oCaps.includes('Tool use'), 'GPT-4o capabilities includes Tool use');
assert(gpt4oCaps.includes('Vision'), 'GPT-4o capabilities includes Vision');

// 8. Test getAvailabilityDisplay helper
const gpt4oAvail = getAvailabilityDisplay(gpt4o);
assert(gpt4oAvail.label === 'Available', 'GPT-4o availability label is Available');
assert(gpt4oAvail.color === 'green', 'GPT-4o availability color is green');

// 9. Test clean model name helper
assert(getCleanModelName('Auto Dynamic Balanced', 'Auto') === 'Auto', 'getCleanModelName strips Router suffix');
assert(getCleanModelName('OpenAI GPT-4o', 'GPT-4o') === 'GPT-4o', 'getCleanModelName strips OpenAI prefix');

// 10. Model provider display name
assert(getModelProviderName(gpt4o) === 'OpenAI', 'getModelProviderName returns OpenAI');

console.log(`\n======================================================`);
console.log(`Model Selector Panel Test Results: ${passed} passed, ${failed} failed.`);
console.log(`======================================================`);

if (failed > 0) {
  process.exit(1);
}
