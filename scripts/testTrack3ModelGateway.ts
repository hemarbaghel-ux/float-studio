/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { FloatLocalOllamaProvider, IFloatOllamaModelTag } from '../desktop/src/vs/workbench/contrib/float/common/model-runtime/floatLocalOllamaProvider.js';
import { FloatAuthService } from '../desktop/src/vs/workbench/contrib/float/common/auth/floatAuthService.js';
import { registerDynamicModel, calculateModelCost, getFloatModel } from '../desktop/src/vs/workbench/contrib/float/common/model-runtime/floatModelRegistry.js';
import { FloatCostStatusContribution } from '../desktop/src/vs/workbench/contrib/float/browser/telemetry/floatCostStatusContribution.js';

console.log('🧪 Starting Track 3: Model Gateway & BYOK / Local Ollama Inference Tests...\n');

class MockSecretStorageService {
	private readonly _store = new Map<string, string>();

	async get(key: string): Promise<string | undefined> {
		return this._store.get(key);
	}

	async set(key: string, value: string): Promise<void> {
		this._store.set(key, value);
	}

	async delete(key: string): Promise<void> {
		this._store.delete(key);
	}
}

class MockStatusbarService {
	public entries: any[] = [];

	addEntry(entry: any, id: string, alignment: any, priority: number) {
		const accessor = {
			entry,
			id,
			update: (newEntry: any) => {
				accessor.entry = newEntry;
			},
			dispose: () => {
				const idx = this.entries.indexOf(accessor);
				if (idx >= 0) {
					this.entries.splice(idx, 1);
				}
			}
		};
		this.entries.push(accessor);
		return accessor;
	}
}

