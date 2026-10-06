export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'method'
  | 'variable'
  | 'import';

export interface CodeSymbol {
  name: string;
  kind: SymbolKind;
  line: number;           // 1-indexed
  endLine?: number;
  signature?: string;
  containerName?: string; // enclosing class or namespace
  docComment?: string;
}

export interface IndexedDocument {
  id: string;
  path: string;
  name: string;
  content: string;
  lines: string[];
  hash: string;
  mtime: number;
  symbols: CodeSymbol[];
  imports: string[];
  exports: string[];
  tokens: string[];
  tokenFrequencies: Map<string, number>;
  trigrams: Set<string>;
  sizeBytes: number;
}

export interface RetrievalRankingSignals {
  exactPathMatch: boolean;
  filenameMatch: boolean;
  symbolMatch: boolean;
  contentMatch: boolean;
  activeFileMatch: boolean;
  importRelevance: boolean;
  gitDiffRelevance: boolean;
}

export interface RankedSearchResult {
  fileId: string;
  filePath: string;
  fileName: string;
  matchType: 'path' | 'symbol' | 'content';
  score: number;
  line: number;
  startLine: number;
  endLine: number;
  contentExcerpt: string;
  symbol?: CodeSymbol;
  signals: string[];
}

export interface RetrievalOptions {
  maxResults?: number;
  minScore?: number;
  contextLines?: number;
  caseSensitive?: boolean;
  activeFilePath?: string;
  gitDiffPaths?: string[];
  filterSymbolKinds?: SymbolKind[];
  maxTotalChars?: number;
}

export interface BoundedContextItem {
  filePath: string;
  fileName: string;
  startLine: number;
  endLine: number;
  score: number;
  matchType: string;
  symbol?: CodeSymbol;
  excerpt: string;
}

export interface BoundedContextResult {
  formattedContext: string;
  items: BoundedContextItem[];
  totalChars: number;
  omittedCount: number;
  includedFiles: string[];
}

export interface IndexStats {
  totalFiles: number;
  totalSymbols: number;
  totalTokens: number;
  totalTrigrams: number;
  totalSizeBytes: number;
  lastUpdated: number;
}
