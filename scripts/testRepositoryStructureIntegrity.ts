import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FloatTreeSitterGrammarRegistry } from '../daemon/src/grammars/floatTreeSitterGrammarRegistry.js';

const root = process.cwd();
const extensionsRoot = path.join(root, 'extensions');
const expectedExtensions = [
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
  'debug-server-ready',
];

for (const extensionName of expectedExtensions) {
  const extensionRoot = path.join(extensionsRoot, extensionName);
  const manifestPath = path.join(extensionRoot, 'package.json');
  const bundlePath = path.join(extensionRoot, 'dist', 'extension.js');
  assert.ok(fs.existsSync(manifestPath), `Missing extension manifest: ${extensionName}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.ok(typeof manifest.name === 'string' && manifest.name.length > 0, `Invalid extension name: ${extensionName}`);
  assert.ok(fs.existsSync(bundlePath), `Missing built extension bundle: ${extensionName}`);
}

const grammarRegistry = new FloatTreeSitterGrammarRegistry();
const languages = grammarRegistry.getSupportedLanguages();
for (const language of ['typescript', 'python', 'rust', 'go', 'cpp', 'java', 'ruby', 'php']) {
  assert.ok(languages.includes(language), `Missing daemon grammar support: ${language}`);
}

assert.ok(!fs.existsSync(path.join(root, 'benchmarks', 'swe-bench', 'data')), 'Synthetic SWE-bench task bank must not be required');
assert.ok(!fs.existsSync(path.join(root, 'daemon', 'grammars', 'data')), 'Synthetic LOC-padding grammar catalog must not be required');

console.log(`Repository integrity passed: ${expectedExtensions.length} built-in extensions and ${languages.length} runtime grammar registrations verified.`);
