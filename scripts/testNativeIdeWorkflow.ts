/**
 * FLOAT Studio — Stage 1 Native IDE Workflow Acceptance
 *
 * Exercises the real Code-OSS Electron workbench, not a browser mock:
 * - multi-root workspace loading
 * - opening files from separate workspace roots
 * - editing and saving a real file to disk
 * - split editor groups
 * - Explorer, Search, Extensions, Problems, Settings and Terminal surfaces
 *
 * Run from the repository root after the native desktop has been compiled
 * and the matching Electron runtime has been unpacked.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const REPO_ROOT = process.cwd();
const DESKTOP_ROOT = path.join(REPO_ROOT, 'desktop');
const MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control';
const TIMEOUT_MS = 30_000;

function resolveElectronExecutable(): string {
  const candidates = process.platform === 'win32'
    ? [
        path.join(DESKTOP_ROOT, '.build', 'electron', 'FLOAT.exe'),
        path.join(DESKTOP_ROOT, 'VSCode-win32-x64', 'FLOAT.exe')
      ]
    : process.platform === 'darwin'
      ? [
          path.join(DESKTOP_ROOT, '.build', 'electron', 'FLOAT Studio.app', 'Contents', 'MacOS', 'Electron'),
          path.join(DESKTOP_ROOT, '.build', 'electron', 'FLOAT.app', 'Contents', 'MacOS', 'Electron'),
          path.join(DESKTOP_ROOT, 'VSCode-darwin-arm64', 'FLOAT Studio.app', 'Contents', 'MacOS', 'Electron')
        ]
      : [
          path.join(DESKTOP_ROOT, '.build', 'electron', 'float-studio'),
          path.join(DESKTOP_ROOT, 'VSCode-linux-x64', 'float-studio')
        ];

  const executable = candidates.find(candidate => fs.existsSync(candidate));
  assert.ok(
    executable,
    'FLOAT Electron executable is missing. Checked: ' + candidates.join(', ')
  );
  return executable;
}

async function waitForFileContains(filePath: string, expected: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastContent = '';

  while (Date.now() < deadline) {
    try {
      lastContent = await fsp.readFile(filePath, 'utf8');
      if (lastContent.includes(expected)) {
        return;
      }
    } catch {
      // The editor may not have flushed the file yet. Keep polling until timeout.
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  throw new Error(
    'Timed out waiting for saved file content in ' + filePath +
    '. Last content length: ' + lastContent.length
  );
}

async function waitForEditorText(page: any, expected: string): Promise<void> {
  const editorLines = page.locator('.monaco-editor .view-lines').first();
  await editorLines.waitFor({ state: 'visible', timeout: TIMEOUT_MS });

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const text = await editorLines.innerText().catch(() => '');
    if (text.includes(expected)) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  throw new Error('Expected editor text was not rendered: ' + expected);
}

async function openCommandPaletteCommand(page: any, command: string): Promise<void> {
  await page.keyboard.press(MODIFIER + '+Shift+P');
  const input = page.locator('.quick-input-widget input').first();
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill(command);
  await page.keyboard.press('Enter');
}

async function openQuickOpenFile(page: any, fileName: string): Promise<void> {
  await page.keyboard.press(MODIFIER + '+P');
  const input = page.locator('.quick-input-widget input').first();
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill(fileName);
  await page.keyboard.press('Enter');
}

async function assertVisible(page: any, selector: string, description: string): Promise<void> {
  await page.locator(selector).first().waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  console.log('[PASS] ' + description);
}

async function run(): Promise<void> {
  console.log('=== FLOAT Stage 1: Native IDE Workflow Acceptance ===');

  const executable = resolveElectronExecutable();
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'float-stage1-native-'));
  const appRoot = path.join(tempRoot, 'workspace-app');
  const sharedRoot = path.join(tempRoot, 'workspace-shared');
  const workspaceFile = path.join(tempRoot, 'float-stage1.code-workspace');
  const mainFile = path.join(appRoot, 'src', 'main.ts');
  const sharedFile = path.join(sharedRoot, 'src', 'models.ts');
  const userDataDir = path.join(tempRoot, 'user-data');
  const extensionsDir = path.join(tempRoot, 'extensions');

  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  let passed = 0;

  const pass = (message: string): void => {
    passed++;
    console.log('[PASS] ' + message);
  };

  try {
    await Promise.all([
      fsp.mkdir(path.dirname(mainFile), { recursive: true }),
      fsp.mkdir(path.dirname(sharedFile), { recursive: true }),
      fsp.mkdir(userDataDir, { recursive: true }),
      fsp.mkdir(extensionsDir, { recursive: true })
    ]);

    await fsp.writeFile(
      mainFile,
      'export const FLOAT_STAGE1_MAIN_FILE = "workspace-ready";\n',
      'utf8'
    );
    await fsp.writeFile(
      sharedFile,
      'export const FLOAT_STAGE1_SECOND_ROOT = "multi-root-ready";\n',
      'utf8'
    );

    await fsp.writeFile(
      workspaceFile,
      JSON.stringify({
        folders: [
          { name: 'float-app', path: appRoot },
          { name: 'float-shared', path: sharedRoot }
        ],
        settings: {
          'workbench.startupEditor': 'none',
          'files.autoSave': 'off',
          'workbench.tips.enabled': false
        }
      }, null, 2),
      'utf8'
    );

    const isPackaged = !executable.includes(path.join('desktop', '.build'));
    const args: string[] = [];
    if (!isPackaged) {
      args.push(DESKTOP_ROOT);
    }
    args.push(
      workspaceFile,
      mainFile,
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-telemetry',
      '--disable-updates',
      '--disable-workspace-trust',
      '--new-window',
      '--user-data-dir=' + userDataDir,
      '--extensions-dir=' + extensionsDir
    );

    if (process.platform === 'linux') {
      args.push('--disable-dev-shm-usage', '--disable-gpu');
    }

    app = await electron.launch({
      executablePath: executable,
      args,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        VSCODE_DEV: isPackaged ? '0' : '1',
        ELECTRON_ENABLE_LOGGING: '1'
      },
      timeout: 60_000
    });

    const page = await app.firstWindow();
    page.on('pageerror', (error: Error) => {
      console.error('[RENDERER ERROR] ' + error.message);
    });

    await page.locator('.monaco-workbench').waitFor({ state: 'visible', timeout: 60_000 });
    await waitForEditorText(page, 'FLOAT_STAGE1_MAIN_FILE');
    pass('Native Code-OSS workbench opened the workspace and rendered a real source file');

    // Verify a real edit/save round-trip against the temporary filesystem.
    const saveMarker = '// FLOAT_STAGE1_SAVE_ROUNDTRIP';
    await page.locator('.monaco-editor').first().click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText(saveMarker);
    // Invoke the workbench command explicitly instead of relying on host shortcut routing.
    // This makes the test assert the actual Save command and on-disk write, not just editor input.
    await openCommandPaletteCommand(page, 'File: Save');
    await waitForFileContains(mainFile, saveMarker, 15_000);
    pass('Editor changes were saved to the actual workspace file');

    // Open a file from the second workspace root through native Quick Open.
    await openQuickOpenFile(page, 'models.ts');
    await waitForEditorText(page, 'FLOAT_STAGE1_SECOND_ROOT');
    pass('Quick Open resolved and opened a file from the second workspace root');

    // Verify the editor can create and render a second editor group.
    await openQuickOpenFile(page, 'main.ts');
    await waitForEditorText(page, 'FLOAT_STAGE1_MAIN_FILE');
    await page.keyboard.press(MODIFIER + '+\\');
    const editorGroups = page.locator('.editor-group-container');
    await page.waitForFunction(
      () => document.querySelectorAll('.editor-group-container').length >= 2,
      undefined,
      { timeout: TIMEOUT_MS }
    );
    assert.ok(await editorGroups.count() >= 2, 'Split editor must create at least two editor groups');
    pass('Split editor created multiple native editor groups');

    // Exercise built-in workbench surfaces supplied by the pinned Code-OSS workbench.
    await page.keyboard.press(MODIFIER + '+Shift+E');
    await assertVisible(page, '.explorer-viewlet', 'Native Explorer view opened');
    const explorerText = await page.locator('.explorer-viewlet').innerText();
    assert.ok(explorerText.includes('float-app'), 'Explorer must show the first workspace folder');
    assert.ok(explorerText.includes('float-shared'), 'Explorer must show the second workspace folder');
    pass('Explorer displayed both folders in the multi-root workspace');

    await page.keyboard.press(MODIFIER + '+Shift+F');
    await assertVisible(page, '.search-view', 'Native Search view opened');

    await page.keyboard.press(MODIFIER + '+Shift+X');
    await assertVisible(page, '.extensions-viewlet', 'Native Extensions view opened');

    await page.keyboard.press(MODIFIER + '+Shift+M');
    await assertVisible(page, '.markers-panel', 'Native Problems panel opened');

    await openCommandPaletteCommand(page, 'Preferences: Open Settings (UI)');
    await assertVisible(page, '.settings-editor', 'Native Settings editor opened');

    await openCommandPaletteCommand(page, 'Terminal: Create New Terminal');
    await assertVisible(page, '.integrated-terminal', 'Native integrated terminal opened');
    await assertVisible(page, '.xterm-screen', 'Terminal emulator rendered');

    console.log('=== FLOAT Stage 1 PASSED: ' + passed + ' runtime assertions ===');
  } catch (error) {
    console.error('[STAGE 1 FAILED]', error);
    if (app) {
      try {
        const page = await app.firstWindow();
        const screenshotPath = path.join(REPO_ROOT, 'tmp', 'stage1-failure-' + process.platform + '.png');
        await fsp.mkdir(path.dirname(screenshotPath), { recursive: true });
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.error('[DIAGNOSTIC] Screenshot: ' + screenshotPath);
        console.error('[DIAGNOSTIC] Workbench text: ' + (await page.locator('.monaco-workbench').innerText().catch(() => 'unavailable')));
      } catch {
        // Preserve the original failure if diagnostics cannot be captured.
      }
    }
    throw error;
  } finally {
    if (app) {
      await app.close().catch(() => undefined);
    }
    await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

run().catch(error => {
  console.error('[FATAL] Native IDE workflow acceptance failed:', error);
  process.exitCode = 1;
});
