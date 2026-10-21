import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import firebaseConfig from '../../firebase-applet-config.json';

/**
 * Accepted Firebase ID Token Claims Policy:
 * - Header `alg` MUST be `'RS256'` and `kid` MUST be a non-empty string matching a trusted Google SecureToken public certificate.
 * - `aud` MUST equal `firebaseConfig.projectId`.
 * - `iss` MUST equal `https://securetoken.google.com/${firebaseConfig.projectId}`.
 * - `sub` MUST be a non-empty string (1..128 chars) identifying the Firebase user UID.
 * - `user_id` MUST be present, non-empty, and strictly equal to `sub` (`payload.user_id === payload.sub`).
 * - `exp` MUST be a safe integer strictly in the future (`exp > nowInSeconds`).
 * - `iat` MUST be a safe integer not in the future (`iat <= nowInSeconds + 60`).
 * - If `auth_time` is present, it MUST be a safe integer not in the future (`auth_time <= nowInSeconds + 60`).
 */
interface DecodedToken {
  header: { alg: string; kid: string; typ?: string; [key: string]: any };
  payload: {
    iss: string;
    aud: string;
    sub: string;
    user_id: string;
    email?: string;
    email_verified?: boolean;
    exp: number;
    iat: number;
    auth_time?: number;
    [key: string]: any;
  };
  signature: string;
}

const DEFAULT_MIN_CERT_REFRESH_INTERVAL_MS = 60_000;

let cachedCertificates: Record<string, string> = {};
let certsExpiry = 0;
let lastCertRefreshAt = 0;
let minCertRefreshIntervalMs = DEFAULT_MIN_CERT_REFRESH_INTERVAL_MS;

let testCertificatesOverride: Record<string, string> | null = null;
let simulateCertFetchOutageForTests = false;
let testCertRefreshHandler: (() => Promise<Record<string, string>> | Record<string, string>) | null = null;
let testCertRefreshCount = 0;

export interface GooglePublicKeyTestOptions {
  simulateOutage?: boolean;
  onRefreshCerts?: (() => Promise<Record<string, string>> | Record<string, string>) | null;
  minRefreshIntervalMs?: number;
}

/**
 * Test-only hook for deterministic RS256 verification, key rotation, and outage testing
 * without external network calls. Never bypasses cryptographic signature verification.
 */
export function setGooglePublicKeysForTests(
  certs: Record<string, string> | null,
  options?: GooglePublicKeyTestOptions
): void {
  testCertificatesOverride = certs ? { ...certs } : null;
  simulateCertFetchOutageForTests = Boolean(options?.simulateOutage);
  testCertRefreshHandler = options?.onRefreshCerts ?? null;
  minCertRefreshIntervalMs = options?.minRefreshIntervalMs ?? DEFAULT_MIN_CERT_REFRESH_INTERVAL_MS;
  lastCertRefreshAt = 0;
  testCertRefreshCount = 0;
}

export function getCertRefreshCountForTests(): number {
  return testCertRefreshCount;
}

async function getGooglePublicKeys(options?: { forceRefresh?: boolean }): Promise<Record<string, string>> {
  const forceRefresh = Boolean(options?.forceRefresh);
  const now = Date.now();

  if (simulateCertFetchOutageForTests) {
    throw new Error('Simulated certificate verification outage');
  }

  if (testCertificatesOverride !== null) {
    if (forceRefresh && testCertRefreshHandler) {
      if (lastCertRefreshAt === 0 || now - lastCertRefreshAt >= minCertRefreshIntervalMs) {
        lastCertRefreshAt = now;
        testCertRefreshCount++;
        const refreshed = await testCertRefreshHandler();
        testCertificatesOverride = { ...refreshed };
      }
    }
    return testCertificatesOverride;
  }

  const hasValidCachedCerts = now < certsExpiry && Object.keys(cachedCertificates).length > 0;
  if (!forceRefresh && hasValidCachedCerts) {
    return cachedCertificates;
  }

  // Enforce bounded refresh interval so unknown-kid tokens cannot trigger unbounded upstream fetches
  if (forceRefresh && lastCertRefreshAt > 0 && now - lastCertRefreshAt < minCertRefreshIntervalMs) {
    if (hasValidCachedCerts) {
      return cachedCertificates;
    }
  }

  try {
    lastCertRefreshAt = now;
    testCertRefreshCount++;
    const res = await fetch(
      'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
      {
        signal: AbortSignal.timeout(5_000)
      }
    );
    if (!res.ok) {
      throw new Error(`Failed to fetch certificates: ${res.status}`);
    }

    const cacheControl = res.headers.get('cache-control') || '';
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
    const maxAgeSeconds = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 3600;

    cachedCertificates = await res.json();
    certsExpiry = now + maxAgeSeconds * 1000;
    return cachedCertificates;
  } catch (err) {
    console.error('Error fetching Google public certs:', err);
    // Only fall back to cached certificates when this was NOT a forced refresh for an unknown kid
    if (!forceRefresh && hasValidCachedCerts) {
      return cachedCertificates;
    }
    throw err;
  }
}

