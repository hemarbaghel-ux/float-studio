import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProductionComposerFileSystem, ProductionComposerCommandRunner, SpeculativeComposerFileSystem, IsolatedShadowWorkspaceCommandRunner, resolveComposerWorkspacePath, resolveComposerWorkspaceRelativePath } from '../desktop/src/vs/workbench/contrib/float/common/composer/floatProductionAdapters.js';
import { copyComposerWorkspace } from '../desktop/src/vs/workbench/contrib/float/common/composer/floatSandboxWorkspaceCopy.js';
import { FloatComposer } from '../desktop/src/vs/workbench/contrib/float/browser/composer/floatComposer.js';
import {
  buildFloatDockerSandboxArgs,
  DEFAULT_FLOAT_COMPOSER_SANDBOX_IMAGE
} from '../desktop/src/vs/workbench/contrib/float/common/composer/floatDockerSandboxRunner.js';

async function main(): Promise<void> {
  // The production Composer wrapper must not let callers disable speculative
  // workspace isolation, even when a goal explicitly supplies false.
  let forwardedGoal: any;
  const composerIsolationProbe = Object.create(FloatComposer.prototype) as any;
  composerIsolationProbe._notificationService = { info: () => undefined };
  composerIsolationProbe._agent = {
    executeGoal: async (goal: any) => {
      forwardedGoal = goal;
      return { proposal: undefined, status: 'completed' };
    }
  };
  await composerIsolationProbe.executeAutonomousGoal({
    prompt: 'verify Composer isolation',
    isolateWorkspaceMutations: false
  });
  assert.equal(forwardedGoal.isolateWorkspaceMutations, true, 'production Composer must enforce speculative workspace isolation');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'float-composer-security-'));
  const workspace = path.join(tempRoot, 'workspace-root');
  const sibling = path.join(tempRoot, 'workspace-root-evil');
  const dependencies = path.join(workspace, 'node_modules');

  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(sibling, { recursive: true });
  fs.mkdirSync(dependencies, { recursive: true });
  fs.writeFileSync(path.join(workspace, 'safe.txt'), 'safe', 'utf8');
  fs.writeFileSync(path.join(workspace, '.env'), 'FLOAT_API_KEY=do-not-copy', 'utf8');
  fs.writeFileSync(path.join(workspace, '.npmrc'), '//registry.example/:_authToken=do-not-copy', 'utf8');
  fs.writeFileSync(path.join(workspace, 'credentials.json'), '{"private_key":"do-not-copy"}', 'utf8');
  fs.mkdirSync(path.join(workspace, '.aws'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.aws', 'credentials'), '[default]\\naws_access_key_id = do-not-copy', 'utf8');
  fs.mkdirSync(path.join(workspace, '.ssh'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.ssh', 'id_ed25519'), 'PRIVATE KEY MATERIAL', 'utf8');
  fs.mkdirSync(path.join(workspace, 'secrets'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'secrets', 'provider.json'), '{"api_key":"do-not-copy"}', 'utf8');
  fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'src', 'app.ts'), 'export const safe = true;', 'utf8');
  fs.writeFileSync(path.join(sibling, 'outside.txt'), 'outside', 'utf8');

  try {

    const copyDestination = path.join(tempRoot, 'safe-copy');
    const copyStats = copyComposerWorkspace(workspace, copyDestination);
    assert.ok(copyStats.filesCopied >= 2, 'normal project source files should be copied');
    assert.equal(fs.existsSync(path.join(copyDestination, 'src', 'app.ts')), true);
    for (const excluded of ['.env', '.npmrc', 'credentials.json', path.join('secrets', 'provider.json'), path.join('.aws', 'credentials'), path.join('.ssh', 'id_ed25519')]) {
      assert.equal(fs.existsSync(path.join(copyDestination, excluded)), false, 'sensitive file must not enter command workspace: ' + excluded);
    }
    assert.equal(fs.existsSync(path.join(copyDestination, 'node_modules')), false, 'dependency directory must not be copied');

    assert.equal(resolveComposerWorkspaceRelativePath(workspace, path.join(workspace, 'src', 'app.ts')), 'src/app.ts');
    assert.equal(resolveComposerWorkspaceRelativePath(workspace, 'src/app.ts'), 'src/app.ts');
    const symlinkWorkspace = path.join(tempRoot, 'workspace-alias');
    let workspaceAliasSupported = true;
    try {
      fs.symlinkSync(workspace, symlinkWorkspace, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EACCES' || code === 'UNKNOWN') {
        workspaceAliasSupported = false;
      } else {
        throw error;
      }
    }
    if (workspaceAliasSupported) {
      assert.equal(
        resolveComposerWorkspaceRelativePath(symlinkWorkspace, path.join(symlinkWorkspace, 'src', 'app.ts')),
        'src/app.ts',
        'opening a workspace through a symlinked root must preserve its valid relative editor paths'
      );
      assert.equal(
        fs.realpathSync(resolveComposerWorkspacePath(symlinkWorkspace, 'src/app.ts')),
        fs.realpathSync(path.join(workspace, 'src', 'app.ts'))
      );
    }
    assert.throws(() => resolveComposerWorkspaceRelativePath(workspace, path.join(sibling, 'outside.txt')), /outside the active workspace/);
    assert.throws(() => resolveComposerWorkspacePath(workspace, '.aws/credentials'), /excluded workspace path/);
    assert.throws(() => resolveComposerWorkspacePath(workspace, '.ssh/id_ed25519'), /excluded workspace path/);
    assert.throws(() => resolveComposerWorkspacePath(workspace, '../workspace-root-evil/outside.txt'), /Path traversal/);

    const fileSystem = new ProductionComposerFileSystem(workspace);
    const speculativeFs = new SpeculativeComposerFileSystem(fileSystem);
    await assert.rejects(() => speculativeFs.writeFile('.aws/credentials', 'fake-secret'), /Writing to sensitive file prohibited/);
    await assert.rejects(() => speculativeFs.readFile('.aws/credentials'), /Access denied to sensitive file/);
    assert.equal(await speculativeFs.fileExists('.aws/credentials'), false);
    assert.deepEqual(await speculativeFs.listDirectory('.aws', true), []);
    await fileSystem.writeFile('safe.txt', 'updated');
    assert.equal(await fileSystem.readFile('safe.txt'), 'updated');
    for (const deniedPath of ['.env', '.npmrc', 'credentials.json', '.aws/credentials', '.ssh/id_ed25519', 'secrets/provider.json']) {
      await assert.rejects(() => fileSystem.readFile(deniedPath), /Access denied/);
    }
    const visiblePaths = await fileSystem.listDirectory('.', true);
    assert.equal(visiblePaths.some(filePath => filePath.startsWith('.aws/')), false);
    assert.equal(visiblePaths.some(filePath => filePath.startsWith('.ssh/')), false);

    const escapeLink = path.join(workspace, 'escape');
    let symlinkSupported = true;
    try {
      fs.symlinkSync(sibling, escapeLink, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EACCES' || code === 'UNKNOWN') {
        symlinkSupported = false;
      } else {
        throw error;
      }
    }
    if (symlinkSupported) {
      await assert.rejects(
        () => fileSystem.writeFile('escape/new-secret.txt', 'nope'),
        /\[SECURITY\]/
      );
      assert.equal(fs.existsSync(path.join(sibling, 'new-secret.txt')), false);
    }

    const outsideFile = path.join(sibling, 'outside-hardlink.txt');
    const hardlinkInside = path.join(workspace, 'hardlink.txt');
    fs.writeFileSync(outsideFile, 'outside-original', 'utf8');
    let hardlinkSupported = true;
    try {
      fs.linkSync(outsideFile, hardlinkInside);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EACCES' || code === 'UNKNOWN') {
        hardlinkSupported = false;
      } else {
        throw error;
      }
    }
    if (hardlinkSupported) {
      await assert.rejects(() => fileSystem.writeFile('hardlink.txt', 'mutated'), /\[SECURITY\]/);
      assert.equal(fs.readFileSync(outsideFile, 'utf8'), 'outside-original');
    }


    // Composer must require explicit user approval before invoking Docker.
    const noApprovalRunner = new ProductionComposerCommandRunner(workspace, 5_000);
    const noApproval = await noApprovalRunner.runCommand('node -e "console.log(\\'must-not-run\\')"');
    assert.equal(noApproval.exitCode, 126);
    assert.match(noApproval.stderr, /User approval is required/);

    let approvalRequest: any;
    const deniedRunner = new ProductionComposerCommandRunner(workspace, 5_000, async request => {
      approvalRequest = request;
      return false;
    });
    const denied = await deniedRunner.runCommand('node -e "console.log(\\'must-not-run\\')"');
    assert.equal(denied.exitCode, 126);
    assert.match(denied.stderr, /No command was executed/);
    assert.equal(approvalRequest.command, 'node -e "console.log(\\'must-not-run\\')"');
    assert.equal(approvalRequest.workspaceRoot, path.resolve(workspace));
    assert.equal(approvalRequest.workingDirectory, path.resolve(workspace));

    const isolatedNoApprovalRunner = new IsolatedShadowWorkspaceCommandRunner(workspace);
    try {
      const isolatedBlocked = await isolatedNoApprovalRunner.runCommand('node -e "console.log(\\'must-not-run\\')"');
      assert.equal(isolatedBlocked.exitCode, 126);
      assert.match(isolatedBlocked.stderr, /User approval is required/);
    } finally {
      isolatedNoApprovalRunner.dispose();
    }

    // The Docker-backed runner's host-side overlay writer must also reject a
    // symlink created by a command inside the disposable container workspace.
    const isolatedRunner = new IsolatedShadowWorkspaceCommandRunner(workspace);
    const runnerEscape = path.join(isolatedRunner.shadowDir, 'escape');
    let runnerSymlinkSupported = true;
    try {
      fs.symlinkSync(sibling, runnerEscape, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EACCES' || code === 'UNKNOWN') {
        runnerSymlinkSupported = false;
      } else {
        throw error;
      }
    }
    if (runnerSymlinkSupported) {
      assert.throws(
        () => isolatedRunner.updateOverlay('escape/host-write.txt', 'must-not-escape'),
        /\[SECURITY\]/
      );
      assert.equal(fs.existsSync(path.join(sibling, 'host-write.txt')), false);
    }
    isolatedRunner.dispose();

    // The production command runner must never fall back to a host shell if Docker is unavailable.
    // Hide Docker from PATH and use an absolute Node executable that would create a marker if a host
    // command were executed. A correct implementation returns an error and leaves the marker absent.
    const missingDockerPath = path.join(tempRoot, 'no-executables');
    fs.mkdirSync(missingDockerPath, { recursive: true });
    const markerPath = path.join(tempRoot, 'host-shell-fallback-ran.txt');
    const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === 'path') || 'PATH';
    const originalPath = process.env[pathKey];
    let dockerUnavailableResult: { exitCode: number; stdout: string; stderr: string } | undefined;
    try {
      process.env[pathKey] = missingDockerPath;
      const productionRunner = new ProductionComposerCommandRunner(workspace, 5_000, async () => true);
      const markerLiteral = JSON.stringify(markerPath);
      const hostCommand = `${JSON.stringify(process.execPath)} -e "require('node:fs').writeFileSync(${markerLiteral}, 'executed')"`;
      dockerUnavailableResult = await productionRunner.runCommand(hostCommand);
    } finally {
      if (originalPath === undefined) {
        delete process.env[pathKey];
      } else {
        process.env[pathKey] = originalPath;
      }
    }
    assert.ok(dockerUnavailableResult && dockerUnavailableResult.exitCode !== 0, 'Docker absence must fail the production runner');
    assert.match(dockerUnavailableResult.stderr, /Docker CLI was not found|not found|ENOENT/i);
    assert.equal(fs.existsSync(markerPath), false, 'production Composer must not execute commands on the host when Docker is unavailable');

    const command = 'node -e "console.log(1 + 1)"';
    const args = buildFloatDockerSandboxArgs({
      workspaceRoot: workspace,
      dependenciesDirectory: dependencies,
      command,
      cwd: '.',
      image: DEFAULT_FLOAT_COMPOSER_SANDBOX_IMAGE,
      containerName: 'float-security-test'
    });

    for (const flag of [
      '--network=none',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '--pids-limit=128',
      '--memory=1g',
      '--memory-swap=1g',
      '--cpus=1',
      '--read-only',
      '--pull=missing'
    ]) {
      assert.ok(args.includes(flag), 'Docker sandbox must include ' + flag);
    }

    assert.ok(args.find(arg => arg.includes('target=/workspace/node_modules,readonly')),
      'node_modules must be mounted read-only');
    assert.ok(args.includes(command), 'model command must be one Docker CLI argument');
    assert.ok(args.includes('sh') && args.includes('-lc'), 'commands are interpreted inside the container');
    assert.equal(args.some(arg => /(?:OPENAI|ANTHROPIC|GEMINI|GOOGLE|AWS|AZURE)_API_KEY/.test(arg)), false,
      'container arguments must not forward common provider secrets');

    assert.throws(() => buildFloatDockerSandboxArgs({
      workspaceRoot: workspace,
      command,
      cwd: '../workspace-root-evil',
      image: DEFAULT_FLOAT_COMPOSER_SANDBOX_IMAGE,
      containerName: 'float-security-test'
    }), /Path traversal|escapes/);

    console.log('Composer sandbox security: path boundary checks and Docker policy assertions passed.');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error('Composer sandbox security test failed:', error);
  process.exit(1);
});
