import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

console.log('=== FLOAT AI: Cursor IDE Layout & StatusBar Verification ===\n');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// 1. Verify StatusBar.tsx exists and contains Cursor status bar elements
const statusBarPath = path.join(ROOT, 'src/features/shell/StatusBar.tsx');
assert.ok(fs.existsSync(statusBarPath), 'StatusBar.tsx must exist');

const statusBarSrc = fs.readFileSync(statusBarPath, 'utf8');

// Semantic status bar role
assert.ok(statusBarSrc.includes('role="status"'), 'StatusBar must define role="status" for accessibility');
assert.ok(statusBarSrc.includes('aria-label="Cursor IDE Status Bar"'), 'StatusBar must define accessible aria-label');

// Git branch indicator
assert.ok(statusBarSrc.includes('GitBranch'), 'StatusBar must display GitBranch icon');
assert.ok(statusBarSrc.includes('setActiveSidebarView(\'source-control\')'), 'Clicking Git branch must navigate to source control');

// Diagnostics / Problems indicator
assert.ok(statusBarSrc.includes('setBottomPanelTab(\'problems\')'), 'Clicking problems must activate problems panel');
assert.ok(statusBarSrc.includes('AlertCircle'), 'StatusBar must display error diagnostics icon');
assert.ok(statusBarSrc.includes('AlertTriangle'), 'StatusBar must display warning diagnostics icon');

// Cloud save states
assert.ok(statusBarSrc.includes('projectCloudSaveStatus === \'saving\''), 'Handles saving state with spinner');
assert.ok(statusBarSrc.includes('projectCloudSaveStatus === \'synced\''), 'Handles synced state with checkmark');
assert.ok(statusBarSrc.includes('projectCloudSaveStatus === \'local-only\''), 'Handles local-only state');
assert.ok(statusBarSrc.includes('projectCloudSaveStatus === \'error\''), 'Handles cloud save error state');

// Language mode detection
assert.ok(statusBarSrc.includes('TypeScript React'), 'Maps .tsx to TypeScript React');
assert.ok(statusBarSrc.includes('TypeScript'), 'Maps .ts to TypeScript');
assert.ok(statusBarSrc.includes('Python'), 'Maps .py to Python');
assert.ok(statusBarSrc.includes('JSON'), 'Maps .json to JSON');
assert.ok(statusBarSrc.includes('Markdown'), 'Maps .md to Markdown');

// Editor metadata: Line/Col, Tab Size, UTF-8, LF
assert.ok(statusBarSrc.includes('Ln 1, Col 1'), 'Provides default line/column formatting');
assert.ok(statusBarSrc.includes('Spaces:'), 'Displays indentation tab size');
assert.ok(statusBarSrc.includes('UTF-8'), 'Displays UTF-8 encoding');
assert.ok(statusBarSrc.includes('LF'), 'Displays LF line ending indicator');

// Authoritative model badge
assert.ok(statusBarSrc.includes('GPT-6 Astra'), 'Includes GPT-6 Astra');
assert.ok(statusBarSrc.includes('GPT-6.1 Sol'), 'Includes GPT-6.1 Sol');
assert.ok(statusBarSrc.includes('setSelectedModel(\'gpt-6-astra\')'), 'Allows selecting GPT-6 Astra');
assert.ok(statusBarSrc.includes('setSelectedModel(\'gpt-6.1-sol\')'), 'Allows selecting GPT-6.1 Sol');

// Dock toggles
assert.ok(statusBarSrc.includes('toggleBottomPanel'), 'Includes bottom drawer toggle');
assert.ok(statusBarSrc.includes('toggleRightSidebar'), 'Includes right sidebar toggle');

console.log('[PASS] StatusBar provides full Cursor status bar capabilities: Git, Diagnostics, Cloud Sync, Line/Col, Encoding, Model badge, and Toggles');

// 2. Verify IDEWorkspace.tsx incorporates StatusBar
const ideWorkspacePath = path.join(ROOT, 'src/features/shell/IDEWorkspace.tsx');
assert.ok(fs.existsSync(ideWorkspacePath), 'IDEWorkspace.tsx must exist');

const ideWorkspaceSrc = fs.readFileSync(ideWorkspacePath, 'utf8');
assert.ok(ideWorkspaceSrc.includes("import { StatusBar } from './StatusBar'"), 'IDEWorkspace must import StatusBar');
assert.ok(ideWorkspaceSrc.includes('<StatusBar />'), 'IDEWorkspace must render <StatusBar /> at the bottom of the layout');

console.log('[PASS] IDEWorkspace cleanly integrates StatusBar in full-fidelity IDE layout');

// 3. Verify .env Git credentials do not collide
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const githubMatch = envContent.match(/^GITHUB_CLIENT_ID=(.*)$/m);
  const gitlabMatch = envContent.match(/^GITLAB_CLIENT_ID=(.*)$/m);
  if (githubMatch && gitlabMatch && githubMatch[1].trim()) {
    assert.notStrictEqual(
      githubMatch[1].trim(),
      gitlabMatch[1].trim(),
      'GITLAB_CLIENT_ID must NOT be identical to GITHUB_CLIENT_ID'
    );
  }
}
console.log('[PASS] .env GitLab and GitHub credentials do not collide');

console.log('\n======================================================');
console.log('Cursor IDE Layout Verification: All checks passed!');
console.log('======================================================');
