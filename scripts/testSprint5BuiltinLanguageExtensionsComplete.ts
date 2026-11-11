/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalRequire = Module.prototype.require;

const mockSubscriptions: any[] = [];
const mockCommands = new Map<string, Function>();
const mockWindowMessages: { type: string; message: string }[] = [];

const mockVscode = {
	commands: {
		registerCommand: (command: string, callback: Function) => {
			mockCommands.set(command, callback);
			const disposable = {
				dispose: () => {
					mockCommands.delete(command);
				}
			};
			mockSubscriptions.push(disposable);
			return disposable;
		},
		executeCommand: async (command: string, ...args: any[]) => {
			const handler = mockCommands.get(command);
			if (handler) {
				return handler(...args);
			}
			if (command.startsWith('editor.action.')) {
				return true;
			}
			throw new Error(`Command not found: ${command}`);
		}
	},
	window: {
		showInformationMessage: async (msg: string) => {
			mockWindowMessages.push({ type: 'info', message: msg });
			return msg;
		},
		showErrorMessage: async (msg: string) => {
			mockWindowMessages.push({ type: 'error', message: msg });
			return msg;
		},
		showQuickPick: async (items: string[]) => {
			return items[0];
		},
		showInputBox: async (options?: any) => {
			return 'mock-input';
		},
		createTerminal: (options?: any) => ({
			show: () => {},
			sendText: (text: string) => {},
			dispose: () => {}
		}),
		activeTextEditor: undefined as any
	},
	workspace: {
		onDidOpenTextDocument: (callback: Function) => {
			const disposable = { dispose: () => {} };
			mockSubscriptions.push(disposable);
			return disposable;
		},
		onDidCloseTextDocument: (callback: Function) => {
			const disposable = { dispose: () => {} };
			mockSubscriptions.push(disposable);
			return disposable;
		}
	},
	Range: class {
		constructor(public start: any, public end: any) {}
	},
	Position: class {
		constructor(public line: number, public character: number) {}
	}
};

