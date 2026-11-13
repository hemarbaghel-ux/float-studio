import assert from 'node:assert/strict';
import { WorkspaceIndex } from '../src/services/indexing/workspaceIndex';
import {
  matchesIgnorePattern,
  parseIgnorePatterns,
  shouldIndexFile
} from '../src/services/indexing/fileFilter';

interface RetrievalCase {
  name: string;
  query: string;
  expectedPath: string;
}

const corpus = [
  {
    path: 'src/a.ts',
    content: [
      'export function verifyAccessToken(value: string): boolean {',
      '  // JWT token signature expiry validation protects every authenticated request.',
      '  return verifySignature(value) && !isExpired(value);',
      '}'
    ].join('\n')
  },
  {
    path: 'src/b.ts',
    content: [
      'export function revokeRefreshSession(sessionId: string): void {',
      '  // Revoke refresh token session credentials when a user signs out.',
      '  removeSession(sessionId);',
      '}'
    ].join('\n')
  },
  {
    path: 'src/c.ts',
    content: [
      'export function computeInvoiceTotal(lines: number[]): number {',
      '  // Calculate invoice subtotal, tax rate, and final tax total.',
      '  return sum(lines);',
      '}'
    ].join('\n')
  },
  {
    path: 'src/d.ts',
    content: [
      'export async function refundPayment(paymentId: string): Promise<void> {',
      '  // Refund a failed payment transaction and record the provider response.',
      '  await paymentGateway.refund(paymentId);',
      '}'
    ].join('\n')
  },
  {
    path: 'src/e.ts',
    content: [
      'export function invalidateCacheEntry(key: string): void {',
      '  // Cache invalidation removes stale entries after their configured TTL expires.',
      '  cache.delete(key);',
      '}'
    ].join('\n')
  },
  {
    path: 'src/f.ts',
    content: [
      'export function retryHttpRequest(url: string): Promise<Response> {',
      '  // Network request retry policy uses exponential backoff after transient failures.',
      '  return retry(url);',
      '}'
    ].join('\n')
  },
  {
    path: 'src/g.ts',
    content: [
      'export function resolveThemePreference(value: string): string {',
      '  // Resolve dark theme preference from the user's saved appearance setting.',
      '  return value;',
      '}'
    ].join('\n')
  },
  {
    path: 'src/h.ts',
    content: [
      'export function findUserByEmail(email: string): User | undefined {',
      '  // Database user lookup repository finds an account by normalized email address.',
      '  return users.find(email);',
      '}'
    ].join('\n')
  },
  {
    path: 'src/i.ts',
    content: [
      'export function appendAuditEvent(event: AuditEvent): void {',
      '  // Append immutable audit security event records for sensitive operations.',
      '  auditStore.append(event);',
      '}'
    ].join('\n')
  },
  {
    path: 'src/j.ts',
    content: [
      'export function parseCsvRow(input: string): string[] {',
      '  // Parse CSV quoted fields, escaped quotes, and delimiter characters correctly.',
      '  return csv.parse(input);',
      '}'
    ].join('\n')
  },
  {
    path: 'src/noise.ts',
    content: [
      'export function renderDashboardCard(): string {',
      '  // Render common dashboard layout and user interface content.',
      '  return "dashboard";',
      '}'
    ].join('\n')
  },
  {
    path: 'src/anotherNoise.ts',
    content: [
      'export function writeApplicationLog(message: string): void {',
      '  // Write routine application log output for local development.',
      '  logger.info(message);',
      '}'
    ].join('\n')
  }
];

const retrievalCases: RetrievalCase[] = [
  { name: 'JWT signature and expiry validation', query: 'JWT token signature expiry validation', expectedPath: 'src/a.ts' },
  { name: 'Refresh token session revocation', query: 'revoke refresh token session', expectedPath: 'src/b.ts' },
  { name: 'Invoice tax calculation', query: 'calculate invoice tax total', expectedPath: 'src/c.ts' },
  { name: 'Failed payment refund', query: 'refund failed payment transaction', expectedPath: 'src/d.ts' },
  { name: 'TTL cache invalidation', query: 'cache invalidation TTL stale entry', expectedPath: 'src/e.ts' },
  { name: 'HTTP retry backoff', query: 'network request retry exponential backoff', expectedPath: 'src/f.ts' },
  { name: 'Dark theme preference', query: 'resolve dark theme preference setting', expectedPath: 'src/g.ts' },
  { name: 'User email lookup', query: 'database user email lookup repository', expectedPath: 'src/h.ts' },
  { name: 'Security audit event', query: 'append immutable audit security event', expectedPath: 'src/i.ts' },
  { name: 'CSV quoted delimiter parsing', query: 'parse CSV quoted escaped delimiter', expectedPath: 'src/j.ts' }
];

