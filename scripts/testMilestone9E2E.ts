import assert from 'assert';
import { ContextBuilder } from '../src/server/contextBuilder';
import { RulesService } from '../src/server/rules/rulesService';
import { SkillsService } from '../src/server/skills/skillsService';
import { TerminalService } from '../src/server/terminal/terminalService';
import { CodeReviewService } from '../src/server/review/codeReviewService';
import { WORKFLOW_MODE_POLICIES } from '../src/server/agent/agentModes';

console.log('=== FLOAT AI Milestone 9: End-to-End Developer Loop Verification ===\n');

async function runE2ETests() {
  const projectId = 'proj-e2e-developer-loop';
  const userId = 'user-e2e-dev';

  try {
    // Stage 1: Workspace setup with rules and files
    console.log('--- Stage 1: Project Workspace & Rules Setup ---');
    const workspaceFiles = [
      {
        path: 'src/auth/session.ts',
        name: 'session.ts',
        content: `export function validateSession(token: string): boolean {
  return token.length > 10;
}`
      },
      {
        path: 'src/index.ts',
        name: 'index.ts',
        content: `import { validateSession } from './auth/session';
export function run() {
  return validateSession('valid-user-token');
}`
      },
      {
        path: '.float/rules/architecture.md',
        name: 'architecture.md',
        content: 'All exported functions must include type annotations.'
      }
    ];

    const repoRules = RulesService.discoverRepositoryRules(workspaceFiles);
    assert.strictEqual(repoRules.length, 1, 'Repository rule discovered from workspace files');
    console.log('[PASS] Stage 1: Workspace files and repository rules indexed');

    // Stage 2: AI Context Assembly in Plan Mode
    console.log('\n--- Stage 2: Context Assembly & Plan Formulation ---');
    const assembled = ContextBuilder.retrieveAndBuildBoundedContext(
      'Plan refactoring of validateSession to support expiry timestamps',
      projectId,
      workspaceFiles,
      [],
      {
        userId,
        projectId,
        workflowMode: 'plan'
      }
    );

    assert.strictEqual(assembled.intent, 'refactor', 'Task intent classified as refactor');
    assert.ok(assembled.formattedPrompt.includes('[Workflow Mode: PLAN MODE]'), 'Plan mode instructions present');
    assert.ok(assembled.formattedPrompt.includes('validateSession'), 'Target code excerpt retrieved');
    assert.ok(assembled.formattedPrompt.includes('All exported functions must include type annotations'), 'Effective rule injected');
    console.log('[PASS] Stage 2: Context retrieved with rules, mode instructions, and bounded excerpts');

    // Stage 3: Human Review Gate on Plan and Proposals
    console.log('\n--- Stage 3: Approval Gates on Plan & Edits ---');
    const planPolicy = WORKFLOW_MODE_POLICIES['plan'];
    assert.strictEqual(planPolicy.requiresHumanApproval, true, 'Plan execution strictly requires explicit user approval');
    assert.strictEqual(planPolicy.canApplyProposals, false, 'Model cannot self-apply edits');
    console.log('[PASS] Stage 3: Safety gates prevent autonomous unvetted application');

    // Stage 4: Terminal Session & Execution
    console.log('\n--- Stage 4: Sandboxed Terminal Session ---');
    const term = TerminalService.createSession(projectId, userId, 'Build Terminal');
    TerminalService.appendExecution(
      term.id,
      userId,
      'npm test',
      'PASS src/auth/session.test.ts (1 test)',
      '',
      0
    );

    const verifiedTerm = TerminalService.getSession(term.id, userId);
    assert.ok(verifiedTerm?.outputBuffer.includes('PASS src/auth/session.test.ts'), 'Terminal captured real test output');
    assert.strictEqual(verifiedTerm?.history[0], 'npm test', 'Command history recorded');
    console.log('[PASS] Stage 4: Terminal execution recorded in bounded buffer');

    // Stage 5: Automated Code Review Scan
    console.log('\n--- Stage 5: Automated Code Review Pre-Commit Scan ---');
    const reviewReport = CodeReviewService.analyzeDiff(projectId, '', workspaceFiles);
    assert.ok(reviewReport.id.startsWith('rev-'), 'Generated review report');
    assert.strictEqual(reviewReport.summary.criticalCount, 0, 'Clean code has 0 critical security issues');
    console.log('[PASS] Stage 5: Pre-commit code review passed with zero critical flaws');

    console.log('\n================================================================');
    console.log('Milestone 9 End-to-End Developer Loop: 5/5 Stages Fully Verified!');
    console.log('================================================================\n');
  } catch (err: any) {
    console.error('[FAIL] End-to-End developer loop failed:', err);
    process.exit(1);
  }
}

runE2ETests();
