/**
 * FLOAT Studio — Core Logic Router (/api/float/v1)
 * 
 * Exposes the whole Float Logic Engine as clean, type-safe REST and SSE endpoints.
 */

import { Router, Request, Response } from 'express';
import { FloatEngine } from '../core/float/FloatEngine';
import { requireAuth } from './authMiddleware';

export function createFloatLogicRouter(engine?: FloatEngine): Router {
  const router = Router();
  const floatEngine = engine || FloatEngine.getInstance();

  // 1. Workspace Endpoints
  router.get('/workspace/tree', requireAuth, (_req: Request, res: Response) => {
    try {
      const tree = floatEngine.workspace.getFileTree();
      res.json({ success: true, tree });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/workspace/files', requireAuth, async (req: Request, res: Response) => {
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).json({ error: 'Missing path query parameter.' });
    }
    try {
      const content = await floatEngine.workspace.readFile(filePath);
      res.json({ success: true, path: filePath, content });
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  });

  router.post('/workspace/checkpoints', requireAuth, async (req: Request, res: Response) => {
    const { description, projectId } = req.body;
    try {
      const checkpoint = await floatEngine.workspace.createCheckpoint(description || 'Manual checkpoint', projectId);
      res.json({ success: true, checkpoint });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/workspace/checkpoints/:checkpointId/rollback', requireAuth, async (req: Request, res: Response) => {
    const { checkpointId } = req.params;
    try {
      const result = await floatEngine.workspace.rollbackCheckpoint(checkpointId);
      res.json({ success: true, checkpointId, ...result });
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  });

  // 2. Intelligence & Search Endpoints
  router.get('/intelligence/search', requireAuth, (req: Request, res: Response) => {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: 'Missing query parameter q.' });
    }
    try {
      const results = floatEngine.intelligence.searchCodebase(query);
      res.json({ success: true, query, results });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/intelligence/context', requireAuth, async (req: Request, res: Response) => {
    const { prompt, tokenBudget } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt in request body.' });
    }
    try {
      const context = await floatEngine.intelligence.resolveContext(prompt, tokenBudget || 4000);
      res.json({ success: true, context });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 3. Autonomous Composer Endpoints
  router.post('/composer/plan', requireAuth, async (req: Request, res: Response) => {
    const { projectId, prompt } = req.body;
    const userId = (req as any).user?.uid || 'user_anonymous';
    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt for goal planning.' });
    }
    try {
      const goal = await floatEngine.composer.planGoal(projectId || 'default_project', userId, prompt);
      res.json({ success: true, goal });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/composer/goals/:goalId/execute', requireAuth, async (req: Request, res: Response) => {
    const { goalId } = req.params;
    const userId = (req as any).user?.uid || 'user_anonymous';
    try {
      const execution = await floatEngine.composer.executeGoal(goalId, userId, req.body);
      res.json({ success: true, execution });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/composer/goals/:goalId/resume', requireAuth, async (req: Request, res: Response) => {
    const { goalId } = req.params;
    const { actionId, approved, approvalToken } = req.body;
    if (!actionId) {
      return res.status(400).json({ error: 'Missing actionId for goal resumption.' });
    }
    try {
      const execution = await floatEngine.composer.resumeGoal(goalId, actionId, Boolean(approved), approvalToken);
      res.json({ success: true, execution });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/composer/goals/:goalId/apply', requireAuth, async (req: Request, res: Response) => {
    const { goalId } = req.params;
    try {
      const result = await floatEngine.applyApprovedGoal(goalId);
      res.json({ success: true, goalId, ...result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // 4. Cursor Tab & Editor Endpoints
  router.post('/editor/autocomplete', requireAuth, async (req: Request, res: Response) => {
    const { filePath, prefix, suffix, languageId } = req.body;
    try {
      const completion = await floatEngine.editor.getTabCompletion({
        filePath: filePath || 'untitled.ts',
        prefix: prefix || '',
        suffix: suffix || '',
        languageId
      });
      res.json({ success: true, completion });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/editor/inline-edit', requireAuth, (req: Request, res: Response) => {
    const { filePath, originalCode, instruction } = req.body;
    if (!instruction) {
      return res.status(400).json({ error: 'Missing instruction for inline edit.' });
    }
    try {
      const result = floatEngine.editor.generateInlineEdit(
        filePath || 'untitled.ts',
        originalCode || '',
        instruction
      );
      res.json({ success: true, result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 5. Model Gateway & BYOK
  router.post('/gateway/execute', requireAuth, async (req: Request, res: Response) => {
    const { model, prompt, systemPrompt, temperature } = req.body;
    const userId = (req as any).user?.uid;
    try {
      const result = await floatEngine.gateway.executePrompt({
        model: model || 'claude-3-7-sonnet',
        prompt,
        systemPrompt,
        temperature,
        userId
      });
      res.json({ success: true, result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 6. Sandboxed Terminal Execution
  router.post('/terminal/execute', requireAuth, async (req: Request, res: Response) => {
    const { command, approvalToken, projectId } = req.body;
    const userId = (req as any).user?.uid || 'user_anonymous';
    try {
      const result = await floatEngine.terminal.executeCommand({
        command,
        approvalToken,
        projectId: projectId || 'default_project',
        userId
      });
      res.json({ success: true, result });
    } catch (error: any) {
      res.status(403).json({ error: error.message });
    }
  });

  return router;
}
