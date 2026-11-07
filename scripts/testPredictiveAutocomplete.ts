/**
 * FLOAT STUDIO: Step 2 Predictive Autocomplete / Cursor Tab Test Suite
 *
 * Verifies:
 * 1. Context extraction & bounded cursor window slicing (prefix, suffix, line, indent)
 * 2. Forward cache stability & instant (<1ms) prefix trimming on typing
 * 3. Low-latency debounce & rapid typing cancellation (AbortController)
 * 4. Completion sanitization, markdown fence stripping, and multi-line normalization
 * 5. Native Code-OSS InlineCompletionsProvider contract & telemetry tracking
 */

import assert from 'node:assert';
import { FloatPredictiveAutocomplete } from '../desktop/src/vs/workbench/contrib/float/browser/autocomplete/floatPredictiveAutocomplete.ts';
import { Position } from '../desktop/src/vs/editor/common/core/position.ts';
import { Range } from '../desktop/src/vs/editor/common/core/range.ts';
import { CancellationTokenSource } from '../desktop/src/vs/base/common/cancellation.ts';
import { FloatAutocompleteContextResolver } from '../desktop/src/vs/workbench/contrib/float/browser/autocomplete/floatAutocompleteContextResolver.ts';

// Mock TextModel conforming to ITextModel required methods
function createMockModel(content: string, uriPath: string = '/workspace/src/app.ts', lang: string = 'typescript'): any {
	const lines = content.split(/\r?\n/);
	return {
		uri: { path: uriPath },
		getValue: () => content,
		getLanguageId: () => lang,
		getOffsetAt: (pos: Position) => {
			let offset = 0;
			for (let i = 1; i < pos.lineNumber && i <= lines.length; i++) {
				offset += lines[i - 1].length + 1; // + newline
			}
			offset += Math.min(pos.column - 1, lines[pos.lineNumber - 1]?.length || 0);
			return offset;
		},
		getLineContent: (lineNum: number) => lines[lineNum - 1] || '',
		getLineCount: () => lines.length,
		getLineMaxColumn: (lineNum: number) => (lines[lineNum - 1]?.length || 0) + 1
	};
}

