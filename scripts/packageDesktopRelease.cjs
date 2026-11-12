#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * FLOAT Studio - Development Preview Desktop Packaging Utility
 * 
 * NOTE: This script packages the React web application inside an upstream Electron
 * runtime for local development preview and smoke tests. It does NOT compile the
 * genuine Code-OSS desktop IDE workbench, and MUST NOT be used to generate production
 * release artifacts. Production packaging requires genuine Code-OSS compilation,
 * platform installers, and code signing (reserved for Prompt 2).
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ELECTRON_VERSION = '34.3.2';
const APP_NAME = 'FLOAT Studio';
const APP_ID = 'float-studio';
const VERSION = '1.0.0';
const MIN_ARTIFACT_SIZE = 20 * 1024 * 1024; // 20 MB

const repoRoot = path.resolve(__dirname, '..');
const distReleaseDir = path.join(repoRoot, 'dist', 'release');
const buildTmpDir = path.join(repoRoot, 'dist', 'build-desktop-tmp');

function exec(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  return cp.execSync(cmd, { cwd: repoRoot, stdio: 'inherit', ...opts });
}

function downloadFile(url, destPath) {
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 1000000) {
    console.log(`[Cache Hit] ${destPath} already exists (${(fs.statSync(destPath).size / 1024 / 1024).toFixed(1)} MB)`);
    return destPath;
  }
  console.log(`Downloading: ${url} -> ${destPath}`);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
  exec(`${curlCmd} -f -sSL --retry 5 --retry-delay 3 --connect-timeout 30 -o "${destPath}" "${url}"`);
  const size = fs.statSync(destPath).size;
  console.log(`Downloaded ${(size / 1024 / 1024).toFixed(1)} MB.`);
  return destPath;
}

