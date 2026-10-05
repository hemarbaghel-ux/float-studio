import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, GithubAuthProvider, OAuthProvider, EmailAuthProvider } from 'firebase/auth';
import { initializeFirestore, setLogLevel } from 'firebase/firestore';
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

// Initialize Firestore with autoDetectLongPolling for reliable iframe and web proxy connectivity
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();
// GitLab uses OAuthProvider
export const gitlabProvider = new OAuthProvider('gitlab.com');
export const appleProvider = new OAuthProvider('apple.com');
