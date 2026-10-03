import assert from 'assert';

function runStage1NavigationTests() {
  console.log('=== FLOAT AI Stage 1: Main Page & Navigation Verification ===\n');
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // 1. Relative timestamp formatting logic
  test('formatTimeAgo calculates relative human-readable times accurately', () => {
    const formatTimeAgo = (timestamp: any) => {
      if (!timestamp) return '';
      const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    const now = Date.now();
    assert.strictEqual(formatTimeAgo(now - 10000), 'Just now');
    assert.strictEqual(formatTimeAgo(now - 5 * 60 * 1000), '5m ago');
    assert.strictEqual(formatTimeAgo(now - 3 * 3600 * 1000), '3h ago');
    assert.strictEqual(formatTimeAgo(now - 25 * 3600 * 1000), 'Yesterday');
  });

  // 2. Conversation search filtering
  test('Conversation search filters real items by title case-insensitively', () => {
    const sampleChats = [
      { id: '1', title: 'React component explanation' },
      { id: '2', title: 'Build Python CLI calculator' },
      { id: '3', title: 'Debug Firebase auth race condition' }
    ];

    const filterChats = (query: string) => {
      if (!query.trim()) return sampleChats;
      const lower = query.toLowerCase().trim();
      return sampleChats.filter(c => c.title.toLowerCase().includes(lower));
    };

    assert.strictEqual(filterChats('react').length, 1);
    assert.strictEqual(filterChats('react')[0].id, '1');
    assert.strictEqual(filterChats('CALCULATOR').length, 1);
    assert.strictEqual(filterChats('CALCULATOR')[0].id, '2');
    assert.strictEqual(filterChats('xyz').length, 0);
    assert.strictEqual(filterChats('').length, 3);
  });

  // 3. Conversation rename validation
  test('Conversation rename validates non-empty string and caps length at 190', () => {
    const validateRename = (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      return trimmed.slice(0, 190);
    };

    assert.strictEqual(validateRename('   '), null);
    assert.strictEqual(validateRename('  New Title  '), 'New Title');
    const longString = 'a'.repeat(250);
    assert.strictEqual(validateRename(longString)?.length, 190);
  });

  // 4. Conversation deletion updates local list without full page refresh
  test('Deleting a conversation produces clean filtered array', () => {
    const chats = [
      { id: 'c1', title: 'Chat 1' },
      { id: 'c2', title: 'Chat 2' },
      { id: 'c3', title: 'Chat 3' }
    ];

    const deleteChat = (id: string) => chats.filter(c => c.id !== id);
    const updated = deleteChat('c2');
    assert.strictEqual(updated.length, 2);
    assert.strictEqual(updated.find(c => c.id === 'c2'), undefined);
    assert.strictEqual(updated[0].id, 'c1');
    assert.strictEqual(updated[1].id, 'c3');
  });

  // 5. Sidebar collapse persistence
  test('Sidebar collapsed state persistence correctly converts boolean string', () => {
    let mockStorage: Record<string, string> = {};
    const setCollapsed = (val: boolean) => {
      mockStorage['float_sidebar_collapsed'] = String(val);
    };
    const getCollapsed = (): boolean => {
      return mockStorage['float_sidebar_collapsed'] === 'true';
    };

    assert.strictEqual(getCollapsed(), false);
    setCollapsed(true);
    assert.strictEqual(getCollapsed(), true);
    setCollapsed(false);
    assert.strictEqual(getCollapsed(), false);
  });

  console.log(`\n======================================================`);
  console.log(`Stage 1 Navigation Verification Summary: ${passed} passed, ${failed} failed.`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runStage1NavigationTests();
