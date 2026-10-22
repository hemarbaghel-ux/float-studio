import {
  KnowledgeNode,
  KnowledgeNodeType,
  KnowledgeEdge,
  KnowledgeEdgeType,
  EdgeConfidence,
  ImpactAnalysis,
  CallGraphResult,
  SubGraph
} from './types';
import { extractSymbols } from '../../services/indexing/symbolExtractor';
import { normalizeWorkspacePath } from '../../services/indexing/fileFilter';

/**
 * High-performance, In-Memory Typed Project Knowledge Graph
 * Captures semantic and structural relationships between projects, files,
 * symbols, API routes, React components, stores, rules, and tests.
 */
export class KnowledgeGraph {
  public readonly projectId: string;

  // Nodes: ID -> Node
  private nodes = new Map<string, KnowledgeNode>();

  // Edges: ID -> Edge
  private edges = new Map<string, KnowledgeEdge>();

  // Indices for sub-millisecond lookups
  private outgoingEdges = new Map<string, Set<string>>(); // sourceId -> Set<edgeId>
  private incomingEdges = new Map<string, Set<string>>(); // targetId -> Set<edgeId>
  private nodesByFile = new Map<string, Set<string>>();   // filePath -> Set<nodeId>
  private nodesByType = new Map<KnowledgeNodeType, Set<string>>(); // type -> Set<nodeId>
  private symbolsByName = new Map<string, Set<string>>(); // lowercase symbol name -> Set<nodeId>
  private fileContents = new Map<string, string>();       // filePath -> raw content

  constructor(projectId: string = 'default-project') {
    this.projectId = projectId;
    this.addProjectNode();
  }

  private addProjectNode(): void {
    const projId = `project:${this.projectId}`;
    const projectNode: KnowledgeNode = {
      id: projId,
      type: 'project',
      name: this.projectId,
      metadata: { createdAt: Date.now() }
    };
    this.addNode(projectNode);
  }

  /**
   * Adds or updates a node in the graph.
   */
  public addNode(node: KnowledgeNode): void {
    this.nodes.set(node.id, node);

    // Index by type
    let typeSet = this.nodesByType.get(node.type);
    if (!typeSet) {
      typeSet = new Set<string>();
      this.nodesByType.set(node.type, typeSet);
    }
    typeSet.add(node.id);

    // Index by file
    if (node.filePath) {
      const normPath = normalizeWorkspacePath(node.filePath);
      let fileSet = this.nodesByFile.get(normPath);
      if (!fileSet) {
        fileSet = new Set<string>();
        this.nodesByFile.set(normPath, fileSet);
      }
      fileSet.add(node.id);
    }

    // Index by symbol name
    if (node.type === 'symbol' || node.type === 'component' || node.type === 'store') {
      const nameKey = node.name.toLowerCase();
      let symSet = this.symbolsByName.get(nameKey);
      if (!symSet) {
        symSet = new Set<string>();
        this.symbolsByName.set(nameKey, symSet);
      }
      symSet.add(node.id);
    }
  }

  /**
   * Adds an edge between two existing nodes.
   */
  public addEdge(edge: KnowledgeEdge): boolean {
    if (!this.nodes.has(edge.sourceId) || !this.nodes.has(edge.targetId)) {
      return false;
    }

    this.edges.set(edge.id, edge);

    let outSet = this.outgoingEdges.get(edge.sourceId);
    if (!outSet) {
      outSet = new Set<string>();
      this.outgoingEdges.set(edge.sourceId, outSet);
    }
    outSet.add(edge.id);

    let inSet = this.incomingEdges.get(edge.targetId);
    if (!inSet) {
      inSet = new Set<string>();
      this.incomingEdges.set(edge.targetId, inSet);
    }
    inSet.add(edge.id);

    return true;
  }

  /**
   * Helper to create and add a typed edge with confidence.
   */
  public link(
    sourceId: string,
    targetId: string,
    type: KnowledgeEdgeType,
    confidence: EdgeConfidence = 'exact',
    metadata?: Record<string, any>
  ): boolean {
    const id = `${sourceId}->${type}->${targetId}`;
    return this.addEdge({ id, sourceId, targetId, type, confidence, metadata });
  }

