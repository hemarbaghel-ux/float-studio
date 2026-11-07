/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IFloatDaemonRuntimeService } from '../../common/daemon/floatDaemonRuntimeService.js';

interface IFloatAutocompleteSearchMatch {
	filePath?: unknown;
	startLine?: unknown;
	endLine?: unknown;
	snippet?: unknown;
}

interface IFloatAutocompleteSearchResult {
	matches?: unknown;
}

/**
 * Adds a small amount of related codebase context to inline completion prompts.
 * This is opportunistic: unavailable/slow daemon retrieval never blocks typing
 * for more than the configured RPC timeout and never disables normal completion.
 */
export class FloatAutocompleteContextResolver {
	private readonly _maxContextChars = 2_400;
	private readonly _maxResults = 2;
	private readonly _timeoutMs = 70;
	private readonly _ignoredIdentifiers = new Set([
		'const', 'let', 'var', 'function', 'return', 'class', 'interface', 'type',
		'public', 'private', 'protected', 'static', 'async', 'await', 'new',
		'this', 'super', 'import', 'export', 'from', 'default', 'true', 'false',
		'null', 'undefined', 'void', 'string', 'number', 'boolean', 'unknown',
		'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue',
		'try', 'catch', 'throw', 'extends', 'implements', 'as', 'of', 'in'
	]);

	constructor(private readonly _runtimeService?: IFloatDaemonRuntimeService) {}

	public async resolveRelatedContext(prefix: string, suffix: string, activeFilePath: string): Promise<string> {
		const client = this._runtimeService?.getClient();
		if (!client || prefix.trim().length < 24) {
			return '';
		}

		const identifiers = `${prefix.slice(-600)} ${suffix.slice(0, 200)}`.match(/[A-Za-z_$][\w$]{2,}/g) ?? [];
		const queryTokens = Array.from(new Set(identifiers.filter(token =>
			!this._ignoredIdentifiers.has(token.toLowerCase())
		))).slice(-10);
		if (queryTokens.length < 2) {
			return '';
		}

		const query = queryTokens.join(' ').slice(0, 450);
		try {
			const result = await client.call<IFloatAutocompleteSearchResult>(
				'semantic_search',
				{ query, topK: 5 },
				this._timeoutMs
			);
			if (!Array.isArray(result?.matches)) {
				return '';
			}

			const normalizedActivePath = activeFilePath.replace(/\\/g, '/').toLowerCase();
			const parts: string[] = [];
			let totalChars = 0;
			for (const rawMatch of result.matches) {
				const match = rawMatch as IFloatAutocompleteSearchMatch;
				const filePath = typeof match.filePath === 'string' ? match.filePath : '';
				const snippet = typeof match.snippet === 'string' ? match.snippet.trim() : '';
				if (!filePath || !snippet) {
					continue;
				}

				const normalizedMatchPath = filePath.replace(/\\\\/g, '/').toLowerCase();
				if (
					normalizedMatchPath === normalizedActivePath ||
					normalizedActivePath.endsWith('/' + normalizedMatchPath)
				) {
					continue;
				}

				const safeSnippet = snippet.slice(0, 1_000);
				const startLine = typeof match.startLine === 'number' ? match.startLine : undefined;
				const endLine = typeof match.endLine === 'number' ? match.endLine : undefined;
				const lineLabel = startLine
					? `L${startLine}${endLine && endLine !== startLine ? `-L${endLine}` : ''}`
					: 'location unavailable';
				const part = `// Related workspace code: ${filePath} (${lineLabel})\n${safeSnippet}`;
				if (totalChars + part.length > this._maxContextChars) {
					break;
				}
				parts.push(part);
				totalChars += part.length;
				if (parts.length >= this._maxResults) {
					break;
				}
			}
			return parts.length > 0
				? `// FLOAT related code context. Reference only; current file remains authoritative.\n${parts.join('\n\n')}`
				: '';
		} catch {
			// Daemon offline, timed out or rebuilding: keep ordinary inline completion.
			return '';
		}
	}
}
