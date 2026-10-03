import { FileNode } from '../types';
import { flattenFileTree } from '../lib/utils';

export interface SearchMatch {
  fileId: string;
  filePath: string;
  fileName: string;
  matchType: 'path' | 'content';
  score: number;
  line: number;
  startLine: number;
  endLine: number;
  contentExcerpt: string;
}

export interface CodebaseSearchOptions {
  maxResults?: number;
  caseSensitive?: boolean;
  contextLines?: number;
}

/**
 * Searches the project's virtual file tree using ranked lexical retrieval.
 * Provides file paths, exact line numbers, and formatted contextual excerpts.
 */
export function searchCodebase(
  files: FileNode[],
  rawQuery: string,
  options: CodebaseSearchOptions = {}
): SearchMatch[] {
  const query = rawQuery.trim();
  if (!query) return [];

  const maxResults = options.maxResults ?? 15;
  const caseSensitive = options.caseSensitive ?? false;
  const contextLines = options.contextLines ?? 2;

  const needle = caseSensitive ? query : query.toLowerCase();
  const flatFiles = flattenFileTree(files);
  const results: SearchMatch[] = [];

  for (const file of flatFiles) {
    if (file.type !== 'file' || !file.content) continue;

    const path = file.path;
    const name = file.name || path.split('/').pop() || '';
    const normPath = caseSensitive ? path : path.toLowerCase();
    const normName = caseSensitive ? name : name.toLowerCase();

    // 1. Path & Filename Match
    if (normName === needle) {
      // Exact file name match
      results.push({
        fileId: file.id,
        filePath: path,
        fileName: name,
        matchType: 'path',
        score: 100,
        line: 1,
        startLine: 1,
        endLine: Math.min(10, file.content.split('\n').length),
        contentExcerpt: file.content.split('\n').slice(0, 10).join('\n')
      });
    } else if (normName.includes(needle)) {
      results.push({
        fileId: file.id,
        filePath: path,
        fileName: name,
        matchType: 'path',
        score: 75,
        line: 1,
        startLine: 1,
        endLine: Math.min(10, file.content.split('\n').length),
        contentExcerpt: file.content.split('\n').slice(0, 10).join('\n')
      });
    } else if (normPath.includes(needle)) {
      results.push({
        fileId: file.id,
        filePath: path,
        fileName: name,
        matchType: 'path',
        score: 50,
        line: 1,
        startLine: 1,
        endLine: Math.min(10, file.content.split('\n').length),
        contentExcerpt: file.content.split('\n').slice(0, 10).join('\n')
      });
    }

    // 2. Content Line Match
    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineStr = lines[i];
      const normLine = caseSensitive ? lineStr : lineStr.toLowerCase();

      if (normLine.includes(needle)) {
        const start = Math.max(0, i - contextLines);
        const end = Math.min(lines.length - 1, i + contextLines);
        const excerpt = lines
          .slice(start, end + 1)
          .map((l, idx) => `${start + idx + 1}: ${l}`)
          .join('\n');

        // Score based on exact occurrences and match location
        const matchFrequency = (normLine.match(new RegExp(escapeRegex(needle), 'g')) || []).length;
        const lineScore = 30 + Math.min(30, matchFrequency * 10);

        results.push({
          fileId: file.id,
          filePath: path,
          fileName: name,
          matchType: 'content',
          score: lineScore,
          line: i + 1,
          startLine: start + 1,
          endLine: end + 1,
          contentExcerpt: excerpt
        });

        // Skip ahead by contextLines to avoid redundant overlapping excerpts
        i += contextLines;
      }
    }
  }

  // Sort descending by score, then by filePath
  results.sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath));

  // Deduplicate matches from the same file with identical line spans
  const seen = new Set<string>();
  const deduplicated: SearchMatch[] = [];

  for (const match of results) {
    const key = `${match.filePath}:${match.startLine}-${match.endLine}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(match);
      if (deduplicated.length >= maxResults) break;
    }
  }

  return deduplicated;
}

function escapeRegex(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
