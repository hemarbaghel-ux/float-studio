import { Router } from 'express';
import { requireAuth } from '../authMiddleware';
import { asyncRoute } from '../asyncRoute';
import { requireProjectOwnership } from '../projectOwnership';
import { floatBrainManager } from './floatBrain';
import { BrainMemoryService } from './brainMemory';

export const brainRouter = Router();

// Protect all project brain routes with authentication and project ownership verification
brainRouter.use('/projects/:projectId/brain', requireAuth, asyncRoute(requireProjectOwnership()));

/**
 * 1. GET /api/projects/:projectId/brain/status
 * Returns index status, search mode, node/edge counts, and health report.
 */
brainRouter.get('/projects/:projectId/brain/status', (req: any, res) => {
  const { projectId } = req.params;
  const brain = floatBrainManager.getBrain(projectId, req.user?.uid);
  res.json({ brain: brain.getObservabilityReport() });
});

/**
 * 2. POST /api/projects/:projectId/brain/query
 * Executes hybrid context retrieval across whole codebase.
 */
brainRouter.post('/projects/:projectId/brain/query', async (req: any, res) => {
  const { projectId } = req.params;
  const { query, options } = req.body || {};

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query parameter is required.' });
  }

  const brain = floatBrainManager.getBrain(projectId, req.user?.uid);
  const result = await brain.queryContext(query, options || {});
  res.json({ result });
});

/**
 * 3. GET /api/projects/:projectId/brain/graph
 * Returns graph summary or neighborhood around a center node.
 */
brainRouter.get('/projects/:projectId/brain/graph', (req: any, res) => {
  const { projectId } = req.params;
  const { centerNodeId, depth, type } = req.query;

  const brain = floatBrainManager.getBrain(projectId, req.user?.uid);

  if (centerNodeId && typeof centerNodeId === 'string') {
    const neighborhood = brain.graph.queryNeighborhood(centerNodeId, Number(depth) || 1);
    return res.json({ graph: neighborhood });
  }

  if (type && typeof type === 'string') {
    const nodes = brain.graph.getNodesByType(type as any);
    return res.json({ nodes, count: nodes.length });
  }

  res.json({ stats: brain.graph.getStats() });
});

/**
 * 4. GET /api/projects/:projectId/brain/impact
 * Analyzes impact of changes to a file or module.
 */
brainRouter.get('/projects/:projectId/brain/impact', (req: any, res) => {
  const { projectId } = req.params;
  const { path } = req.query;

  if (!path || typeof path !== 'string') {
    return res.status(400).json({ error: 'Path query parameter is required.' });
  }

  const brain = floatBrainManager.getBrain(projectId, req.user?.uid);
  const impact = brain.graph.getImpactedFiles(path);
  res.json({ impact });
});

/**
 * 5. GET /api/projects/:projectId/brain/callers
 * Retrieves definition, inbound callers, and outbound callees for a symbol.
 */
brainRouter.get('/projects/:projectId/brain/callers', (req: any, res) => {
  const { projectId } = req.params;
  const { symbol } = req.query;

  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({ error: 'Symbol query parameter is required.' });
  }

  const brain = floatBrainManager.getBrain(projectId, req.user?.uid);
  const callGraph = brain.graph.getSymbolCallers(symbol);
  res.json({ callGraph });
});

/**
 * 6. GET /api/projects/:projectId/brain/tests
 * Finds relevant test files exercising a given file.
 */
brainRouter.get('/projects/:projectId/brain/tests', (req: any, res) => {
  const { projectId } = req.params;
  const { path } = req.query;

  if (!path || typeof path !== 'string') {
    return res.status(400).json({ error: 'Path query parameter is required.' });
  }

  const brain = floatBrainManager.getBrain(projectId, req.user?.uid);
  const tests = brain.graph.getRelatedTests(path);
  res.json({ tests });
});

/**
 * 7. GET /api/projects/:projectId/brain/memory
 * Retrieves scoped architectural memory items.
 */
brainRouter.get('/projects/:projectId/brain/memory', (req: any, res) => {
  const { projectId } = req.params;
  const { query, category } = req.query;

  const memories = BrainMemoryService.queryMemories(
    projectId,
    req.user?.uid,
    query as string | undefined,
    category as any
  );
  res.json({ memories });
});

/**
 * 8. POST /api/projects/:projectId/brain/memory
 * Records an architectural memory item.
 */
brainRouter.post('/projects/:projectId/brain/memory', (req: any, res) => {
  const { projectId } = req.params;
  const { category, key, value, provenance, confidence, verified, relatedFiles } = req.body || {};

  const result = BrainMemoryService.remember({
    projectId,
    userId: req.user?.uid,
    category: category || 'architecture',
    key,
    value,
    provenance: provenance || 'user_explicit',
    confidence,
    verified,
    relatedFiles
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.status(201).json({ memory: result.item });
});

/**
 * 9. DELETE /api/projects/:projectId/brain/memory/:key
 * Deletes an architectural memory item.
 */
brainRouter.delete('/projects/:projectId/brain/memory/:key', (req: any, res) => {
  const { projectId, key } = req.params;
  const deleted = BrainMemoryService.forget(projectId, req.user?.uid, key);
  res.json({ success: deleted });
});

/**
 * 10. POST /api/projects/:projectId/brain/sync
 * Manually or programmatically triggers whole-file synchronization into Brain.
 */
brainRouter.post('/projects/:projectId/brain/sync', async (req: any, res) => {
  const { projectId } = req.params;
  const { files } = req.body || {};

  if (!Array.isArray(files)) {
    return res.status(400).json({ error: 'Files array is required.' });
  }

  const brain = floatBrainManager.getBrain(projectId, req.user?.uid);
  await brain.syncFiles(files);

  res.json({
    success: true,
    report: brain.getObservabilityReport()
  });
});
