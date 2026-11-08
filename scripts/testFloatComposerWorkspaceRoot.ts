/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { URI } from '../desktop/src/vs/base/common/uri.ts';
import { getFloatComposerWorkspaceRoot } from '../desktop/src/vs/workbench/contrib/float/browser/composer/floatComposerWorkspaceRoot.ts';

async function main(): Promise<void> {
	const root = URI.file('/projects/float');
	const nestedRoot = URI.file('/projects/float/packages/desktop');
	const activeFile = URI.file('/projects/float/packages/desktop/src/main.ts');
	const trailingSlashRoot = URI.from({ scheme: 'file', path: '/projects/float/' });
	const outsideFile = URI.file('/projects/float-evil/src/main.ts');

	assert.equal(
		getFloatComposerWorkspaceRoot([root, nestedRoot], activeFile)?.toString(),
		nestedRoot.toString(),
		'the most specific containing workspace folder must be selected'
	);
	assert.equal(
		getFloatComposerWorkspaceRoot([root], outsideFile),
		undefined,
		'a path-prefix sibling must not be treated as part of the workspace'
	);
	assert.equal(
		getFloatComposerWorkspaceRoot([trailingSlashRoot], activeFile)?.toString(),
		trailingSlashRoot.toString(),
		'a trailing slash on the workspace root must not break containment checks'
	);
	assert.equal(
		getFloatComposerWorkspaceRoot([root])?.toString(),
		root.toString(),
		'a single local folder can be selected when no editor is active'
	);
	assert.equal(
		getFloatComposerWorkspaceRoot([root, nestedRoot]),
		undefined,
		'a multi-root workspace without an active editor must require explicit folder selection'
	);

	const remoteRoot = URI.from({
		scheme: 'vscode-remote',
		authority: 'ssh-remote+devbox',
		path: '/projects/float'
	});
	const remoteFile = URI.from({
		scheme: 'vscode-remote',
		authority: 'ssh-remote+devbox',
		path: '/projects/float/src/main.ts'
	});
	assert.equal(
		getFloatComposerWorkspaceRoot([remoteRoot], remoteFile),
		undefined,
		'remote resources must never be converted to local filesystem paths'
	);

	const localAndRemote = [root, remoteRoot];
	assert.equal(
		getFloatComposerWorkspaceRoot(localAndRemote, remoteFile),
		undefined,
		'a remote editor must not silently select a local folder with the same path'
	);
	assert.equal(
		getFloatComposerWorkspaceRoot(localAndRemote, URI.file('/projects/float/src/main.ts'))?.toString(),
		root.toString(),
		'provider scheme and authority must distinguish equal local and remote paths'
	);

	console.log('FLOAT Composer workspace root: nested-root selection, multi-root prompt requirement, path-boundary checks and remote-workspace fail-closed behavior passed.');
}

main().catch(error => {
	console.error('FLOAT Composer workspace-root test failed:', error);
	process.exit(1);
});
