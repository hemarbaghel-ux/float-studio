import { ToolDefinition, ToolResult, ToolExecutionContext } from './types';
import { searchCodebase } from '../../services/codebaseSearch';
import { ProposalService, computeDiffStats } from './proposalService';
import { applyAgentChangesToWorktree } from './agentGitWorktree';
import { workspaceIndexManager } from '../../services/indexing/workspaceIndexManager';
import { DiagnosticsService } from '../diagnostics/diagnosticsService';
import { ValidationService } from '../validation/validationService';
import { projectProcessManager } from '../execution/processManager';

// Patterns to exclude from file listings and reads
const SENSITIVE_SEGMENT = /^(?:\.env(?:$|\.)|\.git$|node_modules$|vendor$|dist$|build$|coverage$|\.next$|\.cache$|\.venv$|venv$|\.ssh$|\.aws$|\.npmrc$|\.pypirc$|\.netrc$|\.ds_store$|id_rsa(?:$|\.)|id_ed25519(?:$|\.))/i;
const SENSITIVE_EXTENSION = /\.(?:pem|key|p12|pfx|keystore|crt|cer)$/i;

function isSensitivePath(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return norm.split('/').some(segment => SENSITIVE_SEGMENT.test(segment)) || SENSITIVE_EXTENSION.test(norm);
}

function sanitizePath(rawPath: string): { safePath: string; error?: string } {
  if (!rawPath || typeof rawPath !== 'string') {
    return { safePath: '', error: 'Path is required.' };
  }
  const normalized = rawPath.trim().replace(/\\/g, '/');
  if (normalized.includes('\0') || normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.split('/').some(part => !part || part === '.' || part === '..')) {
    return { safePath: '', error: 'Path traversal (../) is strictly forbidden.' };
  }
  if (isSensitivePath(normalized)) {
    return { safePath: '', error: `Access to sensitive path "${normalized}" is forbidden.` };
  }
  return { safePath: normalized };
}

/**
 * 1. list_project_files
 */
const listProjectFilesTool: ToolDefinition = {
  name: 'list_files',
  description: 'Lists all files within the authorized project workspace, excluding secrets and build artifacts.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to list (e.g. "." or "src" or "src/components")'
      },
      subpath: {
        type: 'string',
        description: 'Optional subfolder path to filter listings (e.g. "src" or "src/components")'
      }
    }
  },
  permissionRequired: 'read',
  timeoutMs: 5000,
  maxOutputChars: 12000,
  handler: async (args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> => {
    const raw = String(args.path ?? args.subpath ?? '').trim();
    const subpath = (raw === '.' || raw === './' || raw === '/') ? '' : raw.replace(/^\/+/, '');
    
    if (subpath.includes('../')) {
      return { success: false, error: 'Path traversal (../) is not allowed.' };
    }

    const matchedFiles: string[] = [];
    const maxEntries = 120;

    for (const [path, file] of context.virtualFiles.entries()) {
      if (file.type !== 'file') continue;
      if (isSensitivePath(path)) continue;

      if (!subpath || path === subpath || path.startsWith(subpath.endsWith('/') ? subpath : `${subpath}/`)) {
        matchedFiles.push(path);
      }
      if (matchedFiles.length >= maxEntries) break;
    }

    matchedFiles.sort();

    return {
      success: true,
      output: {
        totalFound: matchedFiles.length,
        files: matchedFiles,
        truncated: matchedFiles.length >= maxEntries
      }
    };
  }
};

/**
 * 2. read_project_file
 */
const readProjectFileTool: ToolDefinition = {
  name: 'read_project_file',
  description: 'Reads the text content of a project file with optional line-range boundaries.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The relative project path of the file to read (e.g. "src/App.tsx")'
      },
      startLine: {
        type: 'number',
        description: 'Optional 1-based start line to read from'
      },
      endLine: {
        type: 'number',
        description: 'Optional 1-based end line to read up to'
      }
    },
    required: ['path']
  },
  permissionRequired: 'read',
  timeoutMs: 5000,
  maxOutputChars: 18000,
  handler: async (args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> => {
    const { safePath, error } = sanitizePath(args.path);
    if (error) {
      return { success: false, error };
    }

    const file = context.virtualFiles.get(safePath);
    if (!file || file.type !== 'file') {
      return { success: false, error: `File not found in project: "${safePath}"` };
    }

    const fullContent = file.content || '';
    const allLines = fullContent.split('\n');
    const totalLines = allLines.length;

    let start = 1;
    let end = totalLines;

    if (typeof args.startLine === 'number' && args.startLine > 0) {
      start = Math.min(args.startLine, totalLines);
    }
    if (typeof args.endLine === 'number' && args.endLine >= start) {
      end = Math.min(args.endLine, totalLines);
    }

    // Line window extraction
    const selectedLines = allLines.slice(start - 1, end);
    let content = selectedLines
      .map((line, idx) => `${start + idx}: ${line}`)
      .join('\n');

    let truncated = false;
    const MAX_CHARS = 16000;
    if (content.length > MAX_CHARS) {
      content = content.slice(0, MAX_CHARS) + '\n... [Content truncated due to size limit]';
      truncated = true;
    }

    return {
      success: true,
      output: {
        path: safePath,
        startLine: start,
        endLine: end,
        totalLines,
        content,
        truncated
      }
    };
  }
};

