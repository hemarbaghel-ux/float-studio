import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import JSZip from 'jszip';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './adminFirebase';
import { requireAuth } from './authMiddleware';
import {
  consumeOAuthState,
  deleteIntegrationConnection,
  getIntegrationConnection,
  listIntegrationConnections,
  saveIntegrationConnection,
  saveOAuthState,
  type OAuthStateRecord,
  type StoredIntegrationConnection,
} from './integrationStore';

export const integrationsRouter = Router();

export type { StoredIntegrationConnection } from './integrationStore';

// Base App URL resolver: accurately derives domain from request, client origin, or environment
export function getBaseAppUrl(req?: Request): string {
  // OAuth callback destinations must come from deployment configuration, never
  // a client-supplied Origin or redirect_uri parameter.
  if (process.env.APP_URL) {
    const configured = new URL(process.env.APP_URL.trim());
    if (configured.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
      throw new Error('APP_URL must use HTTPS in production.');
    }
    return configured.origin;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('APP_URL must be configured for production OAuth callbacks.');
  }

  const host = req?.headers.host;
  if (host && !/[\s,/@]/.test(host)) return `${host.includes('localhost') ? 'http' : 'https'}://${host}`;
  return 'http://localhost:3000';
}

export function getCallbackUrl(provider: string, req?: Request): string {
  // Allow explicit callback URL override via environment variable if set by user
  if (provider === 'github' && process.env.GITHUB_CALLBACK_URL) {
    return process.env.GITHUB_CALLBACK_URL.trim().replace(/\/+$/, '');
  }
  if (provider === 'gitlab' && process.env.GITLAB_CALLBACK_URL) {
    return process.env.GITLAB_CALLBACK_URL.trim().replace(/\/+$/, '');
  }

  const base = getBaseAppUrl(req);
  return `${base}/api/integrations/${provider}/callback`;
}

async function createOAuthState(provider: 'github' | 'gitlab', userId: string, redirectUri: string): Promise<string | null> {
  const state = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  try {
    await saveOAuthState({ state, provider, userId, redirectUri, createdAt: now, expiresAt: now + 10 * 60 * 1000 });
    return state;
  } catch (error: any) {
    console.error('[OAuth] Could not persist state in Firestore:', error?.message || error);
    return null;
  }
}

// Provider configuration checker
export const getConfiguredProviders = () => {
  const configured: string[] = [];
  const encryptionKey = Buffer.from(process.env.FLOAT_OAUTH_ENCRYPTION_KEY || '', 'base64');
  if (encryptionKey.length !== 32) return configured;
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) configured.push('github');
  if (process.env.GITLAB_CLIENT_ID && process.env.GITLAB_CLIENT_SECRET) configured.push('gitlab');
  return configured;
};

// 1. Integration Status & Setup Information
integrationsRouter.get('/status', (req: Request, res: Response) => {
  const configured = getConfiguredProviders();
  const base = getBaseAppUrl(req);

  res.json({
    configuredProviders: configured,
    providers: {
      github: {
        id: 'github',
        name: 'GitHub',
        configured: configured.includes('github'),
        callbackUrl: `${base}/api/integrations/github/callback`,
        scopes: ['read:user', 'repo'],
        envVars: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
        helpUrl: 'https://github.com/settings/developers'
      },
      gitlab: {
        id: 'gitlab',
        name: 'GitLab',
        configured: configured.includes('gitlab'),
        callbackUrl: `${base}/api/integrations/gitlab/callback`,
        scopes: ['read_user', 'read_repository'],
        envVars: ['GITLAB_CLIENT_ID', 'GITLAB_CLIENT_SECRET'],
        helpUrl: 'https://gitlab.com/-/profile/applications'
      }
    }
  });
});

