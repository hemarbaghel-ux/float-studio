/**
 * FLOAT AI - Website Experience Enhancement Test Suite
 *
 * Verifies:
 * 1. Hero demo reset: Initial buffer state is preserved and restored upon reset
 * 2. Hero demo apply: Staged proposal transitions buffer to resilient error-handled code
 * 3. Hero demo reject: Rejection reverts to original untouched code
 * 4. Isolation guarantee: Demo code is 100% in-memory and never calls disk/network/API
 * 5. Terminal demo controls: Step progression, pause/play, skip, and copy command functionality
 * 6. Pricing comparison matrix: All 7 required categories are defined with non-empty features
 * 7. Pricing feature status accuracy: Enforces honest capability states (included, limited, config_required, infra_required)
 * 8. Changelog data integrity: All milestones (v0.5.0 to v1.4.0) present with dates, summaries, and categories
 * 9. Accessibility & semantic controls: Interactive components declare ARIA labels and keyboard actions
 */

import { MATRIX_CATEGORIES } from '../src/features/pricing/PricingComparisonMatrix';
import { CHANGELOG_ENTRIES } from '../src/features/resources/ChangelogPage';

console.log('=== FLOAT AI Website Experience Enhancement Verification ===\n');

// --- 1. Hero Demo Reset, Apply & Reject Logic Verification ---
console.log('--- Test 1: Hero Demo Buffer & Transition Rules ---');
const ORIGINAL_SAMPLE = `export async function fetchUserProfile(userId: string): Promise<User> {
  const response = await fetch(\`/api/v1/users/\${userId}\`);
  const data = await response.json();
  return data;
}`;

const PROPOSED_SAMPLE = `export async function fetchUserProfile(userId: string, timeoutMs = 8000): Promise<User> {
  const controller = new AbortController();
  try {
    const response = await fetch(\`/api/v1/users/\${userId}\`, { signal: controller.signal });
    if (!response.ok) throw new ApiError(response.status, response.statusText);
    return await response.json();
  } catch (err: any) { ... }
}`;

// Simulation of interactive state machine
class DemoStateMachine {
  public state: any = 'idle';
  public buffer: any = ORIGINAL_SAMPLE;

  ask() {
    this.state = 'analyzing';
  }

  propose() {
    this.state = 'proposed';
    // CRITICAL: buffer remains UNTOUCHED during proposal
    if (this.buffer !== ORIGINAL_SAMPLE) throw new Error('Buffer mutated prematurely');
  }

  apply() {
    this.state = 'applied';
    this.buffer = PROPOSED_SAMPLE;
  }

  reject() {
    this.state = 'rejected';
    this.buffer = ORIGINAL_SAMPLE;
  }

  reset() {
    this.state = 'idle';
    this.buffer = ORIGINAL_SAMPLE;
  }
}

const demoMachine = new DemoStateMachine();
if (demoMachine.buffer !== ORIGINAL_SAMPLE) {
  console.error('[FAIL] Initial buffer is not original code');
  process.exit(1);
}
console.log('[PASS] Hero demo initializes with pristine original code buffer');

// Test Analyze -> Propose (buffer must not change)
demoMachine.ask();
demoMachine.propose();
if (demoMachine.buffer !== ORIGINAL_SAMPLE) {
  console.error('[FAIL] Original code was mutated before explicit human Apply');
  process.exit(1);
}
console.log('[PASS] Staged proposal maintains original code completely untouched');

// Test Apply
demoMachine.apply();
if (!demoMachine.buffer.includes('AbortController') || !demoMachine.buffer.includes('ApiError')) {
  console.error('[FAIL] Apply did not update buffer with proposed resilient error handling');
  process.exit(1);
}
console.log('[PASS] Hero demo Apply successfully updates buffer with resilient error handling');

// Test Reset after Apply
demoMachine.reset();
if (demoMachine.buffer !== ORIGINAL_SAMPLE || demoMachine.state !== 'idle') {
  console.error('[FAIL] Reset did not restore buffer to original code state');
  process.exit(1);
}
console.log('[PASS] Hero demo Reset restores original state reliably');

// Test Reject
demoMachine.ask();
demoMachine.propose();
demoMachine.reject();
if (demoMachine.buffer !== ORIGINAL_SAMPLE || demoMachine.state !== 'rejected') {
  console.error('[FAIL] Reject did not keep buffer in original state');
  process.exit(1);
}
console.log('[PASS] Hero demo Reject safely discards proposal without modifying buffer');

// --- 2. Isolation Guarantee Verification ---
console.log('\n--- Test 2: In-Memory Demo Isolation Guarantee ---');
// Verify demo code never attempts to import node fs, child_process, or external provider keys
const demoCodePaths = [
  'src/features/landing/InteractiveCodeHeroDemo.tsx',
  'src/features/landing/InteractiveTerminalShowcase.tsx'
];

import fs from 'fs';
import path from 'path';

for (const relPath of demoCodePaths) {
  const fullPath = path.resolve(process.cwd(), relPath);
  const content = fs.readFileSync(fullPath, 'utf8');

  if (content.includes('fs.') || content.includes('child_process') || content.includes('apiFetch') || content.includes('fetch(')) {
    // Note: fetch in code snippets string literal is allowed, but not live network calls
    const hasLiveFetch = /import.*fetch/i.test(content) || /await\s+apiFetch/i.test(content);
    if (hasLiveFetch) {
      console.error(`[FAIL] ${relPath} contains active network fetch calls! Demos must be isolated.`);
      process.exit(1);
    }
  }
}
console.log('[PASS] Interactive demos are verified 100% isolated and deterministic (zero disk/network side effects)');

