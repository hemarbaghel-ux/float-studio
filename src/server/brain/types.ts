/**
 * FLOAT AI Studio - Unified Brain Architecture Types
 * Defines the core interfaces for the Project Knowledge Graph, Context Engine,
 * Scoped Memory, Hybrid Retrieval, Event Synchronization, and Observability.
 */

export type KnowledgeNodeType =
  | 'project'
  | 'directory'
  | 'file'
  | 'symbol'
  | 'api_route'
  | 'component'
  | 'store'
  | 'rule'
  | 'test'
  | 'diagnostic';

export type KnowledgeEdgeType =
  | 'contains'
  | 'imports'
  | 'exports'
  | 'calls'
  | 'references'
  | 'implements'
  | 'renders'
  | 'reads_from'
  | 'writes_to'
  | 'calls_api'
  | 'tested_by'
  | 'depends_on'
  | 'configured_by';

export type EdgeConfidence = 'exact' | 'ast' | 'heuristic' | 'inferred';

export interface KnowledgeNode {
  id: string;
  type: KnowledgeNodeType;
  name: string;
  filePath?: string;
  line?: number;
  endLine?: number;
  metadata?: Record<string, any>;
}

export interface KnowledgeEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: KnowledgeEdgeType;
  confidence: EdgeConfidence;
  metadata?: Record<string, any>;
}

export interface ImpactAnalysis {
  targetFile: string;
  targetSymbols: string[];
  directImporters: string[];
  indirectImporters: string[];
  callingSymbols: Array<{ symbol: string; filePath: string; line: number }>;
  dependentComponents: string[];
  dependentStores: string[];
  affectedTests: string[];
  affectedApiRoutes: string[];
  totalImpactCount: number;
}

export interface CallGraphResult {
  symbolName: string;
  definition?: { filePath: string; line: number; signature?: string };
  callers: Array<{
    callerName: string;
    filePath: string;
    line: number;
    confidence: EdgeConfidence;
  }>;
  callees: Array<{
    calleeName: string;
    filePath: string;
    line: number;
    confidence: EdgeConfidence;
  }>;
}

export interface SubGraph {
  centerNodeId: string;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

export type MemoryCategory =
  | 'architecture'
  | 'convention'
  | 'decision'
  | 'fix'
  | 'problem'
  | 'risk'
  | 'test_requirement';

export interface BrainMemoryItem {
  id: string;
  projectId: string;
  userId: string;
  category: MemoryCategory;
  key: string;
  value: string;
  provenance: string; // e.g. "conversation:abc", "review:fix-123", "user_explicit"
  confidence: number; // 0.0 - 1.0
  verified: boolean;
  relatedFiles?: string[];
  createdAt: number;
  updatedAt: number;
  stale?: boolean;
}

export type BrainSearchMode =
  | 'lexical_graph_hybrid'
  | 'semantic_embeddings_hybrid'
  | 'symbol_exact';

export interface BrainRetrievedItem {
  id: string;
  filePath: string;
  fileName: string;
  nodeType: KnowledgeNodeType;
  nodeId?: string;
  symbolName?: string;
  symbolKind?: string;
  startLine: number;
  endLine: number;
  excerpt: string;
  score: number;
  confidence: EdgeConfidence;
  signals: string[];
  source: 'graph' | 'symbol' | 'bm25' | 'embedding' | 'active_editor' | 'test' | 'rule';
}

export interface BrainContextQueryOptions {
  activeFilePath?: string;
  activeSymbol?: string;
  gitDiffPaths?: string[];
  maxTotalChars?: number;
  maxItems?: number;
  intent?: 'bugfix' | 'refactor' | 'ui' | 'git' | 'question' | 'general' | 'test';
  includeNeighborhood?: boolean;
  neighborhoodDepth?: number;
}

export interface BrainContextResponse {
  searchMode: BrainSearchMode;
  items: BrainRetrievedItem[];
  formattedContext: string;
  totalChars: number;
  omittedCount: number;
  includedFiles: string[];
  impactedFiles: string[];
  relatedTests: string[];
  activeRules: string[];
  relevantMemories: BrainMemoryItem[];
  diagnosticsSummary?: string;
  observability: {
    retrievalDurationMs: number;
    graphNodesQueried: number;
    graphEdgesTraversed: number;
    lexicalMatches: number;
    graphMatches: number;
  };
}

export interface BrainObservabilityReport {
  projectId: string;
  status: 'idle' | 'indexing' | 'stale' | 'error';
  lastIndexedAt: number;
  revisionHash: string;
  searchMode: BrainSearchMode;
  stats: {
    totalFiles: number;
    totalSymbols: number;
    totalNodes: number;
    totalEdges: number;
    totalApiRoutes: number;
    totalComponents: number;
    totalStores: number;
    totalTests: number;
    totalMemories: number;
  };
  warnings: string[];
}

export interface StructuredFinding {
  taskId: string;
  subagentRole: string;
  summary: string;
  targetFiles: string[];
  nodesExamined: string[];
  evidence: Array<{
    filePath: string;
    line?: number;
    snippet?: string;
    relevance: string;
  }>;
  proposedChangesSummary?: string;
  dependencies: string[];
  confidence: number;
  unresolvedQuestions?: string[];
}

export interface EmbeddingProvider {
  name: string;
  isAvailable(): boolean;
  embedText(text: string): Promise<number[] | null>;
  embedBatch?(texts: string[]): Promise<Array<number[] | null>>;
}