function parseJwt(token: string): DecodedToken | null {
  if (typeof token !== 'string' || !token || token.length > 16_384) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  if (!parts[0] || !parts[1] || !parts[2]) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const signature = parts[2];
    if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') {
      return null;
    }
    return { header, payload, signature };
  } catch {
    return null;
  }
}

function verifySignature(token: string, cert: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[2]) return false;
    const data = `${parts[0]}.${parts[1]}`;
    const signature = parts[2];
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(data);
    return verifier.verify(cert, signature, 'base64url');
  } catch {
    return false;
  }
}

/**
 * Cryptographically verifies a Firebase ID token (RS256 signature + strict claims).
 * - Requires `user_id` to be present, non-empty, and equal to `sub`.
 * - Performs a bounded refresh of Google's public certificates when `header.kid` is unknown.
 * - Never accepts unverified JWT payloads as authenticated identities.
 * - If trusted token verification infrastructure is unavailable, throws so callers fail closed (503).
 */
export async function verifyFirebaseIdToken(token: string): Promise<{ uid: string; email?: string } | null> {
  const decoded = parseJwt(token);
  if (!decoded) return null;

  const { header, payload, signature } = decoded;
  const projectId = firebaseConfig.projectId;

  // Strictly enforce RS256 and reject alg: "none" or symmetric algorithms
  if (header.alg !== 'RS256') return null;
  if (!signature || typeof signature !== 'string') return null;
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!payload.sub || typeof payload.sub !== 'string' || !payload.sub.trim() || payload.sub.length > 128) return null;
  // Firebase ID tokens always carry both `sub` and `user_id` with identical non-empty values
  if (typeof payload.user_id !== 'string' || !payload.user_id.trim() || payload.user_id !== payload.sub) {
    return null;
  }
  if (typeof header.kid !== 'string' || !header.kid.trim()) return null;

  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (!isFirebaseTokenTimeValid(payload.exp, payload.iat, nowInSeconds)) return null;
  if (payload.auth_time !== undefined && (!Number.isSafeInteger(payload.auth_time) || payload.auth_time > nowInSeconds + 60)) {
    return null;
  }

  try {
    let certs = await getGooglePublicKeys({ forceRefresh: false });
    if (!certs || typeof certs !== 'object' || Object.keys(certs).length === 0) {
      throw new Error('No trusted public key certificates available for token verification.');
    }
    let cert = certs[header.kid];
    if (!cert) {
      // Unknown signing-key ID: perform a bounded refresh of trusted public certificates
      certs = await getGooglePublicKeys({ forceRefresh: true });
      if (!certs || typeof certs !== 'object' || Object.keys(certs).length === 0) {
        throw new Error('No trusted public key certificates available after refresh.');
      }
      cert = certs[header.kid];
    }
    if (!cert) {
      return null;
    }
    const isValid = verifySignature(token, cert);
    return isValid ? { uid: payload.sub, email: payload.email } : null;
  } catch (err) {
    // A certificate fetch/network failure is an infrastructure outage, not
    // evidence that the caller supplied a valid token. Let requireAuth
    // fail closed with a retryable 503.
    throw err;
  }
}

export function isFirebaseTokenTimeValid(exp: unknown, iat: unknown, nowInSeconds: number): boolean {
  return Number.isSafeInteger(exp) && (exp as number) > nowInSeconds &&
    Number.isSafeInteger(iat) && (iat as number) <= nowInSeconds + 60;
}

export async function requireAuth(req: any, res: Response, next: NextFunction) {
  const authHeader = req.headers?.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Token is empty.' });
  }

  let user: { uid: string; email?: string } | null;
  try {
    user = await verifyFirebaseIdToken(token);
  } catch (error) {
    // Fail closed when trusted verification keys are unavailable.
    console.error('Firebase token verification unavailable:', error);
    return res.status(503).json({ error: 'Authentication verification is temporarily unavailable. Please retry.' });
  }
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }

  req.user = user;
  return next();
}