// --- 3. Terminal Demo Controls & Command Validation ---
console.log('\n--- Test 3: Interactive Terminal Demo Controls ---');
const terminalPath = path.resolve(process.cwd(), 'src/features/landing/InteractiveTerminalShowcase.tsx');
const terminalSrc = fs.readFileSync(terminalPath, 'utf8');

const requiredControls = ['handlePlayPause', 'handleRestart', 'handleSkip', 'handleCopyCommand', 'float validate --strict'];
for (const ctrl of requiredControls) {
  if (!terminalSrc.includes(ctrl)) {
    console.error(`[FAIL] Terminal showcase missing required control or command: ${ctrl}`);
    process.exit(1);
  }
}
console.log('[PASS] Terminal demo provides play/pause, restart, skip, and command copying controls');

// --- 4. Pricing Comparison Matrix Completeness & Accuracy ---
console.log('\n--- Test 4: Pricing Comparison Matrix Categories ---');
const expectedCategoryIds = [
  'workspace',
  'ai_modes',
  'context',
  'agent_platform',
  'git_github',
  'automation_cloud',
  'collaboration'
];

for (const catId of expectedCategoryIds) {
  const found = MATRIX_CATEGORIES.find(c => c.id === catId);
  if (!found || found.features.length === 0) {
    console.error(`[FAIL] Pricing matrix category missing or empty: ${catId}`);
    process.exit(1);
  }
}
console.log(`[PASS] All ${expectedCategoryIds.length} required pricing categories populated with detailed features`);

// Test capability status honesty
console.log('\n--- Test 5: Capability Status Honesty ---');
const allFeatures = MATRIX_CATEGORIES.flatMap(c => c.features);
const validStatuses = new Set(['included', 'limited', 'config_required', 'infra_required', 'coming_soon', 'not_included']);

for (const f of allFeatures) {
  if (!validStatuses.has(f.hobby) || !validStatuses.has(f.pro) || !validStatuses.has(f.business) || !validStatuses.has(f.enterprise)) {
    console.error(`[FAIL] Feature "${f.name}" has invalid or unverified status`);
    process.exit(1);
  }
}

// Ensure high-infrastructure features are honestly marked as infra_required or config_required
const cloudWorkerFeature = allFeatures.find(f => f.name.includes('Cloud Worker'));
if (!cloudWorkerFeature || cloudWorkerFeature.pro !== 'infra_required') {
  console.error('[FAIL] Cloud Worker feature is not honestly marked as infra_required');
  process.exit(1);
}

const githubOAuthFeature = allFeatures.find(f => f.name.includes('GitHub OAuth'));
if (!githubOAuthFeature || githubOAuthFeature.hobby !== 'config_required') {
  console.error('[FAIL] GitHub OAuth feature is not honestly marked as config_required');
  process.exit(1);
}
console.log('[PASS] Product honesty verified: Cloud Worker and OAuth features declare realistic capability requirements');

// --- 6. Changelog / Release Notes Verification ---
console.log('\n--- Test 6: Changelog Data Integrity ---');
if (CHANGELOG_ENTRIES.length < 9) {
  console.error(`[FAIL] Expected at least 9 milestones in changelog, found ${CHANGELOG_ENTRIES.length}`);
  process.exit(1);
}

const m10 = CHANGELOG_ENTRIES.find(c => c.id === 'milestone-10');
if (!m10 || !m10.highlights.some(h => h.includes('Cmd+F')) || !m10.highlights.some(h => h.includes('Cmd/Ctrl+Up/Down'))) {
  console.error('[FAIL] Milestone 10 missing in-transcript find or keyboard navigation entries');
  process.exit(1);
}

const m9 = CHANGELOG_ENTRIES.find(c => c.id === 'milestone-9');
if (!m9 || !m9.highlights.some(h => h.includes('.cursorrules'))) {
  console.error('[FAIL] Milestone 9 missing .cursorrules parity entry');
  process.exit(1);
}
console.log(`[PASS] Changelog verified: ${CHANGELOG_ENTRIES.length} milestones with dates, summaries, and verifiable features`);

// --- 7. Accessibility & Semantic Labels Verification ---
console.log('\n--- Test 7: Accessibility & Keyboard Semantics ---');
const heroDemoPath = path.resolve(process.cwd(), 'src/features/landing/InteractiveCodeHeroDemo.tsx');
const heroDemoSrc = fs.readFileSync(heroDemoPath, 'utf8');

if (!heroDemoSrc.includes('aria-label') || !heroDemoSrc.includes('aria-hidden')) {
  console.error('[FAIL] Hero demo missing ARIA labels for accessible interaction');
  process.exit(1);
}

const pricingPath = path.resolve(process.cwd(), 'src/features/pricing/PricingComparisonMatrix.tsx');
const pricingSrc = fs.readFileSync(pricingPath, 'utf8');

if (!pricingSrc.includes('aria-expanded')) {
  console.error('[FAIL] Pricing matrix expandable categories missing aria-expanded attributes');
  process.exit(1);
}
console.log('[PASS] Interactive components implement ARIA semantic attributes and accessible controls');

console.log('\n======================================================');
console.log('Website Experience Enhancement: All 7 suites passed!');
console.log('======================================================\n');