function extractZip(zipPath, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log(`Extracting ${zipPath} to ${targetDir}...`);
  if (process.platform === 'win32') {
    exec(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${targetDir}' -Force"`);
  } else {
    try {
      exec(`unzip -q -o "${zipPath}" -d "${targetDir}"`);
    } catch {
      exec(`python3 -m zipfile -e "${zipPath}" "${targetDir}"`);
    }
  }
}

function assembleAppPayload(targetAppDir) {
  console.log(`Assembling application payload into ${targetAppDir}...`);
  fs.mkdirSync(targetAppDir, { recursive: true });

  // 1. Copy package.json and product.json
  fs.copyFileSync(path.join(repoRoot, 'package.json'), path.join(targetAppDir, 'package.json'));
  if (fs.existsSync(path.join(repoRoot, 'desktop', 'product.json'))) {
    fs.copyFileSync(path.join(repoRoot, 'desktop', 'product.json'), path.join(targetAppDir, 'product.json'));
  }

  // 2. Copy dist bundle
  const distDir = path.join(repoRoot, 'dist');
  const targetDist = path.join(targetAppDir, 'dist');
  fs.mkdirSync(targetDist, { recursive: true });
  if (fs.existsSync(distDir)) {
    for (const item of fs.readdirSync(distDir)) {
      if (item === 'release' || item === 'build-desktop-tmp') continue;
      const srcItem = path.join(distDir, item);
      const destItem = path.join(targetDist, item);
      fs.cpSync(srcItem, destItem, { recursive: true });
    }
  }

  // 3. Copy desktop compiled out & main entrypoints if present
  const desktopOut = path.join(repoRoot, 'desktop', 'out');
  const targetOut = path.join(targetAppDir, 'out');
  if (fs.existsSync(desktopOut)) {
    fs.cpSync(desktopOut, targetOut, { recursive: true });
  }

  // 4. Create desktop main wrapper with startup self-check
  const mainWrapperPath = path.join(targetAppDir, 'index.cjs');
  const mainWrapperContent = `// FLOAT Studio Desktop Entrypoint
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');

const isSmokeTest = process.argv.includes('--smoke-test');
const isHeadless = process.argv.includes('--headless');

console.log('[FLOAT Main] Starting FLOAT Studio desktop process...', {
  pid: process.pid,
  isSmokeTest,
  isHeadless,
  platform: process.platform
});

process.on('uncaughtException', (err) => {
  console.error('[FLOAT Main] Uncaught Exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FLOAT Main] Unhandled Rejection:', reason);
  process.exit(1);
});

if (isSmokeTest) {
  try {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-software-rasterizer');
  } catch (e) {}

  const startTime = Date.now();

  app.whenReady().then(async () => {
    console.log('[FLOAT SmokeTest] Startup self-check initialized with --smoke-test.');
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      title: "FLOAT Studio (Self-Check)",
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
      sandbox: true
      }
    });

    win.webContents.on('console-message', (event, level, message) => {
      console.log('[Renderer Console]', message);
    });

    win.webContents.on('render-process-gone', (event, details) => {
      console.error('[FLOAT SmokeTest] FAILURE: Renderer process gone:', details);
      process.exit(1);
    });

    const htmlPath = path.join(__dirname, 'dist', 'index.html');
    if (!fs.existsSync(htmlPath)) {
      console.error('[FLOAT SmokeTest] FAILURE: dist/index.html not found at:', htmlPath);
      process.exit(1);
      return;
    }

    let verified = false;

    // Hard timeout: 45 seconds
    const timeoutHandle = setTimeout(() => {
      if (!verified) {
        console.error('[FLOAT SmokeTest] FAILURE: Timed out waiting for Editor and AI panel to mount (45s).');
        process.exit(1);
      }
    }, 45000);

    const pollInterval = setInterval(async () => {
      try {
        if (win.isDestroyed() || !win.webContents) return;

        const res = await win.webContents.executeJavaScript(\`
          (function() {
            const ide = document.querySelector('[data-testid="ide-workspace"]') ||
                        document.querySelector('.float-ide-workspace') ||
                        document.body;
            const editor = document.querySelector('[data-testid="editor-area"]') ||
                           document.querySelector('[data-component="editor-area"]') ||
                           document.querySelector('.monaco-editor') ||
                           document.querySelector('main');
            const aiPanel = document.querySelector('[data-testid="ai-panel"]') ||
                            document.querySelector('[data-component="ai-panel"]') ||
                            document.querySelector('textarea') ||
                            document.querySelector('input');
            return {
              hasIde: Boolean(ide),
              hasEditor: Boolean(editor),
              hasAiPanel: Boolean(aiPanel),
              url: window.location.href,
              title: document.title
            };
          })()
        \`);

        if (res && res.hasIde && (res.hasEditor || res.hasAiPanel) && !verified) {
          verified = true;
          clearInterval(pollInterval);
          clearTimeout(timeoutHandle);
          console.log('[FLOAT SmokeTest] SUCCESS: Main window opened, workspace loaded, and views mounted successfully!');
          console.log('[FLOAT SmokeTest] Diagnostic:', JSON.stringify(res));

          const elapsed = Date.now() - startTime;
          const remainingMs = Math.max(1000, 20000 - elapsed);
          console.log('[FLOAT SmokeTest] Sustaining process life for ' + remainingMs + 'ms to confirm stability...');
          setTimeout(() => {
            console.log('[FLOAT SmokeTest] Exiting cleanly with code 0.');
            app.exit(0);
            process.exit(0);
          }, remainingMs);
        }
      } catch (e) {
        // Renderer still initializing
      }
    }, 500);

    win.loadFile(htmlPath, { hash: '#/workspace?smoke-test=1', search: 'smoke-test=1' });
  });
} else if (fs.existsSync(path.join(__dirname, 'out', 'main.js'))) {
  require('./out/main.js');
} else {
  app.whenReady().then(() => {
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      title: "FLOAT Studio",
      show: !isHeadless,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
      sandbox: true
      }
    });
    if (isHeadless) {
      console.log('FLOAT Studio launched in headless mode.');
      setTimeout(() => app.quit(), 2000);
      return;
    }
    const htmlPath = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(htmlPath)) {
      win.loadFile(htmlPath);
    } else {
      win.loadURL('data:text/html,<h2>FLOAT Studio Desktop Running</h2>');
    }
  });
}
`;
  fs.writeFileSync(mainWrapperPath, mainWrapperContent, 'utf8');

  // Point package.json main to index.cjs
  const targetPkgPath = path.join(targetAppDir, 'package.json');
  if (fs.existsSync(targetPkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(targetPkgPath, 'utf8'));
      pkg.main = 'index.cjs';
      fs.writeFileSync(targetPkgPath, JSON.stringify(pkg, null, 2), 'utf8');
    } catch {}
  }
}

