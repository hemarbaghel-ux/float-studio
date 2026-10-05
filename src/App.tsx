import React, { useEffect, useState } from 'react';
import { useIDEStore, applyThemeToDocument } from './store';
import { useOnboardingStore } from './store/onboardingStore';
import { useAuthStore } from './store/authStore';
import { LandingPage } from './features/landing/LandingPage';
import { ModelsPage } from './features/models/ModelsPage';
import { ModelsFilteredPage } from './features/models/ModelsFilteredPage';
import { ModelsEvalsPage } from './features/models/ModelsEvalsPage';
import { EvalsPage } from './features/evals/EvalsPage';
import { UsageDashboard } from './features/models/UsageDashboard';
import { ModelDetailsPage } from './features/models/ModelDetailsPage';
import { OnboardingFlow } from './features/onboarding/OnboardingFlow';
import { Dashboard } from './features/dashboard/Dashboard';
import { PricingPage } from './features/pricing/PricingPage';
import { SignUpPage } from './features/auth/SignUpPage';
import { ResourcesPage } from './features/resources/ResourcesPage';
import { DocsPage } from './features/resources/DocsPage';
import { GuidesPage } from './features/resources/GuidesPage';
import { ChangelogPage } from './features/resources/ChangelogPage';
import { HelpPage } from './features/resources/HelpPage';
import { BlogPage } from './features/resources/BlogPage';
import { CommunityPage } from './features/resources/CommunityPage';
import { LearnPage } from './features/learn/LearnPage';
import { FeatureDetailPage } from './features/featurePages/FeatureDetailPage';
import { FeatureIndexPage } from './features/featurePages/FeatureIndexPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { ProfilePage } from './features/profile/ProfilePage';
import { DownloadPage } from './features/download/DownloadPage';
import { PrivacyPolicyPage } from './features/resources/PrivacyPolicyPage';
import { useConsentStore } from './store/consentStore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase';
import { Loader2 } from 'lucide-react';
import { FloatLogo } from './components/FloatLogo';

