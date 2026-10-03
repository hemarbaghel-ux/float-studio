import { ValidationService } from '../src/server/validation/validationService';
import { ProposalService } from '../src/server/agent/proposalService';

async function runTests() {
  console.log('--- Starting FLOAT Phase 6 Testing, Validation & Error Analysis Test Suite ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // 1. Output Sanitization & Secret Redaction
  const rawWithApiKey = 'Error at https://generativelanguage.googleapis.com with key AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q in /var/task/float-ai/src/index.ts';
  const sanitizedApiKey = ValidationService.sanitizeOutput(rawWithApiKey);
  assert(!sanitizedApiKey.includes('AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q'), 'Sanitizes and redacts Gemini/Google API keys');
  assert(sanitizedApiKey.includes('[REDACTED_API_KEY]'), 'Replaces API keys with [REDACTED_API_KEY]');

  const rawWithAuth = 'Authorization header was Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisToken';
  const sanitizedAuth = ValidationService.sanitizeOutput(rawWithAuth);
  assert(!sanitizedAuth.includes('doNotLeakThisToken'), 'Redacts Bearer authorization tokens');
  assert(sanitizedAuth.includes('[REDACTED_TOKEN]'), 'Replaces tokens with [REDACTED_TOKEN]');

  const rawWithCwd = `Failed in ${process.cwd()}/src/server/app.ts`;
  const sanitizedCwd = ValidationService.sanitizeOutput(rawWithCwd);
  assert(!sanitizedCwd.includes(process.cwd()), 'Redacts absolute server working directory paths');

  // 2. TSC Output Parsing
  const mockTscOutput = `
src/server/app.ts(24,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/types/index.ts(104,1): warning TS2308: Module './evals' has already exported a member named 'ValidationType'.
`;
  const parsedDiags = ValidationService.parseTscDiagnostics(mockTscOutput);
  assert(parsedDiags.length === 2, 'Parses multiple compiler diagnostics from raw tsc output');
  assert(parsedDiags[0].filePath === 'src/server/app.ts' && parsedDiags[0].line === 24 && parsedDiags[0].column === 5, 'Extracts exact file path, line, and column');
  assert(parsedDiags[0].severity === 'error' && parsedDiags[0].message.includes('TS2322'), 'Extracts error severity and TS code');
  assert(parsedDiags[1].severity === 'warning', 'Extracts warning severity correctly');

  // 3. Syntax Validation: JSON
  const validJson = ValidationService.validateSyntax([{ path: 'config.json', content: '{"port": 3000, "debug": true}' }]);
  assert(validJson.status === 'passed' && validJson.diagnostics.length === 0, 'Valid JSON passes syntax check');

  const invalidJson = ValidationService.validateSyntax([{ path: 'bad.json', content: '{"port": 3000, "debug": }' }]);
  assert(invalidJson.status === 'failed' && invalidJson.diagnostics.length === 1, 'Invalid JSON fails syntax check');
  assert(invalidJson.diagnostics[0].line === 1, 'JSON syntax error identifies line reference');

  // 4. Syntax Validation: TypeScript / JavaScript
  const validTs = ValidationService.validateSyntax([{ path: 'src/math.ts', content: 'export function add(a: number, b: number): number { return a + b; }' }]);
  assert(validTs.status === 'passed', 'Valid TypeScript syntax passes');

  const invalidTs = ValidationService.validateSyntax([{ path: 'src/bad.ts', content: 'export function add(a: number, b: number { return a + b;' }]);
  assert(invalidTs.status === 'failed' && invalidTs.diagnostics.length > 0, 'Invalid TypeScript syntax with unclosed paren fails');
  assert(invalidTs.diagnostics[0].filePath === 'src/bad.ts', 'Diagnostic references exact bad TypeScript file');

  // 5. Syntax Validation: Python
  const validPy = ValidationService.validateSyntax([{ path: 'main.py', content: 'def greet(name):\n    print(f"Hello {name}")\n' }]);
  assert(validPy.status === 'passed', 'Valid Python syntax passes');

  const invalidPy = ValidationService.validateSyntax([{ path: 'main.py', content: 'def greet(name:\n    print("Hello")\n' }]);
  assert(invalidPy.status === 'failed', 'Unmatched bracket in Python fails');

  // 6. Proposal Validation: Validating a proposal without modifying original project files
  const originalFiles = [
    { path: 'src/calc.ts', content: 'export const calculate = (x: number) => x * 2;\n' }
  ];
  const fileBefore = originalFiles[0].content;

  const fileMap = new Map<string, { content?: string }>();
  fileMap.set('src/calc.ts', { content: fileBefore });

  // Create proposal with a syntax error
  const proposalResult = ProposalService.createProposal({
    ownerId: 'test-user',
    projectId: 'test-proj',
    description: 'Refactor calculation with intentional typo',
    rawChanges: [
      {
        path: 'src/calc.ts',
        operation: 'modify',
        proposedContent: 'export const calculate = (x: number => x * 3;\n' // Missing closing paren
      }
    ],
    virtualFiles: fileMap
  });

  const proposal = proposalResult.proposal!;
  assert(!!proposal, 'Proposal created for validation test');

  // Validate the proposal preview
  const proposalValidation = await ValidationService.executeValidation({
    projectId: 'test-proj',
    userId: 'test-user',
    target: 'proposal',
    proposalId: proposal.id,
    files: originalFiles,
    requestedChecks: ['syntax']
  });

  assert(proposalValidation.status === 'failed', 'Validation catches syntax error in proposed code before application');
  assert(proposalValidation.errorCount >= 1, 'Records diagnostic error count in proposal preview');
  assert(originalFiles[0].content === fileBefore, 'Original project files remain 100% UNMODIFIED during proposal validation');

  // 7. Unsupported Checks Reporting (Honest Feature Status)
  const fullValidation = await ValidationService.executeValidation({
    projectId: 'test-proj-2',
    userId: 'test-user',
    target: 'current_project',
    files: originalFiles,
    requestedChecks: ['test', 'eslint']
  });

  const testCheck = fullValidation.checks.find(c => c.type === 'test');
  assert(testCheck?.status === 'unsupported', 'Reports unit test runner as unsupported when not configured in package.json');
  assert(!!testCheck?.unsupportedReason?.includes('Vitest/Jest'), 'Explains reason unit test runner is unsupported');

  const eslintCheck = fullValidation.checks.find(c => c.type === 'eslint');
  assert(eslintCheck?.status === 'unsupported', 'Reports ESLint as unsupported when not configured');

  // 8. Cancellation of validation run
  const cancelResult = ValidationService.cancelValidation('non-existent-project');
  assert(cancelResult === false, 'Handles cancelling idle or non-existent project run safely');

  console.log(`\nTest Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