const index = new WorkspaceIndex('retrieval-benchmark-fixture');
index.indexProject(corpus);

let hitsAtFive = 0;
let reciprocalRankTotal = 0;
const misses: string[] = [];
const perCase: Array<{ name: string; rank: number | null; topPath?: string }> = [];

for (const testCase of retrievalCases) {
  const results = index.search(testCase.query, { maxResults: 30, minScore: 0, contextLines: 1 });
  // The search engine may return path, symbol, and line windows for one file.
  // Evaluate unique file ranking, since the user navigates to files rather than
  // counting multiple excerpts from the same file as separate retrieval hits.
  const uniquePaths: string[] = [];
  for (const result of results) {
    if (!uniquePaths.includes(result.filePath)) uniquePaths.push(result.filePath);
  }
  const position = uniquePaths.indexOf(testCase.expectedPath);
  const rank = position >= 0 ? position + 1 : null;
  if (rank !== null && rank <= 5) hitsAtFive++;
  if (rank !== null) reciprocalRankTotal += 1 / rank;
  else misses.push(testCase.name);
  perCase.push({ name: testCase.name, rank, topPath: uniquePaths[0] });
}

const recallAtFive = hitsAtFive / retrievalCases.length;
const meanReciprocalRank = reciprocalRankTotal / retrievalCases.length;
console.log('FLOAT hybrid retrieval benchmark');
console.log(`Recall@5: ${hitsAtFive}/${retrievalCases.length} (${(recallAtFive * 100).toFixed(1)}%)`);
console.log(`MRR: ${meanReciprocalRank.toFixed(3)}`);
for (const item of perCase) {
  console.log(`- ${item.name}: rank=${item.rank ?? 'MISS'}, top=${item.topPath || '(none)'}`);
}
assert.ok(recallAtFive >= 0.9, `Recall@5 must be at least 90%; misses: ${misses.join(', ')}`);
assert.ok(meanReciprocalRank >= 0.65, `MRR must be at least 0.65; actual=${meanReciprocalRank.toFixed(3)}`);

// An index refresh must remove stale files and stale terms, not merely add new
// documents over the existing inverted indices.
index.indexProject([
  { path: 'src/replacement.ts', content: 'export function verifySamlAssertion() { return true; }' },
  { path: 'src/noise.ts', content: 'export function renderDashboardCard() { return "dashboard"; }' }
]);
assert.equal(index.getFileDocument('src/a.ts'), undefined);
assert.equal(index.search('JWT token signature expiry validation', { minScore: 0 }).length, 0);
assert.ok(index.search('SAML assertion verification', { minScore: 0 }).some(result => result.filePath === 'src/replacement.ts'));

// Symbol filters must not return a symbol result whose type is excluded.
const symbolIndex = new WorkspaceIndex('symbol-kind-filter-fixture');
symbolIndex.indexProject([
  { path: 'src/container.ts', content: 'export class Container { run() { return true; } }' },
  { path: 'src/action.ts', content: 'export function runContainerAction() { return true; }' }
]);
const filtered = symbolIndex.search('Container', {
  minScore: 0,
  filterSymbolKinds: ['function']
});
assert.ok(filtered.every(result => result.matchType !== 'symbol' || result.symbol?.kind === 'function'));

// Gitignore parsing must respect ordered negation (last matching rule wins).
const ignorePatterns = parseIgnorePatterns([
  '# generated files',
  '*.log',
  '!important.log',
  'cache/',
  '!**/cache/keep.ts',
  'important.log'
].join('\n'));
assert.equal(matchesIgnorePattern('src/debug.log', ignorePatterns), true);
assert.equal(matchesIgnorePattern('src/important.log', ignorePatterns), true, 'later positive rule wins');
assert.equal(matchesIgnorePattern('src/cache/throwaway.ts', ignorePatterns), true);
assert.equal(matchesIgnorePattern('src/cache/keep.ts', ['cache/', '!**/cache/keep.ts']), false);
assert.equal(shouldIndexFile('src/cache/keep.ts', 'export const keep = true;', ['cache/', '!**/cache/keep.ts']), true);
assert.equal(shouldIndexFile('src/cache/throwaway.ts', 'export const skip = true;', ['cache/']), false);

console.log('Codebase retrieval and ignore-rule regression: all assertions passed.');