  /**
   * Retrieves a node by ID.
   */
  public getNode(id: string): KnowledgeNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Retrieves all nodes matching a specific type.
   */
  public getNodesByType(type: KnowledgeNodeType): KnowledgeNode[] {
    const ids = this.nodesByType.get(type);
    if (!ids) return [];
    const list: KnowledgeNode[] = [];
    for (const id of ids) {
      const node = this.nodes.get(id);
      if (node) list.push(node);
    }
    return list;
  }

  /**
   * Retrieves all nodes belonging to a file.
   */
  public getNodesByFile(filePath: string): KnowledgeNode[] {
    const norm = normalizeWorkspacePath(filePath);
    const ids = this.nodesByFile.get(norm);
    if (!ids) return [];
    const list: KnowledgeNode[] = [];
    for (const id of ids) {
      const node = this.nodes.get(id);
      if (node) list.push(node);
    }
    return list;
  }

  /**
   * Reconciles a single file in the graph.
   * Extracts symbols, API routes, components, stores, tests, imports, and cross-references.
   */
  public reconcileFile(rawPath: string, content: string): void {
    const filePath = normalizeWorkspacePath(rawPath);
    if (!filePath) return;

    // 1. Remove previous nodes and edges for this file
    this.removeFile(filePath);

    this.fileContents.set(filePath, content);

    // 2. Add File node
    const fileNodeId = `file:${filePath}`;
    const fileName = filePath.split('/').pop() || filePath;
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    this.addNode({
      id: fileNodeId,
      type: 'file',
      name: fileName,
      filePath,
      metadata: { ext, sizeBytes: content.length, mtime: Date.now() }
    });

    // Link Project -> contains -> File
    this.link(`project:${this.projectId}`, fileNodeId, 'contains', 'exact');

    // 3. Extract symbols & language-aware entities
    const { symbols, imports, exports } = extractSymbols(filePath, content);
    const lines = content.split(/\r?\n/);

    // Is this a test file?
    const isTest = /(?:^|\/)(?:test|tests|__tests__|scripts\/test[A-Z0-9].*)\.|\.(?:test|spec)\.[a-z0-9]+$/i.test(filePath) ||
      lines.some(l => /\b(describe|test|it)\s*\(['"]/.test(l));

    if (isTest) {
      const testNodeId = `test:${filePath}`;
      this.addNode({
        id: testNodeId,
        type: 'test',
        name: fileName,
        filePath,
        metadata: {
          testType: filePath.includes('e2e') ? 'e2e' : filePath.includes('integration') ? 'integration' : 'unit'
        }
      });
      this.link(fileNodeId, testNodeId, 'contains', 'exact');
    }

    // 4. Process Symbols and specialize into Components, Stores, ApiRoutes
    for (const sym of symbols) {
      if (sym.kind === 'import') continue; // Handled via import resolution

      const symNodeId = `sym:${filePath}:${sym.name}`;
      const symNode: KnowledgeNode = {
        id: symNodeId,
        type: 'symbol',
        name: sym.name,
        filePath,
        line: sym.line,
        metadata: { kind: sym.kind, signature: sym.signature }
      };

      this.addNode(symNode);
      this.link(fileNodeId, symNodeId, 'contains', 'exact');

      if (exports.includes(sym.name)) {
        this.link(fileNodeId, symNodeId, 'exports', 'exact');
      }

      // Check if it's a React Component
      // Convention: Capitalized identifier in TSX/JSX, or contains JSX/hooks
      if (
        (['tsx', 'jsx'].includes(ext) || content.includes('import React')) &&
        /^[A-Z][a-zA-Z0-9_$]+$/.test(sym.name) &&
        (sym.kind === 'function' || sym.kind === 'class')
      ) {
        const compNodeId = `comp:${filePath}:${sym.name}`;
        this.addNode({
          id: compNodeId,
          type: 'component',
          name: sym.name,
          filePath,
          line: sym.line,
          metadata: { signature: sym.signature }
        });
        this.link(fileNodeId, compNodeId, 'contains', 'exact');
        this.link(compNodeId, symNodeId, 'implements', 'exact');
      }

      // Check if it's a State Store
      // Convention: use...Store, create(...) from zustand, or State class
      if (
        (sym.kind as string) === 'store' ||
        /^(?:use[A-Z0-9]\w*Store|.*Store)$/i.test(sym.name) ||
        (sym.signature && /create(?:<[^>]+>)?\s*\(/.test(sym.signature))
      ) {
        const storeNodeId = `store:${filePath}:${sym.name}`;
        this.addNode({
          id: storeNodeId,
          type: 'store',
          name: sym.name,
          filePath,
          line: sym.line,
          metadata: { signature: sym.signature }
        });
        this.link(fileNodeId, storeNodeId, 'contains', 'exact');
      }
    }

    // 4b. Scan lines for store definitions: e.g. export const useUserStore = ...
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const storeMatch = lineText.match(/(?:export\s+)?(?:const|let|var)\s+(use[A-Z0-9]\w*Store|[a-zA-Z0-9_$]*Store)\s*=/i);
      if (storeMatch) {
        const storeName = storeMatch[1];
        const storeNodeId = `store:${filePath}:${storeName}`;
        if (!this.nodes.has(storeNodeId)) {
          this.addNode({
            id: storeNodeId,
            type: 'store',
            name: storeName,
            filePath,
            line: i + 1,
            metadata: { signature: lineText.slice(0, 100) }
          });
          this.link(fileNodeId, storeNodeId, 'contains', 'exact');
        }
      }
    }

    // 5. Scan for API Routes (e.g. app.get('/api/...'), router.post('/api/...'))
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const apiMatch = lineText.match(/(?:app|router)\.(get|post|put|delete|patch|use)\s*\(\s*['"]([^'"]+)['"]/i);
      if (apiMatch) {
        const method = apiMatch[1].toUpperCase();
        const routePath = apiMatch[2];
        const routeNodeId = `api:${method}:${routePath}`;
        this.addNode({
          id: routeNodeId,
          type: 'api_route',
          name: `${method} ${routePath}`,
          filePath,
          line: i + 1,
          metadata: { method, routePath }
        });
        this.link(fileNodeId, routeNodeId, 'contains', 'exact');
      }
    }

    // 6. Scan for API calls from client code (e.g. fetch('/api/...'), axios.get('/api/...'))
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const clientApiMatch = lineText.match(/(?:fetch|axios\.(?:get|post|put|delete))\s*\(\s*[`'"](\/api\/[^`'"]+)[`'"]/);
      if (clientApiMatch) {
        const calledEndpoint = clientApiMatch[1].split('?')[0];
        // Heuristic link to potential matching API routes
        for (const [nodeId, node] of this.nodes.entries()) {
          if (node.type === 'api_route' && node.metadata?.routePath === calledEndpoint) {
            this.link(fileNodeId, nodeId, 'calls_api', 'heuristic', { line: i + 1 });
          }
        }
      }
    }

    // 7. Resolve Imports
    for (const imp of imports) {
      const resolvedTarget = this.resolveImport(filePath, imp);
      if (resolvedTarget) {
        const targetFileId = `file:${resolvedTarget}`;
        if (this.nodes.has(targetFileId)) {
          this.link(fileNodeId, targetFileId, 'imports', 'exact');
          this.link(targetFileId, fileNodeId, 'depends_on', 'exact');

          // If current file is a test file, link target with 'tested_by'
          if (isTest) {
            this.link(targetFileId, `test:${filePath}`, 'tested_by', 'exact');
          }
        }
      }
    }

    // 8. Call and Component Render resolution
    this.resolveIntraFileCalls(filePath, lines, symbols);
  }

  /**
   * Resolves function calls, component renders, and store connections within file lines.
   */
  private resolveIntraFileCalls(
    filePath: string,
    lines: string[],
    fileSymbols: Array<{ name: string; kind: string; line: number }>
  ): void {
    const fileNodeId = `file:${filePath}`;

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const lineNum = i + 1;

      // 1. Component renders: <MyComponent ... />
      const renderMatches = lineText.matchAll(/<([A-Z][a-zA-Z0-9_$]+)(?:\s|>|\/)/g);
      for (const m of renderMatches) {
        const renderedName = m[1];
        if (['React', 'Fragment', 'Suspense', 'StrictMode'].includes(renderedName)) continue;

        const targetSyms = this.symbolsByName.get(renderedName.toLowerCase());
        if (targetSyms) {
          for (const targetId of targetSyms) {
            const targetNode = this.nodes.get(targetId);
            if (targetNode && (targetNode.type === 'component' || targetNode.type === 'symbol')) {
              this.link(fileNodeId, targetNode.id, 'renders', 'ast', { line: lineNum });
            }
          }
        }
      }

      // 2. Store usage: useAppStore(...)
      const storeMatches = lineText.matchAll(/\b(use[A-Z0-9]\w*Store|[A-Za-z0-9_$]+Store)\b/g);
      for (const sm of storeMatches) {
        const storeName = sm[1];
        const targetStores = this.symbolsByName.get(storeName.toLowerCase());
        if (targetStores) {
          for (const sId of targetStores) {
            const storeNode = this.nodes.get(sId);
            if (storeNode && storeNode.type === 'store') {
              this.link(fileNodeId, storeNode.id, 'reads_from', 'heuristic', { line: lineNum });
            }
          }
        }
      }

      // 3. Class implements interface
      const implementsMatch = lineText.match(/class\s+([a-zA-Z0-9_$]+)[^{]*\bimplements\s+([^{]+)/);
      if (implementsMatch) {
        const className = implementsMatch[1];
        const ifaceList = implementsMatch[2].replace(/{.*/, '').split(',').map(s => s.trim().split(/[\s<]/)[0]);
        const classNodeId = `sym:${filePath}:${className}`;

        for (const ifaceName of ifaceList) {
          if (!ifaceName) continue;
          const ifaceMatches = this.symbolsByName.get(ifaceName.toLowerCase());
          if (ifaceMatches) {
            for (const ifaceId of ifaceMatches) {
              this.link(classNodeId, ifaceId, 'implements', 'ast', { line: lineNum });
            }
          }
        }
      }

      // 4. Instantiations: new ClassName(...)
      const newMatches = lineText.matchAll(/\bnew\s+([a-zA-Z0-9_$]+)/g);
      for (const nm of newMatches) {
        const clsName = nm[1];
        const classSyms = this.symbolsByName.get(clsName.toLowerCase());
        if (classSyms) {
          for (const cId of classSyms) {
            const cNode = this.nodes.get(cId);
            if (cNode && cNode.filePath !== filePath) {
              this.link(fileNodeId, cNode.id, 'calls', 'ast', { line: lineNum });
            }
          }
        }
      }

      // 5. Method calls: service.getUserProfile(...)
      const callMatches = lineText.matchAll(/\b([a-zA-Z0-9_$]+)\s*\.\s*([a-zA-Z0-9_$]+)\s*\(/g);
      for (const cm of callMatches) {
        const meth = cm[2];
        const methSyms = this.symbolsByName.get(meth.toLowerCase());
        if (methSyms) {
          for (const mId of methSyms) {
            const mNode = this.nodes.get(mId);
            if (mNode && mNode.filePath !== filePath) {
              this.link(fileNodeId, mNode.id, 'calls', 'heuristic', { line: lineNum });
            }
          }
        }
      }
    }
  }

  /**
   * Secondary pass to resolve cross-file references and implementations across the entire project.
   */
  public resolveCrossFileReferences(): void {
    for (const [filePath, content] of this.fileContents.entries()) {
      this.resolveIntraFileCalls(filePath, content.split(/\r?\n/), []);
    }
  }

  /**
   * Resolves relative import specifier to canonical workspace path.
   */
  private resolveImport(sourcePath: string, importSpec: string): string | null {
    if (!importSpec.startsWith('.')) return null;

    const sourceParts = sourcePath.split('/');
    sourceParts.pop(); // directory

    const importParts = importSpec.split('/');
    for (const part of importParts) {
      if (part === '.') continue;
      if (part === '..') {
        sourceParts.pop();
      } else {
        sourceParts.push(part);
      }
    }

    const candidateBase = sourceParts.join('/');
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];

    for (const ext of extensions) {
      const testPath = candidateBase + ext;
      if (this.nodes.has(`file:${testPath}`)) {
        return testPath;
      }
    }

    return null;
  }

  /**
   * Removes all nodes and edges associated with a file.
   */
  public removeFile(rawPath: string): void {
    const filePath = normalizeWorkspacePath(rawPath);
    const nodeIds = this.nodesByFile.get(filePath);
    if (!nodeIds) return;

    for (const nodeId of Array.from(nodeIds)) {
      this.removeNode(nodeId);
    }

    this.nodesByFile.delete(filePath);
  }

  /**
   * Removes a node and all its connected edges.
   */
  public removeNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    // Remove outgoing edges
    const outEdges = this.outgoingEdges.get(nodeId);
    if (outEdges) {
      for (const eId of outEdges) {
        const edge = this.edges.get(eId);
        if (edge) {
          this.incomingEdges.get(edge.targetId)?.delete(eId);
        }
        this.edges.delete(eId);
      }
      this.outgoingEdges.delete(nodeId);
    }

    // Remove incoming edges
    const inEdges = this.incomingEdges.get(nodeId);
    if (inEdges) {
      for (const eId of inEdges) {
        const edge = this.edges.get(eId);
        if (edge) {
          this.outgoingEdges.get(edge.sourceId)?.delete(eId);
        }
        this.edges.delete(eId);
      }
      this.incomingEdges.delete(nodeId);
    }

    // Remove from indices
    this.nodesByType.get(node.type)?.delete(nodeId);
    if (node.name) {
      this.symbolsByName.get(node.name.toLowerCase())?.delete(nodeId);
    }
    this.nodes.delete(nodeId);
  }

  /**
   * Impact Analysis Query: Answers "What would be affected if this file/symbol changes?"
   */
  public getImpactedFiles(rawPath: string): ImpactAnalysis {
    const targetFile = normalizeWorkspacePath(rawPath);
    const targetFileNodeId = `file:${targetFile}`;

    const targetSymbols: string[] = [];
    const directImporters = new Set<string>();
    const indirectImporters = new Set<string>();
    const callingSymbols: Array<{ symbol: string; filePath: string; line: number }> = [];
    const dependentComponents = new Set<string>();
    const dependentStores = new Set<string>();
    const affectedTests = new Set<string>();
    const affectedApiRoutes = new Set<string>();

    const fileNodes = this.getNodesByFile(targetFile);
    for (const node of fileNodes) {
      if (node.type === 'symbol') targetSymbols.push(node.name);
      if (node.type === 'store') dependentStores.add(node.name);
    }

    // 1. Direct Importers (edges target = targetFileNodeId, type = 'imports')
    const incomingToFile = this.incomingEdges.get(targetFileNodeId) || new Set<string>();
    for (const edgeId of incomingToFile) {
      const edge = this.edges.get(edgeId);
      if (edge && edge.type === 'imports') {
        const sourceNode = this.nodes.get(edge.sourceId);
        if (sourceNode?.filePath && sourceNode.filePath !== targetFile) {
          directImporters.add(sourceNode.filePath);
        }
      }
      if (edge && edge.type === 'tested_by') {
        const testNode = this.nodes.get(edge.targetId);
        if (testNode?.filePath) affectedTests.add(testNode.filePath);
      }
    }

    // 2. Indirect Importers (2nd degree traversal)
    for (const direct of directImporters) {
      const inDirectNodeId = `file:${direct}`;
      const secondDegree = this.incomingEdges.get(inDirectNodeId) || new Set<string>();
      for (const eId of secondDegree) {
        const edge = this.edges.get(eId);
        if (edge && edge.type === 'imports') {
          const sourceNode = this.nodes.get(edge.sourceId);
          if (sourceNode?.filePath && sourceNode.filePath !== targetFile && !directImporters.has(sourceNode.filePath)) {
            indirectImporters.add(sourceNode.filePath);
          }
        }
      }
    }

    // 3. Dependent components and callers
    for (const node of fileNodes) {
      const nodeIncoming = this.incomingEdges.get(node.id) || new Set<string>();
      for (const eId of nodeIncoming) {
        const edge = this.edges.get(eId);
        if (!edge) continue;

        const sourceNode = this.nodes.get(edge.sourceId);
        if (!sourceNode) continue;

        if (edge.type === 'calls' || edge.type === 'references') {
          callingSymbols.push({
            symbol: sourceNode.name,
            filePath: sourceNode.filePath || '',
            line: edge.metadata?.line || sourceNode.line || 1
          });
        } else if (edge.type === 'renders') {
          dependentComponents.add(sourceNode.name);
        } else if (edge.type === 'reads_from' || edge.type === 'writes_to') {
          if (sourceNode.type === 'component') dependentComponents.add(sourceNode.name);
        }
      }

      // Check for attached API routes
      if (node.type === 'api_route') {
        affectedApiRoutes.add(node.name);
      }
    }

    // 4. Resolve tests covering this file
    const relatedTests = this.getRelatedTests(targetFile);
    for (const t of relatedTests) {
      if (t.filePath) affectedTests.add(t.filePath);
    }

    const totalImpactCount =
      directImporters.size +
      indirectImporters.size +
      callingSymbols.length +
      dependentComponents.size +
      affectedTests.size +
      affectedApiRoutes.size;

    return {
      targetFile,
      targetSymbols,
      directImporters: Array.from(directImporters),
      indirectImporters: Array.from(indirectImporters),
      callingSymbols,
      dependentComponents: Array.from(dependentComponents),
      dependentStores: Array.from(dependentStores),
      affectedTests: Array.from(affectedTests),
      affectedApiRoutes: Array.from(affectedApiRoutes),
      totalImpactCount
    };
  }

  /**
   * Call Graph Query: Returns definition, callers, and callees for a symbol.
   */
  public getSymbolCallers(symbolName: string): CallGraphResult {
    const norm = symbolName.trim();
    const symNodeIds = this.symbolsByName.get(norm.toLowerCase()) || new Set<string>();

    let definition: { filePath: string; line: number; signature?: string } | undefined;
    const callers: CallGraphResult['callers'] = [];
    const callees: CallGraphResult['callees'] = [];

    for (const id of symNodeIds) {
      const node = this.nodes.get(id);
      if (node && !definition && node.filePath && node.line) {
        definition = {
          filePath: node.filePath,
          line: node.line,
          signature: node.metadata?.signature
        };
      }

      // Inbound calls
      const inEdges = this.incomingEdges.get(id) || new Set<string>();
      for (const eId of inEdges) {
        const edge = this.edges.get(eId);
        if (edge && (edge.type === 'calls' || edge.type === 'renders' || edge.type === 'references' || edge.type === 'implements')) {
          const src = this.nodes.get(edge.sourceId);
          if (src) {
            callers.push({
              callerName: src.name,
              filePath: src.filePath || '',
              line: edge.metadata?.line || src.line || 1,
              confidence: edge.confidence
            });
          }
        }
      }

      // Outbound callees
      const outEdges = this.outgoingEdges.get(id) || new Set<string>();
      for (const eId of outEdges) {
        const edge = this.edges.get(eId);
        if (edge && (edge.type === 'calls' || edge.type === 'renders' || edge.type === 'implements')) {
          const tgt = this.nodes.get(edge.targetId);
          if (tgt) {
            callees.push({
              calleeName: tgt.name,
              filePath: tgt.filePath || '',
              line: edge.metadata?.line || tgt.line || 1,
              confidence: edge.confidence
            });
          }
        }
      }
    }

    return { symbolName: norm, definition, callers, callees };
  }

  /**
   * Resolves automated tests relevant to a file or symbol.
   */
  public getRelatedTests(rawPath: string): KnowledgeNode[] {
    const filePath = normalizeWorkspacePath(rawPath);
    const testNodes = this.getNodesByType('test');
    const matched: KnowledgeNode[] = [];

    const baseName = filePath.split('/').pop()?.replace(/\.[^.]+$/, '').toLowerCase() || '';

    for (const testNode of testNodes) {
      if (!testNode.filePath) continue;

      // Direct edge test
      const fileId = `file:${filePath}`;
      const outEdges = this.outgoingEdges.get(fileId) || new Set<string>();
      let hasDirectEdge = false;
      for (const eId of outEdges) {
        const edge = this.edges.get(eId);
        if (edge?.targetId === testNode.id) {
          hasDirectEdge = true;
          break;
        }
      }

      // Name convention heuristic: testFoo.ts -> foo.ts
      const testPathLower = testNode.filePath.toLowerCase();
      const isNameMatch = baseName && (testPathLower.includes(baseName) || baseName.includes(testPathLower.replace(/.*test/, '')));

      if (hasDirectEdge || isNameMatch) {
        matched.push(testNode);
      }
    }

    return matched;
  }

  /**
   * Returns frontend components and hooks that read from or write to a store.
   */
  public getStoreDependents(storeName: string): KnowledgeNode[] {
    const storeIds = this.symbolsByName.get(storeName.toLowerCase()) || new Set<string>();
    const dependents: KnowledgeNode[] = [];

    for (const storeId of storeIds) {
      const inEdges = this.incomingEdges.get(storeId) || new Set<string>();
      for (const eId of inEdges) {
        const edge = this.edges.get(eId);
        if (edge && (edge.type === 'reads_from' || edge.type === 'writes_to')) {
          const src = this.nodes.get(edge.sourceId);
          if (src) dependents.push(src);
        }
      }
    }

    return dependents;
  }

  /**
   * Subgraph / Neighborhood traversal around a center node.
   */
  public queryNeighborhood(nodeId: string, depth: number = 1): SubGraph {
    const visitedNodes = new Set<string>();
    const visitedEdges = new Set<string>();

    const queue: Array<{ id: string; currentDepth: number }> = [{ id: nodeId, currentDepth: 0 }];
    visitedNodes.add(nodeId);

    while (queue.length > 0) {
      const { id, currentDepth } = queue.shift()!;
      if (currentDepth >= depth) continue;

      // Expand outgoing
      const outEdges = this.outgoingEdges.get(id) || new Set<string>();
      for (const eId of outEdges) {
        const edge = this.edges.get(eId);
        if (edge) {
          visitedEdges.add(edge.id);
          if (!visitedNodes.has(edge.targetId)) {
            visitedNodes.add(edge.targetId);
            queue.push({ id: edge.targetId, currentDepth: currentDepth + 1 });
          }
        }
      }

      // Expand incoming
      const inEdges = this.incomingEdges.get(id) || new Set<string>();
      for (const eId of inEdges) {
        const edge = this.edges.get(eId);
        if (edge) {
          visitedEdges.add(edge.id);
          if (!visitedNodes.has(edge.sourceId)) {
            visitedNodes.add(edge.sourceId);
            queue.push({ id: edge.sourceId, currentDepth: currentDepth + 1 });
          }
        }
      }
    }

    const nodes: KnowledgeNode[] = [];
    for (const nId of visitedNodes) {
      const n = this.nodes.get(nId);
      if (n) nodes.push(n);
    }

    const edges: KnowledgeEdge[] = [];
    for (const eId of visitedEdges) {
      const e = this.edges.get(eId);
      if (e) edges.push(e);
    }

    return { centerNodeId: nodeId, nodes, edges };
  }

  /**
   * Graph statistics for observability and monitoring.
   */
  public getStats() {
    return {
      totalNodes: this.nodes.size,
      totalEdges: this.edges.size,
      totalFiles: this.nodesByType.get('file')?.size || 0,
      totalSymbols: this.nodesByType.get('symbol')?.size || 0,
      totalApiRoutes: this.nodesByType.get('api_route')?.size || 0,
      totalComponents: this.nodesByType.get('component')?.size || 0,
      totalStores: this.nodesByType.get('store')?.size || 0,
      totalTests: this.nodesByType.get('test')?.size || 0
    };
  }

  /**
   * Clears the graph completely.
   */
  public clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.outgoingEdges.clear();
    this.incomingEdges.clear();
    this.nodesByFile.clear();
    this.nodesByType.clear();
    this.symbolsByName.clear();
    this.addProjectNode();
  }
}
