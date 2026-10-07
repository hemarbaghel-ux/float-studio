import assert from 'assert';
import { MemoryService } from '../src/server/memory/memoryService';

console.log('=== FLOAT AI Milestone 9: Memory System Verification ===\n');

try {
  MemoryService.clear();

  // 1. Memory CRUD operations
  console.log('--- Test 1: Memory CRUD & Categories ---');
  const userId = 'user-mem-1';
  const projectId = 'proj-mem-1';

  const res1 = MemoryService.setMemory({
    projectId,
    userId,
    category: 'architecture',
    key: 'auth_provider',
    value: 'Firebase Auth is used for client tokens, verified server-side with Firebase Admin SDK.',
    scope: 'project',
    enabled: true
  });

  assert.strictEqual(res1.success, true, 'Memory item saved');
  assert.ok(res1.memory?.id.startsWith('mem-'), 'Generated memory ID');

  const memories = MemoryService.getProjectMemories(projectId, userId);
  assert.strictEqual(memories.length, 1, 'Project has 1 memory item');
  assert.strictEqual(memories[0].key, 'auth_provider', 'Key matches');

  // Tenant isolation
  const intruderMemories = MemoryService.getProjectMemories(projectId, 'intruder-user');
  assert.strictEqual(intruderMemories.length, 0, 'Cross-user access denied');
  console.log('[PASS] Memory creation and tenant isolation verified');

  // 2. Secret Filtering Guard
  console.log('\n--- Test 2: Secret & Token Filtering Guard ---');
  const secretAttempt = MemoryService.setMemory({
    projectId,
    userId,
    category: 'convention',
    key: 'api_token',
    value: 'Use ghp_111122223333444455556666777788889999 for test API access.',
    scope: 'project',
    enabled: true
  });

  assert.strictEqual(secretAttempt.success, false, 'Secret token rejected');
  assert.ok(secretAttempt.error?.includes('secret keys, tokens, or credentials'), 'Reports credential security error');
  console.log('[PASS] Secret keys and tokens are strictly rejected from memory storage');

  // 3. Aggregate Character Limit Guard
  console.log('\n--- Test 3: Character Limits & Context Bounding ---');
  const largeVal = 'A'.repeat(500);
  for (let i = 0; i < 7; i++) {
    MemoryService.setMemory({
      projectId,
      userId,
      category: 'convention',
      key: `convention_${i}`,
      value: largeVal,
      scope: 'project',
      enabled: true
    });
  }

  // Attempting to exceed 4000 total characters
  const overflowAttempt = MemoryService.setMemory({
    projectId,
    userId,
    category: 'convention',
    key: 'convention_overflow',
    value: largeVal,
    scope: 'project',
    enabled: true
  });

  assert.strictEqual(overflowAttempt.success, false, 'Project memory overflow rejected');
  assert.ok(overflowAttempt.error?.includes('Aggregate memory limit reached'), 'Reports character limit error');
  console.log('[PASS] Aggregate memory bounds enforced');

  // 4. Formatted Prompt Section
  console.log('\n--- Test 4: Formatted Memory Prompt ---');
  const activeMems = MemoryService.getProjectMemories(projectId, userId);
  const formattedPrompt = MemoryService.formatMemoriesPrompt(activeMems);
  assert.ok(formattedPrompt.includes('[Project Architectural Memory]'), 'Includes memory section header');
  assert.ok(formattedPrompt.includes('[ARCHITECTURE]: auth_provider'), 'Formats structured category and key');
  console.log('[PASS] Bounded memory prompt formatting verified');

  console.log('\n==================================================');
  console.log('Milestone 9 Memory System: All 4 suites passed!');
  console.log('==================================================\n');
} catch (err: any) {
  console.error('[FAIL] Memory system verification failed:', err);
  process.exit(1);
} finally {
  MemoryService.clear();
}
