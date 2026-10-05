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

interface IndexedFile {
  id: string;
  path: string;
  name: string;
  lines: string[];
  tokens: string[];
  frequencies: Map<string, number>;
}

/**
 * Builds an in-memory inverted index for the current project and ranks matching
 * lines using a BM25-style score. Tokenization understands camelCase, paths,
 * punctuation and common code identifiers. The index is rebuilt from the
 * current immutable file tree, so edits are searchable immediately.
 */
export function searchCodebase(
  files: FileNode[],
  rawQuery: string,
  options: CodebaseSearchOptions = {}
): SearchMatch[] {
  const query = rawQuery.trim();
  if (!query) return [];

  const maxResults = Math.max(1, options.maxResults ?? 15);
  const contextLines = Math.max(0, options.contextLines ?? 2);
  const normalize = (value: string) => options.caseSensitive ? value : value.toLocaleLowerCase();
  const queryTokens = tokenize(normalize(query));
  if (!queryTokens.length) return [];

  const documents: IndexedFile[] = flattenFileTree(files)
    .filter(file => file.type === 'file' && typeof file.content === 'string')
    .map(file => {
      const lines = (file.content ?? '').split(/\r?\n/);
      const tokens = tokenize(normalize(`${file.path} ${file.content ?? ''}`));
      const frequencies = new Map<string, number>();
      for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
      return { id: file.id, path: file.path, name: file.name, lines, tokens, frequencies };
    });

  const documentFrequency = new Map<string, number>();
  for (const token of new Set(queryTokens)) {
    documentFrequency.set(token, documents.reduce((count, document) => count + Number(document.frequencies.has(token)), 0));
  }
  const averageLength = documents.reduce((sum, document) => sum + document.tokens.length, 0) / Math.max(1, documents.length);
  const normalizedQuery = normalize(query);
  const matches: SearchMatch[] = [];

  for (const document of documents) {
    const path = normalize(document.path);
    const name = normalize(document.name);
    const exactPath = path === normalizedQuery || name === normalizedQuery;
    const pathContains = path.includes(normalizedQuery);
    const matchingLines: Array<{ line: number; score: number }> = [];

    for (let index = 0; index < document.lines.length; index += 1) {
      const line = normalize(document.lines[index]);
      const lineTokens = tokenize(line);
      if (!lineTokens.length) continue;
      const lineFrequency = new Map<string, number>();
      for (const token of lineTokens) lineFrequency.set(token, (lineFrequency.get(token) ?? 0) + 1);

      let score = 0;
      for (const token of queryTokens) {
        const tf = lineFrequency.get(token) ?? 0;
        if (!tf) continue;
        const df = documentFrequency.get(token) ?? 0;
        const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
        const lengthNorm = 1.2 * (0.25 + 0.75 * lineTokens.length / Math.max(1, averageLength));
        score += idf * (tf * 2.2) / (tf + lengthNorm);
      }

      if (score > 0) {
        if (line.includes(normalizedQuery)) score *= 1.8;
        // Identifier-shaped queries should favor declarations and references
        // where the whole identifier appears, without requiring exact text.
        if (queryTokens.length === 1 && new RegExp(`(^|\\W)${escapeRegex(queryTokens[0])}($|\\W)`, options.caseSensitive ? '' : 'i').test(document.lines[index])) score *= 1.2;
        matchingLines.push({ line: index + 1, score });
      }
    }

    if (exactPath || pathContains) {
      const line = matchingLines[0]?.line ?? 1;
      matches.push(makeMatch(document, line, exactPath ? 100 : 65, 'path', contextLines));
    }

    matchingLines.sort((a, b) => b.score - a.score || a.line - b.line);
    const selected: typeof matchingLines = [];
    for (const candidate of matchingLines) {
      if (selected.every(existing => Math.abs(existing.line - candidate.line) > contextLines * 2)) selected.push(candidate);
      if (selected.length >= 3) break;
    }
    for (const candidate of selected) {
      matches.push(makeMatch(document, candidate.line, candidate.score * 10, 'content', contextLines));
    }
  }

  matches.sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath) || a.line - b.line);
  const seen = new Set<string>();
  return matches.filter(match => {
    const key = `${match.filePath}:${match.startLine}-${match.endLine}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, maxResults);
}

function makeMatch(document: IndexedFile, line: number, score: number, matchType: SearchMatch['matchType'], contextLines: number): SearchMatch {
  const start = Math.max(1, line - contextLines);
  const end = Math.min(document.lines.length, line + contextLines);
  return {
    fileId: document.id,
    filePath: document.path,
    fileName: document.name,
    matchType,
    score,
    line,
    startLine: start,
    endLine: end,
    contentExcerpt: document.lines.slice(start - 1, end).map((text, index) => `${start + index}: ${text}`).join('\n')
  };
}

function tokenize(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^\p{L}\p{N}_$]+/u)
    .map(token => token.trim())
    .filter(token => token.length > 1 && !/^[\d_]+$/.test(token));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
