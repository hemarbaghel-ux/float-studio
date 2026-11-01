import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const realRecord = {
  requestId: 'request-real-1',
  userId: 'user-real-1',
  provider: 'openai',
  modelId: 'gpt-6-astra',
  timestamp: 1,
  inputTokens: 12,
  outputTokens: 7,
  cachedTokens: 0,
  totalTokens: 19,
  latency: 250,
  estimatedCost: 0.0005,
  status: 'success' as const
};

const persistedValues = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => persistedValues.get(key) ?? null,
    setItem: (key: string, value: string) => persistedValues.set(key, value),
    removeItem: (key: string) => persistedValues.delete(key),
    clear: () => persistedValues.clear(),
    key: (index: number) => Array.from(persistedValues.keys())[index] ?? null,
    get length() { return persistedValues.size; }
  }
});
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { localStorage: (globalThis as any).localStorage }
});
persistedValues.set('float-usage-storage', JSON.stringify({
  state: { records: [{ ...realRecord, requestId: 'sample-req-persisted' }, realRecord] },
  version: 0
}));
const { useUsageStore, sanitizeUsageRecords } = await import('../src/store/usageStore');
const sanitizedRecords = sanitizeUsageRecords([
  { ...realRecord, requestId: 'sample-req-legacy-1' },
  { ...realRecord, userId: 'preview-developer' },
  realRecord
]);
assert.deepEqual(sanitizedRecords, [realRecord], 'legacy synthetic preview records are excluded and genuine records are preserved');
assert.deepEqual(sanitizeUsageRecords(null), [], 'malformed persisted usage state is ignored');
await useUsageStore.persist.rehydrate();
assert.deepEqual(useUsageStore.getState().records, [realRecord], 'persisted legacy preview records are removed during store hydration');

for (const path of [
  'src/features/dashboard/UsageSavingsCard.tsx',
  'src/features/dashboard/UsageAnalyticsView.tsx',
  'src/features/models/UsageDashboard.tsx',
  'src/features/models/TokenUsageChart.tsx'
]) {
  const source = readFileSync(path, 'utf8');
  assert.ok(!source.includes('generateSampleUsageData'), `${path} does not inject generated usage records`);
}

const dashboard = readFileSync('src/features/dashboard/UsageSavingsCard.tsx', 'utf8');
assert.ok(!dashboard.includes('Gemini Fallback') && !dashboard.includes('cost avoided'), 'usage cards do not report fabricated fallback savings');
const analytics = readFileSync('src/features/dashboard/UsageAnalyticsView.tsx', 'utf8');
assert.ok(!analytics.includes('avgTokens'), 'benchmark averages are not presented as request usage');
assert.ok(analytics.includes("return 'unknown';"), 'unrecognized providers are not attributed to Google');
assert.ok(!analytics.includes("providers.google || { name: 'Google Gemini', configured: true }"), 'unconfigured provider status is not presented as configured');

console.log('Usage telemetry integrity: 9 assertions passed.');