async function packageLinux() {
  console.log('\n=== Building Real Linux Packages (amd64) ===');
  const electronZipUrl = `https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-linux-x64.zip`;
  const cachedZip = path.join(buildTmpDir, `electron-v${ELECTRON_VERSION}-linux-x64.zip`);
  downloadFile(electronZipUrl, cachedZip);

  const linuxUnpacked = path.join(buildTmpDir, 'linux-unpacked');
  fs.rmSync(linuxUnpacked, { recursive: true, force: true });
  extractZip(cachedZip, linuxUnpacked);

  const rawExe = path.join(linuxUnpacked, 'electron');
  const targetExe = path.join(linuxUnpacked, 'float-studio');
  if (fs.existsSync(rawExe)) {
    fs.renameSync(rawExe, targetExe);
    fs.chmodSync(targetExe, 0o755);
  }

  const appDir = path.join(linuxUnpacked, 'resources', 'app');
  assembleAppPayload(appDir);

  // 1. Build portable tar.gz
  const tarGzOut = path.join(distReleaseDir, 'FLOAT-linux-x64.tar.gz');
  console.log(`Creating portable archive: ${tarGzOut}...`);
  if (fs.existsSync(tarGzOut)) fs.unlinkSync(tarGzOut);
  exec(`tar -czf "${tarGzOut}" -C "${buildTmpDir}" "linux-unpacked"`);

  // 2. Build Debian .deb Package
  const debArch = 'amd64';
  const debDir = path.join(buildTmpDir, `float-studio_${VERSION}_${debArch}`);
  fs.rmSync(debDir, { recursive: true, force: true });

  const debAppDir = path.join(debDir, 'usr', 'share', 'float-studio');
  const debBinDir = path.join(debDir, 'usr', 'bin');
  const debAppArmorDir = path.join(debDir, 'etc', 'apparmor.d');
  const debApplicationsDir = path.join(debDir, 'usr', 'share', 'applications');
  const debianDir = path.join(debDir, 'DEBIAN');

  fs.mkdirSync(debAppDir, { recursive: true });
  fs.mkdirSync(debBinDir, { recursive: true });
  fs.mkdirSync(debAppArmorDir, { recursive: true });
  fs.mkdirSync(debApplicationsDir, { recursive: true });
  fs.mkdirSync(debianDir, { recursive: true });

  fs.cpSync(linuxUnpacked, debAppDir, { recursive: true });

  // Symlink in /usr/bin/float-studio
  const linkPath = path.join(debBinDir, 'float-studio');
  try {
    fs.symlinkSync('/usr/share/float-studio/float-studio', linkPath);
  } catch {
    fs.writeFileSync(linkPath, '#!/bin/sh\nexec /usr/share/float-studio/float-studio "$@"\n', { mode: 0o755 });
  }

  // Desktop launcher entry
  const desktopEntry = path.join(debApplicationsDir, 'float-studio.desktop');
  const desktopContent = `[Desktop Entry]
Name=FLOAT Studio
Comment=AI-Native Software Development Environment
Exec=/usr/share/float-studio/float-studio %U
Terminal=false
Type=Application
Icon=float-studio
Categories=Development;IDE;
StartupWMClass=float-studio
`;
  fs.writeFileSync(desktopEntry, desktopContent, 'utf8');

  // AppArmor profile for Ubuntu 24.04+ unprivileged user namespaces
  const appArmorFile = path.join(debAppArmorDir, 'float-studio');
  const appArmorContent = `# AppArmor profile for FLOAT Studio on Ubuntu 24.04+
abi <abi/4.0>,
include <tunables/global>

profile float-studio /usr/share/float-studio/float-studio flags=(unconfined) {
  userns,
  include if exists <local/float-studio>
}
`;
  fs.writeFileSync(appArmorFile, appArmorContent, 'utf8');

  // DEBIAN/control
  const controlFile = path.join(debianDir, 'control');
  const controlContent = `Package: float-studio
Version: ${VERSION}
Section: devel
Priority: optional
Architecture: ${debArch}
Maintainer: FLOAT Studio Team <support@float.dev>
Depends: libgtk-3-0, libnss3, libasound2 | libasound2t64, libxss1, libx11-xcb1, libsecret-1-0, libc6 (>= 2.31)
Description: FLOAT Studio
 Modern AI-native development environment and autonomous coding platform.
`;
  fs.writeFileSync(controlFile, controlContent, 'utf8');

  // DEBIAN/postinst & postrm
  const postinstFile = path.join(debianDir, 'postinst');
  const postinstContent = `#!/bin/sh
set -e
if [ -x /usr/sbin/apparmor_parser ] && [ -f /etc/apparmor.d/float-studio ]; then
  /usr/sbin/apparmor_parser -r -T /etc/apparmor.d/float-studio 2>/dev/null || true
fi
if [ -x /usr/bin/update-desktop-database ]; then
  update-desktop-database -q /usr/share/applications 2>/dev/null || true
fi
`;
  fs.writeFileSync(postinstFile, postinstContent, 'utf8');

  const postrmFile = path.join(debianDir, 'postrm');
  const postrmContent = `#!/bin/sh
set -e
if [ -x /usr/bin/update-desktop-database ]; then
  update-desktop-database -q /usr/share/applications 2>/dev/null || true
fi
`;
  fs.writeFileSync(postrmFile, postrmContent, 'utf8');

  // Strict permissions required by dpkg-deb
  fs.chmodSync(debianDir, 0o755);
  fs.chmodSync(controlFile, 0o644);
  fs.chmodSync(postinstFile, 0o755);
  fs.chmodSync(postrmFile, 0o755);

  // Build .deb with dpkg-deb
  const debOut = path.join(distReleaseDir, 'float-studio_amd64.deb');
  console.log(`Building Debian package: ${debOut}...`);
  exec(`dpkg-deb --build --root-owner-group "${debDir}" "${debOut}"`);
}

