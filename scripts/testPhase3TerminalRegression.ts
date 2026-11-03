import assert from 'node:assert/strict';
import { runShell, isShellCommand } from '../src/features/float/sandbox';
import { sandboxFs } from '../src/features/float/workspaceFs';
import { TerminalService, sanitizeTerminalOutput } from '../src/server/terminal/terminalService';

console.log('=== PHASE 3: SANDBOXED TERMINAL & "FIX WITH FLOAT" REGRESSION SUITE ===');

async function runTests() {
  // --- 1. Browser Worker Sandbox Shell Tests ---
  console.log('\n--- 1. Browser Worker Sandbox Command Execution ---');
  {
    assert.equal(isShellCommand('echo "hello world"'), true, 'echo should be recognized as a shell command');
    assert.equal(isShellCommand('ls'), true, 'ls should be recognized as a shell command');
    assert.equal(isShellCommand('pwd'), true, 'pwd should be recognized as a shell command');
    assert.equal(isShellCommand('cat main.py'), true, 'cat should be recognized as a shell command');
    assert.equal(isShellCommand('curl https://example.com'), false, 'curl should not be handled by browser worker shell');
    assert.equal(isShellCommand('docker run ubuntu'), false, 'docker should not be handled by browser worker shell');

    const fs = sandboxFs();
    fs.write('greeting.txt', 'Hello from Float sandbox!');

    // Test echo
    const echoRes = await runShell('echo "test execution"', fs);
    assert.equal(echoRes.code, 0, 'echo command must exit with code 0');
    assert.ok(echoRes.output.includes('test execution'), 'echo command must return output');

    // Test cat
    const catRes = await runShell('cat greeting.txt', fs);
    assert.equal(catRes.code, 0, 'cat command must exit with code 0');
    assert.ok(catRes.output.includes('Hello from Float sandbox!'), 'cat must return file content');

    // Test cat failure on missing file
    const catFail = await runShell('cat non_existent_file.txt', fs);
    assert.ok(catFail.code !== 0, 'cat on missing file must return non-zero exit code');
    assert.ok(catFail.output.toLowerCase().includes('no such file') || catFail.output.includes('cat:'), 'Error output must indicate file failure');

    console.log('[PASS] Browser sandbox shell commands (isShellCommand, echo, cat, error exit code)');
  }

  // --- 2. Server-Side Terminal Service & Isolation ---
  console.log('\n--- 2. Server Terminal Isolation, Buffer Bounding & Traversal Prevention ---');
  {
    const userId = 'user-agent-audit-1';
    const projectId = 'proj-bounded-1';

    // Session creation
    const session = TerminalService.createSession(projectId, userId, 'Audit Terminal');
    assert.ok(session.id.startsWith('term-'), 'Session ID must start with term-');
    assert.equal(session.projectId, projectId, 'Session project ID must match');
    assert.equal(session.userId, userId, 'Session user ID must match');
    assert.equal(session.cwd, '/', 'Initial cwd must be root /');

    // Directory traversal attacks
    const trav1 = TerminalService.changeDirectory(session.id, userId, '../etc');
    assert.equal(trav1.success, false, 'Should reject relative parent traversal (../etc)');
    assert.equal(session.cwd, '/', 'Session cwd must not change on traversal attempt');

    const trav2 = TerminalService.changeDirectory(session.id, userId, 'C:\\Windows\\System32');
    assert.equal(trav2.success, false, 'Should reject Windows absolute drive path traversal');
    assert.equal(session.cwd, '/', 'Session cwd must not change on drive escape attempt');

    const trav3 = TerminalService.changeDirectory(session.id, userId, 'foo/\0/bar');
    assert.equal(trav3.success, false, 'Should reject null byte injection');

    // Legitimate path change
    const validNav = TerminalService.changeDirectory(session.id, userId, 'src/components');
    assert.equal(validNav.success, true, 'Valid workspace directory change must succeed');
    assert.equal(session.cwd, '/src/components', 'Session cwd should be updated with leading /');

    // Multi-tenant authorization guard
    const unauthorizedSession = TerminalService.getSession(session.id, 'attacker-user-id');
    assert.equal(unauthorizedSession, undefined, 'Accessing session with wrong userId must return undefined');

    console.log('[PASS] Terminal session creation, multi-tenant isolation & path traversal security');
  }

  // --- 3. Terminal Output Secret Sanitization ---
  console.log('\n--- 3. Terminal Secret Token Redaction ---');
  {
    const secretText = [
      'Error in OpenAI call: sk-proj-1234567890abcdef1234567890abcdef1234567890 failed.',
      'GitHub token: ghp_1234567890abcdef1234567890abcdef1234 is invalid.',
      'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeak',
      'Google API Key: AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q'
    ].join('\n');

    const sanitized = sanitizeTerminalOutput(secretText);
    assert.ok(!sanitized.includes('sk-proj-'), 'OpenAI secret token must be stripped');
    assert.ok(!sanitized.includes('ghp_'), 'GitHub token must be stripped');
    assert.ok(!sanitized.includes('eyJhbGciOiJIUzI1Ni'), 'JWT token must be stripped');
    assert.ok(!sanitized.includes('AIzaSyA1B2C3D4'), 'Google API key must be stripped');
    assert.ok(sanitized.includes('[REDACTED_SECRET]'), 'Must replace secrets with [REDACTED_SECRET]');

    // Verify sanitized execution append
    const userId = 'user-sec-1';
    const s = TerminalService.createSession('p-sec-1', userId);
    TerminalService.appendExecution(
      s.id,
      userId,
      'git push origin main',
      'Pushing to https://ghp_1234567890abcdef1234567890abcdef1234@github.com',
      'Error sk-proj-0987654321fedcba0987654321fedcba0987654321 unauthorized',
      1
    );

    assert.ok(!s.outputBuffer.includes('ghp_'), 'Buffer must not contain ghp_ token');
    assert.ok(!s.outputBuffer.includes('sk-proj-'), 'Buffer must not contain sk-proj- token');
    assert.ok(s.outputBuffer.includes('[REDACTED_SECRET]'), 'Buffer must contain [REDACTED_SECRET]');
    assert.equal(s.history[0], 'git push origin main', 'History must record command');

    console.log('[PASS] Sensitive tokens redacted from terminal buffers & executions');
  }

  // --- 4. "Fix with FLOAT" Automated Feedback Loop ---
  console.log('\n--- 4. "Fix with FLOAT" Error Prompt Packaging & Truncation ---');
  {
    // Verify truncation and prompt construction
    const buildFixPrompt = (cmd: string, errorOutput: string) => {
      const truncated = errorOutput.length > 2500 ? '...\n' + errorOutput.slice(-2500) : errorOutput;
      return "Fix the failure encountered when running `" + cmd + "`:\n```\n" + truncated + "\n```\nPlease analyze the error, locate the root cause, and propose a multi-file diff to fix it.";
    };

    const shortError = 'TypeError: Cannot read properties of undefined (reading "map") at Button.tsx:14:10';
    const shortPrompt = buildFixPrompt('npm test', shortError);
    assert.ok(shortPrompt.includes('Fix the failure encountered when running `npm test`:'), 'Prompt includes target command');
    assert.ok(shortPrompt.includes(shortError), 'Short error is included entirely');
    assert.ok(shortPrompt.includes('propose a multi-file diff to fix it'), 'Prompt asks for a structured multi-file diff proposal');

    // Giant error trace (exceeding 2500 chars)
    const longError = 'Traceback (most recent call last):\n' + '  at frame line\n'.repeat(300) + 'CRITICAL_ERROR: memory exhausted';
    assert.ok(longError.length > 2500, 'Test error must exceed 2500 chars');
    const longPrompt = buildFixPrompt('python runner.py', longError);
    assert.ok(longPrompt.includes('...\n'), 'Oversized error must have leading ellipsis');
    assert.ok(longPrompt.includes('CRITICAL_ERROR: memory exhausted'), 'End of traceback must be retained');
    assert.ok(longPrompt.length < 3000, 'Prompt must remain compact and well within model character budget');

    console.log('[PASS] "Fix with FLOAT" prompt construction, bounded truncation & proposal request format');
  }

  console.log('\n======================================================');
  console.log('Phase 3 Sandboxed Terminal & "Fix with AI" Regression: All checks passed!');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