// 2. Fetch User-Owned Connections (Never exposes access tokens)
integrationsRouter.get('/connections', requireAuth, async (req: any, res: Response) => {
  try {
    const userConnections = (await listIntegrationConnections(req.user.uid))
      .map(({ id, provider, status, accountId, accountName, avatarUrl, profileUrl, scopes, createdAt, lastVerifiedAt }) => ({
        id, provider, status, accountId, accountName, avatarUrl, profileUrl, scopes, createdAt, lastVerifiedAt,
      }));
    res.json({ connections: userConnections });
  } catch (error: any) {
    console.error('[Integration Store] Could not load connections:', error?.message || error);
    res.status(503).json({ error: 'Integration storage is unavailable. Check Firebase Admin credentials and Firestore access.' });
  }
});

// 3. Generate OAuth Authorization URL with CSRF state
integrationsRouter.get('/:provider/auth-url', requireAuth, async (req: any, res: Response) => {
  const { provider } = req.params;
  const base = getBaseAppUrl(req);
  const redirectUri = getCallbackUrl(provider, req);

  const userId = req.user.uid;

  if (provider === 'github') {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.json({
        configured: false,
        provider: 'github',
        message: 'GitHub OAuth is not configured. Configure GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in environment variables.',
        callbackUrl: redirectUri,
        requiredEnvVars: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
        setupUrl: 'https://github.com/settings/developers'
      });
    }

    const state = await createOAuthState('github', userId, redirectUri);
    if (!state) return res.status(503).json({ error: 'OAuth state storage is unavailable. Check Firebase Admin credentials and Firestore access.' });

    const scopes = 'read:user repo';
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}`;

    return res.json({
      configured: true,
      provider: 'github',
      authUrl,
      callbackUrl: redirectUri,
      scopes: ['read:user', 'repo']
    });
  }

  if (provider === 'gitlab') {
    const clientId = process.env.GITLAB_CLIENT_ID;
    const clientSecret = process.env.GITLAB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.json({
        configured: false,
        provider: 'gitlab',
        message: 'GitLab OAuth is not configured. Configure GITLAB_CLIENT_ID and GITLAB_CLIENT_SECRET in environment variables.',
        callbackUrl: redirectUri,
        requiredEnvVars: ['GITLAB_CLIENT_ID', 'GITLAB_CLIENT_SECRET'],
        setupUrl: 'https://gitlab.com/-/profile/applications'
      });
    }

    const state = await createOAuthState('gitlab', userId, redirectUri);
    if (!state) return res.status(503).json({ error: 'OAuth state storage is unavailable. Check Firebase Admin credentials and Firestore access.' });

    const scopes = 'read_user read_repository';
    const authUrl = `https://gitlab.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}`;

    return res.json({
      configured: true,
      provider: 'gitlab',
      authUrl,
      callbackUrl: redirectUri,
      scopes: ['read_user', 'read_repository']
    });
  }

  return res.status(400).json({
    configured: false,
    error: `Provider ${provider} is not currently supported for OAuth.`
  });
});

// 4. Direct Connect Endpoint (Alternative redirect invocation)
integrationsRouter.get('/:provider/connect', requireAuth, async (req: any, res: Response) => {
  const { provider } = req.params;
  const redirectUri = getCallbackUrl(provider, req);

  if (provider === 'github') {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(400).send(`
        <html>
          <body style="font-family: system-ui, sans-serif; background: #0A0A0A; color: #fff; padding: 40px; text-align: center;">
            <h2>GitHub OAuth Not Configured</h2>
            <p style="color: #A1A1AA;">Please configure GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in AI Studio environment variables.</p>
            <p>Callback URL: <code>${redirectUri}</code></p>
          </body>
        </html>
      `);
    }

    const state = await createOAuthState('github', req.user.uid, redirectUri);
    if (!state) return res.status(503).send('OAuth state storage is unavailable. Check Firebase Admin credentials and Firestore access.');

    const scopes = 'read:user repo';
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}`;
    return res.redirect(authUrl);
  }

  if (provider === 'gitlab') {
    const clientId = process.env.GITLAB_CLIENT_ID;
    const clientSecret = process.env.GITLAB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(400).send(`
        <html>
          <body style="font-family: system-ui, sans-serif; background: #0A0A0A; color: #fff; padding: 40px; text-align: center;">
            <h2>GitLab OAuth Not Configured</h2>
            <p style="color: #A1A1AA;">Please configure GITLAB_CLIENT_ID and GITLAB_CLIENT_SECRET in AI Studio environment variables.</p>
            <p>Callback URL: <code>${redirectUri}</code></p>
          </body>
        </html>
      `);
    }

    const state = await createOAuthState('gitlab', req.user.uid, redirectUri);
    if (!state) return res.status(503).send('OAuth state storage is unavailable. Check Firebase Admin credentials and Firestore access.');

    const scopes = 'read_user read_repository';
    const authUrl = `https://gitlab.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}`;
    return res.redirect(authUrl);
  }

  res.status(400).send(`Provider ${provider} is not supported.`);
});

