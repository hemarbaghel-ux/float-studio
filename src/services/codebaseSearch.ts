import { FileNode } from '../types';
import { flattenFileTree } from '../lib/utils';
import { workspaceIndexManager } from './indexing/workspaceIndexManager';
import { CodeSymbol, SymbolKind, RankedSearchResult } from './indexing/types';

export interface SearchMatch {
  fileId: string;
  filePath: string;
  fileName: string;
  matchType: 'path' | 'content' | 'symbol';
  score: number;
  line: number;
  startLine: number;
  endLine: number;
  contentExcerpt: string;
  symbol?: CodeSymbol;
  signals?: string[];
}

export interface CodebaseSearchOptions {
  maxResults?: number;
  caseSensitive?: boolean;
  contextLines?: number;
  activeFilePath?: string;
  gitDiffPaths?: string[];
  filterSymbolKinds?: SymbolKind[];
  minScore?: number;
  projectId?: string;
}

/**
 * Searches the codebase using incremental workspace indexing and multi-signal ranking.
 * Ranks exact path matches, filenames, symbol definitions (functions, classes, interfaces, types),
 * content matches via BM25, import graph dependencies, active file relevance, and git diffs.
 */
export function searchCodebase(
  files: FileNode[],
  rawQuery: string,
  options: CodebaseSearchOptions = {}
): SearchMatch[] {
  const query = rawQuery.trim();
  if (!query) return [];

  const projectId = options.projectId || 'active-workspace';
  const flattened = flattenFileTree(files)
    .filter(f => f.type === 'file' && typeof f.content === 'string')
    .map(f => ({
      path: f.path || f.name,
      name: f.name,
      content: f.content || '',
      type: 'file'
    }));

  const index = workspaceIndexManager.syncProject(projectId, flattened);

  const results: RankedSearchResult[] = index.search(query, {
    maxResults: options.maxResults ?? 15,
    contextLines: options.contextLines ?? 2,
    caseSensitive: options.caseSensitive,
    activeFilePath: options.activeFilePath,
    gitDiffPaths: options.gitDiffPaths,
    filterSymbolKinds: options.filterSymbolKinds,
    minScore: options.minScore ?? 1
  });

  return results.map(r => ({
    fileId: r.fileId,
    filePath: r.filePath,
    fileName: r.fileName,
    matchType: r.matchType,
    score: r.score,
    line: r.line,
    startLine: r.startLine,
    endLine: r.endLine,
    contentExcerpt: r.contentExcerpt,
    symbol: r.symbol,
    signals: r.signals
  }));
}
