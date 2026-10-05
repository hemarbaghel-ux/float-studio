import { ProjectProcessManager, validateRelativePath } from '../src/server/execution/processManager';
import { runShell } from '../src/features/float/sandbox';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Project execution test failed: ${message}`);
  console.log(`[PASS] ${message}`);
}

assert(validateRelativePath('src/app.ts').includes('src'), 'accepts a workspace-relative source path');
for (const invalid of ['../secret', 'src/../../secret', '/etc/passwd', 'C:\\Windows\\win.ini', 'src\\..\\secret']) {
  let rejected = false;
  try { validateRelativePath(invalid); } catch { rejected = true; }
  assert(rejected, `rejects unsafe workspace path ${invalid}`);
}

const browserPackageInstall = await runShell('npm install', {
  files: () => ({ 'package.json': '{"dependencies":{}}' }),
  write: () => undefined,
  remove: () => undefined
});
assert(browserPackageInstall.code !== 0 && /unavailable in the browser worker/.test(browserPackageInstall.output), 'browser-only worker refuses to fake package installation success');

const previousImage = process.env.FLOAT_EXECUTION_IMAGE;
const previousDocker = process.env.FLOAT_DOCKER_BIN;
delete process.env.FLOAT_EXECUTION_IMAGE;
delete process.env.FLOAT_DOCKER_BIN;
try {
  const manager = new ProjectProcessManager();
  assert(!manager.available, 'reports sandbox unavailable when runtime configuration is absent');
  let rejected = false;
  try { manager.start({ ownerId: 'owner', projectId: 'project', command: 'echo must-not-run', files: [] }, () => undefined); }
  catch (error: any) { rejected = /not configured/.test(error.message); }
  assert(rejected, 'fails closed instead of faking command output without Docker');
} finally {
  if (previousImage !== undefined) process.env.FLOAT_EXECUTION_IMAGE = previousImage;
  if (previousDocker !== undefined) process.env.FLOAT_DOCKER_BIN = previousDocker;
}