// Helper for sending popup response HTML
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!);
}

function renderPopupResponse(res: Response, success: boolean, payload: { provider: string; accountName?: string; error?: string }, targetOrigin = '') {
  const safePayload = JSON.stringify({
    type: success ? 'OAUTH_AUTH_SUCCESS' : 'OAUTH_AUTH_ERROR',
    ...payload
  }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

  const title = success ? 'Connected Successfully' : 'Authentication Error';
  const message = success
    ? `Successfully connected ${escapeHtml(payload.accountName || payload.provider)}. This window will close automatically.`
    : `Error: ${escapeHtml(payload.error || 'Authorization failed')}. This window will close automatically.`;
  const safeOrigin = (() => {
    try { return new URL(targetOrigin).origin; } catch { return ''; }
  })();

  res.send(`<!DOCTYPE html>
<html>
  <head>
    <title>${title}</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background: #0A0A0A;
        color: #EDEDED;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        margin: 0;
      }
      .card {
        background: #141414;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 24px;
        text-align: center;
        max-width: 380px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
      }
      h2 { margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: ${success ? '#4ADE80' : '#F87171'}; }
      p { margin: 0 0 16px 0; color: #A1A1AA; font-size: 13px; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>${title}</h2>
      <p>${message}</p>
    </div>
    <script>
      (function() {
        var payload = ${safePayload};
        if (window.opener) {
          if (${JSON.stringify(safeOrigin)}) {
            window.opener.postMessage(payload, ${JSON.stringify(safeOrigin)});
          }
          setTimeout(function() {
            window.close();
          }, 800);
        } else {
          setTimeout(function() {
          window.location.href = '/integrations';
          }, 1200);
        }
      })();
    </script>
  </body>
</html>`);
}

// 5. OAuth Callback Handler (Validates CSRF state, exchanges code on server, stores tokens safely)
integrationsRouter.get(['/:provider/callback', '/:provider/callback/'], async (req: Request, res: Response) => {
  const { provider } = req.params;
  const { code, state, error, error_description } = req.query;

  if (!state) {
    return renderPopupResponse(res, false, { provider, error: 'Missing code or state parameter.' });
  }

  // Validate state
  let stateRecord: OAuthStateRecord | null;
  try {
    stateRecord = await consumeOAuthState(String(state));
  } catch (storeError: any) {
    console.error('[OAuth] Could not verify state from Firestore:', storeError?.message || storeError);
    return renderPopupResponse(res, false, { provider, error: 'OAuth state storage is unavailable. Please retry after the service is restored.' });
  }
  if (!stateRecord || stateRecord.provider !== provider) {
    console.warn(`[OAuth][${provider}] Invalid or expired state token.`);
    return renderPopupResponse(res, false, { provider, error: 'Invalid or expired state parameter. Please try again.' });
  }
  const callbackOrigin = new URL(stateRecord.redirectUri).origin;

  // Validate and consume state even when the user denies the provider request.
  if (error) {
    const errorMsg = String(error_description || error || 'Authorization was cancelled by user').slice(0, 500);
    console.warn(`[OAuth][${provider}] Provider returned an authorization error.`);
    return renderPopupResponse(res, false, { provider, error: errorMsg }, callbackOrigin);
  }
  if (!code) {
    return renderPopupResponse(res, false, { provider, error: 'Missing authorization code.' }, callbackOrigin);
  }

  try {
    if (provider === 'github') {
      const clientId = process.env.GITHUB_CLIENT_ID!;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET!;

      // Exchange code for access token on server
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'FLOAT-AI'
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code: String(code),
          redirect_uri: stateRecord.redirectUri
        }),
        signal: AbortSignal.timeout(15_000)
      });

      if (!tokenRes.ok) {
        throw new Error(`GitHub token exchange failed: HTTP ${tokenRes.status}`);
      }

      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        throw new Error(tokenData.error_description || tokenData.error);
      }

      const accessToken = tokenData.access_token;
      if (!accessToken) {
        throw new Error('No access_token returned by GitHub');
      }

      // Fetch user profile from GitHub API
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'FLOAT-AI'
        },
        signal: AbortSignal.timeout(15_000)
      });

      if (!userRes.ok) {
        throw new Error(`Failed to fetch GitHub user: HTTP ${userRes.status}`);
      }

      const githubUser = await userRes.json();
      const accountName = githubUser.login || githubUser.name || 'GitHub User';

      // Upsert connection record for user
      const existingConnection = await getIntegrationConnection(stateRecord.userId, 'github');

      const connectionRecord: StoredIntegrationConnection = {
        id: existingConnection?.id || uuidv4(),
        userId: stateRecord.userId,
        provider: 'github',
        status: 'connected',
        accountId: String(githubUser.id),
        accountName,
        avatarUrl: githubUser.avatar_url,
        profileUrl: githubUser.html_url,
        scopes: tokenData.scope ? tokenData.scope.split(/[\s,]+/) : ['read:user', 'repo'],
        accessToken, // NEVER sent to frontend
        createdAt: existingConnection?.createdAt || Date.now(),
        lastVerifiedAt: Date.now()
      };

      await saveIntegrationConnection(connectionRecord);

      return renderPopupResponse(res, true, { provider: 'github', accountName }, callbackOrigin);
    }

    if (provider === 'gitlab') {
      const clientId = process.env.GITLAB_CLIENT_ID!;
      const clientSecret = process.env.GITLAB_CLIENT_SECRET!;

      // Exchange code for token on server
      const tokenRes = await fetch('https://gitlab.com/oauth/token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code: String(code),
          grant_type: 'authorization_code',
          redirect_uri: stateRecord.redirectUri
        }),
        signal: AbortSignal.timeout(15_000)
      });

      if (!tokenRes.ok) {
        throw new Error(`GitLab token exchange failed: HTTP ${tokenRes.status}`);
      }

      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        throw new Error(tokenData.error_description || tokenData.error);
      }

      const accessToken = tokenData.access_token;
      if (!accessToken) {
        throw new Error('No access_token returned by GitLab');
      }

      // Fetch user profile from GitLab API
      const userRes = await fetch('https://gitlab.com/api/v4/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        signal: AbortSignal.timeout(15_000)
      });

      if (!userRes.ok) {
        throw new Error(`Failed to fetch GitLab user: HTTP ${userRes.status}`);
      }

      const gitlabUser = await userRes.json();
      const accountName = gitlabUser.username || gitlabUser.name || 'GitLab User';

      const existingConnection = await getIntegrationConnection(stateRecord.userId, 'gitlab');

      const connectionRecord: StoredIntegrationConnection = {
        id: existingConnection?.id || uuidv4(),
        userId: stateRecord.userId,
        provider: 'gitlab',
        status: 'connected',
        accountId: String(gitlabUser.id),
        accountName,
        avatarUrl: gitlabUser.avatar_url,
        profileUrl: gitlabUser.web_url,
        scopes: tokenData.scope ? tokenData.scope.split(/[\s,]+/) : ['read_user', 'read_repository'],
        accessToken, // NEVER sent to frontend
        refreshToken: tokenData.refresh_token,
        tokenExpiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined,
        createdAt: existingConnection?.createdAt || Date.now(),
        lastVerifiedAt: Date.now()
      };

      await saveIntegrationConnection(connectionRecord);

      return renderPopupResponse(res, true, { provider: 'gitlab', accountName }, callbackOrigin);
    }

    return renderPopupResponse(res, false, { provider, error: `Unsupported provider ${provider}` }, callbackOrigin);
  } catch (err: any) {
    console.error(`[OAuth][${provider}] Exchange failure:`, err.message);
    return renderPopupResponse(res, false, { provider, error: (err.message || 'Token exchange failed').slice(0, 500) }, callbackOrigin);
  }
});

