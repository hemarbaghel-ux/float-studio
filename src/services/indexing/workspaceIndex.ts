import {
  CodeSymbol,
  IndexedDocument,
  RankedSearchResult,
  RetrievalOptions,
  BoundedContextResult,
  BoundedContextItem,
  IndexStats
} from './types';
import { shouldIndexFile, normalizeWorkspacePath, isSensitivePath, isBinaryFile } from './fileFilter';
import { extractSymbols } from './symbolExtractor';

/**
 * Fast string hashing for cache invalidation and change detection
 */
function hashString(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash) + content.charCodeAt(i);
    hash |= 0;
  }
  return `${hash}_${content.length}`;
}

/**
 * Generates 3-character substrings for fast fuzzy and partial lookup
 */
function generateTrigrams(text: string): Set<string> {
  const trigrams = new Set<string>();
  const normalized = text.toLowerCase();
  for (let i = 0; i <= normalized.length - 3; i++) {
    trigrams.add(normalized.slice(i, i + 3));
  }
  return trigrams;
}

/**
 * Tokenizes text with camelCase splitting, path separators, and identifier boundaries
 */
function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^\p{L}\p{N}_$]+/u)
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 1 && !/^[\d_]+$/.test(t));
}

/**
 * Incremental Workspace Index & Multi-Signal Semantic Retrieval
 */
export class WorkspaceIndex {
  public readonly projectId: string;
  private documents = new Map<string, IndexedDocument>();
  private tokenIndex = new Map<string, Set<string>>(); // token -> Set<filePath>
  private trigramIndex = new Map<string, Set<string>>(); // trigram -> Set<filePath>
  private symbolIndex = new Map<string, Array<{ path: string; symbol: CodeSymbol }>>(); // lowercase name -> definitions
  private importGraph = new Map<string, Set<string>>(); // filePath -> Set<importedPath>
  private reverseImportGraph = new Map<string, Set<string>>(); // filePath -> Set<importerPath>
  private lastUpdated: number = Date.now();

  constructor(projectId: string = 'default-project') {
    this.projectId = projectId;
  }

  /**
   * Initializes or bulk-updates the workspace index with a list of files.
   */
  public indexProject(files: Array<{ path?: string; name?: string; content?: string; type?: string }>): void {
    const activePaths = new Set<string>();

    for (const file of files) {
      if (file.type === 'folder') continue;
      const rawPath = file.path || file.name || '';
      const normPath = normalizeWorkspacePath(rawPath);
      if (!normPath) continue;

      if (!shouldIndexFile(normPath, file.content)) {
        continue;
      }

      activePaths.add(normPath);
      this.updateFile(normPath, file.content || '');
    }

    // Prune files that are no longer part of the project
    for (const existingPath of Array.from(this.documents.keys())) {
      if (!activePaths.has(existingPath)) {
        this.removeFile(existingPath);
      }
    }

    this.rebuildImportGraph();
    this.lastUpdated = Date.now();
  }

  /**
   * Incrementally indexes or updates a single file in the workspace.
   * If content is unchanged (checked via hash), skips re-indexing.
   */
  public updateFile(rawPath: string, content: string): boolean {
    const path = normalizeWorkspacePath(rawPath);
    if (!path) return false;

    // Safety checks
    if (!shouldIndexFile(path, content)) {
      if (this.documents.has(path)) {
        this.removeFile(path);
      }
      return false;
    }

    const contentHash = hashString(content);
    const existing = this.documents.get(path);

    // Skip if unchanged
    if (existing && existing.hash === contentHash) {
      return false;
    }

    // If file existed with older content, remove old inverted entries
    if (existing) {
      this.removeFromInvertedIndices(existing);
    }

    const lines = content.split(/\r?\n/);
    const fileName = path.split('/').pop() || path;
    const { symbols, imports, exports } = extractSymbols(path, content);
    const tokens = tokenize(`${path} ${fileName} ${content}`);
    const tokenFrequencies = new Map<string, number>();

    for (const token of tokens) {
      tokenFrequencies.set(token, (tokenFrequencies.get(token) ?? 0) + 1);
    }

    const trigrams = generateTrigrams(`${path} ${content}`);

    const doc: IndexedDocument = {
      id: path,
      path,
      name: fileName,
      content,
      lines,
      hash: contentHash,
      mtime: Date.now(),
      symbols,
      imports,
      exports,
      tokens,
      tokenFrequencies,
      trigrams,
      sizeBytes: content.length
    };

    this.documents.set(path, doc);

    // Update inverted token index
    for (const token of tokenFrequencies.keys()) {
      let set = this.tokenIndex.get(token);
      if (!set) {
        set = new Set<string>();
        this.tokenIndex.set(token, set);
      }
      set.add(path);
    }

    // Update trigram index
    for (const trigram of trigrams) {
      let set = this.trigramIndex.get(trigram);
      if (!set) {
        set = new Set<string>();
        this.trigramIndex.set(trigram, set);
      }
      set.add(path);
    }

    // Update symbol index
    for (const sym of symbols) {
      const symKey = sym.name.toLowerCase();
      let list = this.symbolIndex.get(symKey);
      if (!list) {
        list = [];
        this.symbolIndex.set(symKey, list);
      }
      list.push({ path, symbol: sym });
    }

    // Update import graph for this document
    this.updateDocumentImports(path, imports);

    this.lastUpdated = Date.now();
    return true;
  }

