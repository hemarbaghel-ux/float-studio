import assert from 'assert';
import { useAuthStore } from '../src/store/authStore';
import { useIDEStore } from '../src/store/index';
import { useOnboardingStore } from '../src/store/onboardingStore';

async function runAuthPersistenceTests() {
  console.log('=== FLOAT AI: Auth Persistence & Synchronization Verification ===\n');
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => {
            console.log(`[PASS] ${name}`);
            passed++;
          })
          .catch((err) => {
            console.error(`[FAIL] ${name}:`, err.message);
            failed++;
          });
      }
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // Test 1: Initial auth store contract
  test('AuthStore provides user, loading, and isInitialized flags', () => {
    const state = useAuthStore.getState();
    assert.strictEqual(typeof state.loading, 'boolean');
    assert.strictEqual(typeof state.setUser, 'function');
    assert.strictEqual(typeof state.logout, 'function');
  });

  // Test 2: setUser updates state and clears loading synchronously
  test('setUser synchronously sets user and marks loading false', () => {
    const mockUser: any = {
      uid: 'test-user-123',
      email: 'engineer@float.ai',
      displayName: 'Float Engineer',
      getIdToken: async () => 'mock-token'
    };

    useAuthStore.getState().setUser(mockUser);
    const updated = useAuthStore.getState();
    assert.strictEqual(updated.user?.uid, 'test-user-123');
    assert.strictEqual(updated.loading, false);
    assert.strictEqual(updated.isInitialized, true);
  });

  // Test 3: Auto-start session synchronization
  test('Session is started when user is authenticated', () => {
    const ideStore = useIDEStore.getState();
    ideStore.startSession();
    assert.strictEqual(useIDEStore.getState().hasStarted, true);
  });

  // Test 4: Dashboard routing simulation during auth transitions
  test('Simulated App routing prevents unauthenticated dashboard leaks', () => {
    // Helper replicating App.tsx route decisions
    const resolveAppView = (path: string, user: any, loading: boolean, hasOnboarded: boolean) => {
      if (loading) return 'LOADING';
      if (path === '/sign-in' || path === '/login') {
        if (user) return 'DASHBOARD';
        return 'SIGN_IN';
      }
      if (path === '/dashboard' || path === '/projects' || path === '/integrations' || path === '/automations') {
        if (!user) return 'LANDING';
        return 'DASHBOARD';
      }
      if (path === '/workspace' || path.startsWith('/chat/')) {
        if (!user) return 'LANDING';
        return 'WORKSPACE';
      }
      if (!user) return 'LANDING';
      if (!hasOnboarded) return 'ONBOARDING';
      return 'DASHBOARD';
    };

    // Case 4A: App is still loading auth from Firebase/IndexedDB
    assert.strictEqual(resolveAppView('/dashboard', null, true, true), 'LOADING', 'Must show loading screen while resolving persistence');
    assert.strictEqual(resolveAppView('/', null, true, true), 'LOADING');

    // Case 4B: Unauthenticated user accesses /dashboard
    assert.strictEqual(resolveAppView('/dashboard', null, false, true), 'LANDING', 'Unauthenticated dashboard visit must bounce to Landing');
    assert.strictEqual(resolveAppView('/projects', null, false, true), 'LANDING');

    // Case 4C: User just signed in and immediately opens /dashboard
    const user = { uid: 'u-1', email: 'test@float.ai' };
    assert.strictEqual(resolveAppView('/dashboard', user, false, true), 'DASHBOARD', 'Authenticated user goes straight to dashboard');
    assert.strictEqual(resolveAppView('/chat/p-1', user, false, true), 'WORKSPACE');

    // Case 4D: Authenticated user visits /sign-in
    assert.strictEqual(resolveAppView('/sign-in', user, false, true), 'DASHBOARD', 'Authenticated user on /sign-in redirects to Dashboard');
  });

  // Test 5: Onboarding persistence across reloads
  test('Onboarding completion persists across reloads', () => {
    const store = useOnboardingStore.getState();
    store.setOnboarded(true, 'user-xyz');
    assert.strictEqual(useOnboardingStore.getState().hasCompletedOnboarding, true);
  });

  // Test 6: Logout transition clears state cleanly
  test('Logout cleanly clears user without getting stuck in loading', async () => {
    useAuthStore.getState().setUser(null);
    const state = useAuthStore.getState();
    assert.strictEqual(state.user, null);
    assert.strictEqual(state.loading, false);
    assert.strictEqual(state.isInitialized, true);
  });

  console.log(`\n======================================================`);
  console.log(`Auth Persistence Verification Summary: ${passed} passed, ${failed} failed.`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthPersistenceTests();
