/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { URI } from '../desktop/src/vs/base/common/uri.ts';
import { VSBuffer } from '../desktop/src/vs/base/common/buffer.ts';
import { IFileService, IFileStat } from '../desktop/src/vs/platform/files/common/files.ts';
import { FloatDaemonWorkspaceIndexSynchronizer } from '../desktop/src/vs/workbench/contrib/float/common/daemon/floatDaemonWorkspaceIndexSynchronizer.ts';
import { getFloatIndexedWorkspacePath } from '../desktop/src/vs/workbench/contrib/float/common/daemon/floatWorkspaceIndexPath.ts';
import { FloatAutocompleteContextResolver } from '../desktop/src/vs/workbench/contrib/float/browser/autocomplete/floatAutocompleteContextResolver.ts';

type FakeEntry = {
	resource: URI;
	isFile: boolean;
	isDirectory: boolean;
	isSymbolicLink: boolean;
	size: number;
	content?: string;
	children?: FakeEntry[];
};

class FakeFileService {
	private readonly _entries = new Map<string, FakeEntry>();

	public add(entry: FakeEntry): void {
		this._entries.set(entry.resource.toString(), entry);
	}

	public async resolve(resource: URI): Promise<IFileStat> {
		const entry = this._entries.get(resource.toString());
		if (!entry) {
			throw new Error('ENOENT: ' + resource.toString());
		}
		return {
			resource: entry.resource,
			name: entry.resource.path.split('/').pop() || '',
			isFile: entry.isFile,
			isDirectory: entry.isDirectory,
			isSymbolicLink: entry.isSymbolicLink,
			size: entry.size,
			children: entry.children?.map(child => ({
				resource: child.resource,
				name: child.resource.path.split('/').pop() || '',
				isFile: child.isFile,
				isDirectory: child.isDirectory,
				isSymbolicLink: child.isSymbolicLink,
				size: child.size
			})) as IFileStat[] | undefined
		} as IFileStat;
	}

	public async stat(resource: URI): Promise<IFileStat> {
		return this.resolve(resource);
	}

	public async readFile(resource: URI): Promise<{ value: VSBuffer }> {
		const entry = this._entries.get(resource.toString());
		if (!entry || entry.content === undefined) {
			throw new Error('ENOENT: ' + resource.toString());
		}
		return { value: VSBuffer.fromString(entry.content) };
	}
}

