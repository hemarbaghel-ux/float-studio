import { ToolDefinition, ToolResult, ToolExecutionContext } from './types';
import { searchCodebase } from '../../services/codebaseSearch';
import { ProposalService } from './proposalService';
import { applyAgentChangesToWorktree } from './agentGitWorktree';

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
  name: 'list_project_files',
  description: 'Lists all files within the authorized project workspace, excluding secrets and build artifacts.',
  parameters: {
    type: 'object',
    properties: {
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
    const subpath = args.subpath ? args.subpath.trim().replace(/^\/+/, '') : '';
    
    if (subpath.includes('../')) {
      return { success: false, error: 'Path traversal (../) is not allowed.' };
    }

    const matchedFiles: string[] = [];
    const maxEntries = 120;

    for (const [path, file] of context.virtualFiles.entries()) {
      if (file.type !== 'file') continue;
      if (isSensitivePath(path)) continue;

      if (!subpath || path.startsWith(subpath)) {
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
  name: 'search_project',
  description: 'Searches project filenames and source code contents using ranked lexical search with line numbers.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query or keyword (e.g. function name, class, import, variable)'
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
    const rawQuery = String(args.query || '').trim();
    if (!rawQuery) {
      return { success: false, error: 'Query argument cannot be empty.' };
    }

    const maxResults = Math.min(Math.max(1, Number(args.maxResults) || 8), 15);

    // Convert map to FileNode[] format for searchCodebase
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

      // Identify key manifests or entrypoints
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
      } catch (e) {
        return { success: false, error: 'Invalid JSON format for "changes" parameter.' };
      }
    }

    if (!Array.isArray(rawChanges) || rawChanges.length === 0) {
      return { success: false, error: '"changes" must be a non-empty array of file change objects.' };
    }

    const proposalResult = await ProposalService.createProposalDurable({
      ownerId: context.userId,
      projectId: context.projectId,
      agentTaskId: context.agentTaskId,
      description,
      rawChanges,
      virtualFiles: context.virtualFiles
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
 * Central Tool Registry
 */
export class ToolRegistry {
  private static tools: Map<string, ToolDefinition> = new Map([
    ['list_project_files', listProjectFilesTool],
    ['read_project_file', readProjectFileTool],
    ['search_project', searchProjectTool],
    ['get_project_context', getProjectContextTool],
    ['propose_changes', proposeChangesTool],
    // Aliases for compatibility with earlier agent prompts
    ['list_files', listProjectFilesTool],
    ['read_file', readProjectFileTool],
    ['search_codebase', searchProjectTool]
  ]);

  static getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  static getAllTools(): ToolDefinition[] {
    // Return primary tools (deduplicating aliases)
    const primary = [
      listProjectFilesTool,
      readProjectFileTool,
      searchProjectTool,
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

    // 2. Intercept prohibited direct-modification tools
    const DIRECT_MODIFICATION_TOOLS = [
      'write_file',
      'write_project_file',
      'edit_file',
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
        error: `Direct file modification via "${name}" is strictly prohibited. FLOAT AI enforces a review-first workflow: you MUST use the "propose_changes" tool to submit proposed file modifications for user review and approval.`
      };
    }

    // 3. Intercept prohibited command execution tools
    const DIRECT_EXECUTION_TOOLS = [
      'run_command',
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
        error: `Direct command execution via "${name}" is prohibited in agent workflow. Use read-only tools to inspect the project and "propose_changes" for code updates.`
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

    // 5. Tool argument schema validation
    if (tool.parameters.required && Array.isArray(tool.parameters.required)) {
      for (const reqKey of tool.parameters.required) {
        if (
          args[reqKey] === undefined || 
          args[reqKey] === null || 
          (typeof args[reqKey] === 'string' && !args[reqKey].trim())
        ) {
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
      // Execute with timeout safeguard
      const timeoutMs = tool.timeoutMs || 8000;
      const timeoutPromise = new Promise<ToolResult>((_, reject) => {
        setTimeout(() => reject(new Error(`Tool "${name}" timed out after ${timeoutMs}ms`)), timeoutMs);
      });

      const execPromise = tool.handler(args, context);
      const result = await Promise.race([execPromise, timeoutPromise]);
      return result;
    } catch (err: any) {
      return {
        success: false,
        error: `Execution error in tool "${name}": ${err.message || String(err)}`
      };
    }
  }
}
