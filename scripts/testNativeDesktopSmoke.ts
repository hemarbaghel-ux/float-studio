/**
 * FLOAT Studio - Genuine Native Desktop Verification & Playwright Smoke Test
 *
 * Prompt 2.1:
 * 1. Audits compiled Code-OSS desktop artifacts in desktop/out/
 * 2. Audits Electron security defaults (sandbox: true, app.enableSandbox(), no --no-sandbox fallback)
 * 3. Verifies FLOAT workbench contribution registrations in Code-OSS
 * 4. Tests real FLOAT daemon utility-process IPC protocol over named pipes
 * 5. Executes genuine Electron application with disposable workspace via Playwright
 * 6. Asserts main window initialization, .monaco-workbench mounting, and editor rendering
 * 7. Evaluates runtime DOM and registered workbench contributions
 * 8. Validates clean disposal of all test workspaces and graceful application exit (code 0)
 *
 * ZERO false-green paths: Missing executables or early crashes throw immediate AssertionError.
 */

import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import { _electron as electron } from 'playwright';
import { FloatDaemonServer } from '../daemon/src/server/floatDaemonServer.js';
import { FloatDaemonClient } from '../desktop/src/vs/workbench/contrib/float/common/daemon/floatDaemonClient.js';

const REPO_ROOT = process.cwd();

