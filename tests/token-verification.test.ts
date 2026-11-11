/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import http from 'node:http';
import express from 'express';
import firebaseConfig from '../firebase-applet-config.json';
import {
  verifyFirebaseIdToken,
  requireAuth,
  setGooglePublicKeysForTests,
  setTestAuthTokenForTests,
  isFirebaseTokenTimeValid,
} from '../src/server/authMiddleware';
import { createApp } from '../src/server/app';

describe('Firebase ID Token Verification & Route Security', () => {
  let publicKeyPem: string;
  let privateKeyPem: string;
  const testKid = 'test-key-kid-001';
  const projectId = firebaseConfig.projectId;

  beforeEach(() => {
    // Generate fresh RSA 2048-bit keypair for deterministic RS256 testing
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    publicKeyPem = publicKey;
    privateKeyPem = privateKey;

    // Register public certificate with test certificate cache
    setGooglePublicKeysForTests({ [testKid]: publicKeyPem });
    setTestAuthTokenForTests(null);
  });

  afterEach(() => {
    setGooglePublicKeysForTests(null);
    setTestAuthTokenForTests(null);
  });

  function createTestJwt(payloadOverrides: Record<string, any> = {}, headerOverrides: Record<string, any> = {}): string {
    const now = Math.floor(Date.now() / 1000);
    const header = {
      alg: 'RS256',
      kid: testKid,
      typ: 'JWT',
      ...headerOverrides,
    };
    const payload = {
      iss: `https://securetoken.google.com/${projectId}`,
      aud: projectId,
      sub: 'test-user-uid-456',
      user_id: 'test-user-uid-456',
      email: 'engineer@floatstudio.dev',
      iat: now - 10,
      exp: now + 3600,
      auth_time: now - 10,
      ...payloadOverrides,
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signingInput);
    const signature = signer.sign(privateKeyPem, 'base64url');

    return `${signingInput}.${signature}`;
  }

  describe('Cryptographic Signature & Claims Verification', () => {
    it('successfully verifies a valid RS256 token and extracts user identity', async () => {
      const validToken = createTestJwt();
      const verified = await verifyFirebaseIdToken(validToken);

      expect(verified).not.toBeNull();
      expect(verified?.uid).toBe('test-user-uid-456');
      expect(verified?.email).toBe('engineer@floatstudio.dev');
    });

    it('rejects an expired token', async () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = createTestJwt({
        exp: now - 120, // Expired 2 minutes ago
        iat: now - 3600,
      });

      const verified = await verifyFirebaseIdToken(expiredToken);
      expect(verified).toBeNull();
    });

    it('rejects a tampered token where payload was modified after signing', async () => {
      const validToken = createTestJwt();
      const [h, p, sig] = validToken.split('.');

      // Alter sub in payload without re-signing
      const tamperedPayload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
      tamperedPayload.sub = 'impersonated-hacker-uid';
      tamperedPayload.user_id = 'impersonated-hacker-uid';
      const tamperedP = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url');

      const tamperedToken = `${h}.${tamperedP}.${sig}`;
      const verified = await verifyFirebaseIdToken(tamperedToken);
      expect(verified).toBeNull();
    });

    it('rejects a token signed with an untrusted or unknown private key', async () => {
      const { privateKey: rogueKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const now = Math.floor(Date.now() / 1000);
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: testKid })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        iss: `https://securetoken.google.com/${projectId}`,
        aud: projectId,
        sub: 'rogue-uid',
        user_id: 'rogue-uid',
        exp: now + 3600,
        iat: now,
      })).toString('base64url');
      const input = `${header}.${payload}`;

      const signer = crypto.createSign('RSA-SHA256');
      signer.update(input);
      const rogueSignature = signer.sign(rogueKey, 'base64url');
      const rogueToken = `${input}.${rogueSignature}`;

      const verified = await verifyFirebaseIdToken(rogueToken);
      expect(verified).toBeNull();
    });

    it('rejects insecure alg: none tokens', async () => {
      const now = Math.floor(Date.now() / 1000);
      const header = Buffer.from(JSON.stringify({ alg: 'none', kid: testKid })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        iss: `https://securetoken.google.com/${projectId}`,
        aud: projectId,
        sub: 'bypass-uid',
        user_id: 'bypass-uid',
        exp: now + 3600,
        iat: now,
      })).toString('base64url');

      const noneToken = `${header}.${payload}.`;
      const verified = await verifyFirebaseIdToken(noneToken);
      expect(verified).toBeNull();
    });

    it('rejects tokens with mismatched projectId aud or iss', async () => {
      const wrongAudToken = createTestJwt({ aud: 'different-fake-project' });
      expect(await verifyFirebaseIdToken(wrongAudToken)).toBeNull();

      const wrongIssToken = createTestJwt({ iss: 'https://securetoken.google.com/wrong-project' });
      expect(await verifyFirebaseIdToken(wrongIssToken)).toBeNull();
    });

    it('rejects tokens where user_id does not equal sub', async () => {
      const mismatchedIdToken = createTestJwt({ sub: 'user-a', user_id: 'user-b' });
      expect(await verifyFirebaseIdToken(mismatchedIdToken)).toBeNull();
    });

    it('validates token timestamp bounds accurately', () => {
      const now = 100000;
      expect(isFirebaseTokenTimeValid(now + 100, now - 10, now)).toBe(true);
      expect(isFirebaseTokenTimeValid(now - 1, now - 10, now)).toBe(false); // Expired
      expect(isFirebaseTokenTimeValid(now + 100, now + 120, now)).toBe(false); // iat in future
    });
  });

  describe('requireAuth Express Middleware', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeEach(async () => {
      const app = express();
      app.use(express.json());
      app.get('/protected-test', requireAuth, (req: any, res) => {
        res.status(200).json({ status: 'ok', user: req.user });
      });

      await new Promise<void>((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
          const addr = server.address() as any;
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    });

    afterEach(async () => {
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('returns 401 when Authorization header is missing', async () => {
      const res = await fetch(`${baseUrl}/protected-test`);
      const data = await res.json() as any;
      expect(res.status).toBe(401);
      expect(data.error).toContain('Missing Bearer token');
    });

    it('returns 401 when Authorization header does not start with Bearer', async () => {
      const res = await fetch(`${baseUrl}/protected-test`, {
        headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      });
      const data = await res.json() as any;
      expect(res.status).toBe(401);
      expect(data.error).toContain('Missing Bearer token');
    });

    it('returns 401 when Bearer token is empty', async () => {
      const res = await fetch(`${baseUrl}/protected-test`, {
        headers: { Authorization: 'Bearer    ' },
      });
      const data = await res.json() as any;
      expect(res.status).toBe(401);
      expect(data.error).toContain('Token is empty');
    });

    it('returns 401 when token is tampered or invalid', async () => {
      const res = await fetch(`${baseUrl}/protected-test`, {
        headers: { Authorization: 'Bearer invalid.garbage.token' },
      });
      const data = await res.json() as any;
      expect(res.status).toBe(401);
      expect(data.error).toContain('Invalid or expired authentication token');
    });

    it('allows request through with 200 when valid Bearer token is presented', async () => {
      const validToken = createTestJwt();
      const res = await fetch(`${baseUrl}/protected-test`, {
        headers: { Authorization: `Bearer ${validToken}` },
      });
      const data = await res.json() as any;

      expect(res.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.user.uid).toBe('test-user-uid-456');
    });
  });

  describe('Full Server AI Endpoints Authentication Enforced', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeEach(async () => {
      const serverApp = await createApp();
      await new Promise<void>((resolve) => {
        server = serverApp.listen(0, '127.0.0.1', () => {
          const addr = server.address() as any;
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    });

    afterEach(async () => {
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('rejects unauthenticated POST /api/ai/chat with 401', async () => {
      const res = await fetch(`${baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello AI' }] }),
      });
      const data = await res.json() as any;

      expect(res.status).toBe(401);
      expect(data.error).toBeDefined();
    });

    it('rejects unauthenticated GET /api/ai/models with 401', async () => {
      const res = await fetch(`${baseUrl}/api/ai/models`);
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated GET /api/ai/models/status with 401', async () => {
      const res = await fetch(`${baseUrl}/api/ai/models/status`);
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated GET /api/ai/health with 401', async () => {
      const res = await fetch(`${baseUrl}/api/ai/health`);
      expect(res.status).toBe(401);
    });

    it('allows authenticated GET /api/ai/models with valid token', async () => {
      const validToken = createTestJwt();
      const res = await fetch(`${baseUrl}/api/ai/models`, {
        headers: { Authorization: `Bearer ${validToken}` },
      });
      const data = await res.json() as any;

      expect(res.status).toBe(200);
      expect(data.models).toBeDefined();
    });
  });
});