  /**
   * Removes a file completely from the workspace index.
   */
  public removeFile(rawPath: string): boolean {
    const path = normalizeWorkspacePath(rawPath);
    const doc = this.documents.get(path);
    if (!doc) return false;

    this.removeFromInvertedIndices(doc);
    this.documents.delete(path);

    // Remove from import graphs
    this.importGraph.delete(path);
    for (const importers of this.reverseImportGraph.values()) {
      importers.delete(path);
    }
    this.reverseImportGraph.delete(path);

    this.lastUpdated = Date.now();
    return true;
  }

  /**
   * Atomically renames a file in the index.
   */
  public renameFile(oldRawPath: string, newRawPath: string, content?: string): boolean {
    const oldPath = normalizeWorkspacePath(oldRawPath);
    const newPath = normalizeWorkspacePath(newRawPath);
    const existing = this.documents.get(oldPath);

    const actualContent = content !== undefined ? content : (existing?.content || '');
    this.removeFile(oldPath);
    return this.updateFile(newPath, actualContent);
  }

  /**
   * Removes a document's entries from inverted indices.
   */
  private removeFromInvertedIndices(doc: IndexedDocument): void {
    const path = doc.path;

    for (const token of doc.tokenFrequencies.keys()) {
      const set = this.tokenIndex.get(token);
      if (set) {
        set.delete(path);
        if (set.size === 0) this.tokenIndex.delete(token);
      }
    }

    for (const trigram of doc.trigrams) {
      const set = this.trigramIndex.get(trigram);
      if (set) {
        set.delete(path);
        if (set.size === 0) this.trigramIndex.delete(trigram);
      }
    }

    for (const sym of doc.symbols) {
      const symKey = sym.name.toLowerCase();
      const list = this.symbolIndex.get(symKey);
      if (list) {
        const filtered = list.filter(item => item.path !== path);
        if (filtered.length > 0) {
          this.symbolIndex.set(symKey, filtered);
        } else {
          this.symbolIndex.delete(symKey);
        }
      }
    }
  }

  /**
   * Rebuilds the global import graph for all indexed documents.
   */
  private rebuildImportGraph(): void {
    this.importGraph.clear();
    this.reverseImportGraph.clear();

    for (const [path, doc] of this.documents.entries()) {
      this.updateDocumentImports(path, doc.imports);
    }
  }

  /**
   * Resolves and updates import edges for a document.
   */
  private updateDocumentImports(sourcePath: string, imports: string[]): void {
    const resolvedTargets = new Set<string>();

    for (const imp of imports) {
      const resolved = this.resolveImportPath(sourcePath, imp);
      if (resolved && this.documents.has(resolved)) {
        resolvedTargets.add(resolved);
        let importers = this.reverseImportGraph.get(resolved);
        if (!importers) {
          importers = new Set<string>();
          this.reverseImportGraph.set(resolved, importers);
        }
        importers.add(sourcePath);
      }
    }

    this.importGraph.set(sourcePath, resolvedTargets);
  }

