import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, GithubAuthProvider, OAuthProvider } from 'firebase/auth';
import { initializeFirestore, setLogLevel } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';
import firebaseConfig from '../../firebase-applet-config.json';

// Silence Firestore internal RPC transport and idle stream debug logs
try {
  setLogLevel('silent');
} catch {}

// Filter benign Firestore idle stream disconnect logs from reporting to error consoles
if (typeof window !== 'undefined') {
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const msg = args.map(a => typeof a === 'string' ? a : (a?.message || a?.msg || JSON.stringify(a || ''))).join(' ');
    if (
      msg.includes('Disconnecting idle stream') ||
      msg.includes('Timed out waiting for new targets') ||
      msg.includes("GrpcConnection RPC 'Listen' stream") ||
      msg.includes('operation is manually canceled') ||
      msg.includes('cancelation')
    ) {
      return;
    }
    originalConsoleError.apply(console, args);
  };
}

const app = initializeApp(firebaseConfig);

// Initialize Firestore with autoDetectLongPolling for reliable iframe and web proxy connectivity.
// Connects to default database if firestoreDatabaseId is '(default)' or omitted, or a named database if configured.
const firestoreDbId = (firebaseConfig as any).firestoreDatabaseId;
export const db = (firestoreDbId && firestoreDbId !== '(default)')
  ? initializeFirestore(app, { experimentalAutoDetectLongPolling: true }, firestoreDbId)
  : initializeFirestore(app, { experimentalAutoDetectLongPolling: true });

export const auth = getAuth(app);

// Initialize Firebase Analytics safely when running in a browser environment with analytics support
export let analytics: any = null;
if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(() => {});
}

export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();
// GitLab uses OAuthProvider
export const gitlabProvider = new OAuthProvider('gitlab.com');
export const appleProvider = new OAuthProvider('apple.com');
