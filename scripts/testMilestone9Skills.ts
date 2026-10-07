import assert from 'assert';
import { SkillsService, BUILT_IN_SKILLS } from '../src/server/skills/skillsService';

console.log('=== FLOAT AI Milestone 9: Skills System Verification ===\n');

try {
  // 1. Built-in skills availability
  console.log('--- Test 1: Built-in Skills Catalog ---');
  assert.ok(BUILT_IN_SKILLS.length >= 6, 'Contains at least 6 built-in domain skills');
  assert.ok(BUILT_IN_SKILLS.some(s => s.id === 'skill-react-patterns'), 'Includes React patterns skill');
  assert.ok(BUILT_IN_SKILLS.some(s => s.id === 'skill-firebase-debugging'), 'Includes Firebase debugging skill');
  assert.ok(BUILT_IN_SKILLS.some(s => s.id === 'skill-testing-practices'), 'Includes testing practices skill');
  assert.ok(BUILT_IN_SKILLS.some(s => s.id === 'skill-git-workflow'), 'Includes Git workflow skill');
  console.log('[PASS] Built-in skills catalog initialized with required domain skills');

  // 2. Custom skill registration
  console.log('\n--- Test 2: Custom Skill Registration ---');
  SkillsService.registerSkill({
    id: 'custom-graphql-skill',
    name: 'GraphQL API Design',
    description: 'Best practices for GraphQL schemas and resolvers.',
    instructions: 'Use DataLoader to batch database calls and avoid N+1 queries.',
    allowedTools: ['read_project_file'],
    scope: 'user',
    enabled: true,
    keywords: ['graphql', 'resolver', 'schema', 'query', 'mutation'],
    permissionsRequired: ['read']
  });

  const retrieved = SkillsService.getSkill('custom-graphql-skill');
  assert.ok(retrieved, 'Custom skill retrieved');
  assert.strictEqual(retrieved?.name, 'GraphQL API Design', 'Name matches');
  console.log('[PASS] Custom skill registration verified');

  // 3. Selective Relevance Matching
  console.log('\n--- Test 3: Selective Relevance Matching ---');
  // Prompt about React hooks
  const reactPrompt = 'How should I optimize this useEffect hook to prevent infinite renders?';
  const reactMatches = SkillsService.selectRelevantSkills(reactPrompt, 2);
  assert.ok(reactMatches.length >= 1, 'Matched relevant skills for React prompt');
  assert.strictEqual(reactMatches[0].id, 'skill-react-patterns', 'React skill ranked highest');
  assert.ok(!reactMatches.some(s => s.id === 'skill-firebase-debugging'), 'Unrelated Firebase skill not matched');

  // Prompt about Git pull requests
  const gitPrompt = 'Help me create a pull request branch for this feature.';
  const gitMatches = SkillsService.selectRelevantSkills(gitPrompt, 2);
  assert.ok(gitMatches.length >= 1, 'Matched relevant skills for Git prompt');
  assert.strictEqual(gitMatches[0].id, 'skill-git-workflow', 'Git workflow skill ranked highest');

  // Irrelevant prompt should not match or match empty
  const randomPrompt = 'What is the capital of France?';
  const randomMatches = SkillsService.selectRelevantSkills(randomPrompt, 2);
  assert.strictEqual(randomMatches.length, 0, 'No skills matched for general non-coding query');
  console.log('[PASS] Selective relevance matching matches intent without dumping all skills');

  // 4. Formatted prompt output
  console.log('\n--- Test 4: Formatted Skills Prompt ---');
  const formatted = SkillsService.formatSkillsPrompt(reactMatches);
  assert.ok(formatted.includes('[Active Domain Skills]'), 'Includes domain skills section');
  assert.ok(formatted.includes('Skill: React 19 & Architecture'), 'Includes skill title');
  console.log('[PASS] Bounded skills prompt formatting verified');

  console.log('\n==================================================');
  console.log('Milestone 9 Skills System: All 4 suites passed!');
  console.log('==================================================\n');
} catch (err: any) {
  console.error('[FAIL] Skills system verification failed:', err);
  process.exit(1);
}
