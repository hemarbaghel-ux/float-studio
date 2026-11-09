/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { exec } from 'node:child_process';
import crypto from 'crypto';
import {
  CANONICAL_TOOL_SCHEMAS,
  IToolDefinition,
  IToolRegistry,
  CanonicalToolRegistry,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../../shared/contracts/tools';
import {
  IProposal,
  IProposalFileChange,
  computeContentHash,
  computeDiffStats,
  generateUnifiedDiff,
} from '../../shared/contracts/proposals';
import { validateSafeWorkspacePath } from '../../shared/contracts/workspace';

const DEFAULT_MAX_READ_BYTES = 50_000;
const DEFAULT_MAX_SEARCH_RESULTS = 25;
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;

/**
 * Validates tool arguments against canonical parameter schemas.
 */
export function validateToolArgs(toolName: keyof typeof CANONICAL_TOOL_SCHEMAS, args: any): string | null {
  const schema = CANONICAL_TOOL_SCHEMAS[toolName];
  if (!schema) {
    return `Unknown tool schema for "${toolName}".`;
  }

  if (typeof args !== 'object' || args === null) {
    return `Arguments for tool "${toolName}" must be a non-null object.`;
  }

  for (const requiredProp of schema.required) {
    if (args[requiredProp] === undefined || args[requiredProp] === null || args[requiredProp] === '') {
      return `Missing required parameter "${requiredProp}" for tool "${toolName}".`;
    }
  }

  return null;
}

/**
 * 1. list_dir tool: Inspects directories in the workspace.
 */
export const listDirTool: IToolDefinition = {
  name: 'list_dir',
  description: 'Lists files and folders inside the workspace directory.',
  parametersSchema: CANONICAL_TOOL_SCHEMAS.list_dir,
  requiresApproval: false,
  async execute(args: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const start = Date.now();
    const validationError = validateToolArgs('list_dir', args);
    if (validationError) {
      return { toolName: 'list_dir', success: false, error: validationError, durationMs: Date.now() - start, timestamp: start };
    }

    try {
      const recursive = args.recursive !== false;
      const maxFiles = typeof args.maxFiles === 'number' ? Math.min(args.maxFiles, 500) : 100;
      const files = await context.workspace.listFiles({ recursive, maxFiles });

      const results = files.map(f => ({
        path: f.path,
        name: f.name,
        type: f.type,
        size: f.size ?? 0,
      }));

      return {
        toolName: 'list_dir',
        success: true,
        data: {
          files: results,
          total: results.length,
          truncated: results.length >= maxFiles,
        },
        durationMs: Date.now() - start,
        timestamp: start,
      };
    } catch (err: any) {
      return {
        toolName: 'list_dir',
        success: false,
        error: err?.message || String(err),
        durationMs: Date.now() - start,
        timestamp: start,
      };
    }
  },
};

/**
 * 2. read_file tool: Reads the content of an authorized workspace file.
 */
export const readFileTool: IToolDefinition = {
  name: 'read_file',
  description: 'Reads the text content of a file within the authorized workspace.',
  parametersSchema: CANONICAL_TOOL_SCHEMAS.read_file,
  requiresApproval: false,
  async execute(args: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const start = Date.now();
    const validationError = validateToolArgs('read_file', args);
    if (validationError) {
      return { toolName: 'read_file', success: false, error: validationError, durationMs: Date.now() - start, timestamp: start };
    }

    try {
      const safePath = validateSafeWorkspacePath(args.path);
      const exists = await context.workspace.fileExists(safePath);
      if (!exists) {
        return {
          toolName: 'read_file',
          success: false,
          error: `File not found: "${safePath}"`,
          durationMs: Date.now() - start,
          timestamp: start,
        };
      }

      let content = await context.workspace.readFile(safePath);
      const totalChars = content.length;
      let truncated = false;

      const maxBytes = context.maxReadBytes ?? DEFAULT_MAX_READ_BYTES;
      if (content.length > maxBytes) {
        content = content.slice(0, maxBytes);
        truncated = true;
      }

      if (typeof args.maxLines === 'number' && args.maxLines > 0) {
        const lines = content.split('\n');
        if (lines.length > args.maxLines) {
          content = lines.slice(0, args.maxLines).join('\n');
          truncated = true;
        }
      }

      return {
        toolName: 'read_file',
        success: true,
        data: {
          path: safePath,
          content,
          truncated,
          totalChars,
        },
        durationMs: Date.now() - start,
        timestamp: start,
      };
    } catch (err: any) {
      return {
        toolName: 'read_file',
        success: false,
        error: err?.message || String(err),
        durationMs: Date.now() - start,
        timestamp: start,
      };
    }
  },
};

/**
 * 3. search_codebase tool: Semantic and lexical retrieval across indexed files.
 */
export const searchCodebaseTool: IToolDefinition = {
  name: 'search_codebase',
  description: 'Searches codebase for symbols, functions, classes, or code patterns.',
  parametersSchema: CANONICAL_TOOL_SCHEMAS.search_codebase,
  requiresApproval: false,
  async execute(args: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const start = Date.now();
    const validationError = validateToolArgs('search_codebase', args);
    if (validationError) {
      return { toolName: 'search_codebase', success: false, error: validationError, durationMs: Date.now() - start, timestamp: start };
    }

    try {
      const query = String(args.query).trim();
      const limit = typeof args.limit === 'number' ? Math.min(Math.max(1, args.limit), 50) : DEFAULT_MAX_SEARCH_RESULTS;

      // If workspace has an AST/BM25 index (e.g. LocalFileSystemWorkspaceService), use it
      const anyWorkspace = context.workspace as any;
      if (anyWorkspace.index && typeof anyWorkspace.index.search === 'function') {
        const indexResults = anyWorkspace.index.search(query, { maxResults: limit });
        const matches = indexResults.map((r: any) => ({
          path: r.path,
          score: r.score,
          preview: r.preview || (r.symbols && r.symbols.length > 0 ? `Symbols: ${r.symbols.map((s: any) => s.name).join(', ')}` : ''),
          line: r.symbols && r.symbols[0] ? r.symbols[0].line : 1,
        }));

        return {
          toolName: 'search_codebase',
          success: true,
          data: { query, matches, total: matches.length },
          durationMs: Date.now() - start,
          timestamp: start,
        };
      }

      // Fallback: search listed workspace files line by line
      const files = await context.workspace.listFiles({ recursive: true, maxFiles: 100 });
      const matches: Array<{ path: string; line: number; preview: string }> = [];
      const lowerQuery = query.toLowerCase();

      for (const file of files) {
        if (file.type !== 'file') continue;
        try {
          const content = await context.workspace.readFile(file.path);
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(lowerQuery)) {
              matches.push({
                path: file.path,
                line: i + 1,
                preview: lines[i].trim().slice(0, 150),
              });
              if (matches.length >= limit) break;
            }
          }
        } catch {
          // Skip unreadable files
        }
        if (matches.length >= limit) break;
      }

      return {
        toolName: 'search_codebase',
        success: true,
        data: { query, matches, total: matches.length },
        durationMs: Date.now() - start,
        timestamp: start,
      };
    } catch (err: any) {
      return {
        toolName: 'search_codebase',
        success: false,
        error: err?.message || String(err),
        durationMs: Date.now() - start,
        timestamp: start,
      };
    }
  },
};