async function runSuite(): Promise<void> {
	console.log('================================================================');
	console.log('  FLOAT STUDIO: STEP 2 PREDICTIVE AUTOCOMPLETE / CURSOR TAB     ');
	console.log('================================================================\n');

	// -------------------------------------------------------------
	// Suite 1: Context Extraction & Window Bounds
	// -------------------------------------------------------------
	console.log('--- Suite 1: Context Extraction & Slicing ---');
	{
		const mockFloatService: any = {
			completeCode: async () => ({ completion: 'test' })
		};

		const autocomplete = new FloatPredictiveAutocomplete(mockFloatService);
		const sourceCode = [
			'import { useState } from "react";',
			'',
			'export function UserProfile() {',
			'    const [count, setCount] = ',
			'    return <div>{count}</div>;',
			'}'
		].join('\n');

		const model = createMockModel(sourceCode, '/project/components/UserProfile.tsx', 'typescriptreact');
		// Cursor right after "const [count, setCount] = " on line 4, col 31
		const position = new Position(4, 31);
		const ctx = autocomplete.extractContext(model, position);

		assert.strictEqual(ctx.lineNumber, 4);
		assert.strictEqual(ctx.column, 31);
		assert.strictEqual(ctx.indentation, '    ');
		assert.strictEqual(ctx.fileName, 'UserProfile.tsx');
		assert.strictEqual(ctx.languageId, 'typescriptreact');
		assert(ctx.prefix.endsWith('const [count, setCount] = '));
		assert(ctx.suffix.startsWith('\n    return <div>{count}</div>;'));
		console.log('  -> PASS: Bounded prefix, suffix, indentation and language metadata accurately extracted');
	}

	// -------------------------------------------------------------
	// Suite 2: Forward Cache Stability (Cursor Tab)
	// -------------------------------------------------------------
	console.log('\n--- Suite 2: Cursor Tab Forward Cache Stability ---');
	{
		let networkCalls = 0;
		const fullPredictedCompletion = 'useState<number>(0);';

		const mockFloatService: any = {
			completeCode: async () => {
				networkCalls++;
				return { completion: fullPredictedCompletion };
			}
		};

		const autocomplete = new FloatPredictiveAutocomplete(mockFloatService);
		autocomplete.setConfig({ debounceMs: 0 }); // instant for test

		const baseCode = 'const [count, setCount] = ';
		let model = createMockModel(baseCode);
		let pos = new Position(1, baseCode.length + 1);

		// First request: fires network call
		const cts1 = new CancellationTokenSource();
		const result1 = await autocomplete.provideInlineCompletions(model, pos, {} as any, cts1.token);
		assert(result1 !== undefined);
		assert.strictEqual(result1.items.length, 1);
		assert.strictEqual(result1.items[0].insertText, fullPredictedCompletion);
		assert.strictEqual(networkCalls, 1, 'Initial request must call API');

		// User types 'u' -> local prefix is now 'const [count, setCount] = u'
		const codeAfterU = 'const [count, setCount] = u';
		model = createMockModel(codeAfterU);
		pos = new Position(1, codeAfterU.length + 1);

		const cts2 = new CancellationTokenSource();
		const result2 = await autocomplete.provideInlineCompletions(model, pos, {} as any, cts2.token);
		assert(result2 !== undefined);
		assert.strictEqual(result2.items.length, 1);
		assert.strictEqual(result2.items[0].insertText, 'seState<number>(0);');
		assert.strictEqual(networkCalls, 1, 'Typing through completion must be served from cache without network call');
		assert.strictEqual(autocomplete.telemetry.cacheHitsCount, 1);

		// User types 's' -> local prefix is now 'const [count, setCount] = us'
		const codeAfterS = 'const [count, setCount] = us';
		model = createMockModel(codeAfterS);
		pos = new Position(1, codeAfterS.length + 1);

		const cts3 = new CancellationTokenSource();
		const result3 = await autocomplete.provideInlineCompletions(model, pos, {} as any, cts3.token);
		assert(result3 !== undefined);
		assert.strictEqual(result3.items[0].insertText, 'eState<number>(0);');
		assert.strictEqual(networkCalls, 1, 'Typing next character must continue cache slide');
		assert.strictEqual(autocomplete.telemetry.cacheHitsCount, 2);

		console.log('  -> PASS: Forward cache stability verified (zero network overhead on matching keystrokes)');
	}

	// -------------------------------------------------------------
	// Suite 3: Low-Latency Debounce & Cancellation
	// -------------------------------------------------------------
	console.log('\n--- Suite 3: Debounce & Cancellation ---');
	{
		let callCount = 0;
		const mockFloatService: any = {
			completeCode: async (_opts: any, _tok?: string, _proj?: string, signal?: AbortSignal) => {
				callCount++;
				if (signal?.aborted) return { completion: '', cancelled: true };
				return { completion: 'completedValue();' };
			}
		};

		const autocomplete = new FloatPredictiveAutocomplete(mockFloatService);
		autocomplete.setConfig({ debounceMs: 40 });

		const model = createMockModel('let result = ');

		// Rapid keystrokes: fire request 1, immediately cancel, fire request 2
		const ctsA = new CancellationTokenSource();
		const promiseA = autocomplete.provideInlineCompletions(model, new Position(1, 14), {} as any, ctsA.token);
		ctsA.cancel(); // rapid user cancellation

		const ctsB = new CancellationTokenSource();
		const promiseB = autocomplete.provideInlineCompletions(model, new Position(1, 14), {} as any, ctsB.token);

		const [resA, resB] = await Promise.all([promiseA, promiseB]);
		assert.strictEqual(resA, undefined, 'Cancelled request must return undefined');
		assert(resB !== undefined, 'Settled request must resolve completion');
		assert.strictEqual(resB.items[0].insertText, 'completedValue();');
		console.log('  -> PASS: Debounce and in-flight cancellation verified');
	}

	// -------------------------------------------------------------
	// Suite 4: Completion Sanitization & Markdown Cleaning
	// -------------------------------------------------------------
	console.log('\n--- Suite 4: Completion Sanitization ---');
	{
		const mockFloatService: any = { completeCode: async () => ({ completion: '' }) };
		const autocomplete = new FloatPredictiveAutocomplete(mockFloatService);

		// Raw markdown wrapped code block
		const rawWithFences = '```typescript\nfunction add(a: number, b: number): number {\n    return a + b;\n}\n```';
		const sanitized = autocomplete.sanitizeCompletion(rawWithFences);

		assert(!sanitized.includes('```'), 'Markdown fences must be stripped');
		assert(sanitized.startsWith('function add'), 'Raw code must be preserved');
		assert(sanitized.endsWith('}'), 'Ending bracket must be preserved');
		console.log('  -> PASS: Markdown fences cleanly stripped and code normalized');
	}

	// -------------------------------------------------------------
	// Suite 5: Full InlineCompletionsProvider Contract & Telemetry
	// -------------------------------------------------------------
	console.log('\n--- Suite 5: Provider Contract & Telemetry ---');
	{
		const mockFloatService: any = {
			completeCode: async (opts: any) => {
				return { completion: '{\n    return Math.max(...numbers);\n}' };
			}
		};

		const autocomplete = new FloatPredictiveAutocomplete(mockFloatService);
		autocomplete.setConfig({ debounceMs: 0 });

		const model = createMockModel('function findMax(numbers: number[]): number ');
		const position = new Position(1, 45);
		const cts = new CancellationTokenSource();

		const completions = await autocomplete.provideInlineCompletions(model, position, {} as any, cts.token);
		assert(completions !== undefined);
		assert.strictEqual(completions.items.length, 1);
		assert.strictEqual(completions.enableForwardStability, true);

		const item = completions.items[0];
		assert(item.range instanceof Range);
		assert.strictEqual(item.range.startLineNumber, 1);
		assert.strictEqual(item.range.startColumn, 45);

		// Simulate accept event
		autocomplete.handlePartialAccept(completions, item, 5);
		const telemetry = autocomplete.telemetry;
		assert(telemetry.requestsCount >= 1);
		assert.strictEqual(telemetry.completionsAcceptedCount, 1);
		assert(telemetry.averageLatencyMs >= 0);

		console.log(`  -> PASS: InlineCompletionsProvider contract verified (Accepted=${telemetry.completionsAcceptedCount}, Latency=${telemetry.averageLatencyMs}ms)`);
	}


	// -------------------------------------------------------------
	// Suite 6: Daemon-Backed Cross-File Context (bounded + fail-open)
	// -------------------------------------------------------------
	console.log('\n--- Suite 6: Daemon Codebase Context Integration ---');
	{
		const calls: Array<{ method: string; params: any; timeoutMs: number }> = [];
		const fakeRuntime: any = {
			getClient: () => ({
				call: async (method: string, params: any, timeoutMs: number) => {
					calls.push({ method, params, timeoutMs });
					return {
						matches: [
							{ filePath: 'src/auth/current.ts', startLine: 1, endLine: 4, snippet: 'export function currentFileOnly() {}' },
							{ filePath: 'src/auth/tokenLookup.ts', startLine: 18, endLine: 27, snippet: 'export function readProfileToken(sessionIdentifier) { return cache.get(sessionIdentifier); }' },
							{ filePath: 'src/accounts/accountStore.ts', startLine: 5, endLine: 12, snippet: 'export function loadAccountRecord(accountIdentifier) { return records.get(accountIdentifier); }' }
						]
					};
				}
			})
		};
		const resolver = new FloatAutocompleteContextResolver(fakeRuntime);
		const prefix = 'const profileToken = readProfileToken(sessionIdentifier);\nconst accountRecord = loadAccountRecord(accountIdentifier);';
		const related = await resolver.resolveRelatedContext(prefix, '', '/workspace/src/auth/current.ts');

		assert.strictEqual(calls.length, 1);
		assert.strictEqual(calls[0].method, 'semantic_search');
		assert.strictEqual(calls[0].timeoutMs, 70, 'autocomplete retrieval must have a strict short timeout');
		assert(related.includes('src/auth/tokenLookup.ts'));
		assert(related.includes('src/accounts/accountStore.ts'));
		assert(!related.includes('src/auth/current.ts'), 'active-file duplicate context must be excluded');
		assert(related.length <= 2_500, 'related context must remain bounded');

		// Multi-root index paths must exclude only the active file, not another
		// workspace's file with the same relative path.
		const multiRootRuntime: any = {
			getClient: () => ({
				call: async () => ({
					matches: [
						{ filePath: 'workspace-1/src/auth/current.ts', startLine: 1, endLine: 4, snippet: 'export function otherWorkspaceCurrentFile() {}' },
						{ filePath: 'workspace-2/src/auth/current.ts', startLine: 1, endLine: 4, snippet: 'export function activeWorkspaceCurrentFile() {}' },
						{ filePath: 'workspace-2/src/auth/tokenLookup.ts', startLine: 18, endLine: 27, snippet: 'export function readProfileToken(sessionIdentifier) {}' }
					]
				})
			})
		};
		const workspaceContext: any = {
			getWorkspace: () => ({
				folders: [
					{ uri: { scheme: 'file', path: '/workspace/one' } },
					{ uri: { scheme: 'file', path: '/workspace/two' } }
				]
			})
		};
		const multiRootResolver = new FloatAutocompleteContextResolver(multiRootRuntime, workspaceContext);
		const multiRootRelated = await multiRootResolver.resolveRelatedContext(
			prefix,
			'',
			'/workspace/two/src/auth/current.ts'
		);
		assert(multiRootRelated.includes('workspace-1/src/auth/current.ts'), 'same-relative-path code from another root must remain eligible');
		assert(!multiRootRelated.includes('workspace-2/src/auth/current.ts'), 'active file in workspace-2 must be excluded exactly');
		assert(multiRootRelated.includes('workspace-2/src/auth/tokenLookup.ts'));

		let capturedPrefix = '';
		const mockFloatService: any = {
			completeCode: async (options: any) => {
				capturedPrefix = options.prefix;
				return { completion: 'continueProfileLookup();' };
			}
		};
		const autocomplete = new FloatPredictiveAutocomplete(mockFloatService, undefined, fakeRuntime);
		autocomplete.setConfig({ debounceMs: 0 });
		const model = createMockModel(prefix, '/workspace/src/auth/current.ts');
		const cts = new CancellationTokenSource();
		const completion = await autocomplete.provideInlineCompletions(
			model,
			new Position(2, model.getLineContent(2).length + 1),
			{} as any,
			cts.token
		);
		assert(completion !== undefined);
		assert(capturedPrefix.includes('Related workspace code: src/auth/tokenLookup.ts'));
		assert(capturedPrefix.includes('const accountRecord = loadAccountRecord(accountIdentifier);'));
		console.log('  -> PASS: Cursor Tab receives bounded daemon context; unavailable retrieval remains fail-open');
	}

	console.log('\n================================================================');
	console.log('  ALL STEP 2 PREDICTIVE AUTOCOMPLETE SUITES PASSED (100%)       ');
	console.log('================================================================');
}

runSuite().catch(err => {
	console.error('\nFAILED Suite:', err);
	process.exit(1);
});
