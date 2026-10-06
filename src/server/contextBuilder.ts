import { AIContextItem } from '../types';
import { workspaceIndexManager } from '../services/indexing/workspaceIndexManager';

export interface ContextBuilderOptions {
  projectName?: string;
  projectId?: string;
  gitRepository?: string;
  gitBranch?: string;
  maxTotalChars?: number;
  maxPerItemChars?: number;
}

export interface AssembledContext {
  formattedPrompt: string;
  includedCount: number;
  omittedCount: number;
  warnings: string[];
  totalContextChars: number;
}

const DEFAULT_MAX_TOTAL_CHARS = 28000; // ~7,000 tokens
const DEFAULT_MAX_PER_ITEM_CHARS = 8000; // ~2,000 tokens

/**
 * Shared Context Builder
 * Assembles and budgets codebase context, active selections, file attachments,
 * and search excerpts into a structured, sandboxed prompt for AI models.
 */
export class ContextBuilder {
  static build(
    userMessage: string,
    contextItems: AIContextItem[] = [],
    options: ContextBuilderOptions = {}
  ): AssembledContext {
    const maxTotal = options.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS;
    const maxPerItem = options.maxPerItemChars ?? DEFAULT_MAX_PER_ITEM_CHARS;
    const projectName = options.projectName || 'Project Workspace';

    if (!contextItems || contextItems.length === 0) {
      return {
        formattedPrompt: userMessage,
        includedCount: 0,
        omittedCount: 0,
        warnings: [],
        totalContextChars: 0
      };
    }

    const warnings: string[] = [];
    let currentContextChars = 0;
    const includedBlocks: string[] = [];
    let includedCount = 0;
    let omittedCount = 0;

    // Prioritization: Selections first, then explicit attachments & files, then search matches
    const sortedItems = [...contextItems].sort((a, b) => {
      const priority = (type: string) => {
        if (type === 'selection') return 1;
        if (type === 'attachment') return 2;
        if (type === 'file') return 3;
        return 4; // search_match, terminal, etc.
      };
      return priority(a.type) - priority(b.type);
    });

    const seenPaths = new Set<string>();

    for (const item of sortedItems) {
      // Validate path and prevent path traversal
      const safePath = (item.path || item.name || '').replace(/^\/+/, '');
      if (safePath.includes('../')) {
        warnings.push(`Omitted suspicious path with directory traversal: "${item.name}"`);
        omittedCount++;
        continue;
      }

      // Check remaining budget
      const remainingBudget = maxTotal - currentContextChars;
      if (remainingBudget < 400) {
        warnings.push(`Context budget reached. Omitted remaining item: "${item.name}"`);
        omittedCount++;
        continue;
      }

      let content = item.content || '';
      let isTruncated = false;

      // Truncate per item limit or remaining total budget
      const allowedForItem = Math.min(maxPerItem, remainingBudget - 150);
      if (content.length > allowedForItem) {
        content = content.slice(0, allowedForItem) + '\n... [Content truncated due to context limits]';
        isTruncated = true;
      }

      let header = '';
      if (item.type === 'selection') {
        const lines = item.startLine && item.endLine ? ` (lines ${item.startLine}-${item.endLine})` : '';
        header = `--- Selection: ${safePath}${lines} ---`;
      } else if (item.type === 'attachment') {
        header = `--- Attached File: ${safePath} ---`;
      } else if (item.type === 'search_match') {
        const lines = item.startLine && item.endLine ? ` (lines ${item.startLine}-${item.endLine})` : '';
        header = `--- Codebase Search Excerpt: ${safePath}${lines} ---`;
      } else {
        header = `--- File: ${safePath} ---`;
      }

      const block = `${header}\n${content}`;
      includedBlocks.push(block);
      currentContextChars += block.length;
      includedCount++;

      if (isTruncated) {
        warnings.push(`"${safePath}" was truncated to fit the context limit.`);
      }
    }

    if (includedBlocks.length === 0) {
      return {
        formattedPrompt: userMessage,
        includedCount: 0,
        omittedCount,
        warnings,
        totalContextChars: 0
      };
    }

    let warningSection = '';
    if (warnings.length > 0) {
      warningSection = `[Context Notices: ${warnings.join(' | ')}]\n\n`;
    }

    const gitInfo = options.gitRepository ? ` (Linked: ${options.gitRepository}${options.gitBranch ? `@${options.gitBranch}` : ''})` : '';
    const projectHeader = `[Project Context: ${projectName}${gitInfo}]\n\n`;
    const contextBody = `[Codebase & Attached Context]\n${includedBlocks.join('\n\n')}\n\n`;
    const userPromptSection = `[User Request]\n${userMessage}`;

    const formattedPrompt = `${warningSection}${projectHeader}${contextBody}${userPromptSection}`;

    return {
      formattedPrompt,
      includedCount,
      omittedCount,
      warnings,
      totalContextChars: currentContextChars
    };
  }

  /**
   * Retrieves relevant symbols and code slices from the workspace index and
   * builds a strictly budgeted context prompt.
   */
  static retrieveAndBuildBoundedContext(
    userMessage: string,
    projectId: string,
    files: Array<{ path?: string; name?: string; content?: string }> = [],
    explicitItems: AIContextItem[] = [],
    options: ContextBuilderOptions & { activeFilePath?: string; gitDiffPaths?: string[] } = {}
  ): AssembledContext {
    const combinedItems = [...(explicitItems || [])];

    if (files.length > 0 && userMessage.trim()) {
      const index = workspaceIndexManager.syncProject(projectId, files);
      const bounded = index.retrieveBoundedContext(userMessage, {
        activeFilePath: options.activeFilePath,
        gitDiffPaths: options.gitDiffPaths,
        maxTotalChars: 8000
      });

      const explicitPaths = new Set(explicitItems.map(item => (item.path || item.name || '').replace(/^\/+/, '')));
      for (const item of bounded.items) {
        if (!explicitPaths.has(item.filePath)) {
          combinedItems.push({
            id: `retrieval-${item.filePath}-${item.startLine}`,
            type: 'search_match',
            name: `${item.filePath}${item.symbol ? ` [${item.symbol.kind} ${item.symbol.name}]` : ''}`,
            path: item.filePath,
            content: item.excerpt,
            startLine: item.startLine,
            endLine: item.endLine,
            sizeBytes: item.excerpt.length
          });
        }
      }
    }

    return ContextBuilder.build(userMessage, combinedItems, options);
  }
}