async function runTests() {
	// =========================================================================
	// Test 1: FloatLocalOllamaProvider Discovery & NDJSON Streaming
	// =========================================================================
	console.log('Test 1: FloatLocalOllamaProvider Discovery & NDJSON Streaming...');

	const originalFetch = globalThis.fetch;

	try {
		// Mock Ollama /api/tags
		globalThis.fetch = async (url: any, opts: any) => {
			const urlStr = String(url);

			if (urlStr.endsWith('/api/tags')) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						models: [
							{
								name: 'llama3.2:latest',
								model: 'llama3.2',
								modified_at: '2026-11-01T00:00:00Z',
								size: 2000000000,
								digest: 'sha256:abc'
							},
							{
								name: 'deepseek-coder-v2:16b',
								model: 'deepseek-coder-v2',
								modified_at: '2026-11-01T00:00:00Z',
								size: 8900000000,
								digest: 'sha256:def'
							}
						]
					})
				} as any;
			}

			if (urlStr.endsWith('/api/chat')) {
				const body = JSON.parse(opts.body);
				assert.strictEqual(body.model, 'llama3.2:latest');

				// Simulate streaming NDJSON chunks
				const chunks = [
					JSON.stringify({
						model: 'llama3.2:latest',
						created_at: new Date().toISOString(),
						message: { role: 'assistant', content: 'def ' },
						done: false
					}) + '\n',
					JSON.stringify({
						model: 'llama3.2:latest',
						created_at: new Date().toISOString(),
						message: { role: 'assistant', content: 'solve():\n    return 42' },
						done: false
					}) + '\n',
					JSON.stringify({
						model: 'llama3.2:latest',
						created_at: new Date().toISOString(),
						message: { role: 'assistant', content: '' },
						done: true,
						prompt_eval_count: 15,
						eval_count: 10,
						total_duration: 120000000
					}) + '\n'
				];

				let chunkIdx = 0;
				const stream = new ReadableStream({
					pull(controller) {
						if (chunkIdx < chunks.length) {
							const encoder = new TextEncoder();
							controller.enqueue(encoder.encode(chunks[chunkIdx]));
							chunkIdx++;
						} else {
							controller.close();
						}
					}
				});

				return {
					ok: true,
					status: 200,
					body: stream
				} as any;
			}

			if (urlStr.endsWith('/api/generate')) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						response: 'const x = 10;'
					})
				} as any;
			}

			return { ok: false, status: 404 } as any;
		};

		const provider = new FloatLocalOllamaProvider('http://localhost:11434');

		// 1. Availability check
		const available = await provider.isAvailable();
		assert.strictEqual(available, true, 'Ollama provider should be available');

		// 2. List models
		const models = await provider.listModels();
		assert.strictEqual(models.length, 2);
		assert.strictEqual(models[0].name, 'llama3.2:latest');

		const converted = provider.convertToFloatModels(models);
		assert.strictEqual(converted.length, 2);
		assert.strictEqual(converted[0].provider, 'ollama');
		assert.strictEqual(converted[0].id, 'ollama/llama3.2:latest');

		// 3. Stream chat
		const receivedChunks: string[] = [];
		let completedFullText = '';
		let completedMeta: any = null;

		await provider.streamChat(
			{
				model: 'ollama/llama3.2:latest',
				messages: [{ role: 'user', content: 'Write a python function' }]
			},
			{
				onChunk: (chunk) => receivedChunks.push(chunk),
				onError: (err) => { throw err; },
				onComplete: (fullText, metadata) => {
					completedFullText = fullText;
					completedMeta = metadata;
				}
			}
		);

		assert.strictEqual(completedFullText, 'def solve():\n    return 42');
		assert.strictEqual(completedMeta?.usage?.isLocalInference, true);
		assert.strictEqual(completedMeta?.usage?.estimatedCostUsd, 0.0);
		assert.strictEqual(completedMeta?.usage?.promptTokens, 15);
		assert.strictEqual(completedMeta?.usage?.completionTokens, 10);
		console.log('  ✓ Ollama tags listed and streamed NDJSON with 0.00 USD local inference cost.');

		// 4. Code Completion
		const completion = await provider.completeCode({
			prefix: 'function test() { ',
			suffix: ' }',
			model: 'ollama/deepseek-coder-v2:16b'
		});
		assert.strictEqual(completion.completion, 'const x = 10;');
		console.log('  ✓ Ollama fast FIM code completion verified.');
	} finally {
		globalThis.fetch = originalFetch;
	}

	// =========================================================================
	// Test 2: Bring-Your-Own-Key (BYOK) in FloatAuthService
	// =========================================================================
	console.log('\nTest 2: Bring-Your-Own-Key (BYOK) in FloatAuthService...');

	const secretStorage = new MockSecretStorageService();
	const authService = new FloatAuthService(secretStorage as any);

	let eventFired = false;
	authService.onDidChangeBYOKKey(e => {
		if (e.provider === 'anthropic' && e.hasKey) {
			eventFired = true;
		}
	});

	await authService.setBYOKKey('anthropic', 'sk-ant-api03-test-secret-key-12345');
	assert.strictEqual(authService.hasBYOKKey('anthropic'), true);
	assert.strictEqual(authService.getBYOKKey('anthropic'), 'sk-ant-api03-test-secret-key-12345');
	assert.strictEqual(eventFired, true, 'onDidChangeBYOKKey event must fire');

	// Verify persistence in SecretStorage
	const persisted = await secretStorage.get('float.byok.anthropic');
	assert.strictEqual(persisted, 'sk-ant-api03-test-secret-key-12345');

	// Check provider list
	await authService.setBYOKKey('openai', 'sk-proj-testkey9876');
	const providers = authService.getAllBYOKProviders();
	assert(providers.includes('anthropic'));
	assert(providers.includes('openai'));
	console.log('  ✓ BYOK keys safely persisted in OS SecretStorage and verified.');

	// =========================================================================
	// Test 3: Model Registry & Dynamic Cost Engine
	// =========================================================================
	console.log('\nTest 3: Model Registry & Dynamic Cost Engine...');

	// Test Cost Engine
	const localCost = calculateModelCost('ollama/llama3.2', 5000, 2000);
	assert.strictEqual(localCost, 0.0, 'Local Ollama must cost $0.00');

	const gptCost = calculateModelCost('gpt-6-astra', 100000, 20000);
	// (100k / 1M) * 1.5 + (20k / 1M) * 6.0 = 0.15 + 0.12 = 0.27
	assert.strictEqual(gptCost, 0.27);

	const claudeCost = calculateModelCost('claude-3-5-sonnet', 100000, 20000);
	// (100k / 1M) * 3.0 + (20k / 1M) * 15.0 = 0.30 + 0.30 = 0.60
	assert.strictEqual(claudeCost, 0.60);

	// Register dynamic Ollama model in registry
	registerDynamicModel({
		id: 'ollama/llama3.2',
		name: 'Llama 3.2 (Local)',
		provider: 'ollama',
		upstreamModelId: 'llama3.2',
		isRoutingAlias: false,
		contextWindow: 128000,
		supportsStreaming: true,
		capabilities: { coding: true, reasoning: false, vision: false, tools: false, streaming: true }
	});

	const retrieved = getFloatModel('ollama/llama3.2');
	assert.strictEqual(retrieved?.provider, 'ollama');
	console.log('  ✓ Model registry dynamic expansion and multi-provider cost engine verified.');

	// =========================================================================
	// Test 4: Status Bar Token & Cost Telemetry Widget
	// =========================================================================
	console.log('\nTest 4: Status Bar Token & Cost Telemetry Widget...');

	const statusbar = new MockStatusbarService();
	const costStatus = new FloatCostStatusContribution(statusbar as any, authService);

	assert.strictEqual(statusbar.entries.length, 1);
	let entry = statusbar.entries[0].entry;
	assert(entry.text.includes('Ready'));

	// Record cloud usage
	costStatus.recordUsage('gpt-6-astra', 50000, 10000, 350);
	let telemetry = costStatus.getTelemetry();
	assert.strictEqual(telemetry.totalPromptTokens, 50000);
	assert.strictEqual(telemetry.totalCompletionTokens, 10000);
	assert.strictEqual(telemetry.requestCount, 1);
	assert.strictEqual(telemetry.lastLatencyMs, 350);
	assert.strictEqual(telemetry.totalCostUsd, 0.135);

	entry = statusbar.entries[0].entry;
	assert(entry.text.includes('60,000 tok'));
	assert(entry.text.includes('$0.1350'));
	assert(entry.tooltip.includes('Active Model: gpt-6-astra'));

	// Record local Ollama usage
	costStatus.recordUsage('ollama/llama3.2', 20000, 5000, 120);
	telemetry = costStatus.getTelemetry();
	assert.strictEqual(telemetry.isLocalOllama, true);
	assert.strictEqual(telemetry.totalCostUsd, 0.135, 'Ollama usage must not increase USD cost');

	entry = statusbar.entries[0].entry;
	assert(entry.text.includes('🦙'));
	assert(entry.text.includes('85,000 tok'));

	costStatus.dispose();
	assert.strictEqual(statusbar.entries.length, 0, 'Statusbar entry must be cleaned up on dispose');
	console.log('  ✓ Status bar cost and token telemetry widget verified.');

	console.log('\n✅ All Track 3 Model Gateway & BYOK / Local Ollama tests PASSED successfully!\n');
}

runTests().catch(err => {
	console.error('❌ Test failed with error:', err);
	process.exit(1);
});
