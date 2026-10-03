const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const replacement = `import React, { useEffect } from 'react';
import { useIDEStore } from './store';
import { useOnboardingStore } from './store/onboardingStore';
import { useAuthStore } from './store/authStore';
import { AppShell } from './features/shell/AppShell';
import { LandingPage } from './features/landing/LandingPage';
import { OnboardingFlow } from './features/onboarding/OnboardingFlow';
import { Dashboard } from './features/dashboard/Dashboard';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase';
import { Loader2 } from 'lucide-react';

export default function App() {
  const { projectName, hasStarted, startSession } = useIDEStore();
  const { hasCompletedOnboarding } = useOnboardingStore();
  const { user, loading, setUser, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser && !hasStarted) {
        startSession(); // Auto start session if logged in
      }
    });
    return () => unsubscribe();
  }, [setUser, hasStarted, startSession]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A08] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#7C3AED] animate-spin" />
      </div>
    );
  }

  // 1. First time visitors or unauthenticated users see the landing page
  if (!user || !hasStarted) {
    return <LandingPage />;
  }

  // 2. After login, they see onboarding if incomplete
  if (!hasCompletedOnboarding) {
    return <OnboardingFlow />;
  }

  // 3. After onboarding, if they haven't started a specific project/chat, show dashboard
  if (!projectName) {
    return <Dashboard />;
  }

  // 4. Once a project is created, show the IDE
  return <AppShell />;
}`;

fs.writeFileSync('src/App.tsx', replacement);
