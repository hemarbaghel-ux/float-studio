import { lazy, useEffect, useState } from 'react';
import { useIDEStore, applyThemeToDocument } from './store';
import { useOnboardingStore } from './store/onboardingStore';
import { useAuthStore } from './store/authStore';
const AppShell = lazy(() => import('./features/shell/AppShell').then((module) => ({ default: module.AppShell })));
const LandingPage = lazy(() => import('./features/landing/LandingPage').then((module) => ({ default: module.LandingPage })));
const ModelsPage = lazy(() => import('./features/models/ModelsPage').then((module) => ({ default: module.ModelsPage })));
const ModelsFilteredPage = lazy(() => import('./features/models/ModelsFilteredPage').then((module) => ({ default: module.ModelsFilteredPage })));
const EvalsPage = lazy(() => import('./features/evals/EvalsPage').then((module) => ({ default: module.EvalsPage })));
const UsageDashboard = lazy(() => import('./features/models/UsageDashboard').then((module) => ({ default: module.UsageDashboard })));
const ModelDetailsPage = lazy(() => import('./features/models/ModelDetailsPage').then((module) => ({ default: module.ModelDetailsPage })));
const OnboardingFlow = lazy(() => import('./features/onboarding/OnboardingFlow').then((module) => ({ default: module.OnboardingFlow })));
const Dashboard = lazy(() => import('./features/dashboard/Dashboard').then((module) => ({ default: module.Dashboard })));
const PricingPage = lazy(() => import('./features/pricing/PricingPage').then((module) => ({ default: module.PricingPage })));
const SignUpPage = lazy(() => import('./features/auth/SignUpPage').then((module) => ({ default: module.SignUpPage })));
const ResourcesPage = lazy(() => import('./features/resources/ResourcesPage').then((module) => ({ default: module.ResourcesPage })));
const DocsPage = lazy(() => import('./features/resources/DocsPage').then((module) => ({ default: module.DocsPage })));
const GuidesPage = lazy(() => import('./features/resources/GuidesPage').then((module) => ({ default: module.GuidesPage })));
const ChangelogPage = lazy(() => import('./features/resources/ChangelogPage').then((module) => ({ default: module.ChangelogPage })));
const HelpPage = lazy(() => import('./features/resources/HelpPage').then((module) => ({ default: module.HelpPage })));
const BlogPage = lazy(() => import('./features/resources/BlogPage').then((module) => ({ default: module.BlogPage })));
const CommunityPage = lazy(() => import('./features/resources/CommunityPage').then((module) => ({ default: module.CommunityPage })));
const LearnPage = lazy(() => import('./features/learn/LearnPage').then((module) => ({ default: module.LearnPage })));
const FeatureDetailPage = lazy(() => import('./features/featurePages/FeatureDetailPage').then((module) => ({ default: module.FeatureDetailPage })));
const FeatureIndexPage = lazy(() => import('./features/featurePages/FeatureIndexPage').then((module) => ({ default: module.FeatureIndexPage })));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const ProfilePage = lazy(() => import('./features/profile/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const DownloadPage = lazy(() => import('./features/download/DownloadPage').then((module) => ({ default: module.DownloadPage })));
const PrivacyPolicyPage = lazy(() => import('./features/resources/PrivacyPolicyPage').then((module) => ({ default: module.PrivacyPolicyPage })));
const TermsPage = lazy(() => import('./features/resources/TermsPage').then((module) => ({ default: module.TermsPage })));
import { useConsentStore } from './store/consentStore';
import { Loader2 } from 'lucide-react';
import { FloatLogo } from './components/FloatLogo';

export default function App() {
  const { hasStarted, settings } = useIDEStore();
  const { hasCompletedOnboarding } = useOnboardingStore();
  const { user, loading } = useAuthStore();
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handleLocationChange);

    // Intercept a tag clicks for simple routing
    const handleAnchorClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor && anchor.href && !anchor.target && !anchor.hasAttribute('download')) {
        const url = new URL(anchor.href);
        if (
          url.origin === window.location.origin && (
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
          url.pathname === '/privacy' ||
          url.pathname === '/help' ||
          url.pathname === '/terms'
          )
        ) {
          e.preventDefault();
          const samePage = url.pathname === window.location.pathname;
          window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
          setCurrentPath(url.pathname);
          if (url.hash && samePage) {
            const id = decodeURIComponent(url.hash.slice(1));
            document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
          }
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
    void useConsentStore.getState().initialize();
  }, [user?.uid]);

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

  const requiresAccount = [
    '/dashboard', '/workspace', '/ide', '/automations', '/integrations',
    '/projects', '/settings', '/profile', '/models/usage', '/evals', '/models/evals',
  ].includes(currentPath) || currentPath.startsWith('/chat/');
  if (!user && requiresAccount) {
    return <SignUpPage initialMode="signin" returnTo={`${currentPath}${window.location.search}${window.location.hash}`} />;
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
    return <SignUpPage initialMode="signin" />;
  }

  if (currentPath === '/forgot-password' || currentPath === '/reset-password') {
    return <SignUpPage initialMode="reset" />;
  }

  // Account & Application routes
  if (currentPath === '/privacy') {
    return <PrivacyPolicyPage />;
  }
  if (currentPath === '/terms') {
    return <TermsPage />;
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

  // Explicit route for IDE workspace or active chat
  if (currentPath === '/workspace' || currentPath === '/ide' || currentPath.startsWith('/chat/')) {
    return <AppShell />;
  }

  if (currentPath === '/models' || currentPath.startsWith('/models')) {
    return <ModelsPage />;
  }

  // 1. First time visitors or unauthenticated users see the landing page, unless visiting login / dashboard
  if (!user || !hasStarted) {
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

  // 4. Default to AppShell for active projects
  return <AppShell />;
}
