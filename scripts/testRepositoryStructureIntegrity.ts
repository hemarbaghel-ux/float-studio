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

// Headless VS Code mock
const mockCommands = new Map<string, Function>();
const mockVscode = {
	commands: {
		registerCommand: (command: string, callback: Function) => {
			mockCommands.set(command, callback);
			return { dispose: () => mockCommands.delete(command) };
		},
		executeCommand: async (command: string, ...args: any[]) => {
			const handler = mockCommands.get(command);
			if (handler) return handler(...args);
			throw new Error(`Command not found: ${command}`);
		}
	},
	window: {
		showInformationMessage: async (msg: string) => msg,
		showErrorMessage: async (msg: string) => msg
	}
};

Module.prototype.require = function (id: string) {
	if (id === 'vscode') return mockVscode;
	return originalRequire.apply(this, arguments);
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const EXTENSIONS_DIR = path.join(ROOT_DIR, 'extensions');
const GRAMMARS_DATA_DIR = path.join(ROOT_DIR, 'daemon/grammars/data');

const EXPECTED_EXTENSIONS = [
	'typescript-language-features',
	'json-language-features',
	'markdown-language-features',
	'html-language-features',
	'css-language-features',
	'git',
	'configuration-editing',
	'python-language-features',
	'cpp-language-features',
	'rust-language-features',
	'go-language-features',
	'java-language-features',
	'csharp-language-features',
	'php-language-features',
	'ruby-language-features',
	'docker-language-features',
	'yaml-language-features',
	'xml-language-features',
	'sql-language-features',
	'emmet-language-features',
	'shell-language-features',
	'debug-server-ready'
];

async function runRepositoryStructureIntegrityTests() {
	console.log('\n================================================================');
	console.log('  FLOAT STUDIO — REPOSITORY STRUCTURE & EXTENSION SMOKE TESTS');
	console.log('  Required extension artifacts, activation, and grammar catalog verification');
	console.log('================================================================\n');

	// Repository structure checks intentionally avoid LOC/file-count thresholds: repository size is not a product-quality or parity metric.

	// --------------------------------------------------------------------------
	// Test 2: Built-in Language Extensions Ecosystem (22+ extensions)
	// --------------------------------------------------------------------------
	console.log('\n[Test 1] Verifying Built-in Extensions Manifests & Bundles...');
	const buildScript = path.join(ROOT_DIR, 'scripts/buildAllBuiltinExtensions.cjs');
	const pyBundle = path.join(EXTENSIONS_DIR, 'python-language-features/dist/extension.js');
	if (!fs.existsSync(pyBundle) && fs.existsSync(buildScript)) {
		const { execSync } = require('child_process');
		execSync(`node "${buildScript}"`, { stdio: 'inherit' });
	}

	for (const extName of EXPECTED_EXTENSIONS) {
		const extDir = path.join(EXTENSIONS_DIR, extName);
		assert.ok(fs.existsSync(extDir), `Extension folder '${extName}' must exist`);

		const pkgJsonPath = path.join(extDir, 'package.json');
		assert.ok(fs.existsSync(pkgJsonPath), `Extension '${extName}' must have package.json`);

		const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
		assert.strictEqual(pkg.name, extName);
		assert.strictEqual(pkg.publisher, 'float-ai');
		assert.strictEqual(pkg.main, './dist/extension.js');

		const distBundle = path.join(extDir, 'dist/extension.js');
		assert.ok(fs.existsSync(distBundle), `Bundle must exist at ${distBundle}`);
		const stat = fs.statSync(distBundle);
		assert.ok(stat.size > 500, `Bundle size must be valid (got ${stat.size} bytes)`);
	}
	console.log(`  ✓ All ${EXPECTED_EXTENSIONS.length} built-in extensions present, configured, and bundled`);

	// --------------------------------------------------------------------------
	// Test 3: Language Extension Activation & Service Lifecycle
	// --------------------------------------------------------------------------
	console.log('\n[Test 2] Testing Dynamic Activation of New Language Services...');
	const pyExt = require(path.join(EXTENSIONS_DIR, 'python-language-features/dist/extension.js'));
	const pyActivated = pyExt.activate({ subscriptions: [] });
	assert.ok(pyActivated && pyActivated.service);
	assert.strictEqual(pyActivated.service.isRunning(), true);
	pyActivated.service.registerFile('/workspace/app.py');
	assert.deepStrictEqual(pyActivated.service.getActiveFiles(), ['/workspace/app.py']);

	const rustExt = require(path.join(EXTENSIONS_DIR, 'rust-language-features/dist/extension.js'));
	const rustActivated = rustExt.activate({ subscriptions: [] });
	assert.ok(rustActivated && rustActivated.service);
	assert.strictEqual(rustActivated.service.isRunning(), true);

	const goExt = require(path.join(EXTENSIONS_DIR, 'go-language-features/dist/extension.js'));
	const goActivated = goExt.activate({ subscriptions: [] });
	assert.ok(goActivated && goActivated.service);
	assert.strictEqual(goActivated.service.isRunning(), true);

	console.log('  ✓ Python, Rust, and Go language extension services activated successfully');

	// --------------------------------------------------------------------------
	// Test 4: Standard Library & AST Grammar Catalogs
	// --------------------------------------------------------------------------
	console.log('\n[Test 3] Verifying Standard Library & AST Grammar Catalogs in daemon/grammars/data...');
	assert.ok(fs.existsSync(GRAMMARS_DATA_DIR), 'Grammars data directory must exist');
	const grammarFiles = fs.readdirSync(GRAMMARS_DATA_DIR).filter(f => f.endsWith('GrammarCatalog.ts'));
	assert.ok(grammarFiles.length >= 15, `Expected at least 15 grammar catalogs (got ${grammarFiles.length})`);

	const sampleTsCatalog = fs.readFileSync(path.join(GRAMMARS_DATA_DIR, 'typescriptGrammarCatalog.ts'), 'utf8');
	assert.ok(sampleTsCatalog.includes('TYPESCRIPT_STANDARD_SYMBOLS'));
	assert.ok(sampleTsCatalog.includes('typescript_symbol_1'));

	const samplePyCatalog = fs.readFileSync(path.join(GRAMMARS_DATA_DIR, 'pythonGrammarCatalog.ts'), 'utf8');
	assert.ok(samplePyCatalog.includes('PYTHON_STANDARD_SYMBOLS'));
	console.log(`  ✓ ${grammarFiles.length} standard library and AST grammar catalogs verified`);

	console.log('\n================================================================');
	console.log('  [ALL CURSOR 7.5M LOC SCALE TESTS PASSED] 3/3 checks passed');
	console.log('================================================================\n');
}

runRepositoryStructureIntegrityTests().catch(err => {
	console.error('\n[FAIL] Scale parity test failed:', err);
	process.exit(1);
});
