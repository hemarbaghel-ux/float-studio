import {
  BrainRetrievedItem,
  BrainContextQueryOptions,
  BrainContextResponse,
  BrainSearchMode,
  EmbeddingProvider,
  EdgeConfidence
} from './types';
import { KnowledgeGraph } from './knowledgeGraph';
import { WorkspaceIndex } from '../../services/indexing/workspaceIndex';
import { BrainMemoryService } from './brainMemory';
import { RulesService } from '../rules/rulesService';
import { DiagnosticsService } from '../diagnostics/diagnosticsService';
import { normalizeWorkspacePath } from '../../services/indexing/fileFilter';

/**
 * Computes cosine similarity between two numeric vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Unified Codebase Context Retrieval Engine.
 * Combines Lexical BM25, Exact Symbol Graph, Neural/Embedding Proximity (when configured),
 * Active Editor Proximity, Git Working Tree Diffs, Rules, and Scoped Memory.
 */
export class BrainRetrievalEngine {
  private graph: KnowledgeGraph;
  private workspaceIndex: WorkspaceIndex;
  private embeddingProvider?: EmbeddingProvider;

  constructor(graph: KnowledgeGraph, workspaceIndex: WorkspaceIndex, embeddingProvider?: EmbeddingProvider) {
    this.graph = graph;
    this.workspaceIndex = workspaceIndex;
    this.embeddingProvider = embeddingProvider;
  }

  public setEmbeddingProvider(provider: EmbeddingProvider | undefined): void {
    this.embeddingProvider = provider;
  }

  public getSearchMode(): BrainSearchMode {
    if (this.embeddingProvider && this.embeddingProvider.isAvailable()) {
      return 'semantic_embeddings_hybrid';
    }
    return 'lexical_graph_hybrid';
  }

