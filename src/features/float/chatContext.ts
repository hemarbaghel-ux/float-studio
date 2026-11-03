import type { AIContextItem, FileNode } from '../../types';
import { flattenFileTree } from '../../lib/utils';
import { searchCodebase } from '../../services/codebaseSearch';
import { sanitizePath, parseIgnorePatterns } from '../../services/indexing/fileFilter';
import { workspaceIndexManager } from '../../services/indexing/workspaceIndexManager';

export const MAX_AUTO_RESULTS = 6;
export const MAX_EXPLICIT_FILE_CHARS = 8_000;
export const MAX_FOLDER_TOTAL_CHARS = 12_000;
export const MAX_FOLDER_PER_FILE_CHARS = 4_000;
export const MAX_SYMBOL_CHARS = 2_500;
export const MAX_TOTAL_CONTEXT_CHARS = 24_000;

export const CODE_INTENT = /\b(build|create|implement|add|fix|debug|refactor|change|update|remove|delete|review|test|explain|trace|find|locate|search|code|file|function|class|component|hook|api|route|compiler|error|bug|crash|stack|import|export|type|interface|src|npm|python|react|typescript|javascript|auth|login|database|schema)\b/i;

const utf8Bytes = (text: string) => new TextEncoder().encode(text).byteLength;

export interface ContextExplanationItem {
  id: string;
  name: string;
  type: string;
  source: 'explicit' | 'folder' | 'active_editor' | 'retrieval' | 'symbol' | 'git' | 'terminal' | 'conversation';
  chars: number;
  priority: number;
  startLine?: number;
  endLine?: number;
  reason: string;
}

export interface ContextExclusionItem {
  name: string;
  reason: 'sensitive_file' | 'path_traversal' | 'binary_file' | 'duplicate' | 'budget_exceeded' | 'not_found' | 'ignored';
  detail?: string;
}

export interface ChatContextDiagnostics {
  noResults: boolean;
  isStaleIndex: boolean;
  isIndexFailure: boolean;
  isTruncated: boolean;
  omittedCount: number;
  warnings: string[];
}

export interface ChatContextResult {
  items: AIContextItem[];
  explanation: {
    includedCount: number;
    omittedCount: number;
    totalContextChars: number;
    includedItems: ContextExplanationItem[];
    excludedItems: ContextExclusionItem[];
    intent?: string;
  };
  diagnostics: ChatContextDiagnostics;
}

/**
 * Enhanced Context Engine & Indexing Pipeline
 * Provides bounded multi-file retrieval, folder expansion, symbol extraction,
 * .gitignore pattern filtering, and explainable provenance.
 */