/**
 * 4. inspect_symbol tool: Locates symbol definitions, types, and references.
 */
export const inspectSymbolTool: IToolDefinition = {
  name: 'inspect_symbol',
  description: 'Inspects definitions, types, and references for a specific code symbol.',
  parametersSchema: CANONICAL_TOOL_SCHEMAS.inspect_symbol,
  requiresApproval: false,
  async execute(args: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const start = Date.now();
    const validationError = validateToolArgs('inspect_symbol', args);
    if (validationError) {
      return { toolName: 'inspect_symbol', success: false, error: validationError, durationMs: Date.now() - start, timestamp: start };
    }

    try {
      const symbol = String(args.symbol).trim();
      const anyWorkspace = context.workspace as any;

      if (anyWorkspace.index && typeof anyWorkspace.index.findSymbols === 'function') {
        const definitions = anyWorkspace.index.findSymbols(symbol);
        const references = typeof anyWorkspace.index.findSymbolReferences === 'function'
          ? anyWorkspace.index.findSymbolReferences(symbol)
          : [];

        return {
          toolName: 'inspect_symbol',
          success: true,
          data: {
            symbol,
            definitions: definitions.map((d: any) => ({
              path: d.path,
              name: d.symbol.name,
              kind: d.symbol.kind,
              line: d.symbol.line,
              endLine: d.symbol.endLine,
            })),
            references: references.map((r: any) => ({
              path: r.path,
              line: r.line,
              preview: r.preview,
            })),
          },
          durationMs: Date.now() - start,
          timestamp: start,
        };
      }

      return {
        toolName: 'inspect_symbol',
        success: true,
        data: { symbol, definitions: [], references: [], message: 'Symbol index not initialized for workspace.' },
        durationMs: Date.now() - start,
        timestamp: start,
      };
    } catch (err: any) {
      return {
        toolName: 'inspect_symbol',
        success: false,
        error: err?.message || String(err),
        durationMs: Date.now() - start,
        timestamp: start,
      };
    }
  },
};