/**
 * 3. search_project
 */
const searchProjectTool: ToolDefinition = {
  name: 'search_code',
  description: 'Searches project filenames and source code contents using ranked lexical search with line numbers.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The search pattern or keyword (e.g. function name, class, import, variable)'
      },
      query: {
        type: 'string',
        description: 'The search query or keyword (alias for pattern)'
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of matches to return (default 8, max 15)'
      }
    },
    required: ['query']
  },
  permissionRequired: 'read',
  timeoutMs: 8000,
  maxOutputChars: 16000,
  handler: async (args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> => {
    const rawQuery = String(args.pattern || args.query || '').trim();
    if (!rawQuery) {
      return { success: false, error: 'Query or pattern argument cannot be empty.' };
    }

    const maxResults = Math.min(Math.max(1, Number(args.maxResults) || 8), 15);

    const fileNodes: any[] = [];
    for (const [path, file] of context.virtualFiles.entries()) {
      if (isSensitivePath(path)) continue;
      fileNodes.push({
        id: path,
        name: file.name || path.split('/').pop() || path,
        type: file.type,
        content: file.content
      });
    }

    const matches = searchCodebase(fileNodes, rawQuery, {
      maxResults,
      contextLines: 2,
      projectId: context.projectId
    });

    const formatted = matches.map(m => ({
      filePath: m.filePath,
      startLine: m.startLine,
      endLine: m.endLine,
      matchType: m.matchType,
      excerpt: m.contentExcerpt,
      symbol: m.symbol ? { name: m.symbol.name, kind: m.symbol.kind, line: m.symbol.line } : undefined,
      signals: m.signals
    }));

    return {
      success: true,
      output: {
        query: rawQuery,
        matchesFound: formatted.length,
        results: formatted
      }
    };
  }
};

/**
 * 4. get_project_context
 */
const getProjectContextTool: ToolDefinition = {
  name: 'get_project_context',
  description: 'Retrieves authorized project metadata, structure overview, and key manifest details.',
  parameters: {
    type: 'object',
    properties: {}
  },
  permissionRequired: 'read',
  timeoutMs: 5000,
  maxOutputChars: 10000,
  handler: async (_args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> => {
    const fileSummary: Record<string, number> = {};
    let totalFiles = 0;
    const keyFiles: string[] = [];

    for (const [path, file] of context.virtualFiles.entries()) {
      if (file.type !== 'file') continue;
      if (isSensitivePath(path)) continue;
      totalFiles++;

      const ext = path.includes('.') ? path.split('.').pop() || 'unknown' : 'no_ext';
      fileSummary[ext] = (fileSummary[ext] || 0) + 1;

      if (/package\.json$|tsconfig\.json$|main\.py$|server\.ts$|README\.md$/i.test(path)) {
        keyFiles.push(path);
      }
    }

    return {
      success: true,
      output: {
        projectName: context.projectName,
        projectId: context.projectId,
        totalFiles,
        extensions: fileSummary,
        keyEntrypoints: keyFiles
      }
    };
  }
};

/**
 * 5. propose_changes (Structured change set proposal for review)
 */
const proposeChangesTool: ToolDefinition = {
  name: 'propose_changes',
  description: 'Submits proposed file modifications or creations for user review. Does not directly modify files.',
  parameters: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'A concise summary of the proposed code changes'
      },
      changes: {
        type: 'string',
        description: 'JSON string of changes array: [{"path": string, "operation": "create"|"modify"|"delete", "proposedContent": string}]'
      }
    },
    required: ['description', 'changes']
  },
  permissionRequired: 'write',
  timeoutMs: 5000,
  handler: async (args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> => {
    const description = String(args.description || '').trim();
    let rawChanges = args.changes;

    if (typeof rawChanges === 'string') {
      try {
        rawChanges = JSON.parse(rawChanges);
      } catch {
        return { success: false, error: 'Invalid JSON format for "changes" parameter.' };
      }
    }

    if (!Array.isArray(rawChanges) || rawChanges.length === 0) {
      return { success: false, error: '"changes" must be a non-empty array of file change objects.' };
    }

    // Build baseline map using any prior untouched snapshots from context.baselineFiles
    const baselineVirtualFiles = new Map<string, { path: string; name?: string; content?: string; type: string }>();
    for (const [k, v] of context.virtualFiles.entries()) {
      baselineVirtualFiles.set(k, { ...v });
    }
    if (context.baselineFiles) {
      for (const [k, orig] of context.baselineFiles.entries()) {
        if (orig === null) {
          baselineVirtualFiles.delete(k);
        } else {
          baselineVirtualFiles.set(k, { ...orig });
        }
      }
    }

    const proposalResult = await ProposalService.createProposalDurable({
      ownerId: context.userId,
      projectId: context.projectId,
      agentTaskId: context.agentTaskId,
      description,
      rawChanges,
      virtualFiles: baselineVirtualFiles
    });

    if (proposalResult.error || !proposalResult.proposal) {
      return { success: false, error: proposalResult.error || 'Failed to create change proposal.' };
    }

    const proposal = proposalResult.proposal;

    let worktree: { branch: string; baseCommit: string; diff: string } | undefined;
    if (context.agentTaskId) {
      try {
        worktree = await applyAgentChangesToWorktree(context.agentTaskId, context.userId, proposal.changes, context.signal);
        proposal.agentTaskId = context.agentTaskId;
        proposal.agentBranch = worktree.branch;
        proposal.agentBaseCommit = worktree.baseCommit;
        proposal.agentDiff = worktree.diff;
        await ProposalService.persistProposalMetadata(proposal);
      } catch (error: any) {
        await ProposalService.rejectProposalDurable(proposal.id, context.userId, context.userId).catch(() => undefined);
        return { success: false, error: error?.message || 'Could not update the isolated agent worktree with this proposal.' };
      }
    }

    return {
      success: true,
      output: {
        proposalId: proposal.id,
        description: proposal.description,
        status: proposal.status,
        affectedFiles: proposal.affectedFiles,
        changesCount: proposal.changes.length,
        changes: proposal.changes,
        ...(worktree ? { worktree } : {}),
        proposal
      }
    };
  }
};

