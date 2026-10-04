import { setupAgentOrchestratorRoutes } from './agentOrchestrator';
import { integrationsRouter } from './integrationsRouter';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { ModelRouter } from './providers/router';
import { evalEngine } from './evalEngine';
import { ServerPrivacyGuard } from './privacyGuard';
import { requireAuth } from './authMiddleware';
import { ContextBuilder } from './contextBuilder';
import { searchCodebase } from '../services/codebaseSearch';
import { ProposalService } from './agent/proposalService';
import { ValidationService } from './validation/validationService';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // Health check endpoint for Cloud Run and monitoring
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
  });
  
  const modelRouter = new ModelRouter();

  // Agent Orchestrator Routes
  setupAgentOrchestratorRoutes(app);

  // Integrations Routes
  app.use('/api/integrations', integrationsRouter);

  // Root /auth/callback alias redirect to provider callback
  app.get(['/auth/callback', '/auth/callback/'], (req, res) => {
    const provider = req.query.state && String(req.query.state).includes('gitlab') ? 'gitlab' : 'github';
    const query = new URLSearchParams(req.query as any).toString();
    res.redirect(`/api/integrations/${provider}/callback?${query}`);
  });

  // Model Intelligence & Availability Routes
  app.get('/api/ai/models/status', (_req, res) => {
    try {
      const providerStatus = modelRouter.getProviderStatus();
      res.json({
        success: true,
        providers: providerStatus,
        timestamp: Date.now()
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Provider Health Check endpoint: verifies whether each configured provider can authenticate
  // and whether its configured models are actually usable
  app.get(['/api/ai/health', '/api/ai/providers/health'], async (_req, res) => {
    try {
      const health = await modelRouter.checkAllProvidersHealth();
      res.json({
        success: true,
        providers: health,
        timestamp: Date.now()
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Privacy & Governance Disclosure Route
  app.get('/api/privacy/policy', (_req, res) => {
    res.json({
      policyVersion: '2026.1',
      defaultsToOff: true,
      dataSharingAllowedByDefault: false,
      modelTrainingOnUserData: false,
      retentionPolicy: 'Essential provider transit only. Optional telemetry excluded when consent is OFF.',
      supportedProviders: ['google', 'openai', 'anthropic', 'xai'],
      telemetryCategoriesWhenOptedIn: ['system_latency_ms', 'http_error_codes', 'feature_usage_frequency'],
      protectedDataAlwaysExcluded: ['source_code', 'prompts', 'api_keys', 'passwords', 'tokens']
    });
  });

  // In-memory sliding window rate limiter per authenticated user
  const chatRateLimits = new Map<string, number[]>();
  const checkChatRateLimit = (userId: string, maxRequests = 45, windowMs = 60000): boolean => {
    const now = Date.now();
    const timestamps = (chatRateLimits.get(userId) || []).filter(t => now - t < windowMs);
    if (timestamps.length >= maxRequests) {
      return false;
    }
    timestamps.push(now);
    chatRateLimits.set(userId, timestamps);
    return true;
  };

  // AI API Route - supports progressive SSE streaming and standard JSON
  app.post('/api/ai/chat', requireAuth, async (req: any, res: any) => {
    if (!checkChatRateLimit(req.user.uid)) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Please wait a moment before sending another request.' 
      });
    }

    const isStream = req.body.stream === true || req.headers.accept?.includes('text/event-stream');
    const { 
      messages, 
      model = 'gemini-3.1-flash-lite', 
      systemInstruction, 
      reasoningEffort,
      effort,
      speed,
      contextItems, 
      projectName, 
      projectId 
    } = req.body;
    const resolvedEffort = reasoningEffort || effort;

    if (!messages || (Array.isArray(messages) && messages.length === 0)) {
      return res.status(400).json({ error: 'Messages array is required and cannot be empty.' });
    }

    // Verify project ownership if projectId is provided
    if (projectId) {
      try {
        const projectRef = doc(db, 'projects', projectId);
        const snap = await getDoc(projectRef);
        if (snap.exists() && snap.data().ownerId !== req.user.uid) {
          return res.status(403).json({ error: 'Unauthorized: You do not own this project workspace.' });
        }
      } catch (e) {
        // Local temporary project allowed if not in cloud yet
      }
    }

    // Process and assemble codebase context items if provided
    let processedMessages = messages;
    if (contextItems && Array.isArray(contextItems) && contextItems.length > 0 && Array.isArray(messages) && messages.length > 0) {
      const lastMsgIdx = messages.length - 1;
      const lastMsg = messages[lastMsgIdx];
      let userPromptText = '';
      if (typeof lastMsg === 'string') {
        userPromptText = lastMsg;
      } else if (lastMsg.parts && Array.isArray(lastMsg.parts) && lastMsg.parts[0]?.text) {
        userPromptText = lastMsg.parts[0].text;
      } else if (lastMsg.content) {
        userPromptText = typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content);
      }

      const { formattedPrompt } = ContextBuilder.build(userPromptText, contextItems, {
        projectName,
        projectId
      });

      processedMessages = [
        ...messages.slice(0, lastMsgIdx),
        { role: 'user', parts: [{ text: formattedPrompt }] }
      ];
    }

    const dataSharingAllowed = ServerPrivacyGuard.evaluateConsent(req);

    if (isStream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });

      const abortController = new AbortController();
      req.on('close', () => {
        abortController.abort();
      });

      try {
        const result = await modelRouter.generateContentStream(
          {
            model,
            messages: processedMessages,
            systemInstruction,
            reasoningEffort: resolvedEffort,
            speed,
            dataSharingConsent: dataSharingAllowed,
            dataSharingAllowed
          },
          (delta: string) => {
            res.write(`data: ${JSON.stringify({ type: 'delta', text: delta })}\n\n`);
          },
          abortController.signal
        );

        res.write(`data: ${JSON.stringify({ type: 'done', text: result.text, usage: result.usage })}\n\n`);
        res.end();
      } catch (error: any) {
        const errorStr = typeof error === 'string' ? error : (error?.message || error?.msg || JSON.stringify(error || ''));
        const isCancelled = 
          abortController.signal.aborted ||
          error?.type === 'cancelation' || 
          error?.type === 'cancelled' || 
          error?.name === 'AbortError' || 
          /cancel/i.test(errorStr) ||
          errorStr.includes('operation is manually canceled');

        if (!res.writableEnded) {
          if (isCancelled) {
            res.write(`data: ${JSON.stringify({ type: 'done', text: '', cancelled: true })}\n\n`);
          } else {
            console.error('AI Stream Error:', error);
            const errorCode = error?.code || 'PROVIDER_ERROR';
            const errorProvider = error?.provider || 'FLOAT';
            res.write(`data: ${JSON.stringify({ 
              type: 'error', 
              error: error.message || 'Generation failed',
              code: errorCode,
              provider: errorProvider
            })}\n\n`);
          }
          res.end();
        }
      }
      return;
    }

    try {
      const response = await modelRouter.generateContent({
        model,
        messages: processedMessages,
        systemInstruction,
        reasoningEffort: resolvedEffort,
        speed,
        dataSharingConsent: dataSharingAllowed,
        dataSharingAllowed
      });

      res.json({ text: response.text, usage: response.usage });
    } catch (error: any) {
      const errorStr = typeof error === 'string' ? error : (error?.message || error?.msg || JSON.stringify(error || ''));
      const isCancelled = 
        error?.type === 'cancelation' || 
        error?.type === 'cancelled' || 
        error?.name === 'AbortError' || 
        /cancel/i.test(errorStr) ||
        errorStr.includes('operation is manually canceled');

      if (isCancelled) {
        return res.json({ text: '', cancelled: true });
      }

      console.error('AI Error:', error);
      const errorCode = error?.code || 'PROVIDER_ERROR';
      const statusCode = error?.statusCode || (
        errorCode === 'AUTH_ERROR' ? 401 :
        errorCode === 'MODEL_NOT_FOUND' ? 404 :
        errorCode === 'QUOTA_EXCEEDED' || errorCode === 'RATE_LIMITED' ? 429 :
        errorCode === 'INVALID_REQUEST' ? 400 : 500
      );
      const errorProvider = error?.provider || 'FLOAT';

      res.status(statusCode).json({ 
        error: error.message || 'An error occurred during AI generation.',
        code: errorCode,
        provider: errorProvider
      });
    }
  });

  // Codebase Search API Route with project ownership validation
  app.get('/api/projects/:projectId/search', requireAuth, async (req: any, res: any) => {
    try {
      const { projectId } = req.params;
      const query = String(req.query.q || '').trim();
      if (!query) {
        return res.json({ matches: [] });
      }

      // Check project ownership
      const projectRef = doc(db, 'projects', projectId);
      const snap = await getDoc(projectRef);
      if (!snap.exists()) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const data = snap.data();
      if (data.ownerId !== req.user.uid) {
        return res.status(403).json({ error: 'Unauthorized: You do not own this project.' });
      }

      const files = JSON.parse(data.files || '[]');
      const matches = searchCodebase(files, query);
      res.json({ matches });
    } catch (error: any) {
      console.error('Project search error:', error);
      res.status(500).json({ error: error.message || 'Search failed' });
    }
  });

  // AI Agent Route (SSE)
  app.post('/api/ai/agent', requireAuth, async (req: any, res: any) => {
    try {
      const { prompt, virtualFiles, model = 'gemini-3.1-flash-lite' } = req.body;
      
      await modelRouter.runAgentLoop(req, res, model, prompt, virtualFiles || []);
    } catch (error: any) {
      console.error('Agent Endpoint Error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || 'An error occurred.' });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'event', data: { type: 'failed', message: error.message || 'Agent error occurred.' } })}\n\n`);
        res.end();
      }
    }
  });

  // Code Proposal Routes (Phase 5)
  // 1. Create a proposed change set
  app.post('/api/projects/:projectId/proposals', requireAuth, async (req: any, res: any) => {
    try {
      const { projectId } = req.params;
      const { description, changes, virtualFiles = [] } = req.body;

      // Verify project ownership if project exists in database
      const projectRef = doc(db, 'projects', projectId);
      try {
        const snap = await getDoc(projectRef);
        if (snap.exists() && snap.data().ownerId !== req.user.uid) {
          return res.status(403).json({ error: 'Unauthorized: You do not own this project.' });
        }
      } catch (e) {
        // Local/unsaved project allowed for user session
      }

      const fileMap = new Map<string, { content?: string }>();
      for (const f of virtualFiles) {
        if (f.path) fileMap.set(f.path.replace(/^\/+/, ''), f);
      }

      const result = ProposalService.createProposal({
        ownerId: req.user.uid,
        projectId,
        description: description || 'Proposed Code Changes',
        rawChanges: changes || [],
        virtualFiles: fileMap
      });

      if (result.error || !result.proposal) {
        return res.status(400).json({ error: result.error || 'Failed to create proposal' });
      }

      res.status(201).json({ proposal: result.proposal });
    } catch (error: any) {
      console.error('Create Proposal Error:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  // 2. List proposals for a project
  app.get('/api/projects/:projectId/proposals', requireAuth, async (req: any, res: any) => {
    try {
      const { projectId } = req.params;
      const proposals = ProposalService.listProposalsForProject(projectId);
      res.json({ proposals });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to list proposals' });
    }
  });

  // 3. Get proposal by ID
  app.get('/api/projects/:projectId/proposals/:proposalId', requireAuth, async (req: any, res: any) => {
    try {
      const { proposalId } = req.params;
      const proposal = ProposalService.getProposal(proposalId);
      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found' });
      }
      res.json({ proposal });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to get proposal' });
    }
  });

  // 4. Apply proposal (with concurrency protection and stale conflict detection)
  app.post('/api/projects/:projectId/proposals/:proposalId/apply', requireAuth, async (req: any, res: any) => {
    try {
      const { projectId, proposalId } = req.params;
      const { approvedPaths, currentFiles = [] } = req.body;

      // Verify project ownership
      const projectRef = doc(db, 'projects', projectId);
      try {
        const snap = await getDoc(projectRef);
        if (snap.exists() && snap.data().ownerId !== req.user.uid) {
          return res.status(403).json({ error: 'Unauthorized: You do not own this project.' });
        }
      } catch (e) {
        // Fallback for local session
      }

      const result = await ProposalService.applyProposal(proposalId, {
        userId: req.user.uid,
        approvedPaths,
        currentFiles
      });

      if (!result.success) {
        const statusCode = result.status === 'stale' ? 409 : 400;
        return res.status(statusCode).json(result);
      }

      res.json(result);
    } catch (error: any) {
      console.error('Apply Proposal Error:', error);
      res.status(500).json({ error: error.message || 'Failed to apply proposal' });
    }
  });

  // 5. Reject proposal
  app.post('/api/projects/:projectId/proposals/:proposalId/reject', requireAuth, async (req: any, res: any) => {
    try {
      const { proposalId } = req.params;
      const result = ProposalService.rejectProposal(proposalId, req.user.uid);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error: any) {
      console.error('Reject Proposal Error:', error);
      res.status(500).json({ error: error.message || 'Failed to reject proposal' });
    }
  });

  // Validation & Error Analysis Routes (Phase 6)
  // 1. Run validation pipeline
  app.post('/api/projects/:projectId/validation/run', requireAuth, async (req: any, res: any) => {
    try {
      const { projectId } = req.params;
      const { target = 'current_project', proposalId, files = [], requestedChecks } = req.body;

      // Verify project ownership
      const projectRef = doc(db, 'projects', projectId);
      try {
        const snap = await getDoc(projectRef);
        if (snap.exists() && snap.data().ownerId !== req.user.uid) {
          return res.status(403).json({ error: 'Unauthorized: You do not own this project.' });
        }
      } catch (e) {
        // Fallback for local session
      }

      const run = await ValidationService.executeValidation({
        projectId,
        userId: req.user.uid,
        target,
        proposalId,
        files,
        requestedChecks
      });

      res.json({ run });
    } catch (error: any) {
      console.error('Validation Execution Error:', error);
      res.status(500).json({ error: error.message || 'Validation failed to execute' });
    }
  });

  // 2. Cancel active validation run
  app.post('/api/projects/:projectId/validation/cancel', requireAuth, (req: any, res: any) => {
    const { projectId } = req.params;
    const cancelled = ValidationService.cancelValidation(projectId);
    res.json({ cancelled });
  });

  // 3. Get validation run by ID
  app.get('/api/projects/:projectId/validation/runs/:runId', requireAuth, (req: any, res: any) => {
    const { runId } = req.params;
    const run = ValidationService.getValidationRun(runId);
    if (!run) {
      return res.status(404).json({ error: 'Validation run not found' });
    }
    res.json({ run });
  });

  // 4. AI Error Explanation for a diagnostic item
  app.post('/api/projects/:projectId/validation/explain', requireAuth, async (req: any, res: any) => {
    try {
      const { projectId } = req.params;
      const { diagnostic, targetFileContent, modelId } = req.body;

      if (!diagnostic || !diagnostic.message) {
        return res.status(400).json({ error: 'A diagnostic object is required.' });
      }

      const result = await ValidationService.explainDiagnostic({
        diagnostic,
        targetFileContent,
        projectId,
        modelId
      });

      res.json(result);
    } catch (error: any) {
      console.error('Diagnostic Explanation Error:', error);
      res.status(500).json({ error: error.message || 'Failed to explain error' });
    }
  });

  // Evals API Routes
  app.post('/api/evals/tasks', (req, res) => {
    try {
      const task = evalEngine.createTask(req.body);
      res.json(task);
    } catch(e: any) { res.status(500).json({error: e.message}); }
  });

  app.get('/api/evals/tasks', (_req, res) => {
    res.json(evalEngine.getTasks());
  });

  app.get('/api/evals/tasks/:id', (req, res) => {
    const task = evalEngine.getTask(req.params.id);
    if (task) res.json(task);
    else res.status(404).json({error: 'Task not found'});
  });

  app.delete('/api/evals/tasks/:id', (req, res) => {
    const ok = evalEngine.deleteTask(req.params.id);
    res.json({ success: ok });
  });

  app.post('/api/evals/run', async (req, res) => {
    try {
      const { taskId, modelId, agentId, providerId, benchmarkId } = req.body;
      const dataSharingAllowed = ServerPrivacyGuard.evaluateConsent(req);
      const run = await evalEngine.runEval(taskId, modelId, agentId, providerId, benchmarkId, undefined, { dataSharingAllowed });
      res.json(run);
    } catch(e: any) { res.status(500).json({error: e.message}); }
  });

  app.post('/api/evals/runs', async (req, res) => {
    try {
      const { taskId, modelId, agentId, providerId, benchmarkId } = req.body;
      const dataSharingAllowed = ServerPrivacyGuard.evaluateConsent(req);
      const run = await evalEngine.runEval(taskId, modelId, agentId, providerId, benchmarkId, undefined, { dataSharingAllowed });
      res.json(run);
    } catch(e: any) { res.status(500).json({error: e.message}); }
  });

  app.get('/api/evals/runs', (_req, res) => {
    res.json(evalEngine.getRuns());
  });

  app.get('/api/evals/runs/:id', (req, res) => {
    const run = evalEngine.getRun(req.params.id);
    if (run) res.json(run);
    else res.status(404).json({error: 'Not found'});
  });

  app.post('/api/evals/runs/:id/cancel', (req, res) => {
    const ok = evalEngine.cancelRun(req.params.id);
    res.json({ success: ok });
  });

  app.post('/api/evals/runs/:id/retry', async (req, res) => {
    try {
      const dataSharingAllowed = ServerPrivacyGuard.evaluateConsent(req);
      const run = await evalEngine.retryRun(req.params.id, { dataSharingAllowed });
      res.json(run);
    } catch(e: any) { res.status(500).json({error: e.message}); }
  });

  app.get('/api/evals/benchmarks', (_req, res) => {
    res.json(evalEngine.getBenchmarks());
  });

  app.get('/api/evals/benchmarks/:id', (req, res) => {
    const bench = evalEngine.getBenchmark(req.params.id);
    if (bench) res.json(bench);
    else res.status(404).json({error: 'Benchmark not found'});
  });

  app.post('/api/evals/benchmarks', (req, res) => {
    try {
      const bench = evalEngine.createBenchmark(req.body);
      res.json(bench);
    } catch(e: any) { res.status(500).json({error: e.message}); }
  });

  app.get('/api/evals/leaderboard', (req, res) => {
    const benchmarkId = req.query.benchmarkId as string | undefined;
    const minEvals = req.query.minEvaluations ? parseInt(req.query.minEvaluations as string, 10) : 1;
    res.json(evalEngine.getLeaderboard(benchmarkId, minEvals));
  });

  app.get('/api/evals/models/:modelId', (req, res) => {
    const analytics = evalEngine.getModelAnalytics(req.params.modelId);
    if (analytics) res.json(analytics);
    else res.json({ modelId: req.params.modelId, evaluationsCount: 0, avgScore: null });
  });

  app.post('/api/evals/reviews', (req, res) => {
    try {
      const review = evalEngine.addReview(req.body);
      res.json(review);
    } catch(e: any) { res.status(500).json({error: e.message}); }
  });

  app.get('/api/evals/reviews/:runId', (req, res) => {
    res.json(evalEngine.getReviews(req.params.runId));
  });

  // Static files or Vite dev middleware
  const isProduction = process.env.NODE_ENV === 'production';
  const distPath = path.join(process.cwd(), 'dist');
  const distIndexHtml = path.join(distPath, 'index.html');
  const rootIndexHtml = path.join(process.cwd(), 'index.html');

  if (isProduction) {
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
    }

    app.get('*', (_req, res, next) => {
      if (fs.existsSync(distIndexHtml)) {
        res.sendFile(distIndexHtml, (err) => {
          if (err) next(err);
        });
      } else if (fs.existsSync(rootIndexHtml)) {
        res.sendFile(rootIndexHtml, (err) => {
          if (err) next(err);
        });
      } else {
        res.status(503).send('Application is starting, please reload shortly.');
      }
    });
  } else {
    // Development mode: always use Vite middleware for live HMR and seamless reload
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // Global error handler preventing unhandled ENOENT crashes
  app.use((err: any, _req: any, res: any, _next: any) => {
    if (err?.code === 'ENOENT') {
      if (fs.existsSync(rootIndexHtml)) {
        return res.sendFile(rootIndexHtml);
      }
      return res.status(200).send('<!DOCTYPE html><html><head><meta http-equiv="refresh" content="2"></head><body>Loading...</body></html>');
    }
    console.error('Unhandled server error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
  });
}

// Auto start if executed directly
if (process.argv[1] && process.argv[1].endsWith('app.ts')) {
  startServer();
}