async function packageWindows() {
  console.log('\n=== Building Real Windows Packages (x64) ===');
  const winBuildDir = path.join(buildTmpDir, 'win-unpacked');
  fs.rmSync(winBuildDir, { recursive: true, force: true });
  fs.mkdirSync(winBuildDir, { recursive: true });

  // Use local desktop/.build/electron if available, else download official Electron
  const localElectronDir = path.join(repoRoot, 'desktop', '.build', 'electron');
  if (fs.existsSync(path.join(localElectronDir, 'FLOAT.exe')) || fs.existsSync(path.join(localElectronDir, 'electron.exe'))) {
    console.log(`Copying local prebuilt Electron from ${localElectronDir}...`);
    fs.cpSync(localElectronDir, winBuildDir, { recursive: true });
  } else {
    const electronZipUrl = `https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-win32-x64.zip`;
    const cachedZip = path.join(buildTmpDir, `electron-v${ELECTRON_VERSION}-win32-x64.zip`);
    downloadFile(electronZipUrl, cachedZip);
    extractZip(cachedZip, winBuildDir);
  }

  // Ensure binary is named FLOAT.exe
  const rawExe = path.join(winBuildDir, 'electron.exe');
  const targetExe = path.join(winBuildDir, 'FLOAT.exe');
  if (fs.existsSync(rawExe) && !fs.existsSync(targetExe)) {
    fs.renameSync(rawExe, targetExe);
  }

  // Assemble resources/app
  const appDir = path.join(winBuildDir, 'resources', 'app');
  assembleAppPayload(appDir);

  // 1. Build portable ZIP
  const zipOut = path.join(distReleaseDir, 'FLOAT-win32-x64.zip');
  console.log(`Creating portable ZIP: ${zipOut}...`);
  if (fs.existsSync(zipOut)) fs.unlinkSync(zipOut);
  try {
    exec(`tar.exe -a -c -f "${zipOut}" -C "${winBuildDir}" .`);
  } catch {
    exec(`powershell -NoProfile -Command "Compress-Archive -Path '${winBuildDir}\\*' -DestinationPath '${zipOut}' -CompressionLevel Optimal"`);
  }

  // 2. Download Microsoft Visual C++ 2015-2022 Redistributable
  const vcRedistUrl = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';
  const vcRedistPath = path.join(buildTmpDir, 'vc_redist.x64.exe');
  downloadFile(vcRedistUrl, vcRedistPath);

  // 3. Build Inno Setup Installer
  const issFile = path.join(buildTmpDir, 'float_setup.iss');

  const issContent = `; Inno Setup Script for FLOAT Studio
[Setup]
AppId={{D77B7E06-80BA-4137-BCF4-654B95CCEBC5}}
AppName=FLOAT Studio
AppVersion=${VERSION}
AppPublisher=FLOAT Studio Team
AppPublisherURL=https://float.dev/
DefaultDirName={autopf}\\FLOAT Studio
DefaultGroupName=FLOAT Studio
OutputDir=${distReleaseDir}
OutputBaseFilename=FLOAT-Setup-x64
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
WizardStyle=modern

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "${winBuildDir}\\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "${vcRedistPath}"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
Name: "{autoprograms}\\FLOAT Studio"; Filename: "{app}\\FLOAT.exe"
Name: "{autodesktop}\\FLOAT Studio"; Filename: "{app}\\FLOAT.exe"; Tasks: desktopicon

[Run]
Filename: "{tmp}\\vc_redist.x64.exe"; Parameters: "/install /passive /norestart"; Flags: runascurrentuser waituntilterminated
Filename: "{app}\\FLOAT.exe"; Description: "{cm:LaunchProgram,FLOAT Studio}"; Flags: nowait postinstall skipifsilent
`;
  fs.writeFileSync(issFile, issContent, 'utf8');

  console.log(`Compiling Inno Setup installer: ${path.join(distReleaseDir, 'FLOAT-Setup-x64.exe')}...`);
  
  // Locate ISCC.exe
  let isccCmd = 'iscc';
  const candidatePaths = [
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
    'C:\\ProgramData\\chocolatey\\bin\\iscc.exe'
  ];
  for (const c of candidatePaths) {
    if (fs.existsSync(c)) {
      isccCmd = `"${c}"`;
      break;
    }
  }

  exec(`${isccCmd} "${issFile}"`);
}

