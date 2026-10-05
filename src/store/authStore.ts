import { create } from 'zustand';
import { User, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useIDEStore } from './index';
import { useOnboardingStore } from './onboardingStore';

interface AuthState {
  user: User | null;
  loading: boolean;
  isInitialized: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  isInitialized: false,
  setUser: (user) => {
    const previousUser = useAuthStore.getState().user;
    set({ user, loading: false, isInitialized: true });
    if (previousUser?.uid !== user?.uid) {
      useIDEStore.getState().switchAccount(user?.uid ?? null);
      useOnboardingStore.getState().syncOnboardingForUser(user?.uid ?? null);
    }
  },
  setLoading: (loading) => set({ loading }),
  logout: async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error('Logout error:', e);
    }
    set({ user: null, loading: false, isInitialized: true });
    
    // Clear local project state
    const ideStore = useIDEStore.getState();
    ideStore.clearProject();
    
    // Navigate back to the landing page
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}));

// Eager listener attached at module load for instant, race-condition-free auth synchronization
let authListenerUnsubscribe: (() => void) | null = null;

export const initAuthListener = () => {
  if (authListenerUnsubscribe) return authListenerUnsubscribe;

  authListenerUnsubscribe = onAuthStateChanged(
    auth,
    (currentUser) => {
      useAuthStore.getState().setUser(currentUser);
      if (currentUser) {
        useIDEStore.getState().startSession();
      }
    },
    (err) => {
      console.error('Firebase Auth state change error:', err);
      useAuthStore.getState().setUser(null);
    }
  );

  return authListenerUnsubscribe;
};

// Start listener immediately upon bundle evaluation
if (typeof window !== 'undefined') {
  initAuthListener();
}
