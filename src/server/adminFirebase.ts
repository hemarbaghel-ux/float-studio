import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import firebaseConfig from '../../firebase-applet-config.json';

// Cloud Run uses its attached service account through Application Default
// Credentials. Local development can use GOOGLE_APPLICATION_CREDENTIALS.
const existing = getApps().find((app) => app.name === 'float-admin');
const adminApp = existing || initializeApp({
  credential: applicationDefault(),
  projectId: firebaseConfig.projectId,
}, 'float-admin');

// The applet uses a named Firestore database, so admin persistence must use it too.
export const adminDb = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);

let adminCredentialsDisabled = false;

export function markAdminCredentialsUnavailable(_reason?: unknown): void {
  adminCredentialsDisabled = true;
}

export function isPermissionDeniedError(err: any): boolean {
  if (!err) return false;
  const code = err.code ?? err.status;
  const msg = String(err.message || err.details || err || '');
  return code === 7 || code === 16 || /permission[-_ ]?denied|missing or insufficient permissions|unauthenticated/i.test(msg);
}

export function hasAdminCredentials(): boolean {
  if (adminCredentialsDisabled) return false;
  // In Google AI Studio development sandboxes, K_SERVICE is prefixed with "ais-dev-" and lacks Firestore IAM access
  if (process.env.K_SERVICE?.startsWith('ais-dev-')) return false;
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
