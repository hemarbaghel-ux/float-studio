import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import fs from 'fs';
import { requireAuth, verifyFirebaseIdToken } from './authMiddleware';

export const integrationsRouter = Router();

// Connection schema for server storage
export interface StoredIntegrationConnection {
  id: string;
  userId: string;
  provider: 'github' | 'gitlab' | string;
  status: 'connected' | 'error' | 'expired';
  accountId: string;
  accountName: string;
  avatarUrl?: string;
  profileUrl?: string;
  scopes: string[];
  accessToken: string; // Strictly server-side only; never returned in API responses
  refreshToken?: string;
  tokenExpiresAt?: number;
  createdAt: number;
  lastVerifiedAt: number;
}

// State parameter record for CSRF protection and session binding
interface OAuthStateRecord {
  state: string;
  provider: 'github' | 'gitlab';
  userId: string;
  redirectUri: string;
  createdAt: number;
  expiresAt: number;
}

// In-memory state store with 10-minute expiration
const oauthStates = new Map<string, OAuthStateRecord>();

// Clean expired states periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of oauthStates.entries()) {
    if (val.expiresAt < now) {
      oauthStates.delete(key);
    }
  }
}, 60 * 1000);

// Persistence store for connection records across dev server restarts
const STORE_FILE = '/tmp/float_integrations_store.json';

function loadConnections(): StoredIntegrationConnection[] {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = fs.readFileSync(STORE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[Integration Store] Failed to load store file:', err);
  }
  return [];
}

function saveConnections(records: StoredIntegrationConnection[]) {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(records, null, 2), 'utf8');
  } catch (err) {
    console.error('[Integration Store] Failed to save store file:', err);
  }
}

let connections: StoredIntegrationConnection[] = loadConnections();

// Base App URL resolver: accurately derives domain from request, client origin, or environment
export function getBaseAppUrl(req?: Request): string {
  // 1. Explicit client-supplied origin (from browser window.location.origin)
  if (req?.query?.origin && typeof req.query.origin === 'string') {
    try {
      const parsed = new URL(req.query.origin);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin.replace(/\/+$/, '');
      }
    } catch {}
  }

  // 2. Client browser headers (Origin or Referer)
  if (req) {
    const originHeader = req.headers.origin;
    if (typeof originHeader === 'string' && (originHeader.startsWith('http://') || originHeader.startsWith('https://'))) {
      try {
        return new URL(originHeader).origin.replace(/\/+$/, '');
      } catch {}
    }

    const refererHeader = req.headers.referer;
    if (typeof refererHeader === 'string' && (refererHeader.startsWith('http://') || refererHeader.startsWith('https://'))) {
      try {
        return new URL(refererHeader).origin.replace(/\/+$/, '');
      } catch {}
    }

    // 3. Host / X-Forwarded-Host from reverse proxy
    const forwardedHost = req.headers['x-forwarded-host'];
    const hostHeader = (forwardedHost || req.headers.host);
    if (hostHeader && typeof hostHeader === 'string') {
      const host = hostHeader.split(',')[0].trim();
      const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
      return `${proto}://${host}`.replace(/\/+$/, '');
    }
  }

  // 4. Fallback to process.env.APP_URL
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/+$/, '');
  }

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

  // Allow client override via query param if valid URL
  if (req?.query?.redirect_uri && typeof req.query.redirect_uri === 'string') {
    try {
      const parsed = new URL(req.query.redirect_uri);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href.replace(/\/+$/, '');
      }
    } catch {}
  }

  const base = getBaseAppUrl(req);
  return `${base}/api/integrations/${provider}/callback`;
}