// Download a repository archive through the user's GitHub connection. The access token
// stays on the server; the client receives only the repository archive.
integrationsRouter.get('/github/repositories/:owner/:repo/archive', requireAuth, async (req: any, res: Response) => {
  const owner = String(req.params.owner || '');
  const repo = String(req.params.repo || '');
  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim() : '';
  if (!/^[\w.-]{1,100}$/.test(owner) || !/^[\w.-]{1,100}$/.test(repo) || ref.length > 200 || ref.includes('..')) {
    return res.status(400).json({ error: 'Invalid repository or branch name.' });
  }

  let connection: StoredIntegrationConnection | null;
  try {
    connection = await getIntegrationConnection(req.user.uid, 'github');
  } catch (error: any) {
    console.error('[Integration Store] Could not load GitHub connection:', error?.message || error);
    return res.status(503).json({ error: 'GitHub connection storage is unavailable. Check Firebase Admin credentials and Firestore access.' });
  }
  if (!connection || connection.status !== 'connected' || !connection.accessToken) {
    return res.status(404).json({ error: 'Connect GitHub in Integrations to import private repositories.' });
  }

  try {
    const encodedRef = ref ? `/${ref.split('/').map((part) => encodeURIComponent(part)).join('/')}` : '';
    const path = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/zipball${encodedRef}`;
    const upstream = await fetch(path, {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'FLOAT-AI',
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (upstream.status === 401) {
      connection.status = 'expired';
      await saveIntegrationConnection(connection);
      return res.status(401).json({ error: 'GitHub authorization expired. Reconnect GitHub and try again.' });
    }
    if (upstream.status === 404) {
      return res.status(404).json({ error: 'Repository or branch was not found, or this GitHub account cannot access it.' });
    }
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: `GitHub archive request failed (HTTP ${upstream.status}).` });
    }

    const maxBytes = 20 * 1024 * 1024;
    const contentLength = Number(upstream.headers.get('content-length') || 0);
    if (contentLength > maxBytes) {
      await upstream.body.cancel();
      return res.status(413).json({ error: 'Repository archive exceeds the 20 MB import limit.' });
    }

    const reader = upstream.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return res.status(413).json({ error: 'Repository archive exceeds the 20 MB import limit.' });
      }
      chunks.push(Buffer.from(value));
    }

    connection.lastVerifiedAt = Date.now();
    await saveIntegrationConnection(connection);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(Buffer.concat(chunks, size));
  } catch (error: any) {
    console.error('[Integrations][github] Archive import failed:', error?.message || error);
    res.status(502).json({ error: 'Could not download this GitHub repository archive.' });
  }
});

// 5b. Dedicated Repository Import into FLOAT Project
// Atomically downloads repository archive, builds file hierarchy, creates/updates Firestore project,
// and initializes projectGitLinks baseline tracking.
integrationsRouter.post('/github/import', requireAuth, async (req: any, res: Response) => {
  const owner = String(req.body?.owner || '').trim();
  const repo = String(req.body?.repo || '').trim();
  const requestedBranch = String(req.body?.branch || '').trim();
  const customProjectName = typeof req.body?.projectName === 'string' ? req.body.projectName.trim() : '';

  if (!/^[\w.-]{1,100}$/.test(owner) || !/^[\w.-]{1,100}$/.test(repo)) {
    return res.status(400).json({ error: 'Invalid repository owner or name.' });
  }

  let connection: StoredIntegrationConnection | null;
  try {
    connection = await getIntegrationConnection(req.user.uid, 'github');
  } catch (error: any) {
    console.error('[Integration Store] Could not load GitHub connection:', error?.message || error);
    return res.status(503).json({ error: 'GitHub connection storage is unavailable.' });
  }

  if (!connection || connection.status !== 'connected' || !connection.accessToken) {
    return res.status(404).json({ error: 'Connect GitHub in Integrations before importing repositories.' });
  }

  try {
    // 1. Fetch repository metadata to determine default branch and permissions
    const repoRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'FLOAT-AI'
      },
      signal: AbortSignal.timeout(15_000)
    });

    if (repoRes.status === 401) {
      connection.status = 'expired';
      await saveIntegrationConnection(connection);
      return res.status(401).json({ error: 'GitHub authorization expired. Reconnect GitHub and try again.' });
    }
    if (repoRes.status === 404) {
      return res.status(404).json({ error: 'Repository was not found or your GitHub account cannot access it.' });
    }
    if (!repoRes.ok) {
      return res.status(repoRes.status >= 500 ? 502 : repoRes.status).json({ error: 'Failed to fetch repository metadata from GitHub.' });
    }

    const repoData = await repoRes.json();
    const branch = requestedBranch || repoData.default_branch || 'main';

    // 2. Prevent duplicate import: Check if user already has a project linked to this exact repo & branch
    const existingLinksSnap = await adminDb.collection('projectGitLinks')
      .where('ownerId', '==', req.user.uid)
      .where('repositoryOwner', '==', owner)
      .where('repositoryName', '==', repo)
      .limit(1)
      .get();

    if (!existingLinksSnap.empty) {
      const existingDoc = existingLinksSnap.docs[0];
      const existingProjectId = existingDoc.id;
      // Check that project still exists
      const existingProjectSnap = await adminDb.collection('projects').doc(existingProjectId).get();
      if (existingProjectSnap.exists && existingProjectSnap.data()?.ownerId === req.user.uid) {
        return res.json({
          success: true,
          projectId: existingProjectId,
          projectName: existingProjectSnap.data()?.name || repo,
          isExisting: true,
          message: `Repository ${owner}/${repo} is already imported in project "${existingProjectSnap.data()?.name || repo}".`
        });
      }
    }

    // 3. Resolve commit SHA for the branch
    const refPath = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`;
    const refRes = await fetch(refPath, {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'FLOAT-AI'
      },
      signal: AbortSignal.timeout(15_000)
    });

    if (!refRes.ok) {
      return res.status(refRes.status >= 500 ? 502 : refRes.status).json({ error: `Could not resolve branch "${branch}" on GitHub.` });
    }
    const refData = await refRes.json();
    const baseSha = String(refData.object?.sha || '');

    // 4. Download repository zipball
    const zipUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/zipball/${encodeURIComponent(baseSha)}`;
    const zipRes = await fetch(zipUrl, {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'FLOAT-AI'
      },
      signal: AbortSignal.timeout(30_000)
    });

    if (!zipRes.ok) {
      return res.status(zipRes.status >= 500 ? 502 : zipRes.status).json({ error: `Failed to download repository archive (HTTP ${zipRes.status}).` });
    }

    const archiveBuffer = Buffer.from(await zipRes.arrayBuffer());
    if (archiveBuffer.byteLength > 20 * 1024 * 1024) {
      return res.status(413).json({ error: 'Repository archive exceeds the 20 MB import limit.' });
    }

    const zip = await JSZip.loadAsync(archiveBuffer);
    const entries = Object.values(zip.files).filter(entry => !entry.dir);
    const stripTop = entries.length > 0 && entries.every(entry => entry.name.includes('/')) && new Set(entries.map(entry => entry.name.split('/')[0])).size === 1;

    const PRIVATE_PATH = /(^|\/)(\.env(?:$|[./])|\.git(?:$|\/)|id_rsa(?:$|\.)|id_ed25519(?:$|\.))|\.(pem|key|p12|pfx|keystore)$/i;
    const OMIT_DIR = /(^|\/)(node_modules|vendor|dist|build|coverage|\.next|\.cache|\.venv|venv)(\/|$)/i;
    const BINARY_EXTENSION = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|eot|mp[34]|mov|wasm|exe|dll|so|dylib|bin|lockb)$/i;
    const MAX_FILES = 500;
    const MAX_WORKSPACE_BYTES = 10 * 1024 * 1024;

    const fileMap = new Map<string, string>();
    const baseFilesMap: Record<string, { sha: string; mode: string }> = {};
    let totalBytes = 0;

    for (const entry of entries) {
      const raw = stripTop ? entry.name.split('/').slice(1).join('/') : entry.name;
      const normalized = raw.replace(/\\/g, '/');
      if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.includes('\0')) continue;
      if (normalized.split('/').some(p => !p || p === '.' || p === '..')) continue;
      if (PRIVATE_PATH.test(normalized) || OMIT_DIR.test(normalized) || BINARY_EXTENSION.test(normalized)) continue;

      if (fileMap.size >= MAX_FILES) break;
      const content = await entry.async('string');
      if (content.includes('\0')) continue;

      const size = Buffer.byteLength(content, 'utf8');
      if (totalBytes + size > MAX_WORKSPACE_BYTES) break;

      totalBytes += size;
      fileMap.set(normalized, content);

      // Compute Git blob sha for baseline change tracking
      const blobBytes = Buffer.from(content, 'utf8');
      const blobSha = crypto.createHash('sha1').update('blob ' + blobBytes.length + '\0').update(blobBytes).digest('hex');
      baseFilesMap[normalized] = { sha: blobSha, mode: '100644' };
    }

    if (fileMap.size === 0) {
      return res.status(400).json({ error: 'No importable text files found in this repository.' });
    }

    // Build hierarchical FileNode tree
    const rootNodes: any[] = [];
    const sortedPaths = [...fileMap.keys()].sort((a, b) => a.localeCompare(b));
    for (const filePath of sortedPaths) {
      const content = fileMap.get(filePath) || '';
      const segments = filePath.split('/');
      let currentLevel = rootNodes;
      for (let i = 0; i < segments.length; i++) {
        const name = segments[i];
        const isFile = i === segments.length - 1;
        let existing = currentLevel.find(n => n.name === name && n.type === (isFile ? 'file' : 'folder'));
        if (!existing) {
          existing = isFile
            ? { id: `file-${uuidv4()}`, name, type: 'file', content }
            : { id: `folder-${uuidv4()}`, name, type: 'folder', children: [], isOpen: true };
          currentLevel.push(existing);
        } else if (isFile) {
          existing.content = content;
        }
        if (!isFile) {
          existing.children = existing.children || [];
          currentLevel = existing.children;
        }
      }
    }

    const newProjectId = uuidv4();
    const projectName = customProjectName || repo;
    const now = Date.now();

    // Persist project & Git baseline in Firestore transaction
    const projectRef = adminDb.collection('projects').doc(newProjectId);
    const linkRef = adminDb.collection('projectGitLinks').doc(newProjectId);

    await adminDb.runTransaction(async (transaction) => {
      transaction.set(projectRef, {
        ownerId: req.user.uid,
        name: projectName,
        files: JSON.stringify(rootNodes),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      transaction.set(linkRef, {
        ownerId: req.user.uid,
        repositoryOwner: owner,
        repositoryName: repo,
        defaultBranch: repoData.default_branch || 'main',
        branch,
        baseSha,
        baseFiles: baseFilesMap,
        updatedAt: now
      });
    });

    connection.lastVerifiedAt = now;
    await saveIntegrationConnection(connection);

    return res.json({
      success: true,
      projectId: newProjectId,
      projectName,
      repository: {
        fullName: `${owner}/${repo}`,
        branch,
        defaultBranch: repoData.default_branch || 'main',
        fileCount: fileMap.size
      },
      message: `Successfully imported ${owner}/${repo} into project "${projectName}".`
    });
  } catch (err: any) {
    console.error('[Integrations][github] Import error:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Failed to import repository.' });
  }
});

// 6. Real Repositories API Endpoint (Retrieves actual repos via authorized provider token)
integrationsRouter.get('/:provider/repositories', requireAuth, async (req: any, res: Response) => {
  const { provider } = req.params;
  const userId = req.user.uid;

  let connection: StoredIntegrationConnection | null;
  try {
    connection = await getIntegrationConnection(userId, provider);
  } catch (error: any) {
    console.error('[Integration Store] Could not load provider connection:', error?.message || error);
    return res.status(503).json({ error: 'Integration storage is unavailable. Check Firebase Admin credentials and Firestore access.' });
  }
  if (!connection || connection.status !== 'connected' || !connection.accessToken) {
    return res.status(404).json({
      error: `No active ${provider} connection found for this account. Please connect your account first.`
    });
  }

  try {
    if (provider === 'github') {
      const repoRes = await fetch('https://api.github.com/user/repos?sort=updated&per_page=30&affiliation=owner,collaborator', {
        headers: {
          'Authorization': `Bearer ${connection.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'FLOAT-AI'
        },
        signal: AbortSignal.timeout(15_000)
      });

      if (repoRes.status === 401) {
        connection.status = 'expired';
        await saveIntegrationConnection(connection);
        return res.status(401).json({
          error: 'GitHub authorization token has expired or was revoked. Please reconnect your account.'
        });
      }

      if (!repoRes.ok) {
        throw new Error(`GitHub API error: HTTP ${repoRes.status}`);
      }

      const repos = await repoRes.json();
      const formatted = Array.isArray(repos) ? repos.map((r: any) => ({
        id: String(r.id),
        name: r.name,
        fullName: r.full_name,
        private: !!r.private,
        description: r.description || '',
        htmlUrl: r.html_url,
        defaultBranch: r.default_branch || 'main',
        updatedAt: r.updated_at,
        language: r.language || 'Unknown'
      })) : [];

      connection.lastVerifiedAt = Date.now();
      await saveIntegrationConnection(connection);

      return res.json({
        success: true,
        accountName: connection.accountName,
        repositories: formatted
      });
    }

    if (provider === 'gitlab') {
      const repoRes = await fetch('https://gitlab.com/api/v4/projects?membership=true&order_by=updated_at&per_page=30', {
        headers: {
          'Authorization': `Bearer ${connection.accessToken}`
        },
        signal: AbortSignal.timeout(15_000)
      });

      if (repoRes.status === 401) {
        connection.status = 'expired';
        await saveIntegrationConnection(connection);
        return res.status(401).json({
          error: 'GitLab authorization token has expired or was revoked. Please reconnect your account.'
        });
      }

      if (!repoRes.ok) {
        throw new Error(`GitLab API error: HTTP ${repoRes.status}`);
      }

      const projects = await repoRes.json();
      const formatted = Array.isArray(projects) ? projects.map((p: any) => ({
        id: String(p.id),
        name: p.name,
        fullName: p.path_with_namespace,
        private: p.visibility !== 'public',
        description: p.description || '',
        htmlUrl: p.web_url,
        defaultBranch: p.default_branch || 'main',
        updatedAt: p.last_activity_at,
        language: 'GitLab'
      })) : [];

      connection.lastVerifiedAt = Date.now();
      await saveIntegrationConnection(connection);

      return res.json({
        success: true,
        accountName: connection.accountName,
        repositories: formatted
      });
    }

    return res.status(400).json({ error: `Unsupported provider: ${provider}` });
  } catch (err: any) {
    console.error(`[Integrations][${provider}] Repositories fetch error:`, err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch repositories from provider' });
  }
});

// 7. Disconnect Integration
integrationsRouter.post('/disconnect/:id', requireAuth, async (req: any, res: Response) => {
  const { id } = req.params;
  const userId = req.user.uid;
  try {
    const removed = await deleteIntegrationConnection(userId, id);
    if (removed) {
    console.log(`[Integrations] Disconnected ${removed.provider} for user ${userId}`);
      return res.json({ success: true, provider: removed.provider });
    }
    res.status(404).json({ error: 'Connection not found or unauthorized.' });
  } catch (error: any) {
    console.error('[Integration Store] Could not disconnect provider:', error?.message || error);
    res.status(503).json({ error: 'Integration storage is unavailable. Check Firebase Admin credentials and Firestore access.' });
  }
});