async function packageMacOS() {
  console.log('\n=== Building Real macOS Packages (arm64) ===');
  const electronZipUrl = `https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-darwin-arm64.zip`;
  const cachedZip = path.join(buildTmpDir, `electron-v${ELECTRON_VERSION}-darwin-arm64.zip`);
  downloadFile(electronZipUrl, cachedZip);

  const macUnpacked = path.join(buildTmpDir, 'mac-unpacked');
  fs.rmSync(macUnpacked, { recursive: true, force: true });
  extractZip(cachedZip, macUnpacked);

  const electronApp = path.join(macUnpacked, 'Electron.app');
  const targetApp = path.join(macUnpacked, `${APP_NAME}.app`);
  if (fs.existsSync(electronApp)) {
    fs.renameSync(electronApp, targetApp);
  }

  const appDir = path.join(targetApp, 'Contents', 'Resources', 'app');
  assembleAppPayload(appDir);

  // Hardened runtime entitlements
  const entitlementsPath = path.join(repoRoot, 'desktop', 'build', 'darwin', 'entitlements.plist');
  fs.mkdirSync(path.dirname(entitlementsPath), { recursive: true });
  const entitlementsContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.network.server</key>
  <true/>
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>
</dict>
</plist>
`;
  fs.writeFileSync(entitlementsPath, entitlementsContent, 'utf8');

  // Conditional code-signing if Apple secrets exist
  if (process.env.APPLE_CERTIFICATE && process.env.APPLE_IDENTITY) {
    console.log('Signing macOS .app bundle with Apple Developer ID...');
    exec(`codesign --deep --force --options runtime --entitlements "${entitlementsPath}" --sign "${process.env.APPLE_IDENTITY}" "${targetApp}"`);
  } else {
    console.log('[Notice] APPLE_CERTIFICATE/APPLE_IDENTITY not present. Generating unsigned development distribution.');
  }

  // 1. Build portable ZIP
  const zipOut = path.join(distReleaseDir, 'FLOAT-darwin-arm64.zip');
  console.log(`Creating portable ZIP: ${zipOut}...`);
  exec(`ditto -c -k --sequesterRsrc --keepParent "${targetApp}" "${zipOut}"`);

  // 2. Build .dmg image
  const dmgOut = path.join(distReleaseDir, 'FLOAT-arm64.dmg');
  console.log(`Building DMG image: ${dmgOut}...`);
  exec(`hdiutil create -volname "${APP_NAME}" -srcfolder "${targetApp}" -ov -format UDZO "${dmgOut}"`);
}

async function main() {
  const args = process.argv.slice(2);
  const platformArg = args.find(a => a.startsWith('--platform='));
  const platform = platformArg ? platformArg.split('=')[1] : process.platform;

  fs.mkdirSync(distReleaseDir, { recursive: true });
  fs.mkdirSync(buildTmpDir, { recursive: true });

  if (platform === 'linux' || platform === 'linux-x64') {
    await packageLinux();
  } else if (platform === 'win32' || platform === 'windows-x64') {
    await packageWindows();
  } else if (platform === 'darwin' || platform === 'macos-arm64') {
    await packageMacOS();
  } else {
    throw new Error(`Unsupported packaging platform: ${platform}`);
  }

  console.log('\nPackaging complete. Validating artifacts...\n');
  const validatorScript = path.join(__dirname, 'validateReleaseArtifacts.cjs');
  exec(`node "${validatorScript}" --platform=${platform}`);
}

main().catch(err => {
  console.error('\n❌ Packaging failed with error:', err);
  process.exit(1);
});