/**
 * 6. find_symbol: Finds symbol declarations (functions, classes, interfaces, etc.)
 */
const findSymbolTool: ToolDefinition = {
  name: 'find_symbol',
  description: 'Locates symbol declarations (functions, classes, interfaces, types, methods, enums, variables) across project files.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The symbol name or identifier to search for (e.g. "handleLogin", "AuthService", "User")'
      },
      kind: {
        type: 'string',
        description: 'Optional symbol kind filter: function, class, interface, type, enum, method, variable'
      }
    },
    required: ['name']
  },
  permissionRequired: 'read',
  timeoutMs: 5000,
  maxOutputChars: 12000,
  handler: async (args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> => {
    const rawName = String(args.name || '').trim();
    if (!rawName) {
      return { success: false, error: 'Symbol "name" parameter is required.' };
    }

    const fileNodes: any[] = [];
    for (const [path, file] of context.virtualFiles.entries()) {
      if (isSensitivePath(path)) continue;
      fileNodes.push({
        path,
        name: file.name || path.split('/').pop() || path,
        type: file.type,
        content: file.content
      });
    }

    const index = workspaceIndexManager.syncProject(context.projectId, fileNodes);
    const matches = index.findSymbols(rawName, args.kind ? String(args.kind).trim().toLowerCase() : undefined);

    const formatted = matches.slice(0, 20).map(m => ({
      name: m.symbol.name,
      kind: m.symbol.kind,
      filePath: m.path,
      line: m.symbol.line,
      endLine: m.symbol.endLine,
      signature: m.symbol.signature,
      containerName: m.symbol.containerName,
      docComment: m.symbol.docComment
    }));

    return {
      success: true,
      output: {
        query: rawName,
        matchesFound: formatted.length,
        symbols: formatted
      }
    };
  }
};

/**
 * 7. read_diagnostics: Reads active compiler, linter, runtime or build diagnostics
 */
const readDiagnosticsTool: ToolDefinition = {
  name: 'read_diagnostics',
  description: 'Reads active project diagnostics, TypeScript compiler errors, linter issues, test failures, or runtime exceptions.',
  parameters: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Optional filter by diagnostic source: typescript, eslint, build, test, runtime, terminal, browser'
      }
    }
  },
  permissionRequired: 'read',
  timeoutMs: 5000,
  maxOutputChars: 14000,
  handler: async (args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> => {
    const sourceFilter = args.source ? String(args.source).trim().toLowerCase() as any : undefined;
    const items = DiagnosticsService.getDiagnostics(context.projectId, sourceFilter, context.userId);

    // If no stored runtime diagnostics, perform a quick syntax check on virtual files
    if (items.length === 0) {
      const filesToCheck: Array<{ path: string; content?: string }> = [];
      for (const [path, file] of context.virtualFiles.entries()) {
        if (isSensitivePath(path)) continue;
        if (/\.(ts|tsx|js|jsx|json)$/i.test(path)) {
          filesToCheck.push({ path, content: file.content });
        }
      }
      const checkResult = ValidationService.validateSyntax(filesToCheck);
      return {
        success: true,
        output: {
          totalDiagnostics: checkResult.diagnostics.length,
          status: checkResult.diagnostics.length === 0 ? 'clean' : 'errors_detected',
          diagnostics: checkResult.diagnostics.slice(0, 20).map(d => ({
            source: d.source,
            severity: d.severity,
            filePath: d.filePath,
            line: d.line,
            column: d.column,
            message: d.message
          }))
        }
      };
    }

    return {
      success: true,
      output: {
        totalDiagnostics: items.length,
        diagnostics: items.slice(0, 20).map(d => ({
          source: d.source,
          severity: d.severity,
          filePath: d.filePath,
          line: d.line,
          column: d.column,
          message: d.message,
          code: d.code
        }))
      }
    };
  }
};

/**
 * 8. get_git_diff: Inspects working tree diffs or uncommitted changes against baselineFiles
 */
