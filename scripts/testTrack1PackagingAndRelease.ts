/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { FloatUpdateService } from '../desktop/src/vs/workbench/contrib/float/electron-sandbox/floatUpdateService.js';

console.log('🧪 Starting Track 1: Production Packaging & Release Pipeline Tests...\n');

async function runTests() {
	// =========================================================================
	// Test 1: Release Workflow Specification Validation
	// =========================================================================
	console.log('Test 1: Release Workflow YAML Specification...');

	const releaseWorkflowPath = path.resolve('.github/workflows/release.yml');
	assert(fs.existsSync(releaseWorkflowPath), 'release.yml workflow file must exist');

	const yamlContent = fs.readFileSync(releaseWorkflowPath, 'utf8');
	assert(yamlContent.includes('Package Desktop'), 'Workflow must declare build-desktop job');
	assert(yamlContent.includes('windows-x64'), 'Matrix must include windows-x64');
	assert(yamlContent.includes('macos-arm64'), 'Matrix must include macos-arm64');
	assert(yamlContent.includes('linux-x64'), 'Matrix must include linux-x64');
	assert(yamlContent.includes('FLOAT-Setup-x64.exe'), 'Must target Windows setup installer');
	assert(yamlContent.includes('FLOAT-arm64.dmg'), 'Must target macOS DMG image');
	assert(yamlContent.includes('float-studio_amd64.deb'), 'Must target Linux Debian package');
	assert(yamlContent.includes('SHA256SUMS.txt'), 'Must compute SHA256 checksums');
	assert(yamlContent.includes('action-gh-release'), 'Must publish release assets to GitHub');
	assert(yamlContent.includes('scripts/packageDesktopRelease.cjs'), 'Workflow must invoke scripts/packageDesktopRelease.cjs');
	assert(yamlContent.includes('scripts/validateReleaseArtifacts.cjs'), 'Workflow must invoke scripts/validateReleaseArtifacts.cjs');
	assert(!yamlContent.includes('echo "FLOAT Studio Desktop Release'), 'Workflow must never write text placeholders into installer filenames');
	console.log('  ✓ Multi-platform GitHub Actions release matrix validated (Windows, macOS, Linux).');

	// =========================================================================
	// Test 2: FloatUpdateService Semantic Version Comparison
	// =========================================================================
	console.log('\nTest 2: Semantic Version Comparator Engine...');

	const updater = new FloatUpdateService();
	assert.strictEqual(updater.compareSemver('1.1.0', '1.0.0'), 1);
	assert.strictEqual(updater.compareSemver('1.0.0', '1.1.0'), -1);
	assert.strictEqual(updater.compareSemver('1.0.0', '1.0.0'), 0);
	assert.strictEqual(updater.compareSemver('v2.0.1', '2.0.0'), 1);
	assert.strictEqual(updater.compareSemver('1.99.3-float', '1.99.2'), 1);
	assert.strictEqual(updater.compareSemver('0.9.5', '1.0.0'), -1);
	console.log('  ✓ Semver comparator accurately handles versions, prefixes, and patch bumps.');

	// =========================================================================
	// Test 3: Auto-Updater GitHub Release Check & Asset Targeting
	// =========================================================================
	console.log('\nTest 3: Auto-Updater GitHub Release Check & Platform Asset Selection...');

	const originalFetch = globalThis.fetch;

	try {
		const stateEvents: string[] = [];
		updater.onDidChangeState(state => stateEvents.push(state));

		// Mock GitHub Releases API
		globalThis.fetch = async (url: any) => {
			assert(String(url).includes('releases/latest'));
			return {
				ok: true,
				status: 200,
				json: async () => ({
					tag_name: 'v1.2.0',
					body: '## Release v1.2.0\n- Floating Composer\n- Tab Jump Pill\n- Ollama Local Engine',
					published_at: '2026-11-04T12:00:00Z',
					assets: [
						{
							name: 'FLOAT-Setup-x64.exe',
							browser_download_url: 'https://github.com/hemarbaghel-ux/float-studio/releases/download/v1.2.0/FLOAT-Setup-x64.exe',
							size: 245000000
						},
						{
							name: 'FLOAT-arm64.dmg',
							browser_download_url: 'https://github.com/hemarbaghel-ux/float-studio/releases/download/v1.2.0/FLOAT-arm64.dmg',
							size: 238000000
						},
						{
							name: 'float-studio_amd64.deb',
							browser_download_url: 'https://github.com/hemarbaghel-ux/float-studio/releases/download/v1.2.0/float-studio_amd64.deb',
							size: 215000000
						}
					]
				})
			} as any;
		};

		// Check on Windows
		const winUpdate = await updater.checkForUpdates('1.0.0', 'win32');
		assert.strictEqual(winUpdate.hasUpdate, true);
		assert.strictEqual(winUpdate.latestVersion, '1.2.0');
		assert.strictEqual(winUpdate.downloadUrl, 'https://github.com/hemarbaghel-ux/float-studio/releases/download/v1.2.0/FLOAT-Setup-x64.exe');
		assert.strictEqual(updater.getState(), 'available');

		// Check on macOS
		const macUpdate = await updater.checkForUpdates('1.0.0', 'darwin');
		assert.strictEqual(macUpdate.downloadUrl, 'https://github.com/hemarbaghel-ux/float-studio/releases/download/v1.2.0/FLOAT-arm64.dmg');

		// Check on Linux
		const linuxUpdate = await updater.checkForUpdates('1.0.0', 'linux');
		assert.strictEqual(linuxUpdate.downloadUrl, 'https://github.com/hemarbaghel-ux/float-studio/releases/download/v1.2.0/float-studio_amd64.deb');

		// Check when already up-to-date
		const upToDate = await updater.checkForUpdates('1.2.0', 'win32');
		assert.strictEqual(upToDate.hasUpdate, false);
		assert.strictEqual(updater.getState(), 'up-to-date');

		assert(stateEvents.includes('checking'));
		assert(stateEvents.includes('available'));
		assert(stateEvents.includes('up-to-date'));

		console.log('  ✓ Release check, state machine, and OS platform asset targeting verified.');
	} finally {
		globalThis.fetch = originalFetch;
		updater.dispose();
	}

	console.log('\n✅ All Track 1 Production Packaging & Release tests PASSED successfully!\n');
}

runTests().catch(err => {
	console.error('❌ Test failed with error:', err);
	process.exit(1);
});