export function buildChatContextResult(
  prompt: string,
  workspace: FileNode[],
  projectId: string,
  activeFilePath?: string,
): ChatContextResult {
  const warnings: string[] = [];
  const excludedItems: ContextExclusionItem[] = [];
  const includedItems: ContextExplanationItem[] = [];
  const context: AIContextItem[] = [];
  const includedPaths = new Set<string>();

  // Extract .gitignore / .floatignore patterns
  const allWorkspaceNodes = flattenFileTree(workspace);
  const ignorePatterns: string[] = [];
  const gitignoreNode = allWorkspaceNodes.find(
    (n) => (n.path === '.gitignore' || n.name === '.gitignore' || n.path === '.floatignore' || n.name === '.floatignore') && typeof n.content === 'string'
  );
  if (gitignoreNode && gitignoreNode.content) {
    ignorePatterns.push(...parseIgnorePatterns(gitignoreNode.content));
  }

  // Flatten and sanitize files
  const files: Array<FileNode & { path: string }> = [];
  for (const file of allWorkspaceNodes) {
    if (file.type !== 'file' || typeof file.content !== 'string') continue;
    const rawPath = file.path || file.name;
    const { safePath, error } = sanitizePath(rawPath, ignorePatterns);
    if (error || !safePath) {
      if (rawPath) {
        let reason: ContextExclusionItem['reason'] = 'sensitive_file';
        if (error?.includes('traversal')) reason = 'path_traversal';
        else if (error?.includes('Binary')) reason = 'binary_file';
        else if (error?.includes('ignored')) reason = 'ignored';
        excludedItems.push({ name: rawPath, reason, detail: error });
      }
      continue;
    }
    files.push({ ...file, path: safePath });
  }

  const filesByPath = new Map<string, FileNode & { path: string }>(files.map((file) => [file.path, file]));

  let currentContextChars = 0;
  let isTruncated = false;

  // 1. Check for @folder mentions:
  // e.g. @folder:src/components or @folder:src/components/ or @folder/src/components or @src/components/
  const folderMentions = new Set<string>();
  for (const m of prompt.matchAll(/@folder:([^\s,;!?]+)/gi)) {
    folderMentions.add(m[1].replace(/[.,;!?]+$/, ''));
  }
  for (const m of prompt.matchAll(/@folder\/([^\s,;!?]+)/gi)) {
    folderMentions.add(m[1].replace(/[.,;!?]+$/, ''));
  }
  for (const m of prompt.matchAll(/@([\w.-]+(?:\/[\w.-]+)*\/)(?=\s|$|[.,;!?])/gi)) {
    folderMentions.add(m[1].replace(/[.,;!?]+$/, ''));
  }

  let folderCharsAllocated = 0;
  for (const rawFolder of folderMentions) {
    const cleanFolder = rawFolder.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!cleanFolder) continue;

    // Find files whose path starts with cleanFolder + '/'
    const folderFiles = files.filter(f => f.path === cleanFolder || f.path.startsWith(`${cleanFolder}/`));

    if (folderFiles.length === 0) {
      warnings.push(`Folder "${cleanFolder}" contains no readable workspace files.`);
      excludedItems.push({ name: cleanFolder, reason: 'not_found', detail: 'Folder not found or has no matching text files' });
      continue;
    }

    // Sort files alphabetically for stable determinism
    folderFiles.sort((a, b) => a.path.localeCompare(b.path));

    for (const file of folderFiles) {
      if (includedPaths.has(file.path)) continue;
      if (folderCharsAllocated >= MAX_FOLDER_TOTAL_CHARS || currentContextChars >= MAX_TOTAL_CONTEXT_CHARS) {
        warnings.push(`Context budget reached. Omitted remaining file "${file.path}" in folder "${cleanFolder}".`);
        excludedItems.push({ name: file.path, reason: 'budget_exceeded' });
        isTruncated = true;
        break;
      }

      let content = file.content || '';
      let fileTruncated = false;
      if (content.length > MAX_FOLDER_PER_FILE_CHARS) {
        content = `${content.slice(0, MAX_FOLDER_PER_FILE_CHARS)}\n... [Excerpt limited to ${MAX_FOLDER_PER_FILE_CHARS} characters]`;
        fileTruncated = true;
        isTruncated = true;
      }

      const item: AIContextItem = {
        id: `folder-${cleanFolder}-${file.path}`,
        type: 'attachment',
        name: `${file.path} [folder: ${cleanFolder}]`,
        path: file.path,
        content,
        sizeBytes: utf8Bytes(content),
        provenance: 'folder',
        reason: `Expanded from @folder:${cleanFolder}`,
        isTruncated: fileTruncated
      };

      context.push(item);
      includedPaths.add(file.path);
      folderCharsAllocated += content.length;
      currentContextChars += content.length;

      includedItems.push({
        id: item.id,
        name: item.name,
        type: item.type,
        source: 'folder',
        chars: content.length,
        priority: 3,
        reason: item.reason || ''
      });
    }
  }

  // 2. Check for @symbol mentions:
  // e.g. @symbol:handleSubmit or @symbol:AuthService or @symbol handleSubmit
  const symbolMentions = new Set<string>();
  for (const m of prompt.matchAll(/@symbol:([^\s,;!?]+)/gi)) {
    symbolMentions.add(m[1].replace(/[.,;!?]+$/, ''));
  }
  for (const m of prompt.matchAll(/@symbol\s+([a-zA-Z_$][\w$]*)/g)) {
    symbolMentions.add(m[1].replace(/[.,;!?]+$/, ''));
  }

  if (symbolMentions.size > 0 && files.length > 0) {
    let index: any = null;
    try {
      index = workspaceIndexManager.syncProject(projectId, files, ignorePatterns);
    } catch {
      // index sync error
    }

    for (const symName of symbolMentions) {
      let matched = false;

      if (index) {
        const foundSyms = index.getAllSymbols(symName);
        const exactOrClose = foundSyms.filter(
          (s: any) => s.symbol.name.toLowerCase() === symName.toLowerCase()
        );
        const topSyms = exactOrClose.length > 0 ? exactOrClose.slice(0, 2) : foundSyms.slice(0, 1);

        for (const s of topSyms) {
          const file = filesByPath.get(s.path);
          if (!file || !file.content) continue;

          const lines = file.content.split(/\r?\n/);
          const symLine = s.symbol.line;
          const startLine = Math.max(1, symLine - 4);
          const endLine = Math.min(lines.length, symLine + 20);
          const excerpt = lines.slice(startLine - 1, endLine).join('\n');

          const itemId = `symbol-${s.path}-${s.symbol.name}`;
          const item: AIContextItem = {
            id: itemId,
            type: 'search_match',
            name: `${s.path} [${s.symbol.kind} ${s.symbol.name}]`,
            path: s.path,
            content: excerpt.length > MAX_SYMBOL_CHARS
              ? `${excerpt.slice(0, MAX_SYMBOL_CHARS)}\n... [Symbol excerpt limited]`
              : excerpt,
            startLine,
            endLine,
            sizeBytes: utf8Bytes(excerpt),
            provenance: 'symbol',
            reason: `Symbol match for @symbol:${symName} (${s.symbol.kind})`
          };

          context.push(item);
          includedPaths.add(`${s.path}:${startLine}`);
          currentContextChars += item.content.length;
          matched = true;

          includedItems.push({
            id: item.id,
            name: item.name,
            type: item.type,
            source: 'symbol',
            chars: item.content.length,
            priority: 2,
            startLine,
            endLine,
            reason: item.reason || ''
          });
          break;
        }
      }

      // Fallback regex search in files if not matched in index
      if (!matched) {
        const symRegex = new RegExp(`\\b(?:function|class|interface|type|const|let|var|def|async\\s+function)\\s+${symName}\\b`);
        for (const file of files) {
          if (!file.content) continue;
          const matchIdx = file.content.search(symRegex);
          if (matchIdx !== -1) {
            const beforeMatch = file.content.slice(0, matchIdx);
            const lineNum = beforeMatch.split(/\r?\n/).length;
            const lines = file.content.split(/\r?\n/);
            const startLine = Math.max(1, lineNum - 3);
            const endLine = Math.min(lines.length, lineNum + 20);
            const excerpt = lines.slice(startLine - 1, endLine).join('\n');

            const item: AIContextItem = {
              id: `symbol-${file.path}-${symName}`,
              type: 'search_match',
              name: `${file.path} [symbol ${symName}]`,
              path: file.path,
              content: excerpt,
              startLine,
              endLine,
              sizeBytes: utf8Bytes(excerpt),
              provenance: 'symbol',
              reason: `Regex definition match for @symbol:${symName}`
            };

            context.push(item);
            currentContextChars += item.content.length;
            matched = true;

            includedItems.push({
              id: item.id,
              name: item.name,
              type: item.type,
              source: 'symbol',
              chars: item.content.length,
              priority: 2,
              startLine,
              endLine,
              reason: item.reason || ''
            });
            break;
          }
        }
      }

      if (!matched) {
        warnings.push(`Symbol "${symName}" was not found in project workspace.`);
        excludedItems.push({ name: symName, reason: 'not_found', detail: 'Symbol not found in workspace index' });
      }
    }
  }

  // 3. Check for explicit file mentions:
  // e.g. @file:src/App.tsx or @src/App.tsx or @auth.ts
  for (const match of prompt.matchAll(/@(?:file:)?([\w./-]+)/g)) {
    const rawTarget = match[1].replace(/[.,;!?]+$/, '');
    if (!rawTarget || rawTarget === 'codebase' || rawTarget === 'folder' || rawTarget === 'symbol') continue;
    if (folderMentions.has(rawTarget) || symbolMentions.has(rawTarget)) continue;

    const { safePath, error } = sanitizePath(rawTarget, ignorePatterns);
    if (error || !safePath) {
      let reason: ContextExclusionItem['reason'] = 'sensitive_file';
      if (error?.includes('traversal')) reason = 'path_traversal';
      else if (error?.includes('Binary')) reason = 'binary_file';
      else if (error?.includes('ignored')) reason = 'ignored';
      excludedItems.push({ name: rawTarget, reason, detail: error });
      warnings.push(`Excluded mentioned file: "${rawTarget}" (${error || 'forbidden'})`);
      continue;
    }

    if (includedPaths.has(safePath)) continue;

    const file = filesByPath.get(safePath);
    if (!file) {
      continue;
    }

    let content = file.content || '';
    let fileTruncated = false;
    if (content.length > MAX_EXPLICIT_FILE_CHARS) {
      content = `${content.slice(0, MAX_EXPLICIT_FILE_CHARS)}\n... [Selected file excerpt limited to ${MAX_EXPLICIT_FILE_CHARS} characters]`;
      fileTruncated = true;
      isTruncated = true;
    }

    const item: AIContextItem = {
      id: `explicit-${safePath}`,
      type: 'attachment',
      name: safePath,
      path: safePath,
      content,
      sizeBytes: utf8Bytes(content),
      provenance: 'explicit',
      reason: 'Explicit mention in user prompt',
      isTruncated: fileTruncated
    };

    context.push(item);
    includedPaths.add(safePath);
    currentContextChars += content.length;

    includedItems.push({
      id: item.id,
      name: item.name,
      type: item.type,
      source: 'explicit',
      chars: content.length,
      priority: 1,
      reason: item.reason || ''
    });
  }

  // 4. Codebase retrieval:
  const isCodebaseMentioned = /@codebase\b/i.test(prompt);
  const shouldRetrieve = isCodebaseMentioned || CODE_INTENT.test(prompt) || /\b[A-Z][a-z0-9]+[A-Z][\w$]*\b/.test(prompt);

  let noResults = false;

  if (shouldRetrieve && files.length > 0) {
    const cleanPrompt = prompt
      .replace(/@codebase\b/gi, '')
      .replace(/@folder:[^\s,;!?]+/gi, '')
      .replace(/@symbol:[^\s,;!?]+/gi, '')
      .replace(/@file:[^\s,;!?]+/gi, '')
      .trim() || prompt;

    let matches = searchCodebase(files, cleanPrompt, {
      projectId,
      activeFilePath,
      maxResults: isCodebaseMentioned ? 12 : MAX_AUTO_RESULTS,
      contextLines: 3,
    });

    if (isCodebaseMentioned && matches.length === 0) {
      const candidateFiles = files.slice(0, 4);
      for (const f of candidateFiles) {
        const excerpt = (f.content || '').slice(0, 1000);
        matches.push({
          fileId: f.id,
          filePath: f.path,
          fileName: f.name,
          matchType: 'content',
          score: 1,
          line: 1,
          startLine: 1,
          endLine: Math.min(20, (f.content || '').split('\n').length),
          contentExcerpt: excerpt
        });
      }
    }

    if (shouldRetrieve && matches.length === 0) {
      noResults = true;
    }

    for (const match of matches) {
      const { safePath, error } = sanitizePath(match.filePath, ignorePatterns);
      if (error || !safePath || includedPaths.has(safePath) || !match.contentExcerpt) continue;

      const item: AIContextItem = {
        id: `retrieval-${safePath}-${match.startLine}`,
        type: 'search_match',
        name: safePath,
        path: safePath,
        content: match.contentExcerpt,
        startLine: match.startLine,
        endLine: match.endLine,
        sizeBytes: utf8Bytes(match.contentExcerpt),
        provenance: 'codebase',
        reason: 'Semantic codebase retrieval match'
      };

      context.push(item);
      includedPaths.add(safePath);
      currentContextChars += item.content.length;

      includedItems.push({
        id: item.id,
        name: item.name,
        type: item.type,
        source: 'retrieval',
        chars: item.content.length,
        priority: 9,
        startLine: match.startLine,
        endLine: match.endLine,
        reason: item.reason || ''
      });
    }
  }

  return {
    items: context,
    explanation: {
      includedCount: context.length,
      omittedCount: excludedItems.length,
      totalContextChars: currentContextChars,
      includedItems,
      excludedItems
    },
    diagnostics: {
      noResults,
      isStaleIndex: false,
      isIndexFailure: false,
      isTruncated,
      omittedCount: excludedItems.length,
      warnings
    }
  };
}

/**
 * Keep project-wide file contents in the browser. Send only explicitly mentioned
 * files, folders, symbols, and a bounded set of local retrieval excerpts to the chat API.
 */
export function buildChatContextItems(
  prompt: string,
  workspace: FileNode[],
  projectId: string,
  activeFilePath?: string,
): AIContextItem[] {
  return buildChatContextResult(prompt, workspace, projectId, activeFilePath).items;
}
