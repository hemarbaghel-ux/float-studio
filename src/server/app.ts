import dotenv from 'dotenv';
import path from 'path';
import { randomUUID } from 'node:crypto';

// Load environment variables early
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

import { integrationsRouter } from './integrationsRouter';
import { subscriptionRouter, handleStripeWebhook } from './subscription/subscriptionRouter';
import express from 'express';
import fs from 'fs';

import { ModelRouter } from './providers/router';
import { ServerPrivacyGuard } from './privacyGuard';
import { requireAuth } from './authMiddleware';
import { asyncRoute } from './asyncRoute';
import { adminDb, hasAdminCredentials, isPermissionDeniedError, markAdminCredentialsUnavailable } from './adminFirebase';
import { ContextBuilder } from './contextBuilder';
import { searchCodebase } from '../services/codebaseSearch';
import { ProposalService, computeDiffStats } from './proposals/proposalService';
import { BoundedToolExecutor } from './agent/boundedToolExecutor';
import { cancelComposerTask, registerComposerTask, runComposerTask, unregisterComposerTask } from './agent/composerExecutionService';
import { mergeApprovedComposerChanges, normalizeComposerWorkspaceSnapshot } from './agent/composerWorkspaceSnapshot';
import { normalizeComposerWorkspaceSnapshot } from './agent/composerWorkspaceSnapshot';
import { ValidationService } from './validation/validationService';
import { verifyProjectOwnership, ProjectOwnershipResult } from './projectOwnership';
import { deleteProjectContentGenerationAdmin, loadProjectFileTreeAdmin, writeProjectFileTreeAdmin } from './projectContent';
import { serializeProjectFileTree } from '../services/projectCloudFiles';
import { projectProcessManager, ExecutionFile, ExecutionEvent } from './execution/processManager';
import { gitRouter } from './github/gitRouter';
import { milestone9Router } from './milestone9Router';
import { brainRouter } from './brain';
import { createAnalystRouter } from './analystRouter';

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

  // 2. In AI Studio / Cloud Run deployment, Nginx is the public front listening on 8080 and reverse-proxies to 3000.
  // Port 8080 is reserved for Nginx; Node.js must bind to port 3000 to avoid EADDRINUSE crash.
  if (process.env.PORT && process.env.PORT !== '8080') {
    const p = parseInt(process.env.PORT, 10);
    if (!Number.isNaN(p) && p > 0) return p;
  }

  // 3. Standard application port
  return 3000;
}

const endpointRateLimits = new Map<string, number[]>();
const MAX_RATE_LIMIT_KEYS = 15_000;

export function checkEndpointRateLimit(
  bucket: string,
  userId: string,
  maxRequests = 45,
  windowMs = 60_000
): boolean {
  if (!userId) return false;
  const key = `${bucket}:${userId}`;
  const now = Date.now();
  const timestamps = (endpointRateLimits.get(key) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    return false;
  }
  timestamps.push(now);
  endpointRateLimits.delete(key);
  if (!endpointRateLimits.has(key) && endpointRateLimits.size >= MAX_RATE_LIMIT_KEYS) {
    const oldestKey = endpointRateLimits.keys().next().value;
    if (oldestKey) endpointRateLimits.delete(oldestKey);
  }
  endpointRateLimits.set(key, timestamps);
  return true;
}

export function resetEndpointRateLimitsForTests(): void {
  endpointRateLimits.clear();
}

export interface CreateAppOptions {
  skipVite?: boolean;
  modelRouterOverride?: ModelRouter;
}

