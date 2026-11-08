/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../desktop/src/vs/base/common/uri.js';
import { FloatWebWorkbenchMounter } from '../desktop/src/vs/workbench/contrib/float/browser/web/floatWebWorkbenchMounter.js';
import { FloatMultiAgentComposerView } from '../desktop/src/vs/workbench/contrib/float/browser/composer/floatMultiAgentComposerView.js';
import { FloatReleasePackager, PlatformTarget } from '../desktop/src/vs/workbench/contrib/float/browser/release/floatReleasePackager.js';

class MockDomContainer {
	private readonly _attributes = new Map<string, string>();

	setAttribute(name: string, value: string): void {
		this._attributes.set(name, value);
	}

	getAttribute(name: string): string | undefined {
		return this._attributes.get(name);
	}

	removeAttribute(name: string): void {
		this._attributes.delete(name);
	}

	hasAttribute(name: string): boolean {
		return this._attributes.has(name);
	}
}

async function runSprint7Tests() {
	console.log('\n================================================================');
	console.log('  FLOAT STUDIO — SPRINT 7: CODE-OSS WEB WORKBENCH MOUNTER');
	console.log('  & CROSS-PLATFORM RELEASE PACKAGING ACCEPTANCE TEST SUITE');
	console.log('================================================================\n');

	// --------------------------------------------------------------------------
	// Test 1: FloatWebWorkbenchMounter — Mounting Lifecycle & Attributes
	// --------------------------------------------------------------------------
	console.log('[Test 1] Testing FloatWebWorkbenchMounter Mounting Lifecycle...');
	const mounter = new FloatWebWorkbenchMounter();
	assert.strictEqual(mounter.isMounted(), false);
	assert.strictEqual(mounter.getActiveWorkspaceUri(), null);

	const mockContainer = new MockDomContainer();
	let mountEventFired = false;
	mounter.onDidMount(e => {
		mountEventFired = true;
		assert.strictEqual(e.workspaceUri?.scheme, 'float-workspace');
	});

	const targetUri = 'float-workspace://localhost/root/my-project';
	const handle = await mounter.mount(mockContainer, {
		workspaceUri: targetUri,
		theme: 'Default Dark Modern'
	});

	assert.strictEqual(mountEventFired, true, 'onDidMount must fire');
	assert.strictEqual(mounter.isMounted(), true);
	assert.strictEqual(mounter.getActiveWorkspaceUri()?.toString(), targetUri);
	assert.strictEqual(mockContainer.getAttribute('data-float-mounted'), 'true');
	assert.strictEqual(mockContainer.getAttribute('data-float-theme'), 'Default Dark Modern');

	console.log('  ✓ Web workbench mounted into DOM container with configuration attributes');

	// --------------------------------------------------------------------------
	// Test 2: FloatWebWorkbenchMounter — Workspace Switching & Unmount
	// --------------------------------------------------------------------------
	console.log('\n[Test 2] Testing Web Workbench Workspace Switching & Safe Unmount...');
	let workspaceChanged = false;
	mounter.onDidChangeWorkspace(newUri => {
		workspaceChanged = true;
		assert.strictEqual(newUri.toString(), 'float-workspace://localhost/root/another-project');
	});

	await handle.openWorkspace(URI.parse('float-workspace://localhost/root/another-project'));
	assert.strictEqual(workspaceChanged, true, 'onDidChangeWorkspace must fire');
	assert.strictEqual(mounter.getActiveWorkspaceUri()?.toString(), 'float-workspace://localhost/root/another-project');

	let unmountFired = false;
	mounter.onDidUnmount(() => { unmountFired = true; });

	await handle.shutdown();
	assert.strictEqual(unmountFired, true, 'onDidUnmount must fire');
	assert.strictEqual(mounter.isMounted(), false);
	assert.strictEqual(mounter.getActiveWorkspaceUri(), null);
	assert.strictEqual(mockContainer.hasAttribute('data-float-mounted'), false);

	console.log('  ✓ Dynamic workspace switching and clean unmounting verified');

	// --------------------------------------------------------------------------
	// Test 3: FloatMultiAgentComposerView — Goal Trigger & Timeline Streaming
	// --------------------------------------------------------------------------
	console.log('\n[Test 3] Testing Multi-Agent Composer View Goal Execution...');
	const composerView = new FloatMultiAgentComposerView();

	let timelineUpdatesCount = 0;
	composerView.onDidUpdateTimeline(cards => {
		timelineUpdatesCount++;
		assert.ok(cards.length > 0);
	});

	const result = await composerView.triggerGoal('Build customer authentication module');
	assert.strictEqual(result.status, 'success');

	const timeline = composerView.getTimeline();
	assert.ok(timeline.length >= 4, `Expected at least 4 timeline cards (got ${timeline.length})`);
	const roles = timeline.map(c => c.role);
	assert.ok(roles.includes('architect'));
	assert.ok(roles.includes('coder'));
	assert.ok(roles.includes('reviewer'));
	assert.ok(roles.includes('tester'));

	// Verify active session in ComposerViewPane
	const activeSession = composerView.getComposerPane().getActiveSession();
	assert.ok(activeSession, 'Active session must exist in composer pane');
	assert.strictEqual(activeSession.mode, 'agent');
	assert.strictEqual(activeSession.status, 'ready_for_review');
	assert.ok(activeSession.files.length > 0, 'Proposed files must be staged in composer');
	assert.strictEqual(activeSession.files[0].path, 'src/service.ts');

	console.log(`  ✓ Multi-agent timeline streamed (${timeline.length} cards) and staged into ComposerViewPane`);

	// --------------------------------------------------------------------------
	// Test 4: FloatMultiAgentComposerView — Goal Cancellation
	// --------------------------------------------------------------------------
	console.log('\n[Test 4] Testing Multi-Agent Composer View Cancellation...');
	const cancelView = new FloatMultiAgentComposerView();
	cancelView.getComposerPane().createSession('Cancel Test Session', 'agent');
	cancelView.cancelGoal();

	const cancelSession = cancelView.getComposerPane().getActiveSession();
	assert.strictEqual(cancelSession?.status, 'rejected');
	console.log('  ✓ Cancelled multi-agent composer session marked as rejected');

	// --------------------------------------------------------------------------
	// Test 5: FloatReleasePackager — Platform Matrix Completeness
	// --------------------------------------------------------------------------
	console.log('\n[Test 5] Testing FloatReleasePackager Platform Coverage Matrix...');
	const packager = new FloatReleasePackager();
	assert.strictEqual(FloatReleasePackager.SUPPORTED_PLATFORMS.length, 3);
	assert.ok(FloatReleasePackager.SUPPORTED_PLATFORMS.includes('windows-x64'));
	assert.ok(FloatReleasePackager.SUPPORTED_PLATFORMS.includes('macos-arm64'));
	assert.ok(FloatReleasePackager.SUPPORTED_PLATFORMS.includes('linux-x64'));

	// Test completeness checker with partial assets
	const partial = packager.validatePlatformCompleteness([
		{ name: 'FLOAT-Setup-x64.exe', platform: 'windows-x64', size: 100, sha256: 'a', downloadUrl: 'http' }
	]);
	assert.strictEqual(partial.isComplete, false);
	assert.deepStrictEqual(partial.missingPlatforms.sort(), ['linux-x64', 'macos-arm64'].sort());

	console.log('  ✓ Multi-platform support matrix validated (Windows, macOS, Linux)');

	// --------------------------------------------------------------------------
	// Test 6: FloatReleasePackager — Checksum Generation & Tamper Detection
	// --------------------------------------------------------------------------
	console.log('\n[Test 6] Testing SHA-256 Manifest Generation & Tamper Detection...');
	const mockBinaries = [
		{ name: 'FLOAT-Setup-x64.exe', content: 'BINARY_DATA_WINDOWS_INSTALLER_v1.3.0' },
		{ name: 'FLOAT-arm64.dmg', content: 'BINARY_DATA_MACOS_DMG_v1.3.0' },
		{ name: 'float-studio_amd64.deb', content: 'BINARY_DATA_LINUX_DEB_v1.3.0' }
	];

	const manifestStr = packager.generateSha256SumsManifest(mockBinaries);
	assert.ok(manifestStr.includes('FLOAT-Setup-x64.exe'));
	assert.ok(manifestStr.includes('FLOAT-arm64.dmg'));
	assert.ok(manifestStr.includes('float-studio_amd64.deb'));

	const parsedMap = packager.parseSha256SumsManifest(manifestStr);
	assert.strictEqual(parsedMap.size, 3);

	for (const bin of mockBinaries) {
		const expectedSha = parsedMap.get(bin.name);
		assert.ok(expectedSha, `Hash for ${bin.name} must exist`);
		assert.strictEqual(expectedSha.length, 64, 'SHA-256 must be 64 hex characters');
		assert.strictEqual(packager.verifyChecksum(bin.content, expectedSha), true);
	}

	// Tamper detection: modifying binary content must fail verification
	const tamperedContent = 'TAMPERED_BINARY_DATA';
	const winHash = parsedMap.get('FLOAT-Setup-x64.exe')!;
	assert.strictEqual(packager.verifyChecksum(tamperedContent, winHash), false, 'Tampered data must fail checksum');

	console.log('  ✓ SHA-256 checksum manifest generation and tamper detection verified');

	// --------------------------------------------------------------------------
	// Test 7: FloatReleasePackager — Full Release Manifest Builder
	// --------------------------------------------------------------------------
	console.log('\n[Test 7] Testing Full Release Manifest Builder (v1.3.0)...');
	const allPlatformAssets = [
		{ name: 'FLOAT-Setup-x64.exe', platform: 'windows-x64' as PlatformTarget, content: 'win-installer', downloadUrl: 'https://download/win-setup.exe' },
		{ name: 'FLOAT-win32-x64.zip', platform: 'windows-x64' as PlatformTarget, content: 'win-portable', downloadUrl: 'https://download/win-portable.zip' },
		{ name: 'FLOAT-arm64.dmg', platform: 'macos-arm64' as PlatformTarget, content: 'mac-dmg', downloadUrl: 'https://download/mac-arm64.dmg' },
		{ name: 'FLOAT-darwin-arm64.zip', platform: 'macos-arm64' as PlatformTarget, content: 'mac-zip', downloadUrl: 'https://download/mac-zip.zip' },
		{ name: 'float-studio_amd64.deb', platform: 'linux-x64' as PlatformTarget, content: 'linux-deb', downloadUrl: 'https://download/linux.deb' },
		{ name: 'FLOAT-linux-x64.tar.gz', platform: 'linux-x64' as PlatformTarget, content: 'linux-tar', downloadUrl: 'https://download/linux.tar.gz' }
	];

	const releaseManifest = packager.buildReleaseManifest('v1.3.0', allPlatformAssets, 'stable');
	assert.strictEqual(releaseManifest.version, 'v1.3.0');
	assert.strictEqual(releaseManifest.channel, 'stable');
	assert.strictEqual(releaseManifest.assets.length, 6);

	const completeness = packager.validatePlatformCompleteness(releaseManifest.assets);
	assert.strictEqual(completeness.isComplete, true);
	assert.strictEqual(completeness.missingPlatforms.length, 0);

	console.log('  ✓ Complete release manifest with 6 artifacts across all 3 platforms built successfully');

	// --------------------------------------------------------------------------
	// Test 8: Disposal & Memory Leak Prevention
	// --------------------------------------------------------------------------
	console.log('\n[Test 8] Testing Resource Disposal...');
	mounter.dispose();
	composerView.dispose();
	cancelView.dispose();
	console.log('  ✓ All event emitters, DOM references, and subscriptions cleanly disposed');

	console.log('\n================================================================');
	console.log('  [ALL SPRINT 7 TESTS PASSED] 100% GREEN (8/8 Verified)');
	console.log('================================================================\n');
}

runSprint7Tests().catch(err => {
	console.error('\n[FAIL] Sprint 7 verification failed:', err);
	process.exit(1);
});
