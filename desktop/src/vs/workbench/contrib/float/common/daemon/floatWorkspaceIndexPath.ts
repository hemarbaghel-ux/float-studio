/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';

/**
 * Maps an absolute editor URI path to the relative path used by the daemon
 * workspace index. The synchronizer filters to local file roots, chooses the
 * deepest matching root for nested folders and prefixes multi-root paths.
 */
export function getFloatIndexedWorkspacePath(
	activeFilePath: string,
	workspaceFolders: readonly URI[]
): string | undefined {
	const roots = workspaceFolders.filter(root => root.scheme === 'file');
	if (roots.length === 0) {
		return undefined;
	}

	const normalizedActivePath = activeFilePath.replace(/\\/g, '/');
	const activePathLower = normalizedActivePath.toLowerCase();
	let bestMatch: { relativePath: string; index: number; rootLength: number } | undefined;

	for (let index = 0; index < roots.length; index++) {
		const rootPath = roots[index].path.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
		const prefix = rootPath === '/' ? '/' : rootPath + '/';
		if (!activePathLower.startsWith(prefix.toLowerCase())) {
			continue;
		}

		const relativePath = normalizedActivePath.slice(prefix.length).replace(/^\/+/, '');
		const segments = relativePath.split('/');
		if (!relativePath || segments.some(segment => segment === '.' || segment === '..')) {
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