  /**
   * Resolves a relative import path against a source file path.
   */
  private resolveImportPath(sourcePath: string, importSpecifier: string): string | null {
    if (!importSpecifier.startsWith('.')) return null;

    const sourceParts = sourcePath.split('/');
    sourceParts.pop(); // remove file name to get dir

    const importParts = importSpecifier.split('/');
    for (const part of importParts) {
      if (part === '.') continue;
      if (part === '..') {
        sourceParts.pop();
      } else {
        sourceParts.push(part);
      }
    }

    const candidateBase = sourceParts.join('/');
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.py', '/index.ts', '/index.js'];

    for (const ext of extensions) {
      const testPath = candidateBase + ext;
      if (this.documents.has(testPath)) {
        return testPath;
      }
    }

    return null;
  }

  /**
   * Multi-Signal Semantic Retrieval & Ranking Engine
   */
  public search(rawQuery: string, options: RetrievalOptions = {}): RankedSearchResult[] {
    const query = rawQuery.trim();
    if (!query) return [];

    const maxResults = Math.max(1, options.maxResults ?? 15);
    const contextLines = Math.max(0, options.contextLines ?? 2);
    const minScore = options.minScore ?? 5;
    const normQuery = query.toLowerCase();
    const queryTokens = tokenize(query);

    const activeFilePath = options.activeFilePath ? normalizeWorkspacePath(options.activeFilePath) : undefined;
    const gitDiffSet = new Set((options.gitDiffPaths || []).map(normalizeWorkspacePath));

    // Active file import dependencies for signal ranking
    const activeImports = activeFilePath ? (this.importGraph.get(activeFilePath) || new Set<string>()) : new Set<string>();
    const activeImporters = activeFilePath ? (this.reverseImportGraph.get(activeFilePath) || new Set<string>()) : new Set<string>();

    const totalDocs = Math.max(1, this.documents.size);
    const avgDocLength = Array.from(this.documents.values()).reduce((sum, d) => sum + d.tokens.length, 0) / totalDocs;

    // Document frequency per query token for BM25
    const docFrequency = new Map<string, number>();
    for (const token of new Set(queryTokens)) {
      const matchedDocs = this.tokenIndex.get(token);
      docFrequency.set(token, matchedDocs ? matchedDocs.size : 0);
    }

    const candidateMatches: RankedSearchResult[] = [];

    for (const [docPath, doc] of this.documents.entries()) {
      const signals: string[] = [];
      let totalDocScore = 0;

      // 1. Exact path match (+150)
      if (docPath.toLowerCase() === normQuery) {
        totalDocScore += 150;
        signals.push('exact-path');
      } else if (docPath.toLowerCase().includes(normQuery)) {
        totalDocScore += 60;
        signals.push('path-substring');
      }

      // 2. Filename match (+100 exact, +60 partial)
      if (doc.name.toLowerCase() === normQuery) {
        totalDocScore += 100;
        signals.push('exact-filename');
      } else if (doc.name.toLowerCase().includes(normQuery)) {
        totalDocScore += 60;
        signals.push('filename-substring');
      }

      // 3. Active file relevance (+30)
      if (activeFilePath && docPath === activeFilePath) {
        totalDocScore += 30;
        signals.push('active-file');
      }

      // 4. Import / dependency relevance (+35 direct, +15 indirect)
      if (activeFilePath && (activeImports.has(docPath) || activeImporters.has(docPath))) {
        totalDocScore += 35;
        signals.push('import-dependency');
      }

      // 5. Git diff relevance (+25)
      if (gitDiffSet.has(docPath)) {
        totalDocScore += 25;
        signals.push('git-diff');
      }

      // 6. Symbol match
      let bestSymbol: CodeSymbol | undefined;
      let symbolScore = 0;

      for (const sym of doc.symbols) {
        const symNameLower = sym.name.toLowerCase();
        let currentSymBoost = 0;

        if (symNameLower === normQuery) {
          currentSymBoost = 130;
          if (sym.kind === 'class') currentSymBoost += 25;
          else if (sym.kind === 'interface') currentSymBoost += 20;
          else if (sym.kind === 'function' || sym.kind === 'method') currentSymBoost += 20;
          else if (sym.kind === 'type') currentSymBoost += 15;
          signals.push(`symbol:${sym.kind}:${sym.name}`);
        } else if (symNameLower.includes(normQuery) || (queryTokens.length === 1 && symNameLower.startsWith(normQuery))) {
          currentSymBoost = 60;
          signals.push(`symbol-partial:${sym.kind}:${sym.name}`);
        }

        if (currentSymBoost > symbolScore) {
          symbolScore = currentSymBoost;
          bestSymbol = sym;
        }
      }

      totalDocScore += symbolScore;

      // 7. Content line matches & BM25 score
      const matchingLines: Array<{ line: number; score: number; text: string }> = [];

      for (let i = 0; i < doc.lines.length; i++) {
        const lineText = doc.lines[i];
        const normLine = lineText.toLowerCase();
        const lineTokens = tokenize(lineText);
        if (!lineTokens.length && !normLine.includes(normQuery)) continue;

        let lineScore = 0;

        // Exact phrase or substring match in line
        if (normLine.includes(normQuery)) {
          lineScore += 40;
        }

        // BM25 term weighting
        for (const token of queryTokens) {
          if (lineTokens.includes(token)) {
            const tf = lineTokens.filter(t => t === token).length;
            const df = docFrequency.get(token) || 1;
            const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
            const lengthNorm = 1.2 * (0.25 + 0.75 * lineTokens.length / Math.max(1, avgDocLength));
            lineScore += idf * (tf * 2.2) / (tf + lengthNorm);
          }
        }

        if (lineScore > 0) {
          matchingLines.push({ line: i + 1, score: lineScore, text: lineText });
        }
      }

      // If path or filename matched, create path match
      if (signals.includes('exact-path') || signals.includes('exact-filename') || signals.includes('path-substring') || signals.includes('filename-substring')) {
        const line = matchingLines[0]?.line ?? 1;
        const start = Math.max(1, line - contextLines);
        const end = Math.min(doc.lines.length, line + contextLines);
        const excerpt = doc.lines.slice(start - 1, end).map((t, idx) => `${start + idx}: ${t}`).join('\n');
        const pathScore = signals.includes('exact-path') ? 160 : signals.includes('exact-filename') ? 140 : 80;

        candidateMatches.push({
          fileId: doc.id,
          filePath: doc.path,
          fileName: doc.name,
          matchType: 'path',
          score: totalDocScore + pathScore,
          line,
          startLine: start,
          endLine: end,
          contentExcerpt: excerpt,
          signals
        });
      }

      // If document has matches
      if (totalDocScore > 0 || matchingLines.length > 0) {
        matchingLines.sort((a, b) => b.score - a.score);

        // If symbol matched, create excerpt around symbol line
        if (bestSymbol && symbolScore > 0 && (!options.filterSymbolKinds || options.filterSymbolKinds.includes(bestSymbol.kind))) {
          const symLine = bestSymbol.line;
          const start = Math.max(1, symLine - contextLines);
          const end = Math.min(doc.lines.length, symLine + contextLines);
          const excerpt = doc.lines.slice(start - 1, end).map((t, idx) => `${start + idx}: ${t}`).join('\n');

          candidateMatches.push({
            fileId: doc.id,
            filePath: doc.path,
            fileName: doc.name,
            matchType: 'symbol',
            score: totalDocScore + symbolScore + 100,
            line: symLine,
            startLine: start,
            endLine: end,
            contentExcerpt: excerpt,
            symbol: bestSymbol,
            signals
          });
        }

        // Add top content line matches
        const selectedLines: typeof matchingLines = [];
        for (const candidate of matchingLines) {
          // If a symbol was already matched at this line, skip duplicate content candidate
          if (bestSymbol && Math.abs(candidate.line - bestSymbol.line) <= contextLines) {
            continue;
          }
          if (selectedLines.every(existing => Math.abs(existing.line - candidate.line) > contextLines * 2)) {
            selectedLines.push(candidate);
          }
          if (selectedLines.length >= 2) break;
        }

        for (const lineMatch of selectedLines) {
          const start = Math.max(1, lineMatch.line - contextLines);
          const end = Math.min(doc.lines.length, lineMatch.line + contextLines);
          const excerpt = doc.lines.slice(start - 1, end).map((t, idx) => `${start + idx}: ${t}`).join('\n');

          candidateMatches.push({
            fileId: doc.id,
            filePath: doc.path,
            fileName: doc.name,
            matchType: 'content',
            score: totalDocScore + lineMatch.score * 5,
            line: lineMatch.line,
            startLine: start,
            endLine: end,
            contentExcerpt: excerpt,
            symbol: bestSymbol,
            signals
          });
        }
      }
    }

    // Sort by score descending, then filePath, then line
    candidateMatches.sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath) || a.line - b.line);

    // Deduplicate identical line windows
    const seen = new Set<string>();
    return candidateMatches.filter(m => {
      if (m.score < minScore) return false;
      const key = `${m.filePath}:${m.startLine}-${m.endLine}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, maxResults);
  }

  /**
   * Assembles a strictly bounded code and symbol context for AI Chat, Plan Mode, or Agent prompts.
   * Guarantees context never overflows the specified budget and avoids sending the whole repository.
   */
  public retrieveBoundedContext(rawQuery: string, options: RetrievalOptions = {}): BoundedContextResult {
    const maxChars = options.maxTotalChars ?? 6000;
    const matches = this.search(rawQuery, { ...options, maxResults: 10 });

    const items: BoundedContextItem[] = [];
    const includedFiles = new Set<string>();
    let currentChars = 0;
    let omittedCount = 0;
    const blocks: string[] = [];

    for (const match of matches) {
      const remaining = maxChars - currentChars;
      if (remaining < 300) {
        omittedCount++;
        continue;
      }

      let excerpt = match.contentExcerpt;
      const maxExcerptChars = Math.min(1200, remaining - 100);
      if (excerpt.length > maxExcerptChars) {
        excerpt = excerpt.slice(0, maxExcerptChars) + '\n... [truncated]';
      }

      const symInfo = match.symbol ? ` [${match.symbol.kind} ${match.symbol.name}]` : '';
      const header = `--- ${match.filePath}${symInfo} (lines ${match.startLine}-${match.endLine}) ---`;
      const block = `${header}\n${excerpt}`;

      blocks.push(block);
      currentChars += block.length;
      includedFiles.add(match.filePath);

      items.push({
        filePath: match.filePath,
        fileName: match.fileName,
        startLine: match.startLine,
        endLine: match.endLine,
        score: match.score,
        matchType: match.matchType,
        symbol: match.symbol,
        excerpt
      });
    }

    const formattedContext = blocks.length > 0
      ? `[Relevant Codebase Symbols & Context]\n${blocks.join('\n\n')}\n`
      : '';

    return {
      formattedContext,
      items,
      totalChars: currentChars,
      omittedCount,
      includedFiles: Array.from(includedFiles)
    };
  }

  /**
   * Returns all symbols extracted for a given file.
   */
  public getSymbolsForFile(rawPath: string): CodeSymbol[] {
    const path = normalizeWorkspacePath(rawPath);
    return this.documents.get(path)?.symbols || [];
  }

  /**
   * Returns all symbols across the project matching an optional query string.
   */
  public getAllSymbols(query?: string): Array<{ path: string; symbol: CodeSymbol }> {
    const results: Array<{ path: string; symbol: CodeSymbol }> = [];
    const norm = query ? query.toLowerCase().trim() : '';

    for (const [path, doc] of this.documents.entries()) {
      for (const sym of doc.symbols) {
        if (!norm || sym.name.toLowerCase().includes(norm)) {
          results.push({ path, symbol: sym });
        }
      }
    }

    return results;
  }

  /**
   * Retrieves import and importer dependencies for a file.
   */
  public getDependencies(rawPath: string): { imports: string[]; importedBy: string[] } {
    const path = normalizeWorkspacePath(rawPath);
    const imports = Array.from(this.importGraph.get(path) || []);
    const importedBy = Array.from(this.reverseImportGraph.get(path) || []);
    return { imports, importedBy };
  }

  /**
   * Retrieves index statistics.
   */
  public getStats(): IndexStats {
    let totalSymbols = 0;
    let totalSizeBytes = 0;

    for (const doc of this.documents.values()) {
      totalSymbols += doc.symbols.length;
      totalSizeBytes += doc.sizeBytes;
    }

    return {
      totalFiles: this.documents.size,
      totalSymbols,
      totalTokens: this.tokenIndex.size,
      totalTrigrams: this.trigramIndex.size,
      totalSizeBytes,
      lastUpdated: this.lastUpdated
    };
  }

  /**
   * Clears the index completely.
   */
  public clear(): void {
    this.documents.clear();
    this.tokenIndex.clear();
    this.trigramIndex.clear();
    this.symbolIndex.clear();
    this.importGraph.clear();
    this.reverseImportGraph.clear();
    this.lastUpdated = Date.now();
  }
}