const getGitDiffTool: ToolDefinition = {
  name: 'get_git_diff',
  description: 'Inspects uncommitted file modifications, working tree status, or differences against the untouched project baseline.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Optional file path filter to inspect diff for a specific file'
      }
    }
  },
  permissionRequired: 'read',
  timeoutMs: 6000,
  maxOutputChars: 16000,
  handler: async (args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> => {
    let filterPath = '';
    if (args.path !== undefined && args.path !== null && String(args.path).trim() !== '') {
      const sanitized = sanitizePath(String(args.path));
      if (sanitized.error) {
        return { success: false, error: sanitized.error };
      }
      filterPath = sanitized.safePath;
    }

    const diffs: Array<{
      path: string;
      status: 'modified' | 'added' | 'deleted';
      additions: number;
      deletions: number;
      summary: string;
    }> = [];
    let filesChecked = 0;

    const baselineMap = context.baselineFiles;
    const allPaths = Array.from(
      new Set<string>([
        ...context.virtualFiles.keys(),
        ...(baselineMap ? baselineMap.keys() : [])
      ])
    ).sort();

    for (const filePath of allPaths) {
      if (filterPath && filePath !== filterPath) continue;
      if (isSensitivePath(filePath)) continue;

      const currRaw = context.virtualFiles.get(filePath);
      const curr = currRaw && currRaw.type === 'file' ? currRaw : null;

      // If baselineMap was captured, use it as authoritative untouched baseline; otherwise file is unchanged against itself
      const baseRaw = baselineMap ? baselineMap.get(filePath) : curr;
      const base = baseRaw && baseRaw.type === 'file' ? baseRaw : null;

      if (!curr && !base) continue;
      filesChecked++;

      if (!base && curr) {
        const stats = computeDiffStats('', curr.content || '');
        diffs.push({
          path: filePath,
          status: 'added',
          additions: stats.additions,
          deletions: 0,
          summary: `Added file (+${stats.additions} lines)`
        });
      } else if (base && !curr) {
        const stats = computeDiffStats(base.content || '', '');
        diffs.push({
          path: filePath,
          status: 'deleted',
          additions: 0,
          deletions: stats.deletions,
          summary: `Deleted file (-${stats.deletions} lines)`
        });
      } else if (base && curr) {
        const normBase = (base.content || '').replace(/\r\n/g, '\n');
        const normCurr = (curr.content || '').replace(/\r\n/g, '\n');
        if (normBase !== normCurr) {
          const stats = computeDiffStats(base.content || '', curr.content || '');
          diffs.push({
            path: filePath,
            status: 'modified',
            additions: stats.additions,
            deletions: stats.deletions,
            summary: `Modified file (+${stats.additions} / -${stats.deletions} lines)`
          });
        }
      }
    }

    return {
      success: true,
      output: {
        filesChecked,
        hasChanges: diffs.length > 0,
        totalModified: diffs.length,
        addedCount: diffs.filter(d => d.status === 'added').length,
        modifiedCount: diffs.filter(d => d.status === 'modified').length,
        deletedCount: diffs.filter(d => d.status === 'deleted').length,
        diffs: diffs.slice(0, 50)
      }
    };
  }
};

/**
 * 9. run_validation: Runs TypeScript AST syntax checks and diagnostic verification
 */
const runValidationTool: ToolDefinition = {
  name: 'run_validation',
  description: 'Runs code validation, TypeScript AST syntax checks, and diagnostic verification across project files.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Optional file path to validate specifically. If omitted, validates all code files.'
      }
    }
  },
  permissionRequired: 'read',
  timeoutMs: 8000,
  maxOutputChars: 14000,
  handler: async (args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> => {
    const specificPath = args.path ? sanitizePath(args.path).safePath : '';
    const filesToCheck: Array<{ path: string; content?: string }> = [];

    for (const [path, file] of context.virtualFiles.entries()) {
      if (specificPath && path !== specificPath) continue;
      if (isSensitivePath(path)) continue;
      if (/\.(ts|tsx|js|jsx|json|py)$/i.test(path)) {
        filesToCheck.push({ path, content: file.content });
      }
    }

    const checkResult = ValidationService.validateSyntax(filesToCheck);

    return {
      success: true,
      output: {
        filesChecked: filesToCheck.length,
        passed: checkResult.diagnostics.length === 0,
        errorCount: checkResult.diagnostics.length,
        diagnostics: checkResult.diagnostics.slice(0, 20).map(d => ({
          filePath: d.filePath,
          line: d.line,
          column: d.column,
          severity: d.severity,
          message: d.message,
          source: d.source
        }))
      }
    };
  }
};

/**
 * 10. edit_file: Cursor-like targeted file replacement with uniqueness check, baseline preservation, and multi-file accumulation
 */