export async function createApp(options: CreateAppOptions = {}) {
  const app = express();
  // All model-backed endpoints in one app instance share a single routing authority.
  const modelRouter = options.modelRouterOverride || new ModelRouter();

  // Keep ordinary JSON endpoints small. Authenticated AI routes install a larger
  // parser after authentication because repository context can be several MB.
  // Stripe webhooks require pristine raw buffer for cryptographic signature verification.
  app.use((req, res, next) => {
    if (req.path === '/api/subscription/webhook') return next();
    if (req.path === '/api/ai/chat') return next();
    return express.json({ limit: '12mb' })(req, res, next);
  });

  // Stripe Webhook Endpoint (requires raw body buffer)
  app.post('/api/subscription/webhook', express.raw({ type: 'application/json' }), asyncRoute(handleStripeWebhook));

  // Subscription & Checkout Routes
  app.use('/api/subscription', subscriptionRouter);

  // Data Analyst routes use the same registry/router as chat and agents.
  app.use('/api/analyst', createAnalystRouter(modelRouter));

  // Health check endpoint for Cloud Run and monitoring
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
  });

  app.use('/api/session', requireAuth, (_req: any, res: any) => res.status(410).json({
    error: 'Cloud agent sessions are unavailable.',
    code: 'CLOUD_SESSIONS_UNAVAILABLE'
  }));

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

  // Agent execution has been retired from the product surface.
  app.use('/api/agents', requireAuth, (_req: any, res: any) => res.status(410).json({
    error: 'FLOAT agent workflows are unavailable. Use model chat for normal conversations.',
    code: 'AGENTS_UNAVAILABLE'
  }));

  // Integrations Routes
  app.use('/api/integrations', integrationsRouter);
  app.use('/api/projects/:projectId/git', gitRouter);
  app.use('/api', milestone9Router);
  app.use('/api', brainRouter);

  // Project commands run only in the constrained Docker sandbox. Requiring a
  // persisted owned project (`allowMissing: false`) prevents callers from using
  // the runner as a generic remote shell with an arbitrary unsaved workspace.
  const authorizeExecutionProject = async (projectId: string, userId: string) => {
    const check = await verifyProjectOwnership(projectId, userId, {
      allowMissing: false,
      notFoundMessage: 'Save this workspace to your account before running server commands.'
    });
    if (!check.allowed) {
      return { status: check.status, error: check.error || 'Unauthorized project access.' };
    }
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

  // Native structured-tool Composer API. Project ownership is checked before a task
  // starts; each individual tool call repeats server-side ownership and policy checks.
  app.post('/api/projects/:projectId/composer/run', requireAuth, async (req: any, res: any) => {
    const { projectId } = req.params;
    const userId = req.user.uid;
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const mode = req.body?.mode || 'agent';
    const requestedModel = typeof req.body?.model === 'string' ? req.body.model.trim() : 'auto';
    let workspaceSnapshot;
    try {
      workspaceSnapshot = normalizeComposerWorkspaceSnapshot(req.body?.workspaceFiles);
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || 'A valid local workspace snapshot is required.' });
    }

    if (!checkEndpointRateLimit('composer', userId, 6, 60_000)) {
      return res.status(429).json({ error: 'Composer task limit reached. Wait before starting another task.' });
    }
    if (!prompt || prompt.length > 20_000) {
      return res.status(400).json({ error: 'A task prompt between 1 and 20,000 characters is required.' });
    }
    if (!['ask', 'plan', 'agent', 'manual'].includes(mode)) {
      return res.status(400).json({ error: 'Composer mode must be ask, plan, agent, or manual.' });
    }
    if (!requestedModel || requestedModel.length > 128) {
      return res.status(400).json({ error: 'A valid model identifier is required.' });
    }

    const ownership = await verifyProjectOwnership(projectId, userId, { allowMissing: false });
    if (!ownership.allowed) {
      return res.status(ownership.status).json({ error: ownership.error || 'Project access forbidden.' });
    }

    try {
      // Resolve the model before switching to SSE so unknown/unsupported models receive
      // a normal HTTP error instead of a broken stream.
      modelRouter.resolveRoute(requestedModel);
    } catch (error: any) {
      return res.status(error?.statusCode || 400).json({
        error: error?.message || 'The selected model is not available.',
        code: error?.code || 'MODEL_NOT_FOUND'
      });
    }

    const { taskId, controller } = registerComposerTask(userId, projectId);
    const requestTimeout = setTimeout(() => controller.abort(new Error('Composer task timed out.')), 120_000);
    requestTimeout.unref?.();

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders?.();

    const send = (event: any) => {
      if (!res.destroyed && !res.writableEnded) {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    };

    res.on('close', () => {
      if (!res.writableEnded) controller.abort(new Error('Client disconnected.'));
    });

    try {
      const result = await runComposerTask({
        taskId,
        userId,
        projectId,
        model: requestedModel,
        prompt,
        mode,
        maxIterations: req.body?.maxIterations,
        maxRuntimeMs: req.body?.maxRuntimeMs,
        dataSharingAllowed: ServerPrivacyGuard.evaluateConsent(req),
        workspaceFiles: workspaceSnapshot.files,
        signal: controller.signal,
        generate: (request) => modelRouter.generateContent(request),
        onEvent: send
      });
      if (!res.destroyed && !res.writableEnded) {
        res.write(`event: result\ndata: ${JSON.stringify({ taskId, execution: result })}\n\n`);
        res.end();
      }
    } catch (error: any) {
      if (!res.destroyed && !res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ taskId, error: error?.message || 'Composer execution failed.' })}\n\n`);
        res.end();
      }
    } finally {
      clearTimeout(requestTimeout);
      unregisterComposerTask(taskId);
    }
  });

  app.post('/api/projects/:projectId/composer/tasks/:taskId/cancel', requireAuth, asyncRoute(async (req: any, res: any) => {
    const { projectId, taskId } = req.params;
    const ownership = await verifyProjectOwnership(projectId, req.user.uid, { allowMissing: false });
    if (!ownership.allowed) {
      return res.status(ownership.status).json({ error: ownership.error || 'Project access forbidden.' });
    }
    const cancelled = cancelComposerTask(taskId, req.user.uid, projectId);
    return res.json({ taskId, cancelled });
  }));

  // Root /auth/callback alias redirect to provider callback
  app.get(['/auth/callback', '/auth/callback/'], (req, res) => {
    const provider = req.query.state && String(req.query.state).includes('gitlab') ? 'gitlab' : 'github';
    const query = new URLSearchParams(req.query as any).toString();
    res.redirect(`/api/integrations/${provider}/callback?${query}`);
  });

  // Model Intelligence & Availability Routes
  app.get(['/api/ai/models', '/api/ai/models/'], (_req, res) => {
    try {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.json({ success: true, models: modelRouter.getModelCatalog(), timestamp: Date.now() });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Could not load model catalog.' });
    }
  });

  app.get(['/api/ai/models/status', '/api/ai/models/status/'], (_req, res) => {
    try {
      const providerStatus = modelRouter.getProviderStatus();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
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
  const checkChatRateLimit = (userId: string, maxRequests = 45, windowMs = 60000): boolean => {
    return checkEndpointRateLimit('chat', userId, maxRequests, windowMs);
  };

  // AI API Route - supports progressive SSE streaming and standard JSON.
  // Supports unsaved/ephemeral workspaces via `allowMissing: true` while still
  // rejecting persisted projects owned by another user with 403.
  app.post('/api/ai/chat', requireAuth, express.json({ limit: '24mb' }), async (req: any, res: any) => {
    if (!checkChatRateLimit(req.user.uid)) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Please wait a moment before sending another request.'
      });
    }

    const isStream = req.body.stream === true || req.body.isStream === true || req.headers.accept?.includes('text/event-stream');
    const {
      messages,
      model = 'gpt-6.1-sol',
      systemInstruction,
      reasoningEffort,
      effort,
      speed,
      contextItems,
      activeEditor,
      gitContext: clientGitContext,
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

    // Verify project ownership if projectId is provided (including 'default-project').
    // Unsaved local workspaces are permitted (`allowMissing: true`), but any persisted
    // project belonging to another user is rejected with 403.
    let ownership: ProjectOwnershipResult | null = null;
    let effectiveProjectId: string | undefined = undefined;
    const headerProjectId = typeof req.headers['x-float-project-id'] === 'string' ? req.headers['x-float-project-id'].trim() : undefined;
    const bodyProjectId = projectId !== undefined && projectId !== null && String(projectId).trim() !== '' ? String(projectId).trim() : undefined;
    if (headerProjectId && bodyProjectId && headerProjectId !== bodyProjectId) {
      return res.status(400).json({ error: 'Conflicting project identifier provided in X-Float-Project-Id header and request body.' });
    }
    const candidateProjectId = bodyProjectId || headerProjectId;
    if (candidateProjectId) {
      ownership = await verifyProjectOwnership(candidateProjectId, req.user.uid, { allowMissing: true });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({ error: ownership.error });
      }
      effectiveProjectId = ownership.effectiveProjectId || candidateProjectId;
    }

    // Process and assemble codebase context items if provided
    let processedMessages = messages;
    let contextExplanation: any = null;
    if (Array.isArray(messages) && messages.length > 0) {
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

      // Only query persisted Git link metadata when the project is confirmed persisted and owned
      let gitRepoInfo: { gitRepository?: string; gitBranch?: string } = {};
      if (hasAdminCredentials() && ownership?.persisted && !ownership.isEphemeral && effectiveProjectId) {
        try {
          const linkSnap = await adminDb.collection('projectGitLinks').doc(effectiveProjectId).get();
          if (linkSnap.exists) {
            const linkData = linkSnap.data();
            if (linkData && linkData.ownerId === req.user.uid) {
              gitRepoInfo = {
                gitRepository: `${linkData.repositoryOwner}/${linkData.repositoryName}`,
                gitBranch: linkData.branch || linkData.defaultBranch
              };
            }
          }
        } catch {}
      }

      const priorTurns = messages.slice(0, lastMsgIdx).map((m: any) => ({
        role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model',
        content: typeof m.content === 'string' ? m.content : m.parts?.[0]?.text || ''
      }));

      const assembled = ContextBuilder.build(userPromptText, contextItems || [], {
        projectName,
        projectId: effectiveProjectId,
        userId: req.user.uid,
        modelId: model,
        activeEditor,
        gitContext: {
          ...gitRepoInfo,
          ...clientGitContext
        },
        conversationHistory: priorTurns
      });

      contextExplanation = {
        intent: assembled.intent,
        includedCount: assembled.includedCount,
        omittedCount: assembled.omittedCount,
        totalContextChars: assembled.totalContextChars,
        includedItems: assembled.includedItems,
        excludedItems: assembled.excludedItems
      };

      processedMessages = [
        ...messages.slice(0, lastMsgIdx),
        { role: 'user', parts: [{ text: assembled.formattedPrompt }] }
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
      const requestTimeout = setTimeout(() => {
        abortController.abort(new Error('Gateway request timed out after 120 seconds.'));
      }, 120000);
      requestTimeout.unref?.();
      res.on('close', () => {
        if (!res.writableEnded) abortController.abort();
      });

      try {
        if (contextExplanation) {
          res.write(`data: ${JSON.stringify({ type: 'context_info', contextExplanation })}\n\n`);
        }

        const result = await modelRouter.generateContentStream(
          {
            model,
            messages: processedMessages,
            systemInstruction,
            reasoningEffort: resolvedEffort,
            speed,
            dataSharingConsent: dataSharingAllowed,
            dataSharingAllowed,
            demoMode: Boolean(req.body?.demoMode)
          },
          (delta: string) => {
            if (!abortController.signal.aborted && !res.destroyed && !res.writableEnded) {
              res.write(`data: ${JSON.stringify({ type: 'delta', text: delta })}\n\n`);
            }
          },
          abortController.signal
        );

        clearTimeout(requestTimeout);
        res.write(`data: ${JSON.stringify({ type: 'done', text: result.text, usage: result.usage, isSimulated: result.isSimulated, contextExplanation })}\n\n`);
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

        clearTimeout(requestTimeout);
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
        dataSharingAllowed,
        demoMode: Boolean(req.body?.demoMode)
      });

      res.json({ text: response.text, usage: response.usage, isSimulated: response.isSimulated });
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

  // Retired Gemini-specific path. Models must be executed through the active
  // registry so the selected model cannot be rewritten or silently substituted.
  app.post('/api/ai/gemini-stream', requireAuth, (_req: any, res: any) => {
    res.status(410).json({
      error: 'This legacy Gemini route is unavailable. Use the active model catalog and /api/ai/chat.',
      code: 'MODEL_NOT_FOUND'
    });
  });

  // Fast inline ghost-text completion endpoint
  app.post('/api/ai/complete', requireAuth, express.json({ limit: '2mb' }), async (req: any, res: any) => {
    try {
      const {
        prefix = '',
        suffix = '',
        language = 'plaintext',
        fileName = 'file',
        model = 'gpt-6-astra'
      } = req.body || {};

      if (!prefix && !suffix) {
        return res.json({ completion: '' });
      }

      // Bound context to fast local window
      const boundedPrefix = String(prefix).slice(-2000);
      const boundedSuffix = String(suffix).slice(0, 1000);

      const prompt = `You are a high-speed code completion engine. Continue the code exactly where the cursor is located between <PREFIX> and <SUFFIX>.
Output ONLY the code continuation to be inserted directly at the cursor. Do not output markdown, do not output backticks, and do not repeat the prefix or suffix.

File: ${fileName} (${language})
<PREFIX>
${boundedPrefix}
</PREFIX>
<SUFFIX>
${boundedSuffix}
</SUFFIX>`;

      const result = await modelRouter.generateContent({
        model,
        messages: [{ role: 'user', content: prompt }],
        speed: 'fast',
        systemInstruction: "You are an inline code autocompletion engine. Output only the immediate completion code."
      });

      let completionText = result.text || '';
      // Clean up markdown fences if the model emitted them accidentally
      completionText = completionText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '');

      res.json({ completion: completionText });
    } catch (error: any) {
      const isCancelled = error?.name === 'AbortError' || /cancel/i.test(error?.message || '');
      if (isCancelled) {
        return res.json({ completion: '', cancelled: true });
      }
      const statusCode = error?.statusCode || 500;
      res.status(statusCode).json({ error: error.message || 'Completion failed', code: error?.code || 'PROVIDER_ERROR' });
    }
  });

  // Dedicated Inline AI Transformation endpoint (Ctrl+K / Cmd+K)
  app.post('/api/ai/transform', requireAuth, express.json({ limit: '4mb' }), async (req: any, res: any) => {
    try {
      const {
        instruction = '',
        selectedCode = '',
        fullCode = '',
        startLine,
        endLine,
        fileName = 'file',
        language = 'plaintext',
        model = 'gpt-6-astra'
      } = req.body || {};

      if (!instruction.trim()) {
        return res.status(400).json({ error: 'Transformation instruction is required.' });
      }

      const prompt = `You are an expert AI code transformer. The user wants you to edit code according to their instruction.
Return ONLY the transformed code that directly replaces the provided input. Do not explain, do not wrap in conversational text.
If provided a selection, return ONLY the replacement for the selection.
If markdown code blocks are used, wrap only the raw code in a single code fence.

Instruction: ${instruction}
File: ${fileName} (${language})
Line range: ${startLine !== undefined && endLine !== undefined ? `Lines ${startLine} to ${endLine}` : 'Full file'}

Code to transform:
\`\`\`${language}
${selectedCode || fullCode}
\`\`\``;

      const result = await modelRouter.generateContent({
        model,
        messages: [{ role: 'user', content: prompt }],
        systemInstruction: "You are an inline code modification assistant. Return only the replacement code for the target selection without conversational remarks."
      });

      let transformedCode = result.text || '';
      // Strip outer markdown fence if present
      const fenceMatch = transformedCode.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/);
      if (fenceMatch) {
        transformedCode = fenceMatch[1];
      }

      // Compute full proposed file content if a selection was replaced
      let fullProposedContent = transformedCode;
      if (selectedCode && fullCode && startLine !== undefined && endLine !== undefined) {
        const lines = fullCode.replace(/\r\n/g, '\n').split('\n');
        const beforeLines = lines.slice(0, Math.max(0, startLine - 1));
        const afterLines = lines.slice(endLine);
        const replacementLines = transformedCode.replace(/\r\n/g, '\n').split('\n');
        fullProposedContent = [...beforeLines, ...replacementLines, ...afterLines].join('\n');
      }

      res.json({
        transformedSelection: transformedCode,
        proposedContent: fullProposedContent,
        diffStats: computeDiffStats(fullCode, fullProposedContent)
      });
    } catch (error: any) {
      const isCancelled = error?.name === 'AbortError' || /cancel/i.test(error?.message || '');
      if (isCancelled) {
        return res.json({ cancelled: true, message: 'Inline assistant cancelled by user.' });
      }
      const statusCode = error?.statusCode || 500;
      res.status(statusCode).json({ error: error.message || 'Transformation failed', code: error?.code || 'PROVIDER_ERROR' });
    }
  });

  // Codebase Search API Route with persisted project ownership validation (`allowMissing: false`)
  app.get('/api/projects/:projectId/search', requireAuth, async (req: any, res: any) => {
    try {
      const { projectId } = req.params;
      const query = String(req.query.q || '').trim();
      if (!query) {
        return res.json({ matches: [] });
      }

      // Check project ownership via trusted server-side Firebase Admin
      const ownership = await verifyProjectOwnership(projectId, req.user.uid, {
        allowMissing: false,
        notFoundMessage: 'Project not found'
      });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({ error: ownership.error });
      }

      const data = ownership.projectData || {};
      const files = await loadProjectFileTreeAdmin(projectId, data);
      const matches = searchCodebase(files, query);
      res.json({ matches });
    } catch (error: any) {
      console.error('Project search error:', error);
      res.status(500).json({ error: error.message || 'Search failed' });
    }
  });

  // Retired legacy agent endpoints remain explicit and authenticated.
  app.post('/api/ai/agent', requireAuth, (_req: any, res: any) => res.status(410).json({
    error: 'FLOAT agent workflows are unavailable. Use model chat for normal conversations.',
    code: 'AGENTS_UNAVAILABLE'
  }));
  app.post('/api/ai/plan', requireAuth, (_req: any, res: any) => res.status(410).json({
    error: 'FLOAT planning workflows are unavailable. Use model chat for normal conversations.',
    code: 'AGENTS_UNAVAILABLE'
  }));

  // Bounded Autonomous Agent Mode tool execution (Phase 6)
  app.post('/api/projects/:projectId/agent/execute-tool', requireAuth, async (req: any, res: any) => {
    try {
      const { projectId } = req.params;
      const { toolName, args, files } = req.body || {};

      if (!toolName) {
        return res.status(400).json({ error: 'Tool name is required.' });
      }

      const outcome = await BoundedToolExecutor.executeTool(
        { toolName, args: args || {} },
        { userId: req.user.uid, projectId, files }
      );

      res.json({ outcome });
    } catch (error: any) {
      console.error('Agent tool execution error:', error);
      res.status(500).json({ error: error.message || 'Tool execution failed' });
    }
  });
  // Code Proposal Routes (Phase 5) — Strictly require a persisted owned project (`allowMissing: false`)
  // 1. Create a proposed change set
  app.post('/api/projects/:projectId/proposals', requireAuth, async (req: any, res: any) => {
    try {
      const { projectId } = req.params;
      const { description, conversationId, changes, virtualFiles = [] } = req.body;

      const ownership = await verifyProjectOwnership(projectId, req.user.uid, { allowMissing: false });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({ error: ownership.error });
      }

      const fileMap = new Map<string, { content?: string }>();
      for (const f of virtualFiles) {
        if (f.path) fileMap.set(f.path.replace(/^\/+/, ''), f);
      }

      const result = await ProposalService.createProposalDurable({
        ownerId: req.user.uid,
        projectId,
        conversationId: typeof conversationId === 'string' ? conversationId : undefined,
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
      const ownership = await verifyProjectOwnership(projectId, req.user.uid, { allowMissing: false });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({ error: ownership.error });
      }
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
      const ownership = await verifyProjectOwnership(projectId, req.user.uid, { allowMissing: false });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({ error: ownership.error });
      }
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
    const cleanupProjectId = String(req.params.projectId || '');
    let stagedGeneration: string | undefined;
    let snapshotCommitted = false;
    try {
      const { projectId, proposalId } = req.params;
      const { approvedPaths, workspaceFiles } = req.body || {};

      const ownership = await verifyProjectOwnership(projectId, req.user.uid, { allowMissing: false });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({ error: ownership.error });
      }

      const proposal = await ProposalService.getProposalDurable(proposalId, req.user.uid);
      if (!proposal || proposal.projectId !== projectId) return res.status(404).json({ error: 'Proposal not found.' });
      if (!ownership.projectData) return res.status(503).json({ error: 'The saved project snapshot could not be verified.' });

      const savedFiles = await loadProjectFileTreeAdmin(projectId, ownership.projectData);
      let finalTree = savedFiles;
      let currentFiles: Array<{ path: string; content: string }> = [];
      let projectSnapshotManifest: { fileGeneration: string; fileChunkCount: number; fileBytes: number } | undefined;

      const collectFiles = (nodes: any[], parentPath = '') => {
        for (const node of nodes) {
          const filePath = parentPath ? `${parentPath}/${node.name}` : node.name;
          if (node.type === 'file') currentFiles.push({ path: filePath, content: node.content || '' });
          else if (node.type === 'folder' && Array.isArray(node.children)) collectFiles(node.children, filePath);
        }
      };

      if (workspaceFiles !== undefined) {
        const submitted = normalizeComposerWorkspaceSnapshot(workspaceFiles);
        const merged = mergeApprovedComposerChanges(
          savedFiles,
          submitted.files,
          proposal.changes.map(change => ({
            path: change.path,
            operation: change.operation,
            originalContent: change.originalContent,
            proposedContent: change.proposedContent
          })),
          approvedPaths
        );
        finalTree = merged.files;
        collectFiles(finalTree);

        const serialized = serializeProjectFileTree(finalTree);
        if (serialized.ok === false) {
          return res.status(422).json({ error: 'The approved workspace snapshot could not be serialized safely.' });
        }
        stagedGeneration = randomUUID();
        await writeProjectFileTreeAdmin(projectId, req.user.uid, stagedGeneration, serialized.chunks);
        projectSnapshotManifest = {
          fileGeneration: stagedGeneration,
          fileChunkCount: serialized.chunks.length,
          fileBytes: serialized.byteLength
        };
      } else {
        collectFiles(savedFiles);
      }

      const result = await ProposalService.finalizeProposalDurable(proposalId, {
        ownerId: req.user.uid,
        projectId,
        approvedPaths,
        currentFiles,
        projectData: ownership.projectData,
        projectSnapshotManifest
      });

      if (!result.success) {
        const statusCode = result.status === 'stale' ? 409 : result.status === 'failed' ? 404 : 400;
        return res.status(statusCode).json(result);
      }

      snapshotCommitted = Boolean(stagedGeneration);
      const previousGeneration = ownership.projectData.fileStorageVersion === 2 &&
        typeof ownership.projectData.fileGeneration === 'string'
        ? ownership.projectData.fileGeneration
        : undefined;
      if (snapshotCommitted && previousGeneration && previousGeneration !== stagedGeneration) {
        await deleteProjectContentGenerationAdmin(projectId, previousGeneration).catch((error) => {
          console.warn('A previous project content generation could not be cleaned up after Composer Apply:', error);
        });
      }

      return res.json(result);
    } catch (error: any) {
      console.error('Apply Proposal Error:', error);
      return res.status(error?.statusCode || 500).json({ error: error.message || 'Failed to apply proposal' });
    } finally {
      if (stagedGeneration && !snapshotCommitted) {
        await deleteProjectContentGenerationAdmin(cleanupProjectId, stagedGeneration).catch(() => {});
      }
    }
  });

  // 5. Reject proposal
  app.post('/api/projects/:projectId/proposals/:proposalId/reject', requireAuth, async (req: any, res: any) => {
    try {
      const { projectId, proposalId } = req.params;
      const ownership = await verifyProjectOwnership(projectId, req.user.uid, { allowMissing: false });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({ error: ownership.error });
      }
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

  // Validation & Error Analysis Routes (Phase 6) — Require persisted owned project via authorizeExecutionProject
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
      const denied = await authorizeExecutionProject(projectId, req.user.uid);
      if (denied) return res.status(denied.status).json({ error: denied.error });

      if (!diagnostic || typeof diagnostic.message !== 'string' || diagnostic.message.length > 10_000) {
        return res.status(400).json({ error: 'A valid diagnostic object is required (message up to 10,000 characters).' });
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

  // Agent-based model evaluations are retired with the other agent workflows.
  // Keep the prefix authenticated and return before legacy handlers or recovery code.
  app.use('/api/evals', requireAuth, (_req: any, res: any) => res.status(410).json({
    error: 'Evaluation workflows are unavailable in this release.',
    code: 'AGENTS_UNAVAILABLE'
  }));

  // Do not let unknown API requests fall through to the SPA index.html.
  // Returning HTML here makes frontend fetch(...).json() fail with a misleading parse error.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (!options.skipVite && process.env.SKIP_VITE !== 'true') {
    // Static files or Vite dev middleware
    const isRunningWithTsx = process.execArgv.some(arg => arg.includes('tsx')) || process.argv.some(arg => arg.includes('tsx'));
    const distPath = path.join(process.cwd(), 'dist');
    const distIndexHtml = path.join(distPath, 'index.html');
    const rootIndexHtml = path.join(process.cwd(), 'index.html');
    const isProduction = process.env.NODE_ENV === 'production' || (!isRunningWithTsx && fs.existsSync(distIndexHtml));

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
      console.log('  ⚡ Initializing Vite development server...');
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: false, // Prevents independent WebSocket collisions on port 24678
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('  ✓ Vite development middleware ready');
    }
  }

  // Centralized error handling: keep API failures machine-readable and never
  // turn malformed/oversized JSON or missing API routes into a false success.
  app.use((err: any, req: any, res: any, _next: any) => {
    if (res.headersSent) {
      return res.end();
    }

    const isApiRequest = typeof req.path === 'string' && req.path.startsWith('/api/');
    if (isApiRequest) {
      if (err?.type === 'entity.too.large' || err?.status === 413) {
        return res.status(413).json({ error: 'Request payload is too large.' });
      }
      if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
        return res.status(400).json({ error: 'Request body contains invalid JSON.' });
      }
    }

    // ENOENT for a missing API/resource is a missing resource, not a reason
    // to send the SPA HTML with status 200.
    if (err?.code === 'ENOENT') {
      return isApiRequest
        ? res.status(404).json({ error: 'Requested resource was not found.' })
        : res.status(404).send('Requested resource was not found.');
    }

    console.error('Unhandled server error:', err?.message || 'Unknown server error');
    return res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}

export async function startServer() {
  const app = await createApp();
  const PORT = resolvePort();

  let retryCount = 0;
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  ======================================================`);
    console.log(`  🌟 FLOAT AI Studio is running!`);
    console.log(`  ➜  Local:   http://localhost:${PORT}/`);
    console.log(`  ➜  Network: http://127.0.0.1:${PORT}/`);
    console.log(`  ➜  Mode:    ${process.env.NODE_ENV || 'development'}`);
    console.log(`  ======================================================\n`);
  });

  server.on('error', (err: any) => {
    if (err?.code === 'EADDRINUSE') {
      retryCount++;
      if (retryCount <= 2) {
        console.warn(`[FLOAT AI] Port ${PORT} in use; attempting recovery in 1s (${retryCount}/2)...`);
        setTimeout(() => {
          try {
            server.close();
          } catch {}
          server.listen(PORT, '0.0.0.0');
        }, 1000);
      } else {
        const altPort = PORT + 1;
        console.warn(`[FLOAT AI] Port ${PORT} busy; falling back to port ${altPort}...`);
        try {
          server.close();
        } catch {}
        server.listen(altPort, '0.0.0.0', () => {
          console.log(`\n  ======================================================`);
          console.log(`  🌟 FLOAT AI Studio is running!`);
          console.log(`  ➜  Local:   http://localhost:${altPort}/`);
          console.log(`  ➜  Network: http://127.0.0.1:${altPort}/`);
          console.log(`  ➜  Mode:    ${process.env.NODE_ENV || 'development'}`);
          console.log(`  ======================================================\n`);
        });
      }
    } else {
      console.error('Server listen error:', err);
    }
  });

  return server;
}

export async function gracefulShutdownServer(server?: any): Promise<{ stoppedProcesses: number }> {
  const stoppedProcesses = await projectProcessManager.shutdownAll();
  if (server?.listening && typeof server.close === 'function') {
    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => error ? reject(error) : resolve());
    });
  }
  return { stoppedProcesses };
}

// Auto start for direct TypeScript development execution or the compiled Cloud Run entry.
if (process.argv[1] && /(?:^|[\\/])(app\.ts|server\.cjs|server\.js)$/.test(process.argv[1])) {
  startServer().then((server) => {
    let isShuttingDown = false;
    const handleSignal = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log(`\n  🛑 Received ${signal}. Closing HTTP server and stopping active executions...`);
      const forceExit = setTimeout(() => process.exit(0), 5000);
      forceExit.unref?.();
      try {
        await gracefulShutdownServer(server);
      } catch (err) {
        console.error('Shutdown error:', err);
      } finally {
        clearTimeout(forceExit);
        process.exit(0);
      }
    };
    process.on('SIGTERM', () => void handleSignal('SIGTERM'));
    process.on('SIGINT', () => void handleSignal('SIGINT'));
  });
}
