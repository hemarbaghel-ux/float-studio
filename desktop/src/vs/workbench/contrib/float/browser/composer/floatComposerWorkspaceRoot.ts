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

	const resourcePath = activeResource.path.replace(/\\/g, '/');
	let bestMatch: { folder: URI; pathLength: number } | undefined;

	for (const folder of localFolders) {
		if (folder.authority !== activeResource.authority) {
			continue;
		}

		const folderPath = folder.path.replace(/\\/g, '/').replace(/\\/+$/, '') || '/';
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