const editFileTool: ToolDefinition = {
  name: 'edit_file',
  description: 'Replace old_str with new_str in a file (old_str must be unique). Stages changes and generates a visual diff for user review and approval.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative project path of the file to edit (e.g. "src/App.tsx")'
      },
      old_str: {
        type: 'string',
        description: 'The exact string to replace. Must match uniquely within the file.'
      },
      new_str: {
        type: 'string',
        description: 'The replacement string to substitute in place of old_str (may be empty string "" to delete old_str).'
      }
    },
    required: ['path', 'old_str', 'new_str']
  },
  permissionRequired: 'write',
  timeoutMs: 8000,
  handler: async (args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> => {
    const { safePath, error } = sanitizePath(args.path);
    if (error) return { success: false, error };

    const file = context.virtualFiles.get(safePath);
    if (!file || file.type !== 'file') {
      return { success: false, error: `File not found in project: "${safePath}"` };
    }

    const oldStr = typeof args.old_str === 'string' ? args.old_str : String(args.old_str ?? '');
    const newStr = typeof args.new_str === 'string' ? args.new_str : String(args.new_str ?? '');

    if (!oldStr) {
      return { success: false, error: 'Parameter "old_str" cannot be empty.' };
    }

    const currentContent = file.content || '';
    const occurrences = currentContent.split(oldStr).length - 1;

    if (occurrences === 0) {
      return {
        success: false,
        error: `Target string "old_str" was not found in "${safePath}". Ensure exact indentation, whitespace, and formatting match the file.`
      };
    }

    if (occurrences > 1) {
      return {
        success: false,
        error: `Target string "old_str" matched ${occurrences} times in "${safePath}". It must be unique. Provide more surrounding context lines to make old_str unique.`
      };
    }

    const updatedContent = currentContent.replace(oldStr, newStr);

    // Record untouched baseline snapshot before first edit to this file in the session
    if (!context.baselineFiles) {
      context.baselineFiles = new Map();
    }
    if (!context.baselineFiles.has(safePath)) {
      context.baselineFiles.set(safePath, { ...file });
    }

    // Update working overlay in context.virtualFiles so subsequent read_file / edit_file / run_validation calls see the edit
    context.virtualFiles.set(safePath, {
      ...file,
      content: updatedContent
    });

    // Build consolidated rawChanges across all edited files in context.baselineFiles against untouched baseline
    const baselineVirtualFiles = new Map<string, { path: string; name?: string; content?: string; type: string }>();
    for (const [k, v] of context.virtualFiles.entries()) {
      baselineVirtualFiles.set(k, { ...v });
    }
    const consolidatedRawChanges: Array<{ path: string; operation: 'create' | 'modify' | 'delete'; proposedContent?: string }> = [];

    const allSessionPaths = new Set<string>([
      ...context.baselineFiles.keys(),
      ...context.virtualFiles.keys()
    ]);
    for (const candidatePath of allSessionPaths) {
      if (isSensitivePath(candidatePath)) continue;
      const baselineEntry = context.baselineFiles.has(candidatePath) ? context.baselineFiles.get(candidatePath) ?? null : null;
      if (baselineEntry === null) {
        baselineVirtualFiles.delete(candidatePath);
      } else {
        baselineVirtualFiles.set(candidatePath, { ...baselineEntry });
      }
      const latestEntry = context.virtualFiles.get(candidatePath);
      if (!baselineEntry && latestEntry && latestEntry.type === 'file') {
        consolidatedRawChanges.push({
          path: candidatePath,
          operation: 'create',
          proposedContent: latestEntry.content || ''
        });
      } else if (baselineEntry && baselineEntry.type === 'file' && !latestEntry) {
        consolidatedRawChanges.push({
          path: candidatePath,
          operation: 'delete'
        });
      } else if (baselineEntry && latestEntry && (baselineEntry.content || '') !== (latestEntry.content || '')) {
        consolidatedRawChanges.push({
          path: candidatePath,
          operation: 'modify',
          proposedContent: latestEntry.content || ''
        });
      }
    }

    // Fallback if edit resulted in identical content as original baseline
    if (consolidatedRawChanges.length === 0) {
      consolidatedRawChanges.push({
        path: safePath,
        operation: 'modify',
        proposedContent: updatedContent
      });
    }

    const editedFilesList = consolidatedRawChanges.map(c => c.path);
    const description =
      editedFilesList.length === 1
        ? `Edit ${safePath}: replace target code block`
        : `Edit ${editedFilesList.length} files (${editedFilesList.join(', ')})`;

    const proposalResult = await ProposalService.createProposalDurable({
      ownerId: context.userId,
      projectId: context.projectId,
      agentTaskId: context.agentTaskId,
      description,
      rawChanges: consolidatedRawChanges,
      virtualFiles: baselineVirtualFiles
    });

    if (proposalResult.error || !proposalResult.proposal) {
      return { success: false, error: proposalResult.error || 'Failed to create code modification proposal.' };
    }

    const proposal = proposalResult.proposal;
    if (context.agentTaskId) {
      try {
        const worktree = await applyAgentChangesToWorktree(context.agentTaskId, context.userId, proposal.changes, context.signal);
        proposal.agentTaskId = context.agentTaskId;
        proposal.agentBranch = worktree.branch;
        proposal.agentBaseCommit = worktree.baseCommit;
        proposal.agentDiff = worktree.diff;
        await ProposalService.persistProposalMetadata(proposal);
      } catch {
        // Non-fatal if worktree session was not initialized for this context
      }
    }

    return {
      success: true,
      output: {
        status: 'staged_for_review',
        path: safePath,
        message: `Successfully staged edit for "${safePath}". A visual diff has been generated for developer review and approval.`,
        proposalId: proposal.id,
        proposal,
        changes: proposal.changes
      }
    };
  }
};