/**
 * 5. propose_changes tool: Generates a multi-file unified diff proposal.
 *
 * CRITICAL SAFETY INVARIANT:
 * Does NOT modify files on disk! Packages the change set into an IProposal
 * with status 'pending_review', additions/deletions diffStats, and unified diffs.
 */
export const proposeChangesTool: IToolDefinition = {
  name: 'propose_changes',
  description: 'Proposes multi-file code modifications with unified diffs. Changes remain unapplied pending user approval.',
  parametersSchema: CANONICAL_TOOL_SCHEMAS.propose_changes,
  requiresApproval: true,
  async execute(args: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const start = Date.now();
    const validationError = validateToolArgs('propose_changes', args);
    if (validationError) {
      return { toolName: 'propose_changes', success: false, error: validationError, durationMs: Date.now() - start, timestamp: start };
    }

    try {
      const rawChanges: Array<{ path: string; content?: string; isDeletion?: boolean }> = args.changes;
      if (!Array.isArray(rawChanges) || rawChanges.length === 0) {
        return {
          toolName: 'propose_changes',
          success: false,
          error: 'Proposal must contain at least one file change in "changes" array.',
          durationMs: Date.now() - start,
          timestamp: start,
        };
      }

      const fileChanges: IProposalFileChange[] = [];
      let totalAdditions = 0;
      let totalDeletions = 0;

      for (const change of rawChanges) {
        const safePath = validateSafeWorkspacePath(change.path);
        const exists = await context.workspace.fileExists(safePath);
        const originalContent = exists ? await context.workspace.readFile(safePath) : '';
        const proposedContent = change.isDeletion ? '' : (change.content ?? '');

        const operation = change.isDeletion ? 'delete' : exists ? 'modify' : 'create';
        const originalHash = exists ? computeContentHash(originalContent) : undefined;
        const proposedHash = change.isDeletion ? undefined : computeContentHash(proposedContent);
        const diffStats = computeDiffStats(originalContent, proposedContent);
        const unifiedDiff = generateUnifiedDiff(safePath, originalContent, proposedContent);

        totalAdditions += diffStats.additions;
        totalDeletions += diffStats.deletions;

        fileChanges.push({
          path: safePath,
          operation,
          originalContent: exists ? originalContent : undefined,
          proposedContent: change.isDeletion ? undefined : proposedContent,
          originalHash,
          proposedHash,
          status: 'pending',
          diffStats,
          unifiedDiff,
        });
      }

      const proposalId = `prop_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const proposal: IProposal = {
        id: proposalId,
        ownerId: context.userId,
        projectId: context.projectId,
        title: String(args.title).trim(),
        explanation: String(args.explanation || '').trim(),
        status: 'pending_review',
        files: fileChanges,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      return {
        toolName: 'propose_changes',
        success: true,
        requiresApproval: true,
        approvalReason: 'Multi-file code changes require explicit user review and acceptance.',
        data: {
          proposal,
          summary: {
            proposalId,
            status: proposal.status,
            filesCount: fileChanges.length,
            additions: totalAdditions,
            deletions: totalDeletions,
            affectedFiles: fileChanges.map(f => f.path),
          },
          message: 'Proposal successfully drafted. Real workspace files remain unmodified until approved.',
        },
        durationMs: Date.now() - start,
        timestamp: start,
      };
    } catch (err: any) {
      return {
        toolName: 'propose_changes',
        success: false,
        error: err?.message || String(err),
        durationMs: Date.now() - start,
        timestamp: start,
      };
    }
  },
};

/**
 * 6. run_command tool: Runs approved verification commands.
 */
export const runCommandTool: IToolDefinition = {
  name: 'run_command',
  description: 'Executes an approved test or verification command in the project environment.',
  parametersSchema: CANONICAL_TOOL_SCHEMAS.run_command,
  requiresApproval: true,
  async execute(args: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const start = Date.now();
    const validationError = validateToolArgs('run_command', args);
    if (validationError) {
      return { toolName: 'run_command', success: false, error: validationError, durationMs: Date.now() - start, timestamp: start };
    }

    const command = String(args.command).trim();
    const timeoutMs = typeof args.timeoutMs === 'number' ? Math.min(args.timeoutMs, 60_000) : DEFAULT_COMMAND_TIMEOUT_MS;

    // Verify command against allowed list if configured
    if (context.allowedCommands && context.allowedCommands.length > 0) {
      const allowed = context.allowedCommands.some(cmd => command.startsWith(cmd));
      if (!allowed) {
        return {
          toolName: 'run_command',
          success: false,
          error: `Command "${command}" is not in the allowed verification commands list: [${context.allowedCommands.join(', ')}]`,
          durationMs: Date.now() - start,
          timestamp: start,
        };
      }
    }

    try {
      const execResult = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
        const proc = exec(command, { timeout: timeoutMs }, (error, stdout, stderr) => {
          if (error && !stdout && !stderr) {
            reject(error);
          } else {
            resolve({
              stdout: stdout ? stdout.toString() : '',
              stderr: stderr ? stderr.toString() : '',
              exitCode: error?.code ?? 0,
            });
          }
        });

        if (context.signal) {
          context.signal.addEventListener('abort', () => {
            proc.kill();
            reject(new Error('Command cancelled by user.'));
          });
        }
      });

      return {
        toolName: 'run_command',
        success: execResult.exitCode === 0,
        data: {
          command,
          exitCode: execResult.exitCode,
          stdout: execResult.stdout,
          stderr: execResult.stderr,
        },
        durationMs: Date.now() - start,
        timestamp: start,
      };
    } catch (err: any) {
      return {
        toolName: 'run_command',
        success: false,
        error: err?.message || String(err),
        durationMs: Date.now() - start,
        timestamp: start,
      };
    }
  },
};

/**
 * Creates and initializes a CanonicalToolRegistry loaded with all standard tools.
 */
export function createStandardToolRegistry(): IToolRegistry {
  const registry = new CanonicalToolRegistry();
  registry.register(listDirTool);
  registry.register(readFileTool);
  registry.register(searchCodebaseTool);
  registry.register(inspectSymbolTool);
  registry.register(proposeChangesTool);
  registry.register(runCommandTool);
  return registry;
}
