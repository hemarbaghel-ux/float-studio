/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IFloatDaemonRuntimeService } from '../../common/daemon/floatDaemonRuntimeService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';

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

	constructor(
		private readonly _runtimeService?: IFloatDaemonRuntimeService,
		private readonly _workspaceContextService?: IWorkspaceContextService
	) {}

	/**
	 * Converts the editor's absolute file path to the exact path used by the
	 * daemon index. Multi-root workspaces add workspace-N/ prefixes, so a
	 * basename/suffix-only comparison can accidentally hide another root's
	 * same-relative-path file instead of the active file.
	 */
	private _resolveIndexedActiveFilePath(activeFilePath: string): string | undefined {
		const roots = this._workspaceContextService?.getWorkspace().folders
			.filter(folder => folder.uri.scheme === 'file')
			.map(folder => folder.uri);

		if (!roots || roots.length === 0) {
			return undefined;
		}

		const normalizedActivePath = activeFilePath.replace(/\\/g, '/');
		let bestMatch: { relativePath: string; index: number; rootLength: number } | undefined;

		for (let index = 0; index < roots.length; index++) {
			const rootPath = roots[index].path.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
			const prefix = rootPath === '/' ? '/' : rootPath + '/';
			if (!normalizedActivePath.startsWith(prefix)) {
				continue;
			}

			const relativePath = normalizedActivePath.slice(prefix.length).replace(/^\\/+/, '');
			if (!relativePath) {
				continue;
			}
			if (!bestMatch || rootPath.length > bestMatch.rootLength) {
				bestMatch = { relativePath, index, rootLength: rootPath.length };
			}
		}

		if (!bestMatch) {
			return undefined;
		}

		return roots.length > 1
			? `workspace-${bestMatch.index + 1}/${bestMatch.relativePath}`
			: bestMatch.relativePath;
	}

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
			const indexedActivePath = this._resolveIndexedActiveFilePath(activeFilePath)?.toLowerCase();
			const parts: string[] = [];
			let totalChars = 0;
			for (const rawMatch of result.matches) {
				const match = rawMatch as IFloatAutocompleteSearchMatch;
				const filePath = typeof match.filePath === 'string' ? match.filePath : '';
				const snippet = typeof match.snippet === 'string' ? match.snippet.trim() : '';
				if (!filePath || !snippet) {
					continue;
				}

				const normalizedMatchPath = filePath.replace(/\\/g, '/').toLowerCase();
				const isActiveFile = indexedActivePath
					? normalizedMatchPath === indexedActivePath
					: normalizedMatchPath === normalizedActivePath ||
						normalizedActivePath.endsWith('/' + normalizedMatchPath);
				if (isActiveFile) {
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
