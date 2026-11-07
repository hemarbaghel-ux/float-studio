/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';

/**
 * Resolve the local workspace folder that owns an editor resource.
 *
 * Composer's production file adapters and Docker runner operate on the local
 * filesystem. Never translate remote/virtual URIs into local paths or fall
 * back to process.cwd(), which may be the application installation directory.
 */
export function getFloatComposerWorkspaceRoot(
	workspaceFolders: readonly URI[],
	activeResource?: URI
): URI | undefined {
	const localFolders = workspaceFolders.filter(folder => folder.scheme === 'file');

	if (!activeResource) {
		return workspaceFolders.length === 1 && localFolders.length === 1
			? localFolders[0]
			: undefined;
	}

	if (activeResource.scheme !== 'file') {
		return undefined;
	}

	const normalizePath = (value: string): string => value.split(String.fromCharCode(92)).join('/');
	const resourcePath = normalizePath(activeResource.path);
	let bestMatch: { folder: URI; pathLength: number } | undefined;

	for (const folder of localFolders) {
		if (folder.authority !== activeResource.authority) {
			continue;
		}

		let folderPath = normalizePath(folder.path) || '/';
		while (folderPath.length > 1 && folderPath.endsWith('/')) {
			folderPath = folderPath.slice(0, -1);
		}
		const isRoot = folderPath === '/';
		const isInside = isRoot
			? resourcePath.startsWith('/')
			: resourcePath === folderPath || resourcePath.startsWith(folderPath + '/');

		if (!isInside) {
			continue;
		}

		if (!bestMatch || folderPath.length > bestMatch.pathLength) {
			bestMatch = { folder, pathLength: folderPath.length };
		}
	}

	return bestMatch?.folder;
}
