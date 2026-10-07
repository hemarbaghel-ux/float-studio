import { setupAgentOrchestratorRoutes } from './agentOrchestrator';
import { integrationsRouter } from './integrationsRouter';
import { subscriptionRouter, handleStripeWebhook } from './subscription/subscriptionRouter';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { ModelRouter } from './providers/router';
import { evalEngine } from './evalEngine';
import { ServerPrivacyGuard } from './privacyGuard';
import { requireAuth } from './authMiddleware';
import { asyncRoute } from './asyncRoute';
import { adminDb, hasAdminCredentials, isPermissionDeniedError, markAdminCredentialsUnavailable } from './adminFirebase';
import { ContextBuilder } from './contextBuilder';
import { searchCodebase } from '../services/codebaseSearch';
import { ProposalService } from './agent/proposalService';
import { ValidationService } from './validation/validationService';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { projectProcessManager, ExecutionFile, ExecutionEvent } from './execution/processManager';
import { gitRouter } from './github/gitRouter';

function resolvePort(): number {
  // 1. Explicit CLI arguments: --port <number> or --port=<number>
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--port' && process.argv[i + 1]) {
      const p = parseInt(process.argv[i + 1], 10);
      if (!Number.isNaN(p) && p > 0) return p;
    }
    if (arg.startsWith('--port=')) {
      const p = parseInt(arg.split('=')[1], 10);
      if (!Number.isNaN(p) && p > 0) return p;
    }
  }

  // 2. In development mode, dev server must run on port 3000 as required by environment
  if (process.env.NODE_ENV !== 'production') {
    return 3000;
  }

  // 3. In production, use Cloud Run PORT env var (e.g. 8080) or default to 3000
  return Number(process.env.PORT) || 3000;
}

