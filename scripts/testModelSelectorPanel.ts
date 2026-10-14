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

// 1. Verify the dashboard catalog matches the two explicitly routed API models.
assert(DASHBOARD_MODELS.length === 2, `DASHBOARD_MODELS contains the two supported models (found ${DASHBOARD_MODELS.length})`);
assert(DASHBOARD_MODELS[0]?.id === 'gpt-4o-mini', 'Default fast model is gpt-4o-mini');
assert(DASHBOARD_MODELS[1]?.id === 'gpt-4o', 'General-purpose model is gpt-4o');

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