// Provider configuration checker
export const getConfiguredProviders = () => {
  const configured: string[] = [];
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) configured.push('github');
  if (process.env.GITLAB_CLIENT_ID && process.env.GITLAB_CLIENT_SECRET) configured.push('gitlab');
  if (process.env.BITBUCKET_CLIENT_ID && process.env.BITBUCKET_CLIENT_SECRET) configured.push('bitbucket');
  if (process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET) configured.push('slack');
  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) configured.push('teams');
  if (process.env.LINEAR_CLIENT_ID && process.env.LINEAR_CLIENT_SECRET) configured.push('linear');
  if (process.env.JIRA_CLIENT_ID && process.env.JIRA_CLIENT_SECRET) configured.push('jira');
  if (process.env.SENTRY_CLIENT_ID && process.env.SENTRY_CLIENT_SECRET) configured.push('sentry');
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
integrationsRouter.get('/connections', requireAuth, (req: any, res: Response) => {
  const userId = req.user.uid;
  const userConnections = connections
    .filter(c => c.userId === userId)
    .map(({ id, provider, status, accountId, accountName, avatarUrl, profileUrl, scopes, createdAt, lastVerifiedAt }) => ({
      id,
      provider,
      status,
      accountId,
      accountName,
      avatarUrl,
      profileUrl,
      scopes,
      createdAt,
      lastVerifiedAt
    }));

  res.json({ connections: userConnections });
});

// 3. Generate OAuth Authorization URL with CSRF state
integrationsRouter.get('/:provider/auth-url', async (req: Request, res: Response) => {
  const { provider } = req.params;
  const base = getBaseAppUrl(req);
  const redirectUri = getCallbackUrl(provider, req);

  // Extract user identity if token supplied
  let userId = 'anonymous';
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const verified = await verifyFirebaseIdToken(token);
    if (verified) {
      userId = verified.uid;
    }
  }

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

    const state = crypto.randomBytes(24).toString('hex');
    oauthStates.set(state, {
      state,
      provider: 'github',
      userId,
      redirectUri,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

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

    const state = crypto.randomBytes(24).toString('hex');
    oauthStates.set(state, {
      state,
      provider: 'gitlab',
      userId,
      redirectUri,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

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
integrationsRouter.get('/:provider/connect', async (req: Request, res: Response) => {
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

    const state = crypto.randomBytes(24).toString('hex');
    oauthStates.set(state, {
      state,
      provider: 'github',
      userId: 'direct-connect',
      redirectUri,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000
    });

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

    const state = crypto.randomBytes(24).toString('hex');
    oauthStates.set(state, {
      state,
      provider: 'gitlab',
      userId: 'direct-connect',
      redirectUri,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    const scopes = 'read_user read_repository';
    const authUrl = `https://gitlab.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}`;
    return res.redirect(authUrl);
  }

  res.status(400).send(`Provider ${provider} is not supported.`);
});

// Helper for sending popup response HTML
function renderPopupResponse(res: Response, success: boolean, payload: { provider: string; accountName?: string; error?: string }) {
  const safePayload = JSON.stringify({
    type: success ? 'OAUTH_AUTH_SUCCESS' : 'OAUTH_AUTH_ERROR',
    ...payload
  });

  const title = success ? 'Connected Successfully' : 'Authentication Error';
  const message = success
    ? `Successfully connected ${payload.accountName || payload.provider}. This window will close automatically.`
    : `Error: ${payload.error || 'Authorization failed'}. This window will close automatically.`;

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
          window.opener.postMessage(payload, '*');
          setTimeout(function() {
            window.close();
          }, 800);
        } else {
          setTimeout(function() {
            window.location.href = '/?tab=integrations';
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

  // Handle provider denied/cancelled error
  if (error) {
    const errorMsg = String(error_description || error || 'Authorization was cancelled by user');
    console.warn(`[OAuth][${provider}] Provider returned error:`, errorMsg);
    return renderPopupResponse(res, false, { provider, error: errorMsg });
  }

  if (!code || !state) {
    return renderPopupResponse(res, false, { provider, error: 'Missing code or state parameter.' });
  }

  // Validate state
  const stateRecord = oauthStates.get(String(state));
  if (!stateRecord || stateRecord.expiresAt < Date.now()) {
    console.warn(`[OAuth][${provider}] Invalid or expired state token.`);
    return renderPopupResponse(res, false, { provider, error: 'Invalid or expired state parameter. Please try again.' });
  }

  // Remove used state to prevent replay
  oauthStates.delete(String(state));

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
        })
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
        }
      });

      if (!userRes.ok) {
        throw new Error(`Failed to fetch GitHub user: HTTP ${userRes.status}`);
      }

      const githubUser = await userRes.json();
      const accountName = githubUser.login || githubUser.name || 'GitHub User';

      // Upsert connection record for user
      const existingIdx = connections.findIndex(
        c => c.provider === 'github' && (c.userId === stateRecord.userId || c.accountId === String(githubUser.id))
      );

      const connectionRecord: StoredIntegrationConnection = {
        id: existingIdx >= 0 ? connections[existingIdx].id : uuidv4(),
        userId: stateRecord.userId,
        provider: 'github',
        status: 'connected',
        accountId: String(githubUser.id),
        accountName,
        avatarUrl: githubUser.avatar_url,
        profileUrl: githubUser.html_url,
        scopes: tokenData.scope ? tokenData.scope.split(/[\s,]+/) : ['read:user', 'repo'],
        accessToken, // NEVER sent to frontend
        createdAt: existingIdx >= 0 ? connections[existingIdx].createdAt : Date.now(),
        lastVerifiedAt: Date.now()
      };

      if (existingIdx >= 0) {
        connections[existingIdx] = connectionRecord;
      } else {
        connections.push(connectionRecord);
      }
      saveConnections(connections);

      return renderPopupResponse(res, true, { provider: 'github', accountName });
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
        })
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
        }
      });

      if (!userRes.ok) {
        throw new Error(`Failed to fetch GitLab user: HTTP ${userRes.status}`);
      }

      const gitlabUser = await userRes.json();
      const accountName = gitlabUser.username || gitlabUser.name || 'GitLab User';

      const existingIdx = connections.findIndex(
        c => c.provider === 'gitlab' && (c.userId === stateRecord.userId || c.accountId === String(gitlabUser.id))
      );

      const connectionRecord: StoredIntegrationConnection = {
        id: existingIdx >= 0 ? connections[existingIdx].id : uuidv4(),
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
        createdAt: existingIdx >= 0 ? connections[existingIdx].createdAt : Date.now(),
        lastVerifiedAt: Date.now()
      };

      if (existingIdx >= 0) {
        connections[existingIdx] = connectionRecord;
      } else {
        connections.push(connectionRecord);
      }
      saveConnections(connections);

      return renderPopupResponse(res, true, { provider: 'gitlab', accountName });
    }

    return renderPopupResponse(res, false, { provider, error: `Unsupported provider ${provider}` });
  } catch (err: any) {
    console.error(`[OAuth][${provider}] Exchange failure:`, err.message);
    return renderPopupResponse(res, false, { provider, error: err.message || 'Token exchange failed' });
  }
});

// 6. Real Repositories API Endpoint (Retrieves actual repos via authorized provider token)
integrationsRouter.get('/:provider/repositories', requireAuth, async (req: any, res: Response) => {
  const { provider } = req.params;
  const userId = req.user.uid;

  // Find user-owned connection
  const connection = connections.find(c => c.provider === provider && (c.userId === userId || c.userId === 'anonymous' || c.userId === 'direct-connect'));
  if (!connection || connection.status !== 'connected' || !connection.accessToken) {
    return res.status(404).json({
      error: `No active ${provider} connection found for this account. Please connect your account first.`
    });
  }

  // Associate anonymous/pending connection with authenticated user ID
  if (connection.userId !== userId) {
    connection.userId = userId;
    saveConnections(connections);
  }

  try {
    if (provider === 'github') {
      const repoRes = await fetch('https://api.github.com/user/repos?sort=updated&per_page=30&affiliation=owner,collaborator', {
        headers: {
          'Authorization': `Bearer ${connection.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'FLOAT-AI'
        }
      });

      if (repoRes.status === 401) {
        connection.status = 'expired';
        saveConnections(connections);
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
      saveConnections(connections);

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
        }
      });

      if (repoRes.status === 401) {
        connection.status = 'expired';
        saveConnections(connections);
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
      saveConnections(connections);

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
integrationsRouter.post('/disconnect/:id', requireAuth, (req: any, res: Response) => {
  const { id } = req.params;
  const userId = req.user.uid;

  const index = connections.findIndex(c => c.id === id && (c.userId === userId || c.userId === 'anonymous' || c.userId === 'direct-connect'));
  if (index !== -1) {
    const removed = connections.splice(index, 1)[0];
    saveConnections(connections);
    console.log(`[Integrations] Disconnected ${removed.provider} for user ${userId}`);
    res.json({ success: true, provider: removed.provider });
  } else {
    res.status(404).json({ error: 'Connection not found or unauthorized.' });
  }
});