/**
 * 11. run_command: Workspace command runner / validation check (Sandboxed)
 */
const APPROVED_SANDBOX_COMMANDS = /^(?:npm\s+(?:test|run\s+(?:test|lint|build|check|typecheck))(?:\s+--.*)?|npx\s+tsc(?:\s+--noEmit)?|tsc(?:\s+--noEmit)?|pytest(?:\s+[\w./-]+)?|node\s+--check\s+[\w./-]+|python3?\s+-m\s+py_compile\s+[\w./-]+)$/i;
const LIGHTWEIGHT_SYNTAX_COMMANDS = /^(?:syntax-check|validate-syntax|ast-syntax-check)$/i;

const runCommandTool: ToolDefinition = {
  name: 'run_command',
  description: 'Run a project validation, test, or build command in the isolated workspace sandbox. Never executes raw commands on the host shell.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The command to run (e.g. "npm test", "npm run lint", "tsc --noEmit", "npm run build", or "syntax-check" for lightweight AST syntax validation only)'
      },
      mode: {
        type: 'string',
        description: 'Optional execution mode: "sandbox" (default, requires isolated sandbox) or "syntax_only" (runs lightweight syntax check only)'
      },
      approved: {
        type: 'string',
        description: 'Set to "true" when developer has explicitly approved a command requiring confirmation'
      }
    },
    required: ['command']
  },
  permissionRequired: 'read',
  timeoutMs: 15000,
  maxOutputChars: 16000,
  handler: async (args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> => {
    const rawCmd = String(args.command || '').trim();
    if (!rawCmd) {
      return { success: false, error: 'Parameter "command" cannot be empty.' };
    }

    // Reject dangerous, destructive, or shell-chained commands immediately
    if (/(^|[;&|`])\s*(rm\s+-rf|\/etc|chmod\s+777|curl|wget|mkfs|dd\s+if=|sudo\s+)/i.test(rawCmd) || /[;&|`]|\$\(/.test(rawCmd)) {
      return {
        success: false,
        error: `Command "${rawCmd}" rejected: destructive or chained shell commands are prohibited in agent workflow.`
      };
    }

    // Outcome 3: Explicit lightweight syntax validation only (never masquerades as tsc, eslint, npm test, or npm run build)
    if (LIGHTWEIGHT_SYNTAX_COMMANDS.test(rawCmd) || String(args.mode || '').toLowerCase() === 'syntax_only') {
      const filesToCheck: Array<{ path: string; content?: string }> = [];
      for (const [p, file] of context.virtualFiles.entries()) {
        if (isSensitivePath(p)) continue;
        if (/\.(ts|tsx|js|jsx|json|py)$/i.test(p)) {
          filesToCheck.push({ path: p, content: file.content });
        }
      }
      const validation = ValidationService.validateSyntax(filesToCheck);
      const passed = validation.diagnostics.length === 0;
      const summary = passed
        ? `Lightweight syntax validation only (full command "${rawCmd}" did NOT execute): 0 syntax errors across ${filesToCheck.length} file(s).`
        : `Lightweight syntax validation only (full command "${rawCmd}" did NOT execute): ${validation.diagnostics.length} syntax error(s) detected:\n` +
          validation.diagnostics.slice(0, 10).map(d => `${d.filePath}:${d.line}:${d.column}: ${d.message}`).join('\n');

      return {
        success: passed,
        ...(passed ? {} : { error: summary }),
        output: {
          command: rawCmd,
          outcome: 'syntax_validation_only',
          status: 'syntax_validation_only',
          executed: false,
          sandboxExecuted: false,
          syntaxValidationOnly: true,
          syntaxPassed: passed,
          exitCode: null,
          output: summary,
          diagnostics: validation.diagnostics.slice(0, 10)
        }
      };
    }

    // Outcome 5: Command requires developer approval (either policy is "ask" / requireCommandApproval, or command is not on pre-approved allowlist)
    const isApproved = String(args.approved || '').toLowerCase() === 'true';
    const isAllowlisted = APPROVED_SANDBOX_COMMANDS.test(rawCmd);
    if ((context.requireCommandApproval || context.executionPolicy === 'ask' || !isAllowlisted) && !isApproved) {
      const approvalReason = !isAllowlisted
        ? `Command "${rawCmd}" is not in the pre-approved verification allowlist and requires explicit developer approval.`
        : `Command "${rawCmd}" requires developer approval under the active execution policy.`;
      return {
        success: false,
        error: approvalReason,
        output: {
          command: rawCmd,
          outcome: 'requires_approval',
          status: 'requires_approval',
          executed: false,
          sandboxExecuted: false,
          syntaxValidationOnly: false,
          exitCode: null,
          output: approvalReason
        }
      };
    }

    // Outcomes 1 & 2: Actual command execution in isolated ProjectProcessManager sandbox (never raw host shell)
    const sandboxAuthorized = process.env.FLOAT_ENABLE_AGENT_COMMAND_EXECUTION === 'true' || context.enableSandboxExecution === true;
    const hasCustomSandboxExecutor = typeof context.sandboxExecutor === 'function';
    const sandboxAvailable = hasCustomSandboxExecutor || projectProcessManager.available;

    if (sandboxAuthorized && sandboxAvailable) {
      try {
        const fileList = Array.from(context.virtualFiles.entries())
          .filter(([p, f]) => f.type === 'file' && !isSensitivePath(p))
          .map(([p, f]) => ({ path: p, content: f.content || '' }));
        const execFn = context.sandboxExecutor
          ? context.sandboxExecutor
          : (req: any) => projectProcessManager.execute(req);
        const result = await execFn({
          ownerId: context.userId,
          projectId: context.projectId,
          command: rawCmd,
          files: fileList,
          timeoutMs: 10000,
          signal: context.signal
        });

        const passed = result.status === 'succeeded' && result.exitCode === 0;
        if (passed) {
          // Outcome 1: Actual command executed in isolated sandbox and passed
          return {
            success: true,
            output: {
              command: rawCmd,
              outcome: 'sandbox_passed',
              status: 'succeeded',
              executed: true,
              sandboxExecuted: true,
              syntaxValidationOnly: false,
              exitCode: 0,
              stdout: result.stdout,
              stderr: result.stderr,
              output: result.stdout || result.stderr || `Command "${rawCmd}" executed in isolated sandbox and passed.`,
              durationMs: result.durationMs
            }
          };
        }

        // Outcome 2: Actual command executed in isolated sandbox and failed
        const failMsg = result.error || result.stderr || result.stdout || `Command "${rawCmd}" failed in isolated sandbox with exit code ${result.exitCode ?? 1}.`;
        return {
          success: false,
          error: failMsg,
          output: {
            command: rawCmd,
            outcome: 'sandbox_failed',
            status: result.status === 'timed_out' ? 'timed_out' : result.status === 'cancelled' ? 'cancelled' : 'failed',
            executed: true,
            sandboxExecuted: true,
            syntaxValidationOnly: false,
            exitCode: result.exitCode ?? 1,
            stdout: result.stdout,
            stderr: result.stderr,
            output: failMsg,
            durationMs: result.durationMs
          }
        };
      } catch (err: any) {
        return {
          success: false,
          error: err?.message || 'Isolated sandbox command execution failed.',
          output: {
            command: rawCmd,
            outcome: 'sandbox_failed',
            status: 'failed',
            executed: true,
            sandboxExecuted: true,
            syntaxValidationOnly: false,
            exitCode: 1,
            output: err?.message || 'Isolated sandbox command execution failed.'
          }
        };
      }
    }

    // Outcome 4: Command unavailable because sandboxing or dependencies are missing
    const unavailableReason = !sandboxAuthorized
      ? 'FLOAT_ENABLE_AGENT_COMMAND_EXECUTION is disabled by default for host safety.'
      : 'Isolated Docker sandbox runtime (FLOAT_DOCKER_BIN, FLOAT_EXECUTION_IMAGE, TLS runner) or project dependencies are not configured.';

    return {
      success: false,
      error: `Command "${rawCmd}" could not be executed because isolated sandboxing or dependencies are unavailable: ${unavailableReason} Use "run_validation" (or run_command with mode="syntax_only") for lightweight AST syntax validation.`,
      output: {
        command: rawCmd,
        outcome: 'command_unavailable',
        status: 'command_unavailable',
        executed: false,
        sandboxExecuted: false,
        syntaxValidationOnly: false,
        exitCode: null,
        reason: unavailableReason,
        output: `Command "${rawCmd}" did NOT execute (${unavailableReason}).`
      }
    };
  }
};

/**
 * Central Tool Registry
 */
export class ToolRegistry {
  private static tools: Map<string, ToolDefinition> = new Map([
    ['list_files', listProjectFilesTool],
    ['read_file', readProjectFileTool],
    ['edit_file', editFileTool],
    ['search_code', searchProjectTool],
    ['run_command', runCommandTool],
    ['list_project_files', listProjectFilesTool],
    ['read_project_file', readProjectFileTool],
    ['search_project', searchProjectTool],
    ['get_project_context', getProjectContextTool],
    ['find_symbol', findSymbolTool],
    ['read_diagnostics', readDiagnosticsTool],
    ['get_git_diff', getGitDiffTool],
    ['run_validation', runValidationTool],
    ['propose_changes', proposeChangesTool],
    ['search_codebase', searchProjectTool]
  ]);

  static getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  static getAllTools(): ToolDefinition[] {
    const primary = [
      listProjectFilesTool,
      readProjectFileTool,
      editFileTool,
      searchProjectTool,
      runCommandTool,
      findSymbolTool,
      readDiagnosticsTool,
      getGitDiffTool,
      runValidationTool,
      getProjectContextTool,
      proposeChangesTool
    ];
    return primary;
  }

  static async execute(
    name: string,
    args: Record<string, any> = {},
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    // 1. Context validation
    if (!context || !context.virtualFiles || !(context.virtualFiles instanceof Map)) {
      return {
        success: false,
        error: 'Invalid project context: virtualFiles map is missing or invalid.'
      };
    }

    if (!context.projectId) {
      context.projectId = 'default-workspace';
    }
    if (!context.userId) {
      context.userId = 'user';
    }

    // Capture untouched baseline snapshot automatically on first tool call in this context if not already initialized
    if (!context.baselineFiles) {
      context.baselineFiles = new Map();
      for (const [k, v] of context.virtualFiles.entries()) {
        if (v && v.type === 'file' && !isSensitivePath(k)) {
          context.baselineFiles.set(k, { ...v });
        }
      }
    }

    // 2. Intercept prohibited direct-modification tools
    const DIRECT_MODIFICATION_TOOLS = [
      'write_file',
      'write_project_file',
      'modify_file',
      'delete_file',
      'delete_project_file',
      'create_file',
      'save_file',
      'apply_changes',
      'overwrite_file'
    ];
    if (DIRECT_MODIFICATION_TOOLS.includes(name.toLowerCase())) {
      return {
        success: false,
        error: `Direct file modification via "${name}" is strictly prohibited. FLOAT AI enforces a review-first workflow: you MUST use the "edit_file" or "propose_changes" tool to stage file modifications for user review and approval.`
      };
    }

    // 3. Intercept prohibited command execution tools
    const DIRECT_EXECUTION_TOOLS = [
      'execute_command',
      'exec',
      'shell',
      'bash',
      'terminal',
      'sh'
    ];
    if (DIRECT_EXECUTION_TOOLS.includes(name.toLowerCase())) {
      return {
        success: false,
        error: `Direct shell execution via "${name}" is prohibited in agent workflow. Use "run_command" for safe workspace verification commands.`
      };
    }

    // 4. Tool lookup
    const tool = this.getTool(name);
    if (!tool) {
      return {
        success: false,
        error: `Unknown tool "${name}". Available tools: ${this.getAllTools().map(t => t.name).join(', ')}`
      };
    }

    // Aliased argument mappings
    if (name === 'search_project' || name === 'search_code' || name === 'search_codebase') {
      if (args.pattern && !args.query) args.query = args.pattern;
      if (args.query && !args.pattern) args.pattern = args.query;
    }
    if (name === 'list_files' || name === 'list_project_files') {
      if (args.path && !args.subpath) args.subpath = args.path;
      if (args.subpath && !args.path) args.path = args.subpath;
    }

    // 5. Tool argument schema validation
    // Note: For edit_file, `new_str` may legitimately be the empty string "" when deleting lines of code.
    if (tool.parameters.required && Array.isArray(tool.parameters.required)) {
      for (const reqKey of tool.parameters.required) {
        const allowEmptyString = name === 'edit_file' && reqKey === 'new_str';
        if (
          args[reqKey] === undefined || 
          args[reqKey] === null || 
          (!allowEmptyString && typeof args[reqKey] === 'string' && !args[reqKey].trim())
        ) {
          if (name === 'edit_file') {
            return {
              success: false,
              error: `Missing or empty required parameter "${reqKey}" for tool "${name}". To stage edits for review, specify "path", "old_str", and "new_str", or use the "propose_changes" tool.`
            };
          }
          return {
            success: false,
            error: `Missing or empty required parameter "${reqKey}" for tool "${name}".`
          };
        }
      }
    }

    // Coerce and validate parameter types
    for (const [propName, propDef] of Object.entries(tool.parameters.properties || {})) {
      const val = args[propName];
      if (val !== undefined && val !== null) {
        if (propDef.type === 'number' && typeof val !== 'number') {
          const parsed = Number(val);
          if (isNaN(parsed)) {
            return {
              success: false,
              error: `Parameter "${propName}" must be a valid number, got ${typeof val}.`
            };
          }
          args[propName] = parsed;
        } else if (propDef.type === 'string' && typeof val !== 'string') {
          args[propName] = String(val);
        }
      }
    }

    // Parameter path traversal & security checks
    if (typeof args.path === 'string') {
      if (args.path.includes('\0')) {
        return { success: false, error: 'File path contains invalid null characters.' };
      }
      if (args.path.includes('../') || args.path.includes('..\\')) {
        return { success: false, error: 'Path traversal (../) is strictly forbidden.' };
      }
      if (isSensitivePath(args.path)) {
        return { success: false, error: `Access to sensitive path "${args.path}" is forbidden.` };
      }
    }

    if (typeof args.subpath === 'string') {
      if (args.subpath.includes('\0') || args.subpath.includes('../') || args.subpath.includes('..\\')) {
        return { success: false, error: 'Subpath contains invalid traversal characters.' };
      }
    }

    try {
      const timeoutMs = tool.timeoutMs || 8000;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeoutPromise = new Promise<ToolResult>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Tool "${name}" timed out after ${timeoutMs}ms`)), timeoutMs);
        });
        const execPromise = tool.handler(args, context);
        const result = await Promise.race([execPromise, timeoutPromise]);
        return result;
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch (err: any) {
      return {
        success: false,
        error: `Execution error in tool "${name}": ${err.message || String(err)}`
      };
    }
  }
}
