/**
 * FLOAT Studio — Codebase Intelligence & Context Engine
 * 
 * Implements lexical & semantic codebase indexing, AST symbol extraction,
 * and high-precision @-mention context resolution for AI prompts.
 */

import { CodeSymbol, CodebaseSearchResult, ContextSource, ResolvedContext } from './types';
import { FloatWorkspaceLogic } from './FloatWorkspaceLogic';

export class FloatIntelligenceLogic {
  private workspaceLogic: FloatWorkspaceLogic;
  private indexedDocuments = new Map<string, string>(); // path -> content
  private symbolsCache = new Map<string, CodeSymbol[]>();

  constructor(workspaceLogic: FloatWorkspaceLogic) {
    this.workspaceLogic = workspaceLogic;
  }

  /**
   * Index or update file content in the intelligence cache
   */
  public indexFile(filePath: string, content: string): void {
    const normalized = filePath.replace(/\\/g, '/');
    this.indexedDocuments.set(normalized, content);
    this.symbolsCache.delete(normalized); // invalidate symbol cache
  }

  /**
   * Extract code symbols (functions, classes, interfaces, types)
   */
  public extractSymbols(filePath: string): CodeSymbol[] {
    const normalized = filePath.replace(/\\/g, '/');
    if (this.symbolsCache.has(normalized)) {
      return this.symbolsCache.get(normalized)!;
    }

    const content = this.indexedDocuments.get(normalized) || '';
    const symbols: CodeSymbol[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match functions: function foo(, const foo = (, export function foo(
      const fnMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/) ||
                      line.match(/(?:export\s+)?const\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\(/);
      if (fnMatch) {
        symbols.push({
          name: fnMatch[1],
          kind: 'function',
          filePath: normalized,
          line: i + 1,
          character: line.indexOf(fnMatch[1])
        });
      }

      // Match classes
      const classMatch = line.match(/(?:export\s+)?class\s+([a-zA-Z0-9_$]+)/);
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          kind: 'class',
          filePath: normalized,
          line: i + 1,
          character: line.indexOf(classMatch[1])
        });
      }

      // Match interfaces & types
      const typeMatch = line.match(/(?:export\s+)?(?:interface|type)\s+([a-zA-Z0-9_$]+)/);
      if (typeMatch) {
        symbols.push({
          name: typeMatch[1],
          kind: 'interface',
          filePath: normalized,
          line: i + 1,
          character: line.indexOf(typeMatch[1])
        });
      }
    }

    this.symbolsCache.set(normalized, symbols);
    return symbols;
  }

  /**
   * Perform BM25-ranked lexical and symbol search across indexed codebase
   */
  public searchCodebase(query: string, maxResults = 10): CodebaseSearchResult[] {
    const results: CodebaseSearchResult[] = [];
    const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);

    if (tokens.length === 0) {
      return [];
    }

    for (const [filePath, content] of this.indexedDocuments.entries()) {
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lowerLine = line.toLowerCase();
        let matchCount = 0;

        for (const token of tokens) {
          if (lowerLine.includes(token)) {
            matchCount++;
          }
        }

        if (matchCount > 0) {
          const score = (matchCount / tokens.length) * (1 / (1 + Math.log(line.length + 1)));
          results.push({
            filePath,
            line: i + 1,
            text: line.trim(),
            score,
            matchType: 'lexical'
          });
        }
      }
    }

    // Also search symbols
    for (const [filePath, symbols] of this.symbolsCache.entries()) {
      for (const sym of symbols) {
        const symName = sym.name.toLowerCase();
        if (tokens.some(t => symName.includes(t))) {
          results.push({
            filePath,
            line: sym.line,
            text: `[Symbol: ${sym.kind}] ${sym.name}`,
            score: 1.5,
            matchType: 'symbol'
          });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
  }

  /**
   * Resolve @-mentions in user prompt into token-bounded context blocks
   */
  public async resolveContext(rawPrompt: string, tokenBudget = 4000): Promise<ResolvedContext> {
    const sources: ContextSource[] = [];
    let promptText = rawPrompt;

    // Detect @file:path/to/file or @path/to/file
    const fileMentions = rawPrompt.match(/@(?:file:)?([a-zA-Z0-9_\-\./\\]+\.[a-zA-Z0-9]+)/g) || [];
    for (const mention of fileMentions) {
      const cleanPath = mention.replace(/^@(file:)?/, '');
      try {
        const content = await this.workspaceLogic.readFile(cleanPath);
        const snippet = content.length > 1500 ? content.slice(0, 1500) + '\n... [truncated]' : content;
        sources.push({
          type: 'file',
          uri: cleanPath,
          label: `@file ${cleanPath}`,
          contentSnippet: snippet,
          tokensEstimated: Math.ceil(snippet.length / 4)
        });
      } catch {
        // file unreadable or not found
      }
    }

    // Detect @codebase search query
    if (rawPrompt.includes('@codebase')) {
      const searchQuery = rawPrompt.replace(/@codebase/g, '').trim();
      const searchMatches = this.searchCodebase(searchQuery, 5);
      if (searchMatches.length > 0) {
        const snippet = searchMatches.map(m => `${m.filePath}:${m.line} -> ${m.text}`).join('\n');
        sources.push({
          type: 'codebase',
          uri: 'codebase://search',
          label: '@codebase Search Context',
          contentSnippet: snippet,
          tokensEstimated: Math.ceil(snippet.length / 4)
        });
      }
    }

    // Construct formatted prompt prefix
    let formattedPrompt = '';
    let currentTokens = 0;

    if (sources.length > 0) {
      formattedPrompt += '=== Codebase Context ===\n';
      for (const src of sources) {
        if (currentTokens + src.tokensEstimated > tokenBudget) break;
        formattedPrompt += `--- [${src.label}] ---\n${src.contentSnippet}\n\n`;
        currentTokens += src.tokensEstimated;
      }
      formattedPrompt += '=== User Request ===\n';
    }

    formattedPrompt += promptText;

    return {
      formattedPrompt,
      totalTokensEstimated: currentTokens + Math.ceil(promptText.length / 4),
      sources
    };
  }
}
