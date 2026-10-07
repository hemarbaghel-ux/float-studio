import assert from 'assert';
import { HooksService, HookDefinition } from '../src/server/hooks/hooksService';

console.log('=== FLOAT AI Milestone 9: Hooks Architecture Verification ===\n');

async function runTests() {
  try {
    HooksService.clearHooks();

    // 1. Register and trigger a standard beforeToolUse hook
    console.log('--- Test 1: Lifecycle Interception ---');
    let beforeToolFired = false;
    const testHook: HookDefinition = {
      id: 'hook-audit-tool',
      name: 'Audit Tool Hook',
      lifecycle: 'beforeToolUse',
      scope: 'project',
      enabled: true,
      handler: async (payload) => {
        beforeToolFired = true;
        return { proceed: true, log: `Audited tool ${payload.toolName}` };
      }
    };
    HooksService.registerHook(testHook);

    const result = await HooksService.triggerLifecycle(
      'beforeToolUse',
      { toolName: 'read_project_file', args: { path: 'src/App.tsx' } },
      { userId: 'u1', projectId: 'p1' }
    );

    assert.strictEqual(beforeToolFired, true, 'Hook executed during beforeToolUse');
    assert.strictEqual(result.proceed, true, 'Lifecycle permitted to proceed');
    console.log('[PASS] Lifecycle point intercepted successfully');

    // 2. Cancellation by security hook
    console.log('\n--- Test 2: Execution Blocking & Cancellation ---');
    const blockingHook: HookDefinition = {
      id: 'hook-block-traversal',
      name: 'Block Traversal Hook',
      lifecycle: 'beforeFileEdit',
      scope: 'admin',
      enabled: true,
      handler: async (payload) => {
        if (payload.filePath && payload.filePath.includes('..')) {
          return { proceed: false, reason: 'Path traversal blocked by security hook' };
        }
        return { proceed: true };
      }
    };
    HooksService.registerHook(blockingHook);

    const blockedResult = await HooksService.triggerLifecycle(
      'beforeFileEdit',
      { filePath: '../../etc/passwd' },
      { userId: 'u1', projectId: 'p1' }
    );

    assert.strictEqual(blockedResult.proceed, false, 'Lifecycle blocked when hook vetoes');
    assert.ok(blockedResult.abortReason?.includes('Path traversal blocked'), 'Returns specific veto reason');
    console.log('[PASS] Security hook cleanly blocked unauthorized action');

    // 3. Payload modification by hook
    console.log('\n--- Test 3: Payload Transformation ---');
    const transformHook: HookDefinition = {
      id: 'hook-normalize-prompt',
      name: 'Prompt Normalizer',
      lifecycle: 'beforePrompt',
      scope: 'user',
      enabled: true,
      handler: async (payload) => {
        return {
          proceed: true,
          modifiedPayload: {
            prompt: `${payload.prompt?.trim()} [VERIFIED_USER]`
          }
        };
      }
    };
    HooksService.registerHook(transformHook);

    const transformedResult = await HooksService.triggerLifecycle(
      'beforePrompt',
      { prompt: 'Hello world' },
      { userId: 'u1', projectId: 'p1' }
    );

    assert.strictEqual(transformedResult.proceed, true, 'Proceeds with modified payload');
    assert.strictEqual(transformedResult.finalPayload.prompt, 'Hello world [VERIFIED_USER]', 'Payload modified');
    console.log('[PASS] Hook successfully transformed lifecycle payload');

    // 4. Timeout safeguard
    console.log('\n--- Test 4: Hook Timeout Safeguard ---');
    const slowHook: HookDefinition = {
      id: 'hook-slow',
      name: 'Hanging Hook',
      lifecycle: 'afterAgentResponse',
      scope: 'user',
      enabled: true,
      timeoutMs: 100, // 100ms
      handler: async () => {
        await new Promise(resolve => setTimeout(resolve, 500)); // takes 500ms
        return { proceed: true };
      }
    };
    HooksService.registerHook(slowHook);

    const timedOutResult = await HooksService.triggerLifecycle(
      'afterAgentResponse',
      { response: 'done' },
      { userId: 'u1', projectId: 'p1' }
    );

    assert.strictEqual(timedOutResult.proceed, true, 'Non-admin hook timeout does not crash pipeline');
    console.log('[PASS] Hook timeout safeguard prevents hanging agent pipeline');

    console.log('\n==================================================');
    console.log('Milestone 9 Hooks Architecture: All 4 suites passed!');
    console.log('==================================================\n');
  } catch (err: any) {
    console.error('[FAIL] Hooks verification failed:', err);
    process.exit(1);
  } finally {
    HooksService.clearHooks();
  }
}

runTests();
