import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import firebaseConfig from '../../firebase-applet-config.json';

let adminCredentialsDisabled = false;
let adminCredentialsTestOverride: boolean | null = null;

export function markAdminCredentialsUnavailable(_reason?: unknown): void {
  adminCredentialsDisabled = true;
}

export function setAdminCredentialsOverrideForTests(override: boolean | null): void {
  adminCredentialsTestOverride = override;
  if (override !== false) {
    adminCredentialsDisabled = false;
  }
}

export function isPermissionDeniedError(err: any): boolean {
  if (!err) return false;
  const code = err.code ?? err.status;
  const msg = String(err.message || err.details || err || '');
  return code === 7 || code === 16 || /permission[-_ ]?denied|missing or insufficient permissions|unauthenticated/i.test(msg);
}

function parseServiceAccountFromEnv(): Record<string, any> | null {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!rawJson || !rawJson.trim()) return null;
  try {
    const parsed = JSON.parse(rawJson);
    if (parsed && typeof parsed === 'object' && parsed.client_email && parsed.private_key) {
      return parsed;
    }
  } catch {
    // Ignore malformed service account JSON and fail closed
  }
  return null;
}

export function hasAdminCredentials(): boolean {
  if (adminCredentialsTestOverride !== null) {
    return adminCredentialsTestOverride && !adminCredentialsDisabled;
  }
  if (adminCredentialsDisabled) return false;
  // In Google AI Studio development sandboxes, K_SERVICE is prefixed with "ais-dev-" and lacks Firestore IAM access
  if (process.env.K_SERVICE?.startsWith('ais-dev-')) return false;
  if (parseServiceAccountFromEnv()) return true;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      return fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    } catch {
      return false;
    }
  }
  if (process.env.K_SERVICE) return true;
  const credentialFiles = [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'gcloud', 'application_default_credentials.json') : '',
    process.env.HOME ? path.join(process.env.HOME, '.config', 'gcloud', 'application_default_credentials.json') : '',
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, '.config', 'gcloud', 'application_default_credentials.json') : '',
  ].filter(Boolean);
  return credentialFiles.some((file) => {
    try {
      return fs.existsSync(file);
    } catch {
      return false;
    }
  });
}

// Cloud Run uses its attached service account through Application Default
// Credentials. Local or containerized deployments can use GOOGLE_APPLICATION_CREDENTIALS
// or FIREBASE_SERVICE_ACCOUNT_JSON.
const existing = getApps().find((app) => app.name === 'float-admin');
const serviceAccount = parseServiceAccountFromEnv();
const adminApp = existing || initializeApp(
  serviceAccount
    ? { credential: cert(serviceAccount as any), projectId: firebaseConfig.projectId }
    : hasAdminCredentials()
      ? { credential: applicationDefault(), projectId: firebaseConfig.projectId }
      : { projectId: firebaseConfig.projectId },
  'float-admin'
);

// The applet uses a named Firestore database, so admin persistence must use it too.
export const adminDb = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
