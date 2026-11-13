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
import { TerminalExecutionPolicy } from '../terminal';

const DEFAULT_MAX_READ_BYTES = 50_000;
const DEFAULT_MAX_SEARCH_RESULTS = 25;
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;

export function sanitizeToolOutputText(text: string): string {
  if (!text) return '';
  return text
    .replace(/sk-(?:proj-)?[a-zA-Z0-9_\-]{12,}/g, '[REDACTED_SECRET]')
    .replace(/gh[pousr]_[a-zA-Z0-9]{16,}/g, '[REDACTED_SECRET]')
    .replace(/AIzaSy[A-Za-z0-9_\-]{25,}/g, '[REDACTED_SECRET]')
    .replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED_SECRET]');
}

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

      let content = sanitizeToolOutputText(await context.workspace.readFile(safePath));
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

      const anyWorkspace = context.workspace as any;
      if (anyWorkspace.index && typeof anyWorkspace.index.search === 'function') {
        const indexResults = anyWorkspace.index.search(query, { maxResults: limit });
        const matches = indexResults.map((r: any) => ({
          path: r.path,
          score: r.score,
          preview: sanitizeToolOutputText(
            r.preview || (r.symbols && r.symbols.length > 0 ? `Symbols: ${r.symbols.map((s: any) => s.name).join(', ')}` : '')
          ),
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
                preview: sanitizeToolOutputText(lines[i].trim().slice(0, 150)),
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
              preview: sanitizeToolOutputText(r.preview || ''),
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
 * 5. retrieve_context tool: Bounded codebase context assembly with file/line provenance.
 */
export const retrieveContextTool: IToolDefinition = {
  name: 'retrieve_context',
  description: 'Retrieves bounded codebase snippets with file and line provenance for a task or question.',
  parametersSchema: CANONICAL_TOOL_SCHEMAS.retrieve_context,
  requiresApproval: false,
  async execute(args: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const start = Date.now();
    const validationError = validateToolArgs('retrieve_context', args);
    if (validationError) {
      return { toolName: 'retrieve_context', success: false, error: validationError, durationMs: Date.now() - start, timestamp: start };
    }

    try {
      const query = String(args.query).trim();
      const maxChars = typeof args.maxChars === 'number' ? Math.min(Math.max(500, args.maxChars), 32_000) : 12_000;
      const files = await context.workspace.listFiles({ recursive: true, maxFiles: 100 });
      const terms = query.toLowerCase().split(/\W+/).filter(t => t.length >= 2);
      const snippets: Array<{ path: string; startLine: number; endLine: number; score: number; excerpt: string }> = [];
      let usedChars = 0;

      for (const file of files) {
        if (file.type !== 'file') continue;
        try {
          const raw = await context.workspace.readFile(file.path);
          const lower = raw.toLowerCase();
          let score = 0;
          for (const term of terms) {
            if (file.path.toLowerCase().includes(term)) score += 3;
            if (lower.includes(term)) score += 1;
          }
          if (score > 0 || snippets.length < 3) {
            const lines = raw.split('\n');
            const excerpt = sanitizeToolOutputText(lines.slice(0, 60).join('\n'));
            if (usedChars + excerpt.length <= maxChars) {
              usedChars += excerpt.length;
              snippets.push({
                path: file.path,
                startLine: 1,
                endLine: Math.min(lines.length, 60),
                score,
                excerpt,
              });
            }
          }
        } catch {
          // Skip unreadable files
        }
      }

      snippets.sort((a, b) => b.score - a.score);
      return {
        toolName: 'retrieve_context',
        success: true,
        data: {
          query,
          snippets: snippets.slice(0, 8),
          totalChars: usedChars,
          maxChars,
        },
        durationMs: Date.now() - start,
        timestamp: start,
      };
    } catch (err: any) {
      return {
        toolName: 'retrieve_context',
        success: false,
        error: err?.message || String(err),
        durationMs: Date.now() - start,
        timestamp: start,
      };
    }
  },
};

/**
 * 6. inspect_diagnostics tool: Runs syntax and static diagnostic checks on workspace files.
 */
export const inspectDiagnosticsTool: IToolDefinition = {
  name: 'inspect_diagnostics',
  description: 'Inspects workspace files for TypeScript, JavaScript, Python, and JSON syntax/compiler diagnostics.',
  parametersSchema: CANONICAL_TOOL_SCHEMAS.inspect_diagnostics,
  requiresApproval: false,
  async execute(args: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const start = Date.now();
    const validationError = validateToolArgs('inspect_diagnostics', args);
    if (validationError) {
      return { toolName: 'inspect_diagnostics', success: false, error: validationError, durationMs: Date.now() - start, timestamp: start };
    }

    try {
      const requestedPaths: string[] = Array.isArray(args.paths) ? args.paths : [];
      const targetFiles: Array<{ path: string; content: string }> = [];

      if (requestedPaths.length > 0) {
        for (const p of requestedPaths) {
          const safePath = validateSafeWorkspacePath(p);
          if (await context.workspace.fileExists(safePath)) {
            targetFiles.push({ path: safePath, content: await context.workspace.readFile(safePath) });
          }
        }
      } else {
        const listed = await context.workspace.listFiles({ recursive: true, maxFiles: 100 });
        for (const f of listed) {
          if (f.type === 'file') {
            try {
              targetFiles.push({ path: f.path, content: await context.workspace.readFile(f.path) });
            } catch {}
          }
        }
      }

      const { ValidationService } = await import('../../server/validation/validationService');
      const checkResult = ValidationService.validateSyntax(targetFiles);
      return {
        toolName: 'inspect_diagnostics',
        success: true,
        data: {
          status: checkResult.status,
          filesChecked: targetFiles.length,
          diagnostics: checkResult.diagnostics,
          message: checkResult.message,
        },
        durationMs: Date.now() - start,
        timestamp: start,
      };
    } catch (err: any) {
      return {
        toolName: 'inspect_diagnostics',
        success: false,
        error: err?.message || String(err),
        durationMs: Date.now() - start,
        timestamp: start,
      };
    }
  },
};

/**
 * 7. inspect_git tool: Inspects workspace Git status and unified diffs.
 */
export const inspectGitTool: IToolDefinition = {
  name: 'inspect_git',
  description: 'Inspects current Git branch, working tree status, and unified diff.',
  parametersSchema: CANONICAL_TOOL_SCHEMAS.inspect_git,
  requiresApproval: false,
  async execute(args: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const start = Date.now();
    const validationError = validateToolArgs('inspect_git', args);
    if (validationError) {
      return { toolName: 'inspect_git', success: false, error: validationError, durationMs: Date.now() - start, timestamp: start };
    }

    try {
      const rootUri = context.workspace.getRootUri();
      if (rootUri.startsWith('file://')) {
        const fsPath = rootUri.replace(/^file:\/\//, '');
        const { NativeLocalGitService } = await import('../git/nativeLocalGitService');
        const git = new NativeLocalGitService(fsPath);
        if (await git.isGitRepository()) {
          const status = await git.getStatus();
          const diff = args.includeDiff !== false ? await git.getDiff() : '';
          return {
            toolName: 'inspect_git',
            success: true,
            data: {
              mode: 'native_git',
              branch: status.branch,
              clean: status.clean,
              entries: status.entries,
              diff: sanitizeToolOutputText(diff.slice(0, 24_000)),
            },
            durationMs: Date.now() - start,
            timestamp: start,
          };
        }
      }

      const files = await context.workspace.listFiles({ recursive: true, maxFiles: 100 });
      return {
        toolName: 'inspect_git',
        success: true,
        data: {
          mode: 'workspace_snapshot',
          branch: 'main',
          clean: true,
          trackedFileCount: files.filter(f => f.type === 'file').length,
          diff: '',
        },
        durationMs: Date.now() - start,
        timestamp: start,
      };
    } catch (err: any) {
      return {
        toolName: 'inspect_git',
        success: false,
        error: err?.message || String(err),
        durationMs: Date.now() - start,
        timestamp: start,
      };
    }
  },
};

/**
 * 8. request_approval tool: Requests explicit human approval for privileged actions.
 */
export const requestApprovalTool: IToolDefinition = {
  name: 'request_approval',
  description: 'Requests explicit human approval before executing privileged commands, Git pushes, or mutations.',
  parametersSchema: CANONICAL_TOOL_SCHEMAS.request_approval,
  requiresApproval: true,
  async execute(args: any, _context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const start = Date.now();
    const validationError = validateToolArgs('request_approval', args);
    if (validationError) {
      return { toolName: 'request_approval', success: false, error: validationError, durationMs: Date.now() - start, timestamp: start };
    }

    const action = String(args.action).trim();
    const reason = String(args.reason).trim();
    const target = args.target ? String(args.target).trim() : undefined;

    return {
      toolName: 'request_approval',
      success: true,
      requiresApproval: true,
      approvalReason: `${action}: ${reason}`,
      data: {
        approvalId: `appr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        action,
        reason,
        target,
        status: 'pending_user_approval',
      },
      durationMs: Date.now() - start,
      timestamp: start,
    };
  },
};

/**
 * 9. propose_changes tool: Generates a multi-file unified diff proposal.
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
 * 10. run_command tool: Runs approved verification commands.
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

    const policy = TerminalExecutionPolicy.evaluateCommand(command);
    if (!policy.permitted || policy.isDangerous) {
      return {
        toolName: 'run_command',
        success: false,
        error: `Command "${command}" is blocked by TerminalExecutionPolicy: ${policy.reason}`,
        durationMs: Date.now() - start,
        timestamp: start,
      };
    }

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
              stdout: sanitizeToolOutputText(stdout ? stdout.toString() : '').slice(0, 50_000),
              stderr: sanitizeToolOutputText(stderr ? stderr.toString() : '').slice(0, 50_000),
              exitCode: typeof error?.code === 'number' ? error.code : (error ? 1 : 0),
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
  registry.register(retrieveContextTool);
  registry.register(inspectDiagnosticsTool);
  registry.register(inspectGitTool);
  registry.register(requestApprovalTool);
  registry.register(proposeChangesTool);
  registry.register(runCommandTool);
  return registry;
}
