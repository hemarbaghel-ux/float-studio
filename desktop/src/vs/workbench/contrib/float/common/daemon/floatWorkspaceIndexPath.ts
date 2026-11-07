/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';

/**
 * Maps an editor path/URI to the daemon's workspace-relative index path.
 * URI inputs are matched by provider scheme and authority as well as path, so
 * identical paths in local, remote and virtual filesystems cannot collide.
 */
export function getFloatIndexedWorkspacePath(
    activeFile: string | URI,
    workspaceFolders: readonly URI[]
): string | undefined {
    const activePath = typeof activeFile === 'string' ? activeFile : activeFile.path;
    const normalizedActivePath = activePath.replace(/\\/g, '/');
    const activePathLower = normalizedActivePath.toLowerCase();
    const activeScheme = typeof activeFile === 'string' ? undefined : activeFile.scheme;
    const activeAuthority = typeof activeFile === 'string' ? undefined : activeFile.authority;
    let bestMatch: { relativePath: string; index: number; rootLength: number } | undefined;

    for (let index = 0; index < workspaceFolders.length; index++) {
        const root = workspaceFolders[index];
        if (
            activeScheme !== undefined &&
            (root.scheme !== activeScheme || root.authority !== activeAuthority)
        ) {
            continue;
        }

        const rootPath = root.path.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
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

    return workspaceFolders.length > 1
        ? 'workspace-' + (bestMatch.index + 1) + '/' + bestMatch.relativePath
        : bestMatch.relativePath;
}