async function main(): Promise<void> {
	const localRoot = URI.file('/home/dev/project');
	const remoteRoot = URI.from({
		scheme: 'vscode-remote',
		authority: 'ssh-remote+devbox',
		path: '/home/dev/project'
	});
	const virtualRoot = URI.from({
		scheme: 'memfs',
		authority: 'tenant-42',
		path: '/repo'
	});
	const remoteSrc = URI.from({
		scheme: 'vscode-remote',
		authority: 'ssh-remote+devbox',
		path: '/home/dev/project/src'
	});
	const remoteFile = URI.from({
		scheme: 'vscode-remote',
		authority: 'ssh-remote+devbox',
		path: '/home/dev/project/src/remoteService.ts'
	});
	const virtualSrc = URI.from({
		scheme: 'memfs',
		authority: 'tenant-42',
		path: '/repo/src'
	});
	const virtualFile = URI.from({
		scheme: 'memfs',
		authority: 'tenant-42',
		path: '/repo/src/virtualService.ts'
	});

	const fileService = new FakeFileService();
	fileService.add({
		resource: localRoot,
		isFile: false,
		isDirectory: true,
		isSymbolicLink: false,
		size: 0,
		children: []
	});
	fileService.add({
		resource: remoteRoot,
		isFile: false,
		isDirectory: true,
		isSymbolicLink: false,
		size: 0,
		children: [{
			resource: remoteSrc,
			isFile: false,
			isDirectory: true,
			isSymbolicLink: false,
			size: 0,
			children: [{
				resource: remoteFile,
				isFile: true,
				isDirectory: false,
				isSymbolicLink: false,
				size: 64,
				content: 'export function resolveRemoteWorkspaceService() { return true; }'
			}]
		}]
	});
	fileService.add({
		resource: remoteSrc,
		isFile: false,
		isDirectory: true,
		isSymbolicLink: false,
		size: 0,
		children: [{
			resource: remoteFile,
			isFile: true,
			isDirectory: false,
			isSymbolicLink: false,
			size: 64,
			content: 'export function resolveRemoteWorkspaceService() { return true; }'
		}]
	});
	fileService.add({
		resource: remoteFile,
		isFile: true,
		isDirectory: false,
		isSymbolicLink: false,
		size: 64,
		content: 'export function resolveRemoteWorkspaceService() { return true; }'
	});
	fileService.add({
		resource: virtualRoot,
		isFile: false,
		isDirectory: true,
		isSymbolicLink: false,
		size: 0,
		children: [{
			resource: virtualSrc,
			isFile: false,
			isDirectory: true,
			isSymbolicLink: false,
			size: 0,
			children: [{
				resource: virtualFile,
				isFile: true,
				isDirectory: false,
				isSymbolicLink: false,
				size: 62,
				content: 'export function resolveVirtualWorkspaceService() { return true; }'
			}]
		}]
	});
	fileService.add({
		resource: virtualSrc,
		isFile: false,
		isDirectory: true,
		isSymbolicLink: false,
		size: 0,
		children: [{
			resource: virtualFile,
			isFile: true,
			isDirectory: false,
			isSymbolicLink: false,
			size: 62,
			content: 'export function resolveVirtualWorkspaceService() { return true; }'
		}]
	});
	fileService.add({
		resource: virtualFile,
		isFile: true,
		isDirectory: false,
		isSymbolicLink: false,
		size: 62,
		content: 'export function resolveVirtualWorkspaceService() { return true; }'
	});

	const indexed = new Set<string>();
	const indexCalls: Array<{ path: string; content: string }> = [];
	const client = {
		call: async (method: string) => {
			assert.equal(method, 'semantic_list_indexed_files');
			return { files: Array.from(indexed) };
		},
		indexFileSemantics: async (filePath: string, content: string) => {
			indexed.add(filePath);
			indexCalls.push({ path: filePath, content });
		},
		removeFileSemantics: async (filePath: string) => {
			indexed.delete(filePath);
		}
	};
	const synchronizer = new FloatDaemonWorkspaceIndexSynchronizer(
		fileService as unknown as IFileService,
		() => client as any
	);

	await synchronizer.setWorkspaceRoots([localRoot, remoteRoot, virtualRoot]);
	await synchronizer.scanWorkspace();

	assert.deepEqual(Array.from(indexed).sort(), [
		'workspace-2/src/remoteService.ts',
		'workspace-3/src/virtualService.ts'
	]);
	assert.equal(indexCalls.some(call => call.path.includes('/home/dev/project')), false, 'absolute local/remote paths must never be sent to the daemon');
	assert.equal(indexCalls.some(call => call.path.includes('/repo/')), false, 'absolute virtual paths must never be sent to the daemon');

	// A remote event updates only the remote root's namespaced relative path.
	fileService.add({
		resource: remoteFile,
		isFile: true,
		isDirectory: false,
		isSymbolicLink: false,
		size: 64,
		content: 'export function resolveRemoteWorkspaceService() { return "updated"; }'
	});
	await synchronizer.handleFileChanges({ updated: [remoteFile] });
	assert.equal(indexCalls.filter(call => call.path === 'workspace-2/src/remoteService.ts').length, 2);

	// The active URI mapper must distinguish provider and authority even when
	// local and remote roots have identical path strings.
	assert.equal(
		getFloatIndexedWorkspacePath(remoteFile, [localRoot, remoteRoot, virtualRoot]),
		'workspace-2/src/remoteService.ts'
	);
	const otherRemoteFile = URI.from({
		scheme: 'vscode-remote',
		authority: 'ssh-remote+otherbox',
		path: '/home/dev/project/src/remoteService.ts'
	});
	assert.equal(
		getFloatIndexedWorkspacePath(otherRemoteFile, [localRoot, remoteRoot, virtualRoot]),
		undefined,
		'a different remote authority must not map to the indexed workspace root'
	);

	// Cursor Tab retrieval excludes the current remote file but keeps a local
	// file with the same relative path and related code from the virtual root.
	const workspaceContext = {
		getWorkspace: () => ({
			folders: [
				{ uri: localRoot },
				{ uri: remoteRoot },
				{ uri: virtualRoot }
			]
		})
	} as any;
	const runtime = {
		getClient: () => ({
			call: async () => ({
				matches: [
					{ filePath: 'workspace-1/src/remoteService.ts', startLine: 1, endLine: 3, snippet: 'export function resolveLocalWorkspaceService() {}' },
					{ filePath: 'workspace-2/src/remoteService.ts', startLine: 1, endLine: 3, snippet: 'export function resolveRemoteWorkspaceService() {}' },
					{ filePath: 'workspace-3/src/virtualService.ts', startLine: 1, endLine: 3, snippet: 'export function resolveVirtualWorkspaceService() {}' }
				]
			})
		})
	} as any;
	const contextResolver = new FloatAutocompleteContextResolver(runtime, workspaceContext);
	const context = await contextResolver.resolveRelatedContext(
		'const remoteService = resolveRemoteWorkspaceService(remoteSession);',
		'',
		remoteFile
	);
	assert(context.includes('workspace-1/src/remoteService.ts'), 'same relative path from a different provider must remain eligible');
	assert(!context.includes('workspace-2/src/remoteService.ts'), 'the exact active remote URI must be excluded');
	assert(context.includes('workspace-3/src/virtualService.ts'));

	// A symlinked workspace root is intentionally not traversed. Because that
	// scan is incomplete, previously persisted files must not be pruned.
	const symlinkRoot = URI.file('/home/dev/symlink-project');
	fileService.add({
		resource: symlinkRoot,
		isFile: false,
		isDirectory: true,
		isSymbolicLink: true,
		size: 0,
		children: []
	});
	await synchronizer.setWorkspaceRoots([symlinkRoot]);
	indexed.clear();
	indexed.add('src/retained.ts');
	await synchronizer.scanWorkspace();
	assert.deepEqual(
		Array.from(indexed),
		['src/retained.ts'],
		'a skipped symlink root must not cause the previous semantic index to be pruned'
	);

	console.log('FLOAT remote/virtual workspace indexing: provider-backed scans, namespaced events, URI-scoped autocomplete filtering and non-destructive symlink-root reconciliation passed.');
}

main().catch(error => {
	console.error('FLOAT remote/virtual workspace indexing test failed:', error);
	process.exit(1);
});
