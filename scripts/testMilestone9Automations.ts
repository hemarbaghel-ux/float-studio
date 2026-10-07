import assert from 'assert';
import { AutomationService, FloatAutomation } from '../src/server/automations/automationService';

console.log('=== FLOAT AI Milestone 9: Automations System Verification ===\n');

async function runTests() {
  try {
    AutomationService.clear();

    // 1. Create Automations with different triggers
    console.log('--- Test 1: Automation Creation & Scoping ---');
    const autoPr: FloatAutomation = AutomationService.createAutomation({
      projectId: 'proj-auto-1',
      userId: 'user-auto-1',
      name: 'PR Code Reviewer',
      trigger: { type: 'github_pr', filterEvent: 'opened' },
      action: { type: 'review_pr' },
      permissions: ['read', 'review'],
      enabled: true
    });

    assert.ok(autoPr.id.startsWith('auto-'), 'Generated automation ID');
    assert.strictEqual(autoPr.name, 'PR Code Reviewer', 'Name matches');

    // List automations
    const list = AutomationService.listAutomations('proj-auto-1', 'user-auto-1');
    assert.strictEqual(list.length, 1, 'Listed 1 automation for project/user');

    // Tenant isolation: other user cannot see
    const otherUserList = AutomationService.listAutomations('proj-auto-1', 'user-intruder');
    assert.strictEqual(otherUserList.length, 0, 'Cross-user access denied');
    console.log('[PASS] Automation creation and tenant isolation verified');

    // 2. Trigger Action & Execution Log
    console.log('\n--- Test 2: Trigger Action & Execution History ---');
    const triggerResult = await AutomationService.trigger(autoPr.id, {
      triggerType: 'github_pr',
      userId: 'user-auto-1'
    });

    assert.strictEqual(triggerResult.status, 'success', 'Automation triggered successfully');
    assert.ok(triggerResult.runId.startsWith('run-'), 'Run log ID returned');

    const logs = AutomationService.getRunLogs(autoPr.id);
    assert.strictEqual(logs.length, 1, 'Run log persisted');
    assert.strictEqual(logs[0].status, 'success', 'Log status is success');
    assert.ok(logs[0].outputSummary.includes('Triggered automated PR review'), 'Output summary logged');
    console.log('[PASS] Automation trigger execution and history logging verified');

    // 3. Disabled Automation Guard
    console.log('\n--- Test 3: Disabled Automation Guard ---');
    autoPr.enabled = false;
    let threwDisabled = false;
    try {
      await AutomationService.trigger(autoPr.id, {
        triggerType: 'manual',
        userId: 'user-auto-1'
      });
    } catch (err: any) {
      threwDisabled = true;
      assert.ok(err.message.includes('disabled'), 'Reports automation is disabled');
    }
    assert.strictEqual(threwDisabled, true, 'Disabled automation cannot be triggered');
    console.log('[PASS] Disabled automation cannot be executed');

    console.log('\n==================================================');
    console.log('Milestone 9 Automations: All 3 suites passed!');
    console.log('==================================================\n');
  } catch (err: any) {
    console.error('[FAIL] Automations verification failed:', err);
    process.exit(1);
  } finally {
    AutomationService.clear();
  }
}

runTests();