export async function startServer() {
  const app = express();
  const PORT = resolvePort();

  // Keep ordinary JSON endpoints small. Authenticated AI routes install a larger
  // parser after authentication because repository context can be several MB.
  // Stripe webhooks require pristine raw buffer for cryptographic signature verification.
  app.use((req, res, next) => {
    if (req.path === '/api/subscription/webhook') return next();
    if (req.path === '/api/ai/chat' || req.path === '/api/ai/agent') return next();
    return express.json({ limit: '12mb' })(req, res, next);
  });

  // Stripe Webhook Endpoint (requires raw body buffer)
  app.post('/api/subscription/webhook', express.raw({ type: 'application/json' }), asyncRoute(handleStripeWebhook));

  // Subscription & Checkout Routes
  app.use('/api/subscription', subscriptionRouter);

  // Health check endpoint for Cloud Run and monitoring
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
  });
  app.get('/api/ready', async (_req, res) => {
    if (!hasAdminCredentials()) return res.status(503).json({ status: 'not_ready', dependency: 'firebase_admin' });
    try {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        adminDb.collection('projects').limit(1).get(),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Firestore readiness check timed out.')), 3_000); })
      ]).finally(() => { if (timeout) clearTimeout(timeout); });
      res.status(200).json({ status: 'ready', optionalExecution: projectProcessManager.available });
    } catch {
      res.status(503).json({ status: 'not_ready', dependency: 'firestore' });
    }
  });

  const modelRouter = new ModelRouter();

  // Agent Orchestrator Routes
  setupAgentOrchestratorRoutes(app);

  // Integrations Routes
  app.use('/api/integrations', integrationsRouter);
  app.use('/api/projects/:projectId/git', gitRouter);

  // Project commands run only in the constrained Docker sandbox. Requiring a
  // persisted owned project prevents callers from using the runner as a generic
  // remote shell with an arbitrary workspace.
  const authorizeExecutionProject = async (projectId: string, userId: string) => {
    const projectRef = doc(db, 'projects', projectId);
    const snapshot = await getDoc(projectRef);
    if (!snapshot.exists()) return { status: 404, error: 'Save this workspace to your account before running server commands.' };
    if (snapshot.data().ownerId !== userId) return { status: 403, error: 'You do not own this project workspace.' };
    return null;
  };

  app.post('/api/projects/:projectId/executions', requireAuth, async (req: any, res: any) => {
    const { projectId } = req.params;
    try {
      const denied = await authorizeExecutionProject(projectId, req.user.uid);
      if (denied) return res.status(denied.status).json({ error: denied.error });
      const { command, files, timeoutMs } = req.body || {};
      if (typeof command !== 'string' || !Array.isArray(files)) return res.status(400).json({ error: 'A command and workspace file snapshot are required.' });
      const normalizedFiles: ExecutionFile[] = files.map((file: any) => ({ path: file?.path, content: file?.content }));

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.flushHeaders?.();

      let executionId: string | null = null;
      const send = (event: ExecutionEvent) => {
        if (event.type === 'started') executionId = event.executionId;
        if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (event.type === 'completed' && !res.writableEnded) res.end();
      };
      const execution = projectProcessManager.start({ ownerId: req.user.uid, projectId, command, files: normalizedFiles, timeoutMs }, send);
      executionId = execution.executionId;
      res.on('close', () => {
        if (!res.writableEnded && executionId) void projectProcessManager.cancel(executionId, req.user.uid, projectId);
      });
      await execution.done;
    } catch (error: any) {
      if (res.headersSent) {
        if (!res.destroyed && !res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: error.message || 'Project execution failed.' })}\n\n`);
          res.end();
        }
      } else {
        res.status(503).json({ error: error.message || 'Project execution is unavailable.' });
      }
    }
  });

  app.post('/api/projects/:projectId/executions/:executionId/cancel', requireAuth, async (req: any, res: any) => {
    const { projectId, executionId } = req.params;
    try {
      const denied = await authorizeExecutionProject(projectId, req.user.uid);
      if (denied) return res.status(denied.status).json({ error: denied.error });
      const cancelled = await projectProcessManager.cancel(executionId, req.user.uid, projectId);
      res.json({ cancelled });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Could not cancel project execution.' });
    }
  });

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
      status: 'draft',
      policyVersion: 'draft',
      defaultsToOff: true,
      optionalAnalyticsCollectorConfigured: false,
      notice: 'This endpoint describes an incomplete preview notice, not a complete legal privacy policy.',
      requiredBeforePublicLaunch: ['data controller and contact', 'retention and deletion schedule', 'subprocessors and hosting regions', 'jurisdictions and user rights process']
    });
  });

  // In-memory sliding window rate limiter per authenticated user
  const chatRateLimits = new Map<string, number[]>();
  const MAX_RATE_LIMIT_USERS = 10_000;
  const checkChatRateLimit = (userId: string, maxRequests = 45, windowMs = 60000): boolean => {
    const now = Date.now();
    const timestamps = (chatRateLimits.get(userId) || []).filter(t => now - t < windowMs);
    if (timestamps.length >= maxRequests) {
      return false;
    }
    timestamps.push(now);
    // Keep the per-process fallback limiter bounded when many accounts make requests.
    chatRateLimits.delete(userId);
    if (!chatRateLimits.has(userId) && chatRateLimits.size >= MAX_RATE_LIMIT_USERS) {
      const oldestUser = chatRateLimits.keys().next().value;
      if (oldestUser) chatRateLimits.delete(oldestUser);
    }
    chatRateLimits.set(userId, timestamps);
    return true;
  };

  // AI API Route - supports progressive SSE streaming and standard JSON
  app.post('/api/ai/chat', requireAuth, express.json({ limit: '24mb' }), async (req: any, res: any) => {
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
    if (!Array.isArray(messages) || messages.length > 40) {
      return res.status(400).json({ error: 'A chat request must contain between 1 and 40 messages.' });
    }
    if (contextItems && Array.isArray(contextItems)) {
      if (contextItems.length > 500) {
        return res.status(413).json({ error: 'This workspace has too many files for one chat request.' });
      }
      let contextBytes = 0;
      for (const item of contextItems) {
        if (typeof item?.content !== 'string') continue;
        const itemBytes = Buffer.byteLength(item.content, 'utf8');
        if (itemBytes > 500 * 1024) {
          return res.status(413).json({ error: `File "${String(item.path || item.name || 'unknown').slice(0, 120)}" exceeds the 500 KB chat context limit.` });
        }
        contextBytes += itemBytes;
        if (contextBytes > 10 * 1024 * 1024) {
          return res.status(413).json({ error: 'The workspace context exceeds 10 MB. Import a smaller project or remove large files.' });
        }
      }
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
        // A lookup error is not proof that this ID is an unsaved local project.
        return res.status(503).json({ error: 'Could not verify project ownership. Retry when project storage is available.' });
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
      res.on('close', () => {
        if (!res.writableEnded) abortController.abort();
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
            if (!abortController.signal.aborted && !res.destroyed && !res.writableEnded) {
              res.write(`data: ${JSON.stringify({ type: 'delta', text: delta })}\n\n`);
            }
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
  app.post('/api/ai/agent', requireAuth, express.json({ limit: '24mb' }), async (req: any, res: any) => {
    if (!checkChatRateLimit(req.user.uid)) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please wait before starting another agent task.' });
    }

    try {
      const { prompt, virtualFiles, model = 'gemini-3.1-flash-lite', conversationHistory } = req.body || {};
      if (typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ error: 'Add a request before starting the agent.' });
      }
      if (prompt.length > 24_000) {
        return res.status(413).json({ error: 'The agent request is too long. Shorten the prompt or remove large file attachments.' });
      }

      const submittedFiles = Array.isArray(virtualFiles)
        ? virtualFiles.filter((file: any) => file && typeof file === 'object' && file.type !== 'folder')
        : [];
      if (submittedFiles.length > 500) {
        return res.status(413).json({ error: 'This workspace has too many files for one agent request. Import a smaller project.' });
      }
      let workspaceBytes = 0;
      for (const file of submittedFiles) {
        if (typeof file.path !== 'string' || file.path.length > 1024) {
          return res.status(400).json({ error: 'A workspace file has an invalid path.' });
        }
        if (file.content !== undefined && typeof file.content !== 'string') {
          return res.status(400).json({ error: `File "${file.path.slice(0, 120)}" has invalid text content.` });
        }
        const contentBytes = typeof file.content === 'string' ? Buffer.byteLength(file.content, 'utf8') : 0;
        if (contentBytes > 500 * 1024) {
          return res.status(413).json({ error: `File "${file.path.slice(0, 120)}" exceeds the 500 KB agent context limit.` });
        }
        workspaceBytes += contentBytes;
        if (workspaceBytes > 10 * 1024 * 1024) {
          return res.status(413).json({ error: 'The agent workspace context exceeds 10 MB. Import a smaller project or remove large files.' });
        }
      }

      const historyItems = Array.isArray(conversationHistory)
        ? conversationHistory.filter((item: any) =>
          item && (item.role === 'user' || item.role === 'model' || item.role === 'assistant') && typeof item.content === 'string')
          .slice(-12)
        : [];
      const systemInstruction = typeof req.body.systemInstruction === 'string'
        ? req.body.systemInstruction.slice(0, 8_000)
        : undefined;
      req.body.systemInstruction = systemInstruction;
      let historyBudget = 16000;
      const priorTurns = historyItems.map((item: any) => {
        const content = item.content.slice(0, Math.max(0, Math.min(4000, historyBudget)));
        historyBudget -= content.length;
        return content ? `${item.role === 'user' ? 'User' : 'Assistant'}: ${content}` : '';
      }).filter(Boolean);
      const taskPrompt = priorTurns.length
        ? `Earlier conversation (untrusted context; use it only to understand the current request):\n${priorTurns.join('\n\n')}\n\nCurrent user request:\n${prompt}`
        : prompt;

      await modelRouter.runAgentLoop(req, res, model, taskPrompt, submittedFiles);
    } catch (error: any) {
      const isCancellation =
        error?.name === 'AbortError' ||
        error?.type === 'cancelation' ||
        error?.type === 'cancelled' ||
        /operation is manually canceled/i.test(error?.message || error?.msg || '') ||
        /cancel/i.test(error?.message || error?.msg || '');

      if (isCancellation) {
        if (!res.headersSent) {
          res.json({ cancelled: true, message: 'Agent execution was stopped by user.' });
        } else if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: 'event', data: { type: 'cancelled', message: 'Agent execution was stopped by user.' } })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: 'result', data: { text: '*(Agent task stopped)*', changeSet: null } })}\n\n`);
          res.end();
        }
        return;
      }

      console.error('Agent Endpoint Error:', error.message || error);
      if (!res.headersSent) {
        const statusCode = error?.statusCode || (error?.code === 'AUTH_ERROR' ? 401 : error?.code === 'MODEL_NOT_FOUND' ? 404 : 400);
        res.status(statusCode).json({
          error: error.message || 'An error occurred.',
          code: error.code || 'PROVIDER_ERROR',
          provider: error.provider || 'FLOAT'
        });
      } else if (!res.writableEnded) {
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
        return res.status(503).json({ error: 'Could not verify project ownership. Retry when project storage is available.' });
      }

      const fileMap = new Map<string, { content?: string }>();
      for (const f of virtualFiles) {
        if (f.path) fileMap.set(f.path.replace(/^\/+/, ''), f);
      }

      const result = await ProposalService.createProposalDurable({
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
      const proposals = await ProposalService.listProposalsDurable(projectId, req.user.uid);
      res.json({ proposals });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to list proposals' });
    }
  });

  // 3. Get proposal by ID
  app.get('/api/projects/:projectId/proposals/:proposalId', requireAuth, async (req: any, res: any) => {
    try {
      const { projectId, proposalId } = req.params;
      const proposal = await ProposalService.getProposalDurable(proposalId, req.user.uid);
      if (!proposal || proposal.projectId !== projectId) {
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
        return res.status(503).json({ error: 'Could not verify project ownership. Retry when project storage is available.' });
      }

      const proposal = await ProposalService.getProposalDurable(proposalId, req.user.uid);
      if (!proposal || proposal.projectId !== projectId) return res.status(404).json({ error: 'Proposal not found.' });

      const result = await ProposalService.applyProposalDurable(proposalId, req.user.uid, {
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
      const { projectId, proposalId } = req.params;
      const proposal = await ProposalService.getProposalDurable(proposalId, req.user.uid);
      if (!proposal || proposal.projectId !== projectId) return res.status(404).json({ error: 'Proposal not found.' });
      const result = await ProposalService.rejectProposalDurable(proposalId, req.user.uid, req.user.uid);
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
      const denied = await authorizeExecutionProject(projectId, req.user.uid);
      if (denied) return res.status(denied.status).json({ error: denied.error });
      if (!Array.isArray(files) || files.length > 500) return res.status(400).json({ error: 'Validation requires a valid workspace file snapshot of at most 500 files.' });
      if (requestedChecks !== undefined && (!Array.isArray(requestedChecks) || requestedChecks.some((check: string) => !['syntax', 'typecheck', 'build', 'test', 'eslint'].includes(check)))) {
        return res.status(400).json({ error: 'One or more requested validation checks are not supported.' });
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
    void authorizeExecutionProject(projectId, req.user.uid).then(denied => {
      if (denied) return res.status(denied.status).json({ error: denied.error });
      res.json({ cancelled: ValidationService.cancelValidation(projectId) });
    }).catch(error => res.status(500).json({ error: error.message || 'Could not verify project ownership.' }));
  });

  // 3. Get validation run by ID
  app.get('/api/projects/:projectId/validation/runs/:runId', requireAuth, async (req: any, res: any) => {
    const denied = await authorizeExecutionProject(req.params.projectId, req.user.uid).catch((error: any) => ({ status: 500, error: error.message || 'Could not verify project ownership.' }));
    if (denied) return res.status(denied.status).json({ error: denied.error });
    const { runId } = req.params;
    const run = ValidationService.getValidationRun(runId);
    if (!run || run.projectId !== req.params.projectId || run.userId !== req.user.uid) {
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

  // Evals contain user work and can trigger paid model calls. Require Firebase auth.
  app.use('/api/evals', requireAuth);
  if (hasAdminCredentials()) {
    let evalRecoveryTimer: NodeJS.Timeout | undefined;
    const runEvalRecovery = async () => {
      try {
        await evalEngine.recoverInterruptedRuns();
      } catch (error: any) {
        if (isPermissionDeniedError(error)) {
          markAdminCredentialsUnavailable(error);
          if (evalRecoveryTimer) clearInterval(evalRecoveryTimer);
          console.warn('[EvalEngine] Firestore run persistence is unavailable (PERMISSION_DENIED); interrupted run recovery disabled.');
        } else {
          console.error('[EvalEngine] Interrupted run recovery failed:', error);
        }
      }
    };
    void runEvalRecovery();
    evalRecoveryTimer = setInterval(() => {
      if (!hasAdminCredentials()) {
        if (evalRecoveryTimer) clearInterval(evalRecoveryTimer);
        return;
      }
      void runEvalRecovery();
    }, 30_000);
    evalRecoveryTimer.unref?.();
  } else {
    console.warn('[EvalEngine] Firestore run persistence is unavailable; configure Application Default Credentials.');
  }

  // Evals API Routes
  app.post('/api/evals/tasks', asyncRoute(async (req: any, res) => {
    if (!checkChatRateLimit(req.user.uid, 20, 60_000)) return res.status(429).json({ error: 'Evaluation task creation limit reached. Try again in a minute.' });
    try {
      const task = await evalEngine.createTaskDurable(req.body, req.user.uid);
      res.json(task);
    } catch(e: any) { res.status(500).json({error: e.message}); }
  }));

  app.get('/api/evals/tasks', asyncRoute(async (req: any, res) => {
    res.json(await evalEngine.getTasksDurable(req.user.uid));
  }));

  app.get('/api/evals/tasks/:id', asyncRoute(async (req: any, res) => {
    const task = await evalEngine.getTaskDurable(req.params.id, req.user.uid);
    if (task) res.json(task);
    else res.status(404).json({error: 'Task not found'});
  }));

  app.delete('/api/evals/tasks/:id', asyncRoute(async (req: any, res) => {
    const ok = await evalEngine.deleteTaskDurable(req.params.id, req.user.uid);
    res.json({ success: ok });
  }));

  app.post('/api/evals/run', asyncRoute(async (req: any, res) => {
    if (!checkChatRateLimit(req.user.uid, 10, 60_000)) return res.status(429).json({ error: 'Evaluation run limit reached. Try again in a minute.' });
    try {
      const { taskId, modelId, agentId, providerId, benchmarkId } = req.body;
      const dataSharingAllowed = ServerPrivacyGuard.evaluateConsent(req);
      const run = await evalEngine.runEval(taskId, modelId, agentId, providerId, benchmarkId, undefined, { dataSharingAllowed, userId: req.user.uid });
      res.json(run);
    } catch(e: any) { res.status(500).json({error: e.message}); }
  }));

  app.post('/api/evals/runs', asyncRoute(async (req: any, res) => {
    if (!checkChatRateLimit(req.user.uid, 10, 60_000)) return res.status(429).json({ error: 'Evaluation run limit reached. Try again in a minute.' });
    try {
      const { taskId, modelId, agentId, providerId, benchmarkId } = req.body;
      const dataSharingAllowed = ServerPrivacyGuard.evaluateConsent(req);
      const run = await evalEngine.runEval(taskId, modelId, agentId, providerId, benchmarkId, undefined, { dataSharingAllowed, userId: req.user.uid });
      res.json(run);
    } catch(e: any) { res.status(500).json({error: e.message}); }
  }));

  app.get('/api/evals/runs', asyncRoute(async (req: any, res) => {
    res.json(await evalEngine.getRunsDurable(req.user.uid));
  }));

  app.get('/api/evals/runs/:id', asyncRoute(async (req: any, res) => {
    const run = await evalEngine.getRunDurable(req.params.id, req.user.uid);
    if (run) res.json(run);
    else res.status(404).json({error: 'Not found'});
  }));

  app.post('/api/evals/runs/:id/cancel', asyncRoute(async (req: any, res) => {
    if (!await evalEngine.getRunDurable(req.params.id, req.user.uid)) return res.status(404).json({ error: 'Not found' });
    const ok = evalEngine.cancelRun(req.params.id);
    res.json({ success: ok });
  }));

  app.post('/api/evals/runs/:id/retry', asyncRoute(async (req: any, res) => {
    try {
      const dataSharingAllowed = ServerPrivacyGuard.evaluateConsent(req);
      if (!await evalEngine.getRunDurable(req.params.id, req.user.uid)) return res.status(404).json({ error: 'Not found' });
      const run = await evalEngine.retryRun(req.params.id, { dataSharingAllowed, userId: req.user.uid });
      res.json(run);
    } catch(e: any) { res.status(500).json({error: e.message}); }
  }));

  app.get('/api/evals/benchmarks', asyncRoute(async (req: any, res) => {
    res.json(await evalEngine.getBenchmarksDurable(req.user.uid));
  }));

  app.get('/api/evals/benchmarks/:id', asyncRoute(async (req: any, res) => {
    const bench = await evalEngine.getBenchmarkDurable(req.params.id, req.user.uid);
    if (bench) res.json(bench);
    else res.status(404).json({error: 'Benchmark not found'});
  }));

  app.post('/api/evals/benchmarks', asyncRoute(async (req: any, res) => {
    try {
      const bench = await evalEngine.createBenchmarkDurable(req.body, req.user.uid);
      res.json(bench);
    } catch(e: any) { res.status(500).json({error: e.message}); }
  }));

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

  app.post('/api/evals/reviews', asyncRoute(async (req: any, res) => {
    try {
      if (!await evalEngine.getRunDurable(req.body?.runId, req.user.uid)) return res.status(404).json({ error: 'Not found' });
      const scoreFields = ['codeQualityScore', 'architectureScore', 'maintainabilityScore', 'instructionFollowingScore', 'correctnessScore'];
      if (scoreFields.some((field) => !Number.isInteger(req.body?.[field]) || req.body[field] < 0 || req.body[field] > 100)) {
        return res.status(400).json({ error: 'Review scores must be whole numbers between 0 and 100.' });
      }
      if (typeof req.body?.comments !== 'string' || req.body.comments.length > 10_000) {
        return res.status(400).json({ error: 'Review comments must be 10,000 characters or fewer.' });
      }
      const review = await evalEngine.addReviewDurable({ ...req.body, ownerId: req.user.uid, reviewerId: req.user.uid });
      res.json(review);
    } catch(e: any) { res.status(500).json({error: e.message}); }
  }));

  app.get('/api/evals/reviews/:runId', asyncRoute(async (req: any, res) => {
    if (!await evalEngine.getRunDurable(req.params.runId, req.user.uid)) return res.status(404).json({ error: 'Not found' });
    res.json(await evalEngine.getReviewsDurable(req.params.runId, req.user.uid));
  }));

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
      server: {
        middlewareMode: true,
        hmr: false, // Prevents independent WebSocket collisions on port 24678
      },
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

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
  });

  server.on('error', (err: any) => {
    if (err?.code === 'EADDRINUSE') {
      console.warn(`Port ${PORT} in use; attempting recovery in 1s...`);
      setTimeout(() => {
        try {
          server.close();
        } catch {}
        server.listen(PORT, '0.0.0.0');
      }, 1000);
    } else {
      console.error('Server listen error:', err);
    }
  });

  return server;
}

// Auto start for direct TypeScript development execution or the compiled Cloud Run entry.
if (process.argv[1] && /(?:^|[\\/])(app\.ts|server\.cjs)$/.test(process.argv[1])) {
  startServer();
}