Module.prototype.require = function (id: string) {
	if (id === 'vscode') {
		return mockVscode;
	}
	return originalRequire.apply(this, arguments);
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const EXTENSIONS_DIR = path.join(ROOT_DIR, 'extensions');

const EXPECTED_EXTENSIONS = [
	'typescript-language-features',
	'json-language-features',
	'markdown-language-features',
	'html-language-features',
	'css-language-features',
	'git',
	'configuration-editing'
];

async function runSprint5Tests() {
	console.log('\n================================================================');
	console.log('  FLOAT STUDIO — SPRINT 5: BUILT-IN CORE LANGUAGE EXTENSIONS');
	console.log('  Full Acceptance Verification Suite');
	console.log('================================================================\n');

	// Ensure all extensions are built before running tests
	const buildScript = path.join(ROOT_DIR, 'scripts/buildAllBuiltinExtensions.cjs');
	if (fs.existsSync(buildScript)) {
		const { execSync } = require('child_process');
		execSync(`node "${buildScript}"`, { stdio: 'inherit' });
	}

	// --------------------------------------------------------------------------
	// Test 1: Verify Code-OSS Directory Structure & Extension Manifests
	// --------------------------------------------------------------------------
	console.log('[Test 1] Verifying Code-OSS Built-in Extension Manifests...');
	assert.ok(fs.existsSync(EXTENSIONS_DIR), `extensions/ directory must exist at ${EXTENSIONS_DIR}`);

	for (const extName of EXPECTED_EXTENSIONS) {
		const extDir = path.join(EXTENSIONS_DIR, extName);
		assert.ok(fs.existsSync(extDir), `Extension folder '${extName}' must exist`);

		const pkgJsonPath = path.join(extDir, 'package.json');
		assert.ok(fs.existsSync(pkgJsonPath), `Extension '${extName}' must have package.json`);

		const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
		assert.strictEqual(pkg.name, extName, `package.json name must match ${extName}`);
		assert.strictEqual(pkg.publisher, 'float-ai', `publisher must be float-ai`);
		assert.ok(pkg.version, `version must be defined`);
		assert.ok(pkg.engines && pkg.engines.vscode, `engines.vscode must be specified`);
		assert.strictEqual(pkg.main, './dist/extension.js', `entrypoint must be ./dist/extension.js`);

		const distBundle = path.join(extDir, 'dist/extension.js');
		assert.ok(fs.existsSync(distBundle), `Compiled bundle must exist at ${distBundle}`);
		const bundleStat = fs.statSync(distBundle);
		assert.ok(bundleStat.size > 1000, `Bundle size must be non-trivial (got ${bundleStat.size} bytes)`);

		console.log(`  ✓ ${extName}: manifest valid, bundle present (${bundleStat.size} bytes)`);
	}

	// --------------------------------------------------------------------------
	// Test 2: Verify Language Configuration JSON files
	// --------------------------------------------------------------------------
	console.log('\n[Test 2] Verifying Language Configuration Declarations...');
	const langConfigs = [
		'typescript-language-features',
		'json-language-features',
		'markdown-language-features',
		'html-language-features',
		'css-language-features'
	];

	for (const extName of langConfigs) {
		const configPath = path.join(EXTENSIONS_DIR, extName, 'language-configuration.json');
		assert.ok(fs.existsSync(configPath), `${extName} must have language-configuration.json`);
		const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
		assert.ok(config.brackets || config.comments || config.autoClosingPairs, `${extName} configuration must define brackets/comments/autoClosingPairs`);
		console.log(`  ✓ ${extName}: language-configuration.json parsed successfully`);
	}

	// --------------------------------------------------------------------------
	// Test 3: Functional Verification — TypeScript Language Service
	// --------------------------------------------------------------------------
	console.log('\n[Test 3] Testing TypeScript Language Features Service & Commands...');
	const tsExt = require(path.join(EXTENSIONS_DIR, 'typescript-language-features/dist/extension.js'));
	assert.ok(typeof tsExt.activate === 'function', 'activate function must be exported');
	assert.ok(typeof tsExt.deactivate === 'function', 'deactivate function must be exported');

	const mockContext: any = { subscriptions: [] };
	const tsActivated = tsExt.activate(mockContext);
	assert.ok(tsActivated && tsActivated.service, 'activate must return initialized TypeScriptLanguageService');

	const tsService = tsActivated.service;
	let tsStatus = tsService.getStatus();
	assert.strictEqual(tsStatus.isRunning, true, 'TypeScript server should be running on activation');
	assert.strictEqual(tsStatus.version, '5.4.5', 'Bundled TypeScript version should be 5.4.5');

	tsService.registerFile('/workspace/src/app.tsx');
	tsService.registerFile('/workspace/src/index.ts');
	tsStatus = tsService.getStatus();
	assert.strictEqual(tsStatus.activeFiles.length, 2, 'Two files should be registered');
	assert.ok(tsStatus.activeFiles.includes('/workspace/src/app.tsx'));

	tsService.unregisterFile('/workspace/src/app.tsx');
	tsStatus = tsService.getStatus();
	assert.strictEqual(tsStatus.activeFiles.length, 1);

	await mockVscode.commands.executeCommand('typescript.restartTsServer');
	await mockVscode.commands.executeCommand('typescript.openTsServerLog');
	await mockVscode.commands.executeCommand('typescript.selectTypeScriptVersion');

	tsExt.deactivate();
	assert.strictEqual(tsService.getStatus().isRunning, false, 'Service should stop after deactivation');
	console.log('  ✓ TypeScript Language Features fully operational');

	// --------------------------------------------------------------------------
	// Test 4: Functional Verification — JSON Language Features & Key Sorter
	// --------------------------------------------------------------------------
	console.log('\n[Test 4] Testing JSON Language Features & Sorter...');
	const jsonExt = require(path.join(EXTENSIONS_DIR, 'json-language-features/dist/extension.js'));
	const jsonActivated = jsonExt.activate(mockContext);
	assert.ok(jsonActivated && jsonActivated.service);
	const jsonService = jsonActivated.service;

	const unsortedJson = '{\n  "zebra": 1,\n  "alpha": {\n    "delta": true,\n    "beta": false\n  }\n}';
	const sorted = jsonService.sortJson(unsortedJson);
	const parsedSorted = JSON.parse(sorted);
	const rootKeys = Object.keys(parsedSorted);
	assert.deepStrictEqual(rootKeys, ['alpha', 'zebra'], 'JSON keys should be sorted alphabetically');
	const nestedKeys = Object.keys(parsedSorted.alpha);
	assert.deepStrictEqual(nestedKeys, ['beta', 'delta'], 'Nested JSON keys should be sorted alphabetically');

	jsonService.clearCache();
	assert.strictEqual(jsonService.getCachedSchemasCount(), 0);
	await mockVscode.commands.executeCommand('json.clearCache');

	jsonExt.deactivate();
	console.log('  ✓ JSON Language Features & recursive sorter verified');

	// --------------------------------------------------------------------------
	// Test 5: Functional Verification — Markdown Header Extraction & Links
	// --------------------------------------------------------------------------
	console.log('\n[Test 5] Testing Markdown Language Features & Outline Parser...');
	const mdExt = require(path.join(EXTENSIONS_DIR, 'markdown-language-features/dist/extension.js'));
	const mdActivated = mdExt.activate(mockContext);
	assert.ok(mdActivated && mdActivated.service);
	const mdService = mdActivated.service;

	const sampleMarkdown = `# Document Title
Introductory text.

## Architecture Overview
Details about components.

### Subsystem A
Deeper dive.

## Performance
Links: [FLOAT Docs](https://float.dev/docs) and [Local Spec](./spec.md).`;

	const headers = mdService.extractHeaders(sampleMarkdown);
	assert.strictEqual(headers.length, 4, 'Should extract 4 headers');
	assert.strictEqual(headers[0].level, 1);
	assert.strictEqual(headers[0].text, 'Document Title');
	assert.strictEqual(headers[1].level, 2);
	assert.strictEqual(headers[1].text, 'Architecture Overview');
	assert.strictEqual(headers[2].level, 3);
	assert.strictEqual(headers[2].text, 'Subsystem A');

	const linkResult = mdService.validateLinks(sampleMarkdown);
	assert.strictEqual(linkResult.valid.length, 2);
	assert.ok(linkResult.valid.includes('https://float.dev/docs'));
	assert.ok(linkResult.valid.includes('./spec.md'));

	await mockVscode.commands.executeCommand('markdown.showPreview');
	await mockVscode.commands.executeCommand('markdown.showPreviewToSide');
	await mockVscode.commands.executeCommand('markdown.refreshPreview');

	mdExt.deactivate();
	console.log('  ✓ Markdown Header Extraction and link validation verified');

	// --------------------------------------------------------------------------
	// Test 6: Functional Verification — HTML Tag Auto-Closing
	// --------------------------------------------------------------------------
	console.log('\n[Test 6] Testing HTML Language Features & Tag Inferrer...');
	const htmlExt = require(path.join(EXTENSIONS_DIR, 'html-language-features/dist/extension.js'));
	const htmlActivated = htmlExt.activate(mockContext);
	assert.ok(htmlActivated && htmlActivated.service);
	const htmlService = htmlActivated.service;

	assert.strictEqual(htmlService.getClosingTag('<div class="container">'), '</div>');
	assert.strictEqual(htmlService.getClosingTag('<main id="app">'), '</main>');
	assert.strictEqual(htmlService.getClosingTag('<section>'), '</section>');
	assert.strictEqual(htmlService.getClosingTag('<span style="color:red">'), '</span>');

	// Void tags must not generate closing tags
	assert.strictEqual(htmlService.getClosingTag('<br>'), null);
	assert.strictEqual(htmlService.getClosingTag('<hr class="divider">'), null);
	assert.strictEqual(htmlService.getClosingTag('<img src="foo.png">'), null);
	assert.strictEqual(htmlService.getClosingTag('<input type="text">'), null);

	htmlExt.deactivate();
	console.log('  ✓ HTML Auto-Closing Tag logic verified');

	// --------------------------------------------------------------------------
	// Test 7: Functional Verification — CSS Known Property Registry
	// --------------------------------------------------------------------------
	console.log('\n[Test 7] Testing CSS Language Features & Property Registry...');
	const cssExt = require(path.join(EXTENSIONS_DIR, 'css-language-features/dist/extension.js'));
	const cssActivated = cssExt.activate(mockContext);
	assert.ok(cssActivated && cssActivated.service);
	const cssService = cssActivated.service;

	assert.strictEqual(cssService.isKnownProperty('display'), true);
	assert.strictEqual(cssService.isKnownProperty('flex-direction'), true);
	assert.strictEqual(cssService.isKnownProperty('grid-template-columns'), true);
	assert.strictEqual(cssService.isKnownProperty('background-color'), true);
	assert.strictEqual(cssService.isKnownProperty('invalid-pseudo-prop'), false);

	const allProps = cssService.getProperties();
	assert.ok(allProps.length >= 30, `Expected at least 30 known CSS properties (got ${allProps.length})`);

	await mockVscode.commands.executeCommand('css.formatDocument');
	cssExt.deactivate();
	console.log('  ✓ CSS Property Registry & formatter command verified');

	// --------------------------------------------------------------------------
	// Test 8: Functional Verification — Git SCM Service
	// --------------------------------------------------------------------------
	console.log('\n[Test 8] Testing Git SCM Provider & Staging Lifecycle...');
	const gitExt = require(path.join(EXTENSIONS_DIR, 'git/dist/extension.js'));
	const gitActivated = gitExt.activate(mockContext);
	assert.ok(gitActivated && gitActivated.service);
	const gitService = gitActivated.service;

	const initialStatus = gitService.getStatus();
	assert.strictEqual(initialStatus.branch, 'main');
	assert.strictEqual(initialStatus.stagedFiles.length, 0);

	gitService.setBranch('feat/ai-composer');
	assert.strictEqual(gitService.getStatus().branch, 'feat/ai-composer');

	// Stage modifications
	(gitService as any)._modifiedFiles.add('src/file1.ts');
	(gitService as any)._modifiedFiles.add('src/file2.ts');
	gitService.stageAll();

	const stagedStatus = gitService.getStatus();
	assert.strictEqual(stagedStatus.stagedFiles.length, 2);
	assert.strictEqual(stagedStatus.modifiedFiles.length, 0);

	// Commit staged files
	const commitSuccess = gitService.commit('feat: integrate core language extensions');
	assert.strictEqual(commitSuccess, true);
	assert.strictEqual(gitService.getStatus().stagedFiles.length, 0);

	// Empty commit should fail
	assert.strictEqual(gitService.commit('empty commit'), false);

	// Test unstage
	(gitService as any)._stagedFiles.add('src/file3.ts');
	gitService.unstageAll();
	assert.strictEqual(gitService.getStatus().stagedFiles.length, 0);
	assert.strictEqual(gitService.getStatus().modifiedFiles.length, 1);

	await mockVscode.commands.executeCommand('git.refresh');
	await mockVscode.commands.executeCommand('git.push');
	await mockVscode.commands.executeCommand('git.pull');

	gitExt.deactivate();
	console.log('  ✓ Git SCM staging, branch switching, and commit pipeline verified');

	// --------------------------------------------------------------------------
	// Test 9: Functional Verification — Configuration Editing Service
	// --------------------------------------------------------------------------
	console.log('\n[Test 9] Testing Configuration Editing Schema Validation & Autocomplete...');
	const cfgExt = require(path.join(EXTENSIONS_DIR, 'configuration-editing/dist/extension.js'));
	const cfgActivated = cfgExt.activate(mockContext);
	assert.ok(cfgActivated && cfgActivated.service);
	const cfgService = cfgActivated.service;

	// Valid and invalid settings
	const validSettings = JSON.stringify({ "editor.fontSize": 14, "float.ai.enabled": true });
	assert.strictEqual(cfgService.validateConfiguration('settings', validSettings).isValid, true);

	const invalidSettings = 'not json';
	assert.strictEqual(cfgService.validateConfiguration('settings', invalidSettings).isValid, false);

	// Keybindings
	const validKeybindings = JSON.stringify([{ "key": "ctrl+k", "command": "float.inlineEdit" }]);
	assert.strictEqual(cfgService.validateConfiguration('keybindings', validKeybindings).isValid, true);

	const invalidKeybindings = JSON.stringify({ "key": "ctrl+k" }); // Must be an array
	assert.strictEqual(cfgService.validateConfiguration('keybindings', invalidKeybindings).isValid, false);

	const incompleteKeybinding = JSON.stringify([{ "key": "ctrl+k" }]); // missing command
	assert.strictEqual(cfgService.validateConfiguration('keybindings', incompleteKeybinding).isValid, false);

	// Launch.json
	const validLaunch = JSON.stringify({
		version: '0.2.0',
		configurations: [{ type: 'node', request: 'launch', name: 'Launch Server', program: '${workspaceFolder}/server.ts' }]
	});
	assert.strictEqual(cfgService.validateConfiguration('launch', validLaunch).isValid, true);

	// Tasks.json
	const validTasks = JSON.stringify({
		version: '2.0.0',
		tasks: [{ label: 'build', type: 'shell', command: 'npm run build' }]
	});
	assert.strictEqual(cfgService.validateConfiguration('tasks', validTasks).isValid, true);

	// Autocomplete keys
	const floatCompletions = cfgService.getCompletions('settings', 'float');
	assert.ok(floatCompletions.includes('float.ai.enabled'));
	assert.ok(floatCompletions.includes('float.cursorTab.enabled'));
	assert.ok(floatCompletions.includes('float.debugAutoRepair.enabled'));

	await mockVscode.commands.executeCommand('config.validate');
	cfgExt.deactivate();
	console.log('  ✓ Configuration Editing schema validation and autocomplete verified');

	// --------------------------------------------------------------------------
	// Test 10: Scanner Integration Check with Code-OSS builtinExtensionsPath
	// --------------------------------------------------------------------------
	console.log('\n[Test 10] Testing Code-OSS builtinExtensionsPath Scanner Discovery Contract...');
	// Verify every extension is discoverable from root extensions directory
	const discoveredDirs = fs.readdirSync(EXTENSIONS_DIR).filter(item => {
		const full = path.join(EXTENSIONS_DIR, item);
		return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'package.json'));
	});

	for (const expected of EXPECTED_EXTENSIONS) {
		assert.ok(discoveredDirs.includes(expected), `Extensions scanner must discover '${expected}'`);
	}
	console.log(`  ✓ Code-OSS builtinExtensionsPath successfully discovered all ${discoveredDirs.length} extensions (including ${EXPECTED_EXTENSIONS.length} core language extensions)`);

	console.log('\n================================================================');
	console.log('  [ALL SPRINT 5 TESTS PASSED] 100% GREEN (10/10 Verified)');
	console.log('================================================================\n');
}

runSprint5Tests().catch(err => {
	console.error('\n[FAIL] Sprint 5 verification failed:', err);
	process.exit(1);
});