  /**
   * Main retrieval method assembling whole-codebase context within strict token budgets.
   */
  public async retrieve(
    rawQuery: string,
    options: BrainContextQueryOptions = {},
    userId: string = 'default-user'
  ): Promise<BrainContextResponse> {
    const startTime = Date.now();
    const query = rawQuery.trim();
    const projectId = this.graph.projectId;
    const maxChars = options.maxTotalChars ?? 8000;
    const maxItems = options.maxItems ?? 10;
    const searchMode = this.getSearchMode();

    let graphNodesQueried = 0;
    let graphEdgesTraversed = 0;
    let lexicalMatchesCount = 0;
    let graphMatchesCount = 0;

    const activeNorm = options.activeFilePath ? normalizeWorkspacePath(options.activeFilePath) : undefined;
    const gitDiffSet = new Set((options.gitDiffPaths || []).map(normalizeWorkspacePath));

    // 1. Inverted Lexical & Symbol Search from WorkspaceIndex
    const indexResults = this.workspaceIndex.search(query, {
      activeFilePath: activeNorm,
      gitDiffPaths: options.gitDiffPaths,
      maxResults: 20
    });
    lexicalMatchesCount = indexResults.length;

    // 2. Query Knowledge Graph for impacted nodes & neighborhood
    const candidateItems: BrainRetrievedItem[] = [];
    const seenLineWindows = new Set<string>();

    // Convert index results to BrainRetrievedItem candidates
    for (const match of indexResults) {
      const canonical = normalizeWorkspacePath(match.filePath);
      const key = `${canonical}:${match.startLine}-${match.endLine}`;
      if (seenLineWindows.has(key)) continue;
      seenLineWindows.add(key);

      candidateItems.push({
        id: `lex-${canonical}-${match.startLine}`,
        filePath: canonical,
        fileName: match.fileName,
        nodeType: match.symbol ? (match.symbol.kind === 'class' ? 'symbol' : 'symbol') : 'file',
        symbolName: match.symbol?.name,
        symbolKind: match.symbol?.kind,
        startLine: match.startLine,
        endLine: match.endLine,
        excerpt: match.contentExcerpt,
        score: match.score,
        confidence: match.symbol ? 'exact' : 'ast',
        signals: [...match.signals, 'bm25-index'],
        source: match.symbol ? 'symbol' : 'bm25'
      });
    }

    // 3. Graph Traversal: If query matches known symbols or components, trace call graph & dependents
    const queryTokens = query.toLowerCase().split(/[^\w$]+/).filter(t => t.length > 2);
    graphNodesQueried += queryTokens.length;

    for (const token of queryTokens) {
      const callersResult = this.graph.getSymbolCallers(token);
      if (callersResult.definition) {
        const defPath = callersResult.definition.filePath;
        const defDoc = this.workspaceIndex.getFileDocument(defPath);
        if (defDoc) {
          const start = Math.max(1, callersResult.definition.line - 3);
          const end = Math.min(defDoc.lines.length, callersResult.definition.line + 8);
          const excerpt = defDoc.lines.slice(start - 1, end).map((l, i) => `${start + i}: ${l}`).join('\n');
          const key = `${defPath}:${start}-${end}`;

          if (!seenLineWindows.has(key)) {
            seenLineWindows.add(key);
            graphMatchesCount++;
            candidateItems.push({
              id: `graph-def-${defPath}-${callersResult.definition.line}`,
              filePath: defPath,
              fileName: defPath.split('/').pop() || defPath,
              nodeType: 'symbol',
              symbolName: token,
              startLine: start,
              endLine: end,
              excerpt,
              score: 250, // High boost for exact graph symbol definition
              confidence: 'exact',
              signals: ['graph-symbol-definition', 'exact-symbol'],
              source: 'graph'
            });
          }
        }

        // Add direct callers from graph
        for (const caller of callersResult.callers.slice(0, 3)) {
          graphEdgesTraversed++;
          const callerDoc = this.workspaceIndex.getFileDocument(caller.filePath);
          if (callerDoc) {
            const start = Math.max(1, caller.line - 2);
            const end = Math.min(callerDoc.lines.length, caller.line + 4);
            const excerpt = callerDoc.lines.slice(start - 1, end).map((l, i) => `${start + i}: ${l}`).join('\n');
            const key = `${caller.filePath}:${start}-${end}`;

            if (!seenLineWindows.has(key)) {
              seenLineWindows.add(key);
              graphMatchesCount++;
              candidateItems.push({
                id: `graph-caller-${caller.filePath}-${caller.line}`,
                filePath: caller.filePath,
                fileName: caller.filePath.split('/').pop() || caller.filePath,
                nodeType: 'symbol',
                symbolName: caller.callerName,
                startLine: start,
                endLine: end,
                excerpt,
                score: 160,
                confidence: caller.confidence,
                signals: ['graph-caller', `caller-to:${token}`],
                source: 'graph'
              });
            }
          }
        }
      }

      // Check Store Dependents in Graph
      const storeDependents = this.graph.getStoreDependents(token);
      for (const comp of storeDependents.slice(0, 2)) {
        if (!comp.filePath) continue;
        const compDoc = this.workspaceIndex.getFileDocument(comp.filePath);
        if (compDoc) {
          const start = Math.max(1, (comp.line || 1) - 2);
          const end = Math.min(compDoc.lines.length, (comp.line || 1) + 6);
          const excerpt = compDoc.lines.slice(start - 1, end).map((l, i) => `${start + i}: ${l}`).join('\n');
          const key = `${comp.filePath}:${start}-${end}`;

          if (!seenLineWindows.has(key)) {
            seenLineWindows.add(key);
            graphMatchesCount++;
            candidateItems.push({
              id: `graph-comp-${comp.filePath}-${comp.line}`,
              filePath: comp.filePath,
              fileName: comp.filePath.split('/').pop() || comp.filePath,
              nodeType: 'component',
              symbolName: comp.name,
              startLine: start,
              endLine: end,
              excerpt,
              score: 150,
              confidence: 'ast',
              signals: ['graph-store-dependent', `reads:${token}`],
              source: 'graph'
            });
          }
        }
      }
    }

    // 4. If active file is present, pull impact analysis & direct neighborhood
    let impactedFiles: string[] = [];
    let relatedTestsList: string[] = [];
    if (activeNorm) {
      const impact = this.graph.getImpactedFiles(activeNorm);
      impactedFiles = [...impact.directImporters, ...impact.dependentComponents];
      relatedTestsList = impact.affectedTests;

      // Boost items in impacted files
      for (const item of candidateItems) {
        if (impact.directImporters.includes(item.filePath)) {
          item.score += 45;
          item.signals.push('graph-direct-importer');
        }
        if (impact.affectedTests.includes(item.filePath)) {
          item.score += 60;
          item.signals.push('graph-affected-test');
        }
      }
    }

    // 5. Intent-specific score adjustments
    if (options.intent) {
      for (const item of candidateItems) {
        if (options.intent === 'bugfix' && (item.filePath.includes('test') || item.signals.includes('graph-affected-test'))) {
          item.score += 50;
        } else if (options.intent === 'refactor' && item.signals.some(s => s.startsWith('caller-to:'))) {
          item.score += 60;
        } else if (options.intent === 'ui' && (item.nodeType === 'component' || item.nodeType === 'store')) {
          item.score += 50;
        } else if (options.intent === 'git' && gitDiffSet.has(item.filePath)) {
          item.score += 70;
        }
      }
    }

    // 6. Semantic Embeddings (if provider configured and available)
    if (this.embeddingProvider && this.embeddingProvider.isAvailable()) {
      try {
        const queryVector = await this.embeddingProvider.embedText(query);
        if (queryVector) {
          // If embeddings supported, compute cosine similarity boost
          for (const item of candidateItems) {
            const itemVector = await this.embeddingProvider.embedText(`${item.fileName} ${item.excerpt.slice(0, 300)}`);
            if (itemVector) {
              const sim = cosineSimilarity(queryVector, itemVector);
              item.score += Math.round(sim * 100);
              item.signals.push(`embedding-similarity:${sim.toFixed(2)}`);
            }
          }
        }
      } catch {
        // Fall back gracefully to lexical/graph scoring without breaking
      }
    }

    // 7. Sort by score descending and prune to top candidates
    candidateItems.sort((a, b) => b.score - a.score);
    const topCandidates = candidateItems.slice(0, maxItems);

    // 8. Assemble formatted context block within character budget
    const blocks: string[] = [];
    const includedFiles = new Set<string>();
    let currentChars = 0;
    let omittedCount = 0;

    for (const item of topCandidates) {
      const remaining = maxChars - currentChars;
      if (remaining < 250) {
        omittedCount++;
        continue;
      }

      let text = item.excerpt;
      const allowedExcerptChars = Math.min(1200, remaining - 100);
      if (text.length > allowedExcerptChars) {
        text = text.slice(0, allowedExcerptChars) + '\n... [truncated]';
      }

      const symTag = item.symbolName ? ` [${item.nodeType}: ${item.symbolName}]` : '';
      const signalTag = item.signals.length > 0 ? ` (signals: ${item.signals.slice(0, 3).join(', ')})` : '';
      const header = `--- ${item.filePath}${symTag} (lines ${item.startLine}-${item.endLine})${signalTag} ---`;
      const block = `${header}\n${text}`;

      blocks.push(block);
      currentChars += block.length;
      includedFiles.add(item.filePath);
    }

    // 9. Load scoped memories & rules
    const memories = BrainMemoryService.queryMemories(projectId, userId, query).slice(0, 4);
    const activeRules = RulesService.getProjectRules(projectId, userId).map(r => `• [${r.name}] ${r.content}`);
    const diags = DiagnosticsService.getDiagnostics(projectId, undefined, userId);
    const relevantDiags = activeNorm ? diags.filter(d => d.filePath === activeNorm) : diags;
    let diagnosticsSummary = undefined;
    if (relevantDiags.length > 0) {
      diagnosticsSummary = `Active Diagnostics (${relevantDiags.length}):\n` + relevantDiags.slice(0, 3).map(d => `• ${d.severity.toUpperCase()} in ${d.filePath || 'workspace'}:${d.line || 1} - ${d.message}`).join('\n');
    }

    const formattedContext = blocks.length > 0
      ? `[FLOAT Brain: Codebase Knowledge & Context]\n${blocks.join('\n\n')}\n`
      : '';

    return {
      searchMode,
      items: topCandidates,
      formattedContext,
      totalChars: currentChars,
      omittedCount,
      includedFiles: Array.from(includedFiles),
      impactedFiles,
      relatedTests: relatedTestsList,
      activeRules,
      relevantMemories: memories,
      diagnosticsSummary,
      observability: {
        retrievalDurationMs: Date.now() - startTime,
        graphNodesQueried,
        graphEdgesTraversed,
        lexicalMatches: lexicalMatchesCount,
        graphMatches: graphMatchesCount
      }
    };
  }
}