export default function App() {
  const { projectName, hasStarted, startSession, settings } = useIDEStore();
  const { hasCompletedOnboarding } = useOnboardingStore();
  const { user, loading, setUser, setLoading } = useAuthStore();
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handleLocationChange);
    
    // Intercept a tag clicks for simple routing
    const handleAnchorClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor && anchor.href && anchor.href.startsWith(window.location.origin)) {
        const url = new URL(anchor.href);
        if (
          url.pathname.startsWith('/models') || 
          url.pathname.startsWith('/evals') || 
          url.pathname.startsWith('/pricing') || 
          url.pathname.startsWith('/resources') || 
          url.pathname.startsWith('/learn') || 
          url.pathname.startsWith('/features') || 
          url.pathname.startsWith('/chat/') || 
          url.pathname === '/' ||
          url.pathname === '/dashboard' ||
          url.pathname === '/workspace' ||
          url.pathname === '/ide' ||
          url.pathname === '/projects' ||
          url.pathname === '/automations' ||
          url.pathname === '/integrations' ||
          url.pathname === '/usage' ||
          url.pathname === '/analytics' ||
          url.pathname === '/dashboard/usage' ||
          url.pathname === '/dashboard/analytics' ||
          url.pathname === '/sign-up' ||
          url.pathname === '/signup' ||
          url.pathname === '/sign-in' ||
          url.pathname === '/signin' ||
          url.pathname === '/login' ||
          url.pathname === '/forgot-password' ||
          url.pathname === '/reset-password' ||
          url.pathname === '/settings' ||
          url.pathname === '/profile' ||
          url.pathname === '/download' ||
          url.pathname === '/help'
        ) {
          e.preventDefault();
          window.history.pushState({}, '', url.pathname);
          setCurrentPath(url.pathname);
        }
      }
    };
    document.addEventListener('click', handleAnchorClick);
    
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      document.removeEventListener('click', handleAnchorClick);
    };
  }, []);

  useEffect(() => {
    applyThemeToDocument(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      useConsentStore.getState().initialize();
      if (currentUser && !hasStarted) {
        startSession(); // Auto start session if logged in
      }
    });
    return () => unsubscribe();
  }, [setUser, hasStarted, startSession]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A08] flex flex-col items-center justify-center gap-4 select-none">
        <FloatLogo className="w-14 h-14 animate-pulse" />
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#8B949E]">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500 dark:text-[#8B949E]" />
          <span>Starting FLOAT...</span>
        </div>
      </div>
    );
  }

  if (currentPath.startsWith('/models/gpt/') && currentPath.length > '/models/gpt/'.length) {
    return <ModelDetailsPage providerId="openai" modelId={currentPath.replace('/models/gpt/', '')} />;
  }
  if (currentPath.startsWith('/models/gemini/') && currentPath.length > '/models/gemini/'.length) {
    return <ModelDetailsPage providerId="google" modelId={currentPath.replace('/models/gemini/', '')} />;
  }
  if (currentPath.startsWith('/models/anthropic/') && currentPath.length > '/models/anthropic/'.length) {
    return <ModelDetailsPage providerId="anthropic" modelId={currentPath.replace('/models/anthropic/', '')} />;
  }
  if (currentPath === '/models/usage') {
    return <UsageDashboard />;
  }
  if (currentPath === '/models/gpt') {
    return <ModelsFilteredPage providerId="openai" title="GPT models" description="Compare GPT models across coding, reasoning, and agentic tasks." />;
  }

  if (currentPath === '/models/gemini') {
    return <ModelsFilteredPage providerId="google" title="Gemini models" description="Compare Gemini models across coding, reasoning, and agentic tasks." />;
  }

  if (currentPath === '/models/anthropic' || currentPath === '/models/claude') {
    return <ModelsFilteredPage providerId="anthropic" title="Claude models" description="Compare Claude models across coding, reasoning, and agentic tasks." />;
  }

  if (currentPath === '/models/xai' || currentPath === '/models/grok') {
    return <ModelsFilteredPage providerId="xai" title="xAI models" description="Compare xAI Grok models across coding, reasoning, and agentic tasks." />;
  }

  // Deep-link direct model details: /models/:modelId
  if (currentPath.startsWith('/models/') && !['/models/usage', '/models/evals', '/models/gpt', '/models/gemini', '/models/claude', '/models/anthropic', '/models/xai', '/models/grok'].includes(currentPath)) {
    const rawId = currentPath.replace('/models/', '');
    const parts = rawId.split('/');
    if (parts.length === 2 && parts[0] && parts[1]) {
      return <ModelDetailsPage providerId={parts[0]} modelId={parts[1]} />;
    } else if (parts.length === 1 && parts[0]) {
      return <ModelDetailsPage providerId="auto" modelId={parts[0]} />;
    }
  }

  if (currentPath === '/evals' || currentPath === '/models/evals') {
    return <EvalsPage />;
  }

  if (currentPath === '/pricing') {
    return <PricingPage />;
  }

  // Resources routes
  if (currentPath === '/resources/docs') {
    return <DocsPage />;
  }
  if (currentPath === '/resources/guides') {
    return <GuidesPage />;
  }
  if (currentPath === '/resources/changelog') {
    return <ChangelogPage />;
  }
  if (currentPath === '/resources/help') {
    return <HelpPage />;
  }
  if (currentPath === '/resources/blog') {
    return <BlogPage />;
  }
  if (currentPath === '/resources/community') {
    return <CommunityPage />;
  }
  if (currentPath === '/resources' || currentPath.startsWith('/resources')) {
    return <ResourcesPage />;
  }

  // Learning Center routes
  if (currentPath === '/learn' || currentPath.startsWith('/learn/')) {
    return <LearnPage pathname={currentPath} />;
  }

  // Feature Documentation routes
  if (currentPath === '/features' || currentPath === '/features/') {
    return <FeatureIndexPage />;
  }
  if (currentPath.startsWith('/features/')) {
    const slug = currentPath.replace(/^\/features\//, '').replace(/\/$/, '');
    return <FeatureDetailPage slug={slug} />;
  }

  if (currentPath === '/sign-up' || currentPath === '/signup') {
    return <SignUpPage initialMode="signup" />;
  }

  if (currentPath === '/sign-in' || currentPath === '/signin' || currentPath === '/login') {
    return <Dashboard initialTab="new-chat" />;
  }

  if (currentPath === '/forgot-password' || currentPath === '/reset-password') {
    return <SignUpPage initialMode="reset" />;
  }

  // Account & Application routes
  if (currentPath === '/privacy') {
    return <PrivacyPolicyPage />;
  }
  if (currentPath === '/settings') {
    return <SettingsPage />;
  }
  if (currentPath === '/profile') {
    return <ProfilePage />;
  }
  if (currentPath === '/download') {
    return <DownloadPage />;
  }
  if (currentPath === '/help') {
    return <HelpPage />;
  }

  // Dashboard route for specific tabs
  if (
    currentPath === '/usage' ||
    currentPath === '/analytics' ||
    currentPath === '/dashboard/usage' ||
    currentPath === '/dashboard/analytics'
  ) {
    return <Dashboard initialTab="usage" />;
  }
  if (currentPath === '/integrations') {
    return <Dashboard initialTab="integrations" />;
  }
  if (currentPath === '/automations') {
    return <Dashboard initialTab="automations" />;
  }
  if (currentPath === '/projects') {
    return <Dashboard initialTab="projects" />;
  }
  if (currentPath === '/dashboard') {
    return <Dashboard initialTab="new-chat" />;
  }

  // Route workspace or active chat to Dashboard
  if (currentPath === '/workspace' || currentPath === '/ide' || currentPath.startsWith('/chat/')) {
    return <Dashboard initialTab="new-chat" />;
  }

  if (currentPath === '/models' || currentPath.startsWith('/models')) {
    return <ModelsPage />;
  }

  // 1. First time visitors or unauthenticated users see the landing page, unless visiting login / dashboard
  if (!user || !hasStarted) {
    if (
      currentPath === '/sign-in' || 
      currentPath === '/signin' || 
      currentPath === '/login' || 
      currentPath === '/dashboard'
    ) {
      return <Dashboard initialTab="new-chat" />;
    }
    return <LandingPage />;
  }

  // 2. After login, they see onboarding if incomplete
  if (!hasCompletedOnboarding) {
    return <OnboardingFlow />;
  }

  // 3. For authenticated users on '/', show the Dashboard (Main App Home / Empty Chat Screen)
  if (currentPath === '/') {
    return <Dashboard initialTab="new-chat" />;
  }

  // 4. Default to Dashboard
  return <Dashboard initialTab="new-chat" />;
}