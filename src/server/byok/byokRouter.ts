/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../authMiddleware';
import { defaultUserKeyVault, ByokProviderId, UserKeyVaultService } from './userKeyVault';

export interface AuthenticatedUserRequest extends Request {
  user?: { uid: string; email?: string };
  userApiKeys?: Record<string, string>;
}

export function createByokRouter(vault: UserKeyVaultService = defaultUserKeyVault): Router {
  const router = Router();

  // 1. Get user's configured keys (Masked summaries only)
  router.get('/keys', requireAuth, async (req: AuthenticatedUserRequest, res: Response) => {
    try {
      const userId = req.user!.uid;
      const keys = await vault.getUserKeySummary(userId);
      res.json({ success: true, keys });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve user API keys', details: err?.message || String(err) });
    }
  });

  // 2. Validate key without saving (Live test button in UI)
  router.post('/keys/validate', requireAuth, async (req: AuthenticatedUserRequest, res: Response) => {
    try {
      const { provider, apiKey } = req.body || {};
      if (!provider || !apiKey) {
        return res.status(400).json({ error: 'Provider and apiKey are required.' });
      }

      const validProviders: ByokProviderId[] = ['openai', 'anthropic', 'google', 'deepseek', 'xai'];
      if (!validProviders.includes(provider as ByokProviderId)) {
        return res.status(400).json({ error: `Unsupported provider: ${provider}` });
      }

      const result = await vault.validateProviderKey(provider as ByokProviderId, apiKey);
      if (!result.valid) {
        return res.status(400).json({ success: false, ...result });
      }

      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: 'Key validation failed', details: err?.message || String(err) });
    }
  });

  // 3. Save / Update User API Key
  router.post('/keys', requireAuth, async (req: AuthenticatedUserRequest, res: Response) => {
    try {
      const userId = req.user!.uid;
      const { provider, apiKey } = req.body || {};

      if (!provider || !apiKey) {
        return res.status(400).json({ error: 'Provider and apiKey are required.' });
      }

      const validProviders: ByokProviderId[] = ['openai', 'anthropic', 'google', 'deepseek', 'xai'];
      if (!validProviders.includes(provider as ByokProviderId)) {
        return res.status(400).json({ error: `Unsupported provider: ${provider}` });
      }

      // Validate key first
      const validation = await vault.validateProviderKey(provider as ByokProviderId, apiKey);
      if (!validation.valid) {
        return res.status(400).json({
          error: `API key validation failed for ${provider}: ${validation.error || 'Invalid credentials'}`,
          details: validation.error,
        });
      }

      const saved = await vault.saveUserKey(
        userId,
        provider as ByokProviderId,
        apiKey,
        validation.accessibleModels
      );

      res.json({ success: true, key: saved });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to save API key', details: err?.message || String(err) });
    }
  });

  // 4. Delete User API Key
  router.delete('/keys/:provider', requireAuth, async (req: AuthenticatedUserRequest, res: Response) => {
    try {
      const userId = req.user!.uid;
      const { provider } = req.params;

      await vault.deleteUserKey(userId, provider as ByokProviderId);
      res.json({ success: true, message: `Removed API key for ${provider}` });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to delete API key', details: err?.message || String(err) });
    }
  });

  return router;
}

/**
 * Express middleware to automatically load the user's decrypted API keys
 * and attach them to req.userApiKeys for model execution.
 */
export function createUserApiKeyMiddleware(vault: UserKeyVaultService = defaultUserKeyVault) {
  return async (req: AuthenticatedUserRequest, _res: Response, next: NextFunction) => {
    try {
      req.userApiKeys = {};

      // 1. Check custom headers (x-user-api-key-<provider>)
      const providers: ByokProviderId[] = ['openai', 'anthropic', 'google', 'deepseek', 'xai'];
      for (const p of providers) {
        const headerVal = req.headers[`x-user-api-key-${p}`];
        if (typeof headerVal === 'string' && headerVal.trim()) {
          req.userApiKeys[p] = headerVal.trim();
        }
      }

      // 2. Load stored keys from vault if user is authenticated
      if (req.user?.uid) {
        try {
          const storedKeys = await vault.getUserApiKeys(req.user.uid);
          req.userApiKeys = { ...storedKeys, ...req.userApiKeys };
        } catch (vaultErr: any) {
          (req as any).byokError = vaultErr?.message || 'Failed to decrypt user API keys.';
        }
      }

      next();
    } catch (err: any) {
      (req as any).byokError = err?.message || 'Error processing user API keys.';
      next();
    }
  };
}
