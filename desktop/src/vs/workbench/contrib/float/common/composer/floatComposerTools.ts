/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { sanitizeProposalPath } from '../proposals/floatProposalValidator.js';
import { IFloatCommandApprovalRequest } from '../shadow/floatShadowTypes.js';

export interface IComposerToolDefinition {
	name: string;
	description: string;
	parameters: {
		type: 'object';
		properties: Record<string, {
			type: string;
			description: string;
			items?: { type: string };
			enum?: string[];
		}>;
		required: string[];
	};
}

export interface IComposerToolCall {
	id: string;
	name: string;
	parameters: Record<string, any>;
}

export interface IComposerToolResult {
	callId: string;
	toolName: string;
	success: boolean;
	output: string;
	error?: string;
}

export interface IComposerFileSystem {
	readFile(path: string): Promise<string>;
	writeFile(path: string, content: string): Promise<void>;
	fileExists(path: string): Promise<boolean>;
	listDirectory(path: string, recursive?: boolean): Promise<string[]>;
	findFiles(pattern: string): Promise<string[]>;
}

export interface IComposerCommandRunner {
	requestExecutionApproval?(request: IFloatCommandApprovalRequest): Promise<boolean>;
	runCommand(command: string, cwd?: string): Promise<{
		exitCode: number;
		stdout: string;
		stderr: string;
	}>;
}

export class FloatComposerToolRegistry {
	private readonly _tools = new Map<string, (params: any) => Promise<string>>();
	private readonly _definitions: IComposerToolDefinition[] = [];

	constructor(
		private readonly _fs: IComposerFileSystem,
		private readonly _runner: IComposerCommandRunner,
		private readonly _codeSearcher?: (query: string) => Promise<string>
	) {
		this._registerCoreTools();
	}

	public get fileSystem(): IComposerFileSystem {
		return this._fs;
	}

	public get runner(): IComposerCommandRunner {
		return this._runner;
	}

	public createScopedRegistry(
		scopedFs: IComposerFileSystem,
		scopedSearcher?: (query: string) => Promise<string>,
		scopedRunner?: IComposerCommandRunner
	): FloatComposerToolRegistry {
		return new FloatComposerToolRegistry(scopedFs, scopedRunner ?? this._runner, scopedSearcher ?? this._codeSearcher);
	}

	public get definitions(): IComposerToolDefinition[] {
		return [...this._definitions];
	}

	private _registerCoreTools(): void {
		// 1. read_file
		this.registerTool({
			name: 'read_file',
			description: 'Read the text contents of a file in the workspace.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Relative path of the file to read' }
				},
				required: ['path']
			}
		}, async (params: { path: string }) => {
			const clean = sanitizeProposalPath(params.path);
			const exists = await this._fs.fileExists(clean);
			if (!exists) {
				throw new Error(`File not found: ${clean}`);
			}
			return await this._fs.readFile(clean);
		});

		// 2. write_file
		this.registerTool({
			name: 'write_file',
			description: 'Create a new file or completely overwrite an existing file with new content.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Relative path of the file to write' },
					content: { type: 'string', description: 'Complete content to write to the file' }
				},
				required: ['path', 'content']
			}
		}, async (params: { path: string; content: string }) => {
			const clean = sanitizeProposalPath(params.path);
			await this._fs.writeFile(clean, params.content);
			return `Successfully wrote ${params.content.length} characters to ${clean}`;
		});

		// 3. edit_file
		this.registerTool({
			name: 'edit_file',
			description: 'Replace an exact target snippet in an existing file with new content.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Relative path of the file to modify' },
					target: { type: 'string', description: 'Exact string snippet to find and replace' },
					replacement: { type: 'string', description: 'String to replace the target snippet with' }
				},
				required: ['path', 'target', 'replacement']
			}
		}, async (params: { path: string; target: string; replacement: string }) => {
			const clean = sanitizeProposalPath(params.path);
			const original = await this._fs.readFile(clean);
			if (!original.includes(params.target)) {
				throw new Error(`Target snippet not found in file: ${clean}`);
			}
			const updated = original.replace(params.target, params.replacement);
			await this._fs.writeFile(clean, updated);
			return `Successfully replaced snippet in ${clean}`;
		});

		// 4. list_directory
		this.registerTool({
			name: 'list_directory',
			description: 'List all files and folders in a workspace directory.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Relative directory path (e.g. "." or "src")' },
					recursive: { type: 'boolean', description: 'Whether to list recursively' }
				},
				required: ['path']
			}
		}, async (params: { path: string; recursive?: boolean }) => {
			const clean = params.path === '.' || params.path === '' ? '.' : sanitizeProposalPath(params.path);
			const files = await this._fs.listDirectory(clean, params.recursive ?? false);
			return files.join('\n');
		});

		// 5. search_codebase
		this.registerTool({
			name: 'search_codebase',
			description: 'Search for files or code symbols matching a query across the workspace.',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string', description: 'Search term or glob pattern' }
				},
				required: ['query']
			}
		}, async (params: { query: string }) => {
			if (this._codeSearcher) {
				return await this._codeSearcher(params.query);
			}
			const matches = await this._fs.findFiles(params.query);
			return matches.length > 0 ? matches.join('\n') : 'No matching files found.';
		});

		// 6. run_terminal_command
		this.registerTool({
			name: 'run_terminal_command',
			description: 'Execute a build, test, or verification command in the workspace terminal.',
			parameters: {
				type: 'object',
				properties: {
					command: { type: 'string', description: 'Shell command line to execute' },
					cwd: { type: 'string', description: 'Working directory for the command' }
				},
				required: ['command']
			}
		}, async (params: { command: string; cwd?: string }) => {
			const result = await this._runner.runCommand(params.command, params.cwd);
			return [
				`Exit Code: ${result.exitCode}`,
				`STDOUT:\n${result.stdout || '(none)'}`,
				`STDERR:\n${result.stderr || '(none)'}`
			].join('\n');
		});
	}

	public registerTool(
		definition: IComposerToolDefinition,
		executor: (params: any) => Promise<string>
	): void {
		this._definitions.push(definition);
		this._tools.set(definition.name, executor);
	}

	public async executeTool(call: IComposerToolCall): Promise<IComposerToolResult> {
		const executor = this._tools.get(call.name);
		if (!executor) {
			return {
				callId: call.id,
				toolName: call.name,
				success: false,
				output: '',
				error: `Unknown tool: ${call.name}`
			};
		}

		try {
			const output = await executor(call.parameters);
			return {
				callId: call.id,
				toolName: call.name,
				success: true,
				output
			};
		} catch (err: any) {
			return {
				callId: call.id,
				toolName: call.name,
				success: false,
				output: '',
				error: err.message || String(err)
			};
		}
	}
}