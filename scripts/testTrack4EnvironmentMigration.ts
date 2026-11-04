/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FloatEnvironmentMigrator } from '../desktop/src/vs/workbench/contrib/float/common/migration/floatEnvironmentMigrator.js';

console.log('🧪 Starting Track 4: 1-Click VS Code & Cursor Migration Importer Tests...\n');

async function runTests() {
	const testTmpDir = path.join(os.tmpdir(), `float-migration-test-${Date.now()}`);
	fs.mkdirSync(testTmpDir, { recursive: true });

	try {
		// Mock home directory structure
		const mockHome = path.join(testTmpDir, 'home');
		const mockAppData = path.join(testTmpDir, 'appdata');
		const mockTargetConfig = path.join(testTmpDir, 'float-target-user');

		// Set temporary process env overrides
		const oldAppData = process.env['APPDATA'];
		process.env['APPDATA'] = mockAppData;

		// 1. Setup Mock VS Code Environment
		const vsCodeUserDir = path.join(mockAppData, 'Code', 'User');
		const vsCodeSnippetsDir = path.join(vsCodeUserDir, 'snippets');
		const vsCodeExtDir = path.join(mockHome, '.vscode', 'extensions');

		fs.mkdirSync(vsCodeSnippetsDir, { recursive: true });
		fs.mkdirSync(vsCodeExtDir, { recursive: true });

		// settings.json with comments
		const settingsWithComments = `// User Custom Settings
{
    // Indentation
    "editor.tabSize": 2,
    "editor.wordWrap": "on",
    /* Preserved theme */
    "workbench.colorTheme": "Monokai",
    // Conflict check
    "float.agentEnabled": false
}
`;
		fs.writeFileSync(path.join(vsCodeUserDir, 'settings.json'), settingsWithComments, 'utf8');

		// keybindings.json
		const keybindings = [
			{ key: 'ctrl+shift+k', command: 'editor.action.deleteLines' },
			{ key: 'alt+up', command: 'editor.action.moveLinesUpAction' }
		];
		fs.writeFileSync(path.join(vsCodeUserDir, 'keybindings.json'), JSON.stringify(keybindings, null, 2), 'utf8');

		// snippets
		fs.writeFileSync(
			path.join(vsCodeSnippetsDir, 'typescript.json'),
			JSON.stringify({ log: { prefix: 'clog', body: ['console.log($1);'] } }),
			'utf8'
		);

		// extensions
		fs.mkdirSync(path.join(vsCodeExtDir, 'esbenp.prettier-vscode-10.4.0'), { recursive: true });
		fs.mkdirSync(path.join(vsCodeExtDir, 'dbaeumer.vscode-eslint-3.0.5'), { recursive: true });
		fs.mkdirSync(path.join(vsCodeExtDir, 'rust-lang.rust-analyzer-0.3.2000'), { recursive: true });

		// 2. Setup Existing Target Float Config (to verify non-destructive merge)
		fs.mkdirSync(mockTargetConfig, { recursive: true });
		const existingFloatSettings = {
			'float.agentEnabled': true,
			'editor.cursorBlinking': 'smooth'
		};
		fs.writeFileSync(path.join(mockTargetConfig, 'settings.json'), JSON.stringify(existingFloatSettings, null, 2), 'utf8');

		const existingFloatKeybindings = [
			{ key: 'ctrl+i', command: 'float.action.openComposer' }
		];
		fs.writeFileSync(path.join(mockTargetConfig, 'keybindings.json'), JSON.stringify(existingFloatKeybindings, null, 2), 'utf8');

		const migrator = new FloatEnvironmentMigrator(mockHome, mockTargetConfig);

		// =========================================================================
		// Test 1: Detection of Installed Environments
		// =========================================================================
		console.log('Test 1: Environment Auto-Detection...');
		const detected = migrator.detectEnvironments();
		assert.strictEqual(detected.length, 1);
		assert.strictEqual(detected[0].source, 'vscode');
		assert.strictEqual(detected[0].hasSettings, true);
		assert.strictEqual(detected[0].hasKeybindings, true);
		assert.strictEqual(detected[0].hasSnippets, true);
		assert.strictEqual(detected[0].extensionCount, 3);
		console.log('  ✓ Detected Visual Studio Code with settings, keybindings, snippets, and 3 extensions.');

		// =========================================================================
		// Test 2: Dry-Run Migration
		// =========================================================================
		console.log('\nTest 2: Dry-Run Preview...');
		const dryRunResult = await migrator.migrate({
			source: 'vscode',
			dryRun: true
		});
		assert.strictEqual(dryRunResult.success, true);
		assert.strictEqual(dryRunResult.settingsImported, 3); // tabSize, wordWrap, colorTheme (skips float.agentEnabled)
		assert.strictEqual(dryRunResult.keybindingsImported, 2);
		assert.strictEqual(dryRunResult.snippetsImported, 1);
		assert.strictEqual(dryRunResult.extensionsDiscovered.length, 3);
		assert.strictEqual(dryRunResult.backupCreatedPath, undefined, 'Dry run must not create backup file');
		console.log('  ✓ Dry run calculated exact delta without mutating target directory.');

		// =========================================================================
		// Test 3: Live Non-Destructive Migration & Backup Creation
		// =========================================================================
		console.log('\nTest 3: Live Migration Execution & State Preservation...');
		const liveResult = await migrator.migrate({
			source: 'vscode',
			dryRun: false
		});
		assert.strictEqual(liveResult.success, true);
		assert(liveResult.backupCreatedPath && fs.existsSync(liveResult.backupCreatedPath), 'Backup file must exist');

		// Verify merged settings
		const targetSettings = JSON.parse(fs.readFileSync(path.join(mockTargetConfig, 'settings.json'), 'utf8'));
		assert.strictEqual(targetSettings['editor.tabSize'], 2);
		assert.strictEqual(targetSettings['editor.wordWrap'], 'on');
		assert.strictEqual(targetSettings['editor.cursorBlinking'], 'smooth'); // Preserved pre-existing
		assert.strictEqual(targetSettings['float.agentEnabled'], true, 'Target float settings must NOT be overwritten');

		// Verify merged keybindings
		const targetKeybindings = JSON.parse(fs.readFileSync(path.join(mockTargetConfig, 'keybindings.json'), 'utf8'));
		assert.strictEqual(targetKeybindings.length, 3);
		assert(targetKeybindings.some((k: any) => k.command === 'float.action.openComposer'));
		assert(targetKeybindings.some((k: any) => k.command === 'editor.action.deleteLines'));

		// Verify snippet copied
		const destSnippet = path.join(mockTargetConfig, 'snippets', 'typescript.json');
		assert(fs.existsSync(destSnippet));
		const snippetContent = JSON.parse(fs.readFileSync(destSnippet, 'utf8'));
		assert.strictEqual(snippetContent.log.prefix, 'clog');

		// Verify extensions
		assert(liveResult.extensionsDiscovered.includes('esbenp.prettier-vscode'));
		assert(liveResult.extensionsDiscovered.includes('dbaeumer.vscode-eslint'));
		assert(liveResult.extensionsDiscovered.includes('rust-lang.rust-analyzer'));
		console.log('  ✓ Non-destructive merge verified: float settings guarded, shortcuts and extensions imported.');

		// Clean up env override
		if (oldAppData) {
			process.env['APPDATA'] = oldAppData;
		}

		console.log('\n✅ All Track 4 Migration Importer tests PASSED successfully!\n');
	} finally {
		// Clean up test temp directory
		try {
			fs.rmSync(testTmpDir, { recursive: true, force: true });
		} catch {}
	}
}

runTests().catch(err => {
	console.error('❌ Test failed with error:', err);
	process.exit(1);
});
