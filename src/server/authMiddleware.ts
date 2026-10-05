import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import firebaseConfig from '../../firebase-applet-config.json';

interface DecodedToken {
  header: { alg: string; kid: string; typ?: string };
  payload: {
    iss: string;
    aud: string;
    sub: string;
    user_id?: string;
    email?: string;
    email_verified?: boolean;
    exp: number;
    iat: number;
    auth_time?: number;
    [key: string]: any;
  };
  signature: string;
}

let cachedCertificates: Record<string, string> = {};
let certsExpiry = 0;

async function getGooglePublicKeys(): Promise<Record<string, string>> {
  const now = Date.now();
  if (now < certsExpiry && Object.keys(cachedCertificates).length > 0) {
    return cachedCertificates;
  }

  try {
    const res = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com', {
      signal: AbortSignal.timeout(5_000)
    });
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
    if (Object.keys(cachedCertificates).length > 0) {
      return cachedCertificates;
    }
    throw err;
  }
}

function parseJwt(token: string): DecodedToken | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const signature = parts[2];
    return { header, payload, signature };
  } catch {
    return null;
  }
}

function verifySignature(token: string, cert: string): boolean {
  try {
    const parts = token.split('.');
    const data = `${parts[0]}.${parts[1]}`;
    const signature = parts[2];
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(data);
    return verifier.verify(cert, signature, 'base64url');
  } catch {
    return false;
  }
}

export async function verifyFirebaseIdToken(token: string): Promise<{ uid: string; email?: string } | null> {
  const decoded = parseJwt(token);
  if (!decoded) return null;

  const { header, payload } = decoded;
  const projectId = firebaseConfig.projectId;

  if (header.alg !== 'RS256') return null;
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128 || typeof header.kid !== 'string' || !header.kid) return null;

  const nowInSeconds = Math.floor(Date.now() / 1000);
  // Do not accept an ID token after exp. A post-expiry grace window extends
  // compromised/revoked credentials and is not needed for Firebase tokens.
  if (!isFirebaseTokenTimeValid(payload.exp, payload.iat, nowInSeconds)) return null;

  try {
    const certs = await getGooglePublicKeys();
    let cert = certs[header.kid];
    if (!cert) {
      const freshCerts = await getGooglePublicKeys();
      cert = freshCerts[header.kid];
      if (!cert) return null;
    }
    const isValid = verifySignature(token, cert);
    return isValid ? { uid: payload.sub, email: payload.email } : null;
  } catch (err) {
    console.error('Signature verification error:', err);
    return null;
  }
}

export function isFirebaseTokenTimeValid(exp: unknown, iat: unknown, nowInSeconds: number): boolean {
  return Number.isSafeInteger(exp) && (exp as number) > nowInSeconds &&
    Number.isSafeInteger(iat) && (iat as number) <= nowInSeconds + 60;
}

export async function requireAuth(req: any, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Token is empty.' });
  }

  const user = await verifyFirebaseIdToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }

  req.user = user;
  next();
}
