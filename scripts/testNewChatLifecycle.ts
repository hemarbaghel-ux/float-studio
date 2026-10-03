import assert from 'assert';
import { v4 as uuidv4, validate as validateUuid } from 'uuid';

function runNewChatLifecycleTests() {
  console.log('=== FLOAT AI: New Chat Lifecycle & Identifier Isolation Tests ===\n');
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

  // Mock store representing useIDEStore
  class MockIDEStore {
    activeConversationId: string | null = 'existing-conv-id';
    aiMessages: any[] = [{ id: 'm1', role: 'user', content: 'hello' }];
    aiContext: any[] = [{ id: 'c1', type: 'file', path: 'main.py' }];
    activeSelection: any = { startLine: 1, endLine: 5 };
    initialPrompt: string | null = 'hello';
    savedProjects: Record<string, any> = {};

    clearAiMessages() {
      this.aiMessages = [];
    }

    clearAiContext() {
      this.aiContext = [];
    }

    setActiveSelection(sel: any) {
      this.activeSelection = sel;
    }

    setInitialPrompt(prompt: string | null) {
      this.initialPrompt = prompt;
    }

    setActiveConversationId(id: string | null) {
      this.activeConversationId = id;
    }

    setProject(name: string, files: any[], projectId: string) {
      this.savedProjects[projectId] = { name, files, projectId };
    }
  }

  // Test 1: New Chat clears current chat state and resets transient context
  test('handleNewChat resets activeConversationId, aiMessages, aiContext, activeSelection, and initialPrompt', () => {
    const store = new MockIDEStore();
    
    // Simulate active prior conversation state
    assert.strictEqual(store.activeConversationId, 'existing-conv-id');
    assert.strictEqual(store.aiMessages.length, 1);
    assert.strictEqual(store.aiContext.length, 1);
    assert.notStrictEqual(store.activeSelection, null);
    assert.notStrictEqual(store.initialPrompt, null);

    // Simulate handleNewChat execution
    const handleNewChat = (ideStore: MockIDEStore) => {
      ideStore.clearAiMessages();
      ideStore.setInitialPrompt(null);
      ideStore.clearAiContext();
      ideStore.setActiveSelection(null);
      ideStore.setActiveConversationId(null);
    };

    handleNewChat(store);

    assert.strictEqual(store.activeConversationId, null, 'activeConversationId must be null on New Chat');
    assert.strictEqual(store.aiMessages.length, 0, 'aiMessages must be empty');
    assert.strictEqual(store.aiContext.length, 0, 'aiContext must be empty');
    assert.strictEqual(store.activeSelection, null, 'activeSelection must be null');
    assert.strictEqual(store.initialPrompt, null, 'initialPrompt must be null');
    assert.strictEqual(Object.keys(store.savedProjects).length, 0, 'No project record must be created yet');
  });

  // Test 2: First user submission creates a valid conversation identifier
  test('First user submission generates a valid UUID identifier and initializes conversation', () => {
    const store = new MockIDEStore();
    // Start from clean New Chat state
    store.clearAiMessages();
    store.clearAiContext();
    store.setActiveConversationId(null);
    store.setInitialPrompt(null);

    assert.strictEqual(store.activeConversationId, null);

    // Simulate handleStart submission
    const handleStart = (ideStore: MockIDEStore, userPrompt: string) => {
      const trimmed = userPrompt.trim();
      if (!trimmed) return null;

      // Valid conversation identifier is ONLY created upon the first user message submission
      const newConversationId = uuidv4();
      const title = trimmed.length > 36 ? trimmed.slice(0, 36) + '...' : trimmed;

      ideStore.setActiveConversationId(newConversationId);
      ideStore.setInitialPrompt(trimmed);
      ideStore.setProject(title, [], newConversationId);

      return newConversationId;
    };

    const promptText = 'Build a modern responsive navigation bar in React';
    const createdId = handleStart(store, promptText);

    assert.ok(createdId, 'Identifier should have been generated');
    assert.strictEqual(validateUuid(createdId!), true, 'Identifier must be a valid UUID');
    assert.strictEqual(store.activeConversationId, createdId, 'Store activeConversationId must match generated ID');
    assert.strictEqual(store.initialPrompt, promptText, 'Store initialPrompt must match submitted text');
    assert.ok(store.savedProjects[createdId!], 'Project record must now exist for the conversation');
    assert.strictEqual(store.savedProjects[createdId!].name, 'Build a modern responsive navigation...');
  });

  // Test 3: Empty submissions do not generate an identifier or project record
  test('Empty or whitespace prompt does not generate an identifier or save a project', () => {
    const store = new MockIDEStore();
    store.setActiveConversationId(null);
    store.setInitialPrompt(null);

    const handleStart = (ideStore: MockIDEStore, userPrompt: string) => {
      const trimmed = userPrompt.trim();
      if (!trimmed) return null;
      const newConversationId = uuidv4();
      ideStore.setActiveConversationId(newConversationId);
      return newConversationId;
    };

    const emptyResult = handleStart(store, '   ');
    assert.strictEqual(emptyResult, null);
    assert.strictEqual(store.activeConversationId, null, 'activeConversationId must remain null');
    assert.strictEqual(Object.keys(store.savedProjects).length, 0, 'No project must be created');
  });

  console.log(`\n======================================================`);
  console.log(`New Chat Lifecycle Summary: ${passed} passed, ${failed} failed.`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runNewChatLifecycleTests();
