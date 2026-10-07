import assert from 'assert';
import { CodeReviewService } from '../src/server/review/codeReviewService';

console.log('=== FLOAT AI Milestone 9: Automated Code Review Verification ===\n');

try {
  CodeReviewService.clear();

  // 1. Analyze files for security and correctness
  console.log('--- Test 1: Code Review Analysis & Vulnerability Detection ---');
  const filesToReview = [
    {
      path: 'src/server/auth.ts',
      content: `
export function getApiKey() {
  const token = "sk-111122223333444455556666777788889999000011112222";
  return token;
}
`
    },
    {
      path: 'src/server/api/read.ts',
      content: `
export function readFile(userPath: string) {
  const filePath = "../../data/" + userPath;
  return filePath;
}
`
    },
    {
      path: 'src/utils/clean.ts',
      content: `
export function add(a: number, b: number) {
  return a + b;
}
`
    }
  ];

  const report = CodeReviewService.analyzeDiff('proj-rev-1', '', filesToReview);
  assert.ok(report.id.startsWith('rev-'), 'Generated report ID');
  assert.strictEqual(report.findings.length >= 2, true, 'Detected at least 2 code findings');

  // Verify critical secret detection
  const secFinding = report.findings.find(f => f.category === 'security' && f.severity === 'critical');
  assert.ok(secFinding, 'Detected critical security finding');
  assert.ok(secFinding?.finding.includes('credential or token'), 'Correctly identifies credential issue');
  assert.strictEqual(secFinding?.filePath, 'src/server/auth.ts', 'Identifies exact file');
  assert.strictEqual(secFinding?.line, 3, 'Identifies exact line');

  // Verify path traversal detection
  const travFinding = report.findings.find(f => f.category === 'security' && f.severity === 'high');
  assert.ok(travFinding, 'Detected high security path traversal finding');
  assert.strictEqual(travFinding?.filePath, 'src/server/api/read.ts', 'Identifies traversal file');
  console.log('[PASS] Automated code reviewer detected real security issues with file and line precision');

  // 2. Finding Dismissal
  console.log('\n--- Test 2: Finding Dismissal ---');
  assert.strictEqual(secFinding?.dismissed, false, 'Finding initially active');
  const dismissed = CodeReviewService.dismissFinding(report.id, secFinding!.id);
  assert.strictEqual(dismissed, true, 'Dismissal succeeded');

  const refreshedReport = CodeReviewService.getReport(report.id);
  const refreshedFinding = refreshedReport?.findings.find(f => f.id === secFinding!.id);
  assert.strictEqual(refreshedFinding?.dismissed, true, 'Finding now marked as dismissed');
  console.log('[PASS] User dismiss review finding workflow verified');

  console.log('\n==================================================');
  console.log('Milestone 9 Code Review: All 2 suites passed!');
  console.log('==================================================\n');
} catch (err: any) {
  console.error('[FAIL] Code review verification failed:', err);
  process.exit(1);
} finally {
  CodeReviewService.clear();
}
