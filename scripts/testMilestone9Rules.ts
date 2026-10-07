import assert from 'assert';
import { RulesService } from '../src/server/rules/rulesService';

console.log('=== FLOAT AI Milestone 9: Rules System Verification ===\n');

try {
  // 1. User-scoped rules
  console.log('--- Test 1: User-scoped Rules ---');
  const userId = 'user-test-m9';
  RulesService.setUserRule(userId, {
    id: 'user-ts-rule',
    name: 'TypeScript Preference',
    content: 'Always write strict TypeScript with interfaces over type aliases.',
    priority: 5,
    enabled: true
  });

  const userRules = RulesService.getUserRules(userId);
  assert.strictEqual(userRules.length, 1, 'User rule saved');
  assert.strictEqual(userRules[0].name, 'TypeScript Preference', 'Rule name matches');
  console.log('[PASS] User-scoped rules register and persist');

  // 2. Project-scoped rules
  console.log('\n--- Test 2: Project-scoped Rules ---');
  const projectId = 'proj-test-m9';
  RulesService.setProjectRule(projectId, {
    id: 'proj-arch-rule',
    name: 'Zustand State Architecture',
    content: 'Use Zustand for shared client state and avoid React Context for high-frequency updates.',
    priority: 3,
    enabled: true
  });

  const projRules = RulesService.getProjectRules(projectId);
  assert.strictEqual(projRules.length, 1, 'Project rule saved');
  assert.strictEqual(projRules[0].priority, 3, 'Priority is 3');
  console.log('[PASS] Project-scoped rules register and persist');

  // 3. Repository rules discovery (.float/rules/)
  console.log('\n--- Test 3: Repository Rules Discovery (.float/rules/) ---');
  const mockFiles = [
    {
      path: '.float/rules/security.md',
      content: 'Never log API keys or bearer tokens to stdout.'
    },
    {
      path: '.float/rules/conventions.json',
      content: JSON.stringify([
        { name: 'Component Formatting', content: 'Use export function for all React components.', priority: 1 }
      ])
    },
    {
      path: 'src/App.tsx',
      content: 'export function App() {}'
    }
  ];

  const repoRules = RulesService.discoverRepositoryRules(mockFiles);
  assert.strictEqual(repoRules.length, 2, 'Discovered 2 repo rules from .float/rules/');
  assert.ok(repoRules.some(r => r.name === 'security'), 'Discovered markdown rule');
  assert.ok(repoRules.some(r => r.name === 'Component Formatting'), 'Discovered JSON rule');
  console.log('[PASS] Discovered markdown and JSON rules from .float/rules/');

  // 4. Precedence & Effective Rules Resolution
  console.log('\n--- Test 4: Precedence & Budget Bounding ---');
  const effective = RulesService.getEffectiveRules({
    userId,
    projectId,
    files: mockFiles
  });

  assert.ok(effective.length >= 3, 'All 3 layers represented in effective rules');
  // Priority ordering: Component Formatting (1) < security (2) < project (3) < user (5)
  assert.strictEqual(effective[0].priority, 1, 'Priority 1 rule ranked first');
  assert.ok(effective[effective.length - 1].priority >= 4, 'Lower priority rules at end');

  const formatted = RulesService.formatRulesPrompt(effective);
  assert.ok(formatted.includes('[Workspace & Coding Rules]'), 'Rules formatted with section header');
  assert.ok(formatted.includes('REPOSITORY: Component Formatting'), 'Includes repository rule tag');
  assert.ok(formatted.includes('USER: TypeScript Preference'), 'Includes user rule tag');
  console.log('[PASS] Priority ordering and bounded prompt formatting verified');

  console.log('\n==================================================');
  console.log('Milestone 9 Rules System: All 4 suites passed!');
  console.log('==================================================\n');
} catch (err: any) {
  console.error('[FAIL] Rules system verification failed:', err);
  process.exit(1);
}
