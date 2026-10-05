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

export function hasAdminCredentials(): boolean {
  if (process.env.K_SERVICE || process.env.GOOGLE_APPLICATION_CREDENTIALS) return true;
  const credentialFiles = [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'gcloud', 'application_default_credentials.json') : '',
    process.env.HOME ? path.join(process.env.HOME, '.config', 'gcloud', 'application_default_credentials.json') : '',
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, '.config', 'gcloud', 'application_default_credentials.json') : '',
  ].filter(Boolean);
  return credentialFiles.some((file) => fs.existsSync(file));
}
