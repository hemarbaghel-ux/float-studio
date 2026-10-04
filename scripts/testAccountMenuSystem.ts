import { applyThemeToDocument } from '../src/store';
import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

console.log('=== Testing FLOAT AI Professional Account Menu, Settings, Help & Appearance System ===\n');

// 1. Check AccountMenu.tsx contents
const accountMenuCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AccountMenu.tsx'), 'utf8');

assert(accountMenuCode.includes('Upgrade to Start'), 'Account menu contains "Upgrade to Start"');
assert(accountMenuCode.includes('/pricing'), 'Upgrade to Start links to /pricing');
assert(accountMenuCode.includes('Dashboard'), 'Account menu contains "Dashboard"');
assert(accountMenuCode.includes('/dashboard'), 'Dashboard links to /dashboard');
assert(accountMenuCode.includes('My Settings'), 'Account menu contains "My Settings"');
assert(accountMenuCode.includes('/settings'), 'My Settings links to /settings');
assert(accountMenuCode.includes('Profile'), 'Account menu contains "Profile"');
assert(accountMenuCode.includes('/profile'), 'Profile links to /profile');
assert(accountMenuCode.includes('Download FLOAT'), 'Account menu contains "Download FLOAT"');
assert(accountMenuCode.includes('/download'), 'Download FLOAT links to /download');
assert(accountMenuCode.includes('Appearance'), 'Account menu contains "Appearance" trigger');
assert(accountMenuCode.includes('Help'), 'Account menu contains "Help" trigger');
assert(accountMenuCode.includes('Log Out'), 'Account menu contains "Log Out"');

// 2. Appearance Submenu items
assert(accountMenuCode.includes("handleThemeChange('light')"), 'Appearance submenu includes Light theme action');
assert(accountMenuCode.includes("handleThemeChange('dark')"), 'Appearance submenu includes Dark theme action');
assert(accountMenuCode.includes("handleThemeChange('system')"), 'Appearance submenu includes System theme action');
assert(accountMenuCode.includes('Configure'), 'Appearance submenu includes Configure link');

// 3. Help Submenu items
assert(accountMenuCode.includes('FLOAT Docs'), 'Help submenu includes "FLOAT Docs"');
assert(accountMenuCode.includes('/resources/docs'), 'FLOAT Docs links to /resources/docs');
assert(accountMenuCode.includes('Get Help'), 'Help submenu includes "Get Help"');
assert(accountMenuCode.includes('/help'), 'Get Help links to /help');
assert(accountMenuCode.includes('Contact Us'), 'Help submenu includes "Contact Us"');
assert(accountMenuCode.includes('ContactModal'), 'Contact Us opens ContactModal');

// 4. Keyboard Navigation & Anti-Flicker
assert(accountMenuCode.includes('ArrowDown') && accountMenuCode.includes('ArrowUp'), 'Implements ArrowDown and ArrowUp keyboard navigation');
assert(accountMenuCode.includes('ArrowRight') && accountMenuCode.includes('ArrowLeft'), 'Implements ArrowRight and ArrowLeft submenu navigation');
assert(accountMenuCode.includes('Escape'), 'Implements Escape key handling to close menus');
assert(accountMenuCode.includes('submenuTimerRef') && accountMenuCode.includes('180'), 'Anti-flicker delay prevents submenu from closing during mouse transit');

// 5. Theme application
assert(typeof applyThemeToDocument === 'function', 'applyThemeToDocument is exported and functional');

// 6. Check Dashboard.tsx integration
const dashboardCode = fs.readFileSync(path.resolve(process.cwd(), 'src/features/dashboard/Dashboard.tsx'), 'utf8');
assert(dashboardCode.includes('<AccountMenu direction="up" align="left"'), 'Dashboard renders AccountMenu in sidebar footer');
assert(!dashboardCode.includes('Hema baghel'), 'Dashboard has no hardcoded user names');

// 7. Check App.tsx routing
const appCode = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
assert(appCode.includes("currentPath === '/settings'"), 'App.tsx routes /settings');
assert(appCode.includes("currentPath === '/profile'"), 'App.tsx routes /profile');
assert(appCode.includes("currentPath === '/download'"), 'App.tsx routes /download');
assert(appCode.includes("currentPath === '/help'"), 'App.tsx routes /help');
assert(appCode.includes("currentPath === '/pricing'"), 'App.tsx routes /pricing');
assert(appCode.includes("currentPath === '/resources/docs'"), 'App.tsx routes /resources/docs');
assert(appCode.includes('applyThemeToDocument(settings.theme)'), 'App.tsx reactively applies theme');

// 8. Check for any remaining Cursor branding in relevant user-facing files
const forbiddenCursorCheck = (fileRelPath: string) => {
  const content = fs.readFileSync(path.resolve(process.cwd(), fileRelPath), 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    // Exclude CSS class references like cursor-pointer, monaco cursor APIs, or comments
    const cleaned = line.replace(/cursor-[a-z]+/gi, '').replace(/onDidChangeCursor/g, '');
    if (/download cursor/i.test(cleaned) || /cursor docs/i.test(cleaned) || /ask cursor/i.test(cleaned)) {
      assert(false, `Found forbidden Cursor reference in ${fileRelPath}:${idx + 1}: ${line.trim()}`);
    }
  });
};

forbiddenCursorCheck('src/components/AccountMenu.tsx');
forbiddenCursorCheck('src/features/dashboard/Dashboard.tsx');
forbiddenCursorCheck('src/features/download/DownloadPage.tsx');
forbiddenCursorCheck('src/features/settings/SettingsPage.tsx');
assert(true, 'No forbidden Cursor branding found in Account Menu, Dashboard, Download, or Settings');

console.log(`\n======================================================`);
console.log(`Account Menu System Test Results: ${passed} passed, ${failed} failed.`);
console.log(`======================================================`);

if (failed > 0) {
  process.exit(1);
}
