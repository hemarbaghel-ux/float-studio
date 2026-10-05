import assert from 'node:assert/strict';
import { isFirebaseTokenTimeValid } from '../src/server/authMiddleware';
import { normalizeGitPath, validateBranch } from '../src/server/github/gitRouter';
import { sanitizeProposalPath } from '../src/server/agent/proposalService';
import { EvalEngine } from '../src/server/evalEngine';

const now = 1_800_000_000;
assert.equal(isFirebaseTokenTimeValid(now + 60, now - 60, now), true, 'accepts a correctly timed Firebase ID token');
assert.equal(isFirebaseTokenTimeValid(now, now - 60, now), false, 'rejects an expired Firebase ID token at its exact expiry');
assert.equal(isFirebaseTokenTimeValid(Number.NaN, now, now), false, 'rejects malformed Firebase expiry claims');
assert.equal(isFirebaseTokenTimeValid(now + 60, now + 61, now), false, 'rejects ID tokens issued too far in the future');

assert.equal(normalizeGitPath('src\\feature.ts'), 'src/feature.ts', 'normalizes Git paths to repository separators');
for (const unsafe of ['../secret', 'src/../../secret', '/etc/passwd', 'C:\\Windows\\win.ini', 'src\\..\\secret', 'src//file']) {
  assert.equal(normalizeGitPath(unsafe), null, `rejects unsafe Git path ${unsafe}`);
}
assert.equal(validateBranch('feature/audit-fix'), 'feature/audit-fix', 'accepts a valid Git branch name');
for (const unsafe of ['main..attacker', 'feature//bad', '../main', 'feature/.hidden', '-leading']) {
  assert.throws(() => validateBranch(unsafe), `rejects unsafe Git branch ${unsafe}`);
}

for (const unsafe of ['..\\..\\secrets.txt', 'C:\\Windows\\win.ini', '/etc/passwd', 'src/.env.production', 'src/keys/private.pem']) {
  assert.ok(sanitizeProposalPath(unsafe).error, `rejects unsafe proposal path ${unsafe}`);
}
assert.equal(sanitizeProposalPath('src/components/App.tsx').safePath, 'src/components/App.tsx');

const evalEngine = new EvalEngine();
for (const unsafe of ['src/.env.production', '../../outside.ts']) {
  assert.throws(() => evalEngine.createTask({
    name: 'security path test', description: 'valid test task', category: 'Security', difficulty: 'easy',
    prompt: 'Do not run', validationType: 'exact_match', files: [{ path: unsafe, content: 'sensitive' }]
  } as any, 'security-test'), `rejects evaluation context path ${unsafe}`);
}

console.log('Security audit focused checks: 25 passed, 0 failed.');