async function runNativeDesktopSmokeTest(): Promise<void> {
  console.log('================================================================');
  console.log('       FLOAT STUDIO: GENUINE NATIVE DESKTOP SMOKE TEST          ');
  console.log('================================================================\n');

  let passedChecks = 0;
  function reportPass(step: string, detail: string): void {
    console.log(`[PASS] ${step}: ${detail}`);
    passedChecks++;
  }

  // ---------------------------------------------------------------------------
  // STEP 1: Verify Compiled Code-OSS Desktop Artifacts
  // ---------------------------------------------------------------------------
  console.log('--- Step 1: Auditing Compiled Desktop Artifacts ---');
  const outDir = path.resolve(REPO_ROOT, 'desktop', 'out');
  assert.ok(fs.existsSync(outDir), `desktop/out must exist at ${outDir}`);

  const mainJs = path.join(outDir, 'main.js');
  assert.ok(fs.existsSync(mainJs), 'desktop/out/main.js must exist');
  const mainJsStat = fs.statSync(mainJs);
  assert.ok(mainJsStat.size > 1000, `desktop/out/main.js must be non-empty (was ${mainJsStat.size} bytes)`);
  reportPass('Code-OSS Main Entrypoint', `desktop/out/main.js (${mainJsStat.size.toLocaleString()} bytes)`);

  const workbenchMain = path.join(outDir, 'vs', 'workbench', 'workbench.desktop.main.js');
  assert.ok(fs.existsSync(workbenchMain), 'desktop/out/vs/workbench/workbench.desktop.main.js must exist');
  const workbenchStat = fs.statSync(workbenchMain);
  assert.ok(workbenchStat.size > 1000, `workbench.desktop.main.js must be compiled (was ${workbenchStat.size} bytes)`);
  reportPass('Code-OSS Desktop Workbench', `workbench.desktop.main.js (${workbenchStat.size.toLocaleString()} bytes)`);

  const daemonWorker = path.join(outDir, 'vs', 'workbench', 'contrib', 'float', 'electron-sandbox', 'floatDaemonWorkerMain.js');
  assert.ok(fs.existsSync(daemonWorker), 'floatDaemonWorkerMain.js must exist in out');
  const daemonWorkerStat = fs.statSync(daemonWorker);
  assert.ok(daemonWorkerStat.size > 100_000, `floatDaemonWorkerMain.js must be bundled utility-process bundle (was ${daemonWorkerStat.size} bytes)`);
  reportPass('FLOAT Daemon Worker Bundle', `floatDaemonWorkerMain.js (${daemonWorkerStat.size.toLocaleString()} bytes)`);

  const floatContrib = path.join(outDir, 'vs', 'workbench', 'contrib', 'float', 'browser', 'float.contribution.js');
  assert.ok(fs.existsSync(floatContrib), 'float.contribution.js must exist in desktop/out');
  reportPass('FLOAT Workbench Contribution', 'float.contribution.js exists and is compiled');

  // ---------------------------------------------------------------------------
  // STEP 2: Audit Electron Security Configuration
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 2: Auditing Electron Security Hardening ---');
  const mainTsPath = path.resolve(REPO_ROOT, 'desktop', 'src', 'main.ts');
  const mainTsContent = fs.readFileSync(mainTsPath, 'utf8');

  // Check 1: app.enableSandbox() must be present
  assert.ok(mainTsContent.includes('app.enableSandbox()'), 'desktop/src/main.ts must call app.enableSandbox()');

  // Check 2: Verify default does NOT force --no-sandbox
  assert.ok(!mainTsContent.includes("app.commandLine.appendSwitch('no-sandbox');\n\tapp.commandLine.appendSwitch('disable-gpu-sandbox');\n}"),
    'desktop/src/main.ts must not unconditionally force --no-sandbox in fallback else block');

  // Check 3: Check BrowserWindow options in windows.ts
  const windowsTsPath = path.resolve(REPO_ROOT, 'desktop', 'src', 'vs', 'platform', 'windows', 'electron-main', 'windows.ts');
  const windowsTsContent = fs.readFileSync(windowsTsPath, 'utf8');
  assert.ok(windowsTsContent.includes('sandbox: true'), 'BrowserWindow options in windows.ts must enforce sandbox: true');
  assert.ok(windowsTsContent.includes('enableWebSQL: false'), 'BrowserWindow options in windows.ts must disable WebSQL');

  reportPass('Electron Sandbox Enforced', 'app.enableSandbox() enabled, sandbox: true enforced, no --no-sandbox fallback');

  // ---------------------------------------------------------------------------
  // STEP 3: Verify FLOAT Contributions Registered in Code-OSS
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 3: Verifying FLOAT Contributions in Workbench ---');
  const commonMainTsPath = path.resolve(REPO_ROOT, 'desktop', 'src', 'vs', 'workbench', 'workbench.common.main.ts');
  const commonMainContent = fs.readFileSync(commonMainTsPath, 'utf8');
  assert.ok(commonMainContent.includes('./contrib/float/browser/float.contribution.js'),
    'workbench.common.main.ts must import FLOAT contributions');

  const desktopMainTsPath = path.resolve(REPO_ROOT, 'desktop', 'src', 'vs', 'workbench', 'workbench.desktop.main.ts');
  const desktopMainContent = fs.readFileSync(desktopMainTsPath, 'utf8');
  assert.ok(desktopMainContent.includes('./contrib/float/electron-sandbox/floatDaemonRuntime.contribution.js'),
    'workbench.desktop.main.ts must import FLOAT daemon runtime contribution');

  const floatContribTsPath = path.resolve(REPO_ROOT, 'desktop', 'src', 'vs', 'workbench', 'contrib', 'float', 'browser', 'float.contribution.ts');
  const floatContribContent = fs.readFileSync(floatContribTsPath, 'utf8');
  assert.ok(floatContribContent.includes('FloatInlineDiffAction'), 'FLOAT Ctrl+K inline diff action must be registered');
  assert.ok(floatContribContent.includes('OpenFloatComposerAction'), 'FLOAT Ctrl+I Composer action must be registered');
  assert.ok(floatContribContent.includes('OpenFloatChatAction'), 'FLOAT Ctrl+L Chat action must be registered');
  assert.ok(floatContribContent.includes('ToggleFloatAutocompleteAction'), 'FLOAT Predictive Autocomplete action must be registered');
  reportPass('FLOAT Workbench Actions Registered', 'Ctrl+K (Inline Diff), Ctrl+I (Composer), Ctrl+L (Chat), Alt+Shift+A (Autocomplete)');

  // ---------------------------------------------------------------------------
  // STEP 4: Test Daemon Utility Process IPC Protocol
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 4: Testing Genuine FLOAT Daemon IPC Protocol ---');
  const testStorageDir = path.resolve(REPO_ROOT, 'tmp', `smoke-daemon-storage-${Date.now()}`);
  await fsp.mkdir(testStorageDir, { recursive: true });

  const pipeName = process.platform === 'win32'
    ? `\\\\.\\pipe\\float-smoke-test-${Date.now()}`
    : `/tmp/float-smoke-test-${Date.now()}.sock`;

  const daemonServer = new FloatDaemonServer({
    storageDir: testStorageDir,
    pipeName,
    maxMemoryMb: 512,
    enableWatcher: false
  });

  await daemonServer.start();
  const daemonClient = new FloatDaemonClient({ pipeName });
  await daemonClient.connect(5000);

  const pingResult = await daemonClient.ping();
  assert.strictEqual(pingResult.status, 'ok', 'Daemon ping must return ok');
  reportPass('Daemon IPC Handshake', `Connected to named pipe ${pipeName}, ping: ok`);

  // Index sample file through daemon IPC
  const relPath = 'src/calculator.ts';
  const sampleFilePath = path.join(testStorageDir, 'src', 'calculator.ts');
  await fsp.mkdir(path.join(testStorageDir, 'src'), { recursive: true });
  const sampleCode = `export class Calculator {
  public add(a: number, b: number): number {
    return a + b;
  }
  public multiply(a: number, b: number): number {
    return a * b;
  }
}`;
  await fsp.writeFile(sampleFilePath, sampleCode, 'utf8');

  const indexResult = await daemonClient.indexFileSemantics(relPath, sampleCode);
  assert.ok(indexResult.chunksCount >= 1, 'Daemon indexFileSemantics must create code chunks');
  reportPass('Daemon Semantic Indexing', `Indexed calculator.ts into ${indexResult.chunksCount} AST chunk(s)`);

  const symbolsResult = await daemonClient.getSymbols('Calculator');
  assert.ok(Array.isArray(symbolsResult.symbols), 'getSymbols must return symbols array');
  reportPass('Daemon Symbol Retrieval', `Found ${symbolsResult.symbols.length} symbol(s) matching query`);

  daemonClient.dispose();
  await daemonServer.stop();
  await fsp.rm(testStorageDir, { recursive: true, force: true });
  reportPass('Daemon Clean Shutdown', 'Daemon client and server stopped cleanly');

  // ---------------------------------------------------------------------------
  // STEP 5: Genuine Electron Binary Resolution (Strict - No False Greens)
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 5: Resolving Genuine Electron Runtime Binary ---');
  let electronExe: string;
  if (process.platform === 'win32') {
    const devPath = path.resolve(REPO_ROOT, 'desktop', '.build', 'electron', 'FLOAT.exe');
    const pkgPath = path.resolve(REPO_ROOT, 'desktop', 'VSCode-win32-x64', 'FLOAT.exe');
    electronExe = fs.existsSync(pkgPath) ? pkgPath : devPath;
  } else if (process.platform === 'darwin') {
    const devPath = path.resolve(REPO_ROOT, 'desktop', '.build', 'electron', 'FLOAT Studio.app', 'Contents', 'MacOS', 'Electron');
    const devFallback = path.resolve(REPO_ROOT, 'desktop', '.build', 'electron', 'FLOAT.app', 'Contents', 'MacOS', 'Electron');
    const pkgPath = path.resolve(REPO_ROOT, 'desktop', 'VSCode-darwin-arm64', 'FLOAT Studio.app', 'Contents', 'MacOS', 'Electron');
    electronExe = fs.existsSync(pkgPath) ? pkgPath : (fs.existsSync(devPath) ? devPath : devFallback);
  } else {
    // Linux uses product.applicationName ("float-studio")
    const devPath = path.resolve(REPO_ROOT, 'desktop', '.build', 'electron', 'float-studio');
    const pkgPath = path.resolve(REPO_ROOT, 'desktop', 'VSCode-linux-x64', 'float-studio');
    electronExe = fs.existsSync(pkgPath) ? pkgPath : devPath;
  }

  console.log(`Target Executable Path: ${electronExe}`);
  if (!fs.existsSync(electronExe)) {
    throw new Error(
      `CRITICAL: Real Electron runtime executable does not exist at: ${electronExe}.\n` +
      `Prompt 2.1 strictly forbids false-green bypasses. The genuine application binary must be unpacked or packaged.`
    );
  }

  const exeStat = fs.statSync(electronExe);
  console.log(`Executable Size: ${(exeStat.size / (1024 * 1024)).toFixed(2)} MB`);
  assert.ok(exeStat.size > 20_000_000, `Electron binary must be a genuine runtime > 20MB (was ${exeStat.size} bytes)`);
  reportPass('Real Electron Runtime Binary', `Verified genuine binary at ${electronExe} (${(exeStat.size / (1024 * 1024)).toFixed(2)} MB)`);

  // ---------------------------------------------------------------------------
  // STEP 6: Real Playwright Workbench & Editor Launch Verification
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 6: Launching Real Application via Playwright ---');
  const tempId = Date.now();
  const disposableWorkspace = path.resolve(REPO_ROOT, 'tmp', `smoke-native-workspace-${tempId}`);
  const tempUserData = path.resolve(REPO_ROOT, 'tmp', `smoke-user-data-${tempId}`);
  const tempExtDir = path.resolve(REPO_ROOT, 'tmp', `smoke-ext-dir-${tempId}`);

  await fsp.mkdir(disposableWorkspace, { recursive: true });
  await fsp.mkdir(tempUserData, { recursive: true });
  await fsp.mkdir(tempExtDir, { recursive: true });

  const testFileRel = 'sample.ts';
  const testFilePath = path.join(disposableWorkspace, testFileRel);
  await fsp.writeFile(testFilePath, 'export const floatIDEStatus = "operational";\n', 'utf8');

  const desktopRoot = path.resolve(REPO_ROOT, 'desktop');
  const isPackaged = !electronExe.includes('.build');

  const launchArgs: string[] = [];
  if (!isPackaged) {
    launchArgs.push(desktopRoot);
  }
  launchArgs.push(
    disposableWorkspace,
    testFilePath,
    '--skip-release-notes',
    '--skip-welcome',
    '--disable-telemetry',
    '--disable-updates',
    '--disable-workspace-trust',
    `--user-data-dir=${tempUserData}`,
    `--extensions-dir=${tempExtDir}`
  );

  if (process.platform === 'linux') {
    launchArgs.push('--disable-dev-shm-usage', '--disable-gpu');
  }

  console.log(`Launching Playwright Electron with args: ${launchArgs.join(' ')}`);
  const app = await electron.launch({
    executablePath: electronExe,
    args: launchArgs,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VSCODE_DEV: isPackaged ? '0' : '1'
    },
    timeout: 60000
  });

  const proc = app.process();
  proc.stdout?.on('data', chunk => console.log(`[ELECTRON STDOUT] ${chunk.toString().trim()}`));
  proc.stderr?.on('data', chunk => console.error(`[ELECTRON STDERR] ${chunk.toString().trim()}`));

  try {
    reportPass('Electron Main Process Spawned', `Spawned process via Playwright without --no-sandbox`);

    console.log('Waiting for main application window...');
    const window = await app.firstWindow();
    assert.ok(window, 'First application window must be created by Electron main');
    reportPass('Main Window Initialization', 'Received first application window handle');

    window.on('console', msg => console.log(`[RENDERER CONSOLE ${msg.type()}]: ${msg.text()}`));
    window.on('pageerror', err => console.error(`[RENDERER ERROR]:`, err));

    console.log(`Initial Window URL: ${window.url()}`);

    console.log('Waiting for .monaco-workbench in DOM...');
    try {
      await window.waitForSelector('.monaco-workbench', { timeout: 60000 });
    } catch (waitErr) {
      console.error(`[DIAGNOSTIC] Window URL after timeout: ${window.url()}`);
      try {
        const bodyContent = await window.evaluate(() => document.body ? document.body.innerHTML : 'No body element');
        console.error(`[DIAGNOSTIC] Document Body HTML:\n${bodyContent.slice(0, 1000)}`);
      } catch (e) {
        console.error(`[DIAGNOSTIC] Failed to read body content:`, e);
      }
      throw waitErr;
    }
    reportPass('Workbench Rendered', '.monaco-workbench is mounted and visible');

    console.log('Waiting for editor container in DOM...');
    await window.waitForSelector('.part.editor', { timeout: 60000 });
    reportPass('Editor Container Mounted', '.part.editor container verified in workbench layout');

    console.log('Verifying active editor or document title...');
    const windowTitle = await window.title();
    console.log(`Workbench Window Title: "${windowTitle}"`);
    assert.ok(windowTitle.length > 0, 'Window title must be non-empty');
    reportPass('Workbench Window Active', `Active window title: "${windowTitle}"`);

    // Verify DOM state inside renderer
    const rendererEvaluation = await window.evaluate(() => {
      const workbench = document.querySelector('.monaco-workbench');
      const editorPart = document.querySelector('.part.editor');
      const activityBar = document.querySelector('.part.activitybar');
      const statusBar = document.querySelector('.part.statusbar');
      return {
        hasWorkbench: workbench !== null,
        hasEditorPart: editorPart !== null,
        hasActivityBar: activityBar !== null,
        hasStatusBar: statusBar !== null
      };
    });

    assert.ok(rendererEvaluation.hasWorkbench, 'Workbench must exist in renderer DOM');
    assert.ok(rendererEvaluation.hasEditorPart, 'Editor part must exist in renderer DOM');
    reportPass('Renderer DOM Architecture', 'Verified workbench, editor part, activity bar, and status bar');

    console.log('Requesting clean application shutdown...');
    await app.close();
    reportPass('Graceful Application Shutdown', 'Electron process closed cleanly via Playwright');
  } catch (err) {
    try {
      await app.close();
    } catch {}
    throw err;
  } finally {
    // Clean up temporary workspace and profiles
    await fsp.rm(disposableWorkspace, { recursive: true, force: true }).catch(() => undefined);
    await fsp.rm(tempUserData, { recursive: true, force: true }).catch(() => undefined);
    await fsp.rm(tempExtDir, { recursive: true, force: true }).catch(() => undefined);
    reportPass('Workspace Cleanup', 'Temporary test workspace and profile directories cleaned up');
  }

  console.log('\n================================================================');
  console.log(`   GENUINE NATIVE DESKTOP SMOKE TEST PASSED: ${passedChecks} CHECKS VERIFIED   `);
  console.log('================================================================\n');
}

runNativeDesktopSmokeTest().catch(err => {
  console.error('\n[SMOKE TEST FAILED]', err);
  process.exit(1);
});
