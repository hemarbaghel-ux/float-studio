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
\tactiveFile: string | URI,
\tworkspaceFolders: readonly URI[]
): string | undefined {
\tconst activePath = typeof activeFile === 'string' ? activeFile : activeFile.path;
\tconst normalizedActivePath = activePath.replace(/\\/g, '/');
\tconst activePathLower = normalizedActivePath.toLowerCase();
\tconst activeScheme = typeof activeFile === 'string' ? undefined : activeFile.scheme;
\tconst activeAuthority = typeof activeFile === 'string' ? undefined : activeFile.authority;
\tlet bestMatch: { relativePath: string; index: number; rootLength: number } | undefined;

\tfor (let index = 0; index < workspaceFolders.length; index++) {
\t\tconst root = workspaceFolders[index];
\t\tif (
\t\t\tactiveScheme !== undefined &&
\t\t\t(root.scheme !== activeScheme || root.authority !== activeAuthority)
\t\t) {
\t\t\tcontinue;
\t\t}

\t\tconst rootPath = root.path.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
\t\tconst prefix = rootPath === '/' ? '/' : rootPath + '/';
\t\tif (!activePathLower.startsWith(prefix.toLowerCase())) {
\t\t\tcontinue;
\t\t}

\t\tconst relativePath = normalizedActivePath.slice(prefix.length).replace(/^\/+/, '');
\t\tconst segments = relativePath.split('/');
\t\tif (!relativePath || segments.some(segment => segment === '.' || segment === '..')) {
\t\t\tcontinue;
\t\t}

\t\tif (!bestMatch || rootPath.length > bestMatch.rootLength) {
\t\t\tbestMatch = { relativePath, index, rootLength: rootPath.length };
\t\t}
\t}

\tif (!bestMatch) {
\t\treturn undefined;
\t}

\treturn workspaceFolders.length > 1
\t\t? \`workspace-\${bestMatch.index + 1}/\${bestMatch.relativePath}\`
\t\t: bestMatch.relativePath;
}
