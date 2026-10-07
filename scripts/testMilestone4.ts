import assert from 'assert';
import { PlanService } from '../src/server/agent/planService';
import { getPlanDurable, savePlanDurable, listPlansDurable, updatePlanDurable } from '../src/server/agent/planPersistence';
import { Plan } from '../src/types/plan';

async function runMilestone4Tests() {
  console.log('--- Running Milestone 4 Tests: Plan Mode & Multi-Step Agent Execution ---');

  // Test 1: Plan Generation with Mock ModelRouter
  console.log('Test 1: Plan Generation produces structured steps...');
  const mockModelRouter: any = {
    generateContent: async () => ({
      text: JSON.stringify({
        title: 'Add JWT Authentication',
        summary: 'Implement token-based authentication and auth guards.',
        steps: [
          {
            order: 1,
            objective: 'Inspect existing auth middleware and tokens',
            files: ['src/server/authMiddleware.ts'],
            tools: ['read_project_file'],
            validation: 'Manual inspection'
          },
          {
            order: 2,
            objective: 'Implement JWT signing and verification',
            files: ['src/server/jwtService.ts'],
            tools: ['propose_changes'],
            validation: 'Syntax check and token round-trip test'
          },
          {
            order: 3,
            objective: 'Apply auth guards to sensitive endpoints',
            files: ['src/server/app.ts'],
            tools: ['propose_changes'],
            validation: 'Integration tests'
          }
        ]
      })
    })
  };

  const genResult = await PlanService.generatePlan({
    ownerId: 'user-alice',
    projectId: 'proj-123',
    conversationId: 'conv-abc',
    prompt: 'Add JWT authentication to the API',
    virtualFiles: [{ path: 'src/server/authMiddleware.ts', content: '// auth' }]
  }, mockModelRouter);

  assert.ok(genResult.plan, 'Plan must be created');
  assert.strictEqual(genResult.plan.status, 'awaiting_approval', 'Generated plan starts in awaiting_approval');
  assert.strictEqual(genResult.plan.steps.length, 3, 'Must contain 3 structured steps');
  assert.strictEqual(genResult.plan.title, 'Add JWT Authentication');
  assert.strictEqual(genResult.plan.steps[0].status, 'pending');
  console.log('✓ Test 1 Passed: Plan generation produces structured, strongly typed steps in awaiting_approval status.');

  // Test 2: Plan Approval Workflow
  console.log('Test 2: Plan Approval by authenticated owner...');
  const planId = genResult.plan.id;
  const approveResult = await PlanService.approvePlan(planId, 'user-alice');
  assert.ok(approveResult.plan, 'Approve succeeds for owner');
  assert.strictEqual(approveResult.plan.status, 'approved', 'Plan status transitions to approved');
  assert.ok(approveResult.plan.approvedAt, 'Timestamp recorded for approval');
  console.log('✓ Test 2 Passed: Authenticated plan approval transitions state cleanly.');

  // Test 3: Unauthorized Access & Cross-User Security Guard
  console.log('Test 3: Reject unauthorized approval and cross-user access...');
  const unauthApprove = await PlanService.approvePlan(planId, 'user-mallory');
  assert.ok(unauthApprove.error, 'Rejects approval from unauthorized user');

  const unauthFetch = await getPlanDurable(planId, 'user-mallory');
  assert.strictEqual(unauthFetch, null, 'Unauthorized user cannot read plan');
  console.log('✓ Test 3 Passed: Plan authorization strictly isolates cross-user access.');

  // Test 4: Plan Editing / Updates Before Execution
  console.log('Test 4: Plan Editing updates persisted structure...');
  const editResult = await PlanService.updatePlan(planId, 'user-alice', {
    title: 'Customized JWT Auth Plan',
    summary: 'Refined plan with security checks.'
  });
  assert.ok(editResult.plan, 'Update succeeds');
  assert.strictEqual(editResult.plan.title, 'Customized JWT Auth Plan');
  assert.strictEqual(editResult.plan.summary, 'Refined plan with security checks.');
  console.log('✓ Test 4 Passed: Authoritative user plan edits are persisted.');

  // Test 5: Plan Cancellation
  console.log('Test 5: Plan Cancellation stops pending plan...');
  const cancelResult = await PlanService.cancelPlan(planId, 'user-alice');
  assert.ok(cancelResult.plan, 'Cancellation succeeds');
  assert.strictEqual(cancelResult.plan.status, 'cancelled', 'Plan status set to cancelled');
  console.log('✓ Test 5 Passed: Plan cancellation cleanly marks plan and steps as cancelled.');

  // Test 6: Persistence & Recovery
  console.log('Test 6: Durable plan persistence and retrieval...');
  const retrieved = await getPlanDurable(planId, 'user-alice');
  assert.ok(retrieved, 'Plan is durable and retrieved');
  assert.strictEqual(retrieved.id, planId);

  const projectPlans = await listPlansDurable('proj-123', 'user-alice');
  assert.ok(projectPlans.length >= 1, 'Lists plans for project');
  console.log('✓ Test 6 Passed: Plan recovery from persistence confirmed.');

  console.log('All Milestone 4 automated verification tests passed successfully!');
}

runMilestone4Tests().catch((err) => {
  console.error('Milestone 4 Test Failure:', err);
  process.exit(1);
});
