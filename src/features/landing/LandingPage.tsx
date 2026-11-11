import React from 'react';
import { useIDEStore } from '../../store';
import { useAuthStore } from '../../store/authStore';
import { ArrowRight, Sun, Moon, ChevronDown } from 'lucide-react';
import { FloatLogo, FloatWordmark } from '../../components/FloatLogo';
import { ModelsDropdown } from '../../components/ModelsDropdown';
import { ProductsDropdown } from '../../components/ProductsDropdown';
import { PricingDropdown } from '../../components/PricingDropdown';
import { ResourcesDropdown } from '../../components/ResourcesDropdown';
import { LanguageDropdown } from '../../components/LanguageDropdown';
import { useTranslation } from '../../components/LanguageProvider';
import { TestimonialsSection } from './TestimonialsSection';

export function LandingPage() {
  const { settings, toggleTheme, updateSettings } = useIDEStore();
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const [brandHovered, setBrandHovered] = React.useState(false);

  const handleOpenWorkspace = () => {
    useIDEStore.getState().startSession();
    window.history.pushState({}, '', '/workspace');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleStart = (mode: 'signup' | 'signin' | React.MouseEvent = 'signup') => {
    const finalMode = typeof mode === 'string' && mode === 'signin' ? 'signin' : 'signup';
    const targetPath = finalMode === 'signin' ? '/sign-in' : '/sign-up';
    window.history.pushState({}, '', targetPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div data-testid="landing-page" className="min-h-screen bg-slate-50 dark:bg-[#0F0F0B] text-slate-900 dark:text-[#EDEDED] font-sans overflow-x-hidden selection:bg-[#7C3AED]/20 dark:selection:bg-[#EDEDED] dark:selection:text-[#0F0F0B] transition-colors">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-[#0F0F0B]/80 backdrop-blur-md transition-colors">
        <div className="flex items-center gap-8">
          <a
            href="/"
            className="group flex items-center gap-2.5 cursor-pointer select-none"
            onMouseEnter={() => setBrandHovered(true)}
            onMouseLeave={() => setBrandHovered(false)}
            onFocus={() => setBrandHovered(true)}
            onBlur={() => setBrandHovered(false)}
            onClick={(e) => {
              e.preventDefault();
              if (window.location.pathname !== '/') {
                window.history.pushState({}, '', '/');
                window.dispatchEvent(new PopStateEvent('popstate'));
              } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
          >
            <FloatLogo 
              size={38} 
              className="w-[38px] h-[38px]" 
              trigger={brandHovered} 
              active={brandHovered} 
            />
            <span className="flex items-center text-slate-900 dark:text-white transition-opacity group-hover:opacity-90">
              <FloatWordmark className="h-5 w-auto" />
            </span>
          </a>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-[#A1A1AA] absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
            <ModelsDropdown currentPath={window.location.pathname} />
            <ProductsDropdown currentPath={window.location.pathname} />
            <PricingDropdown currentPath={window.location.pathname} />
            <ResourcesDropdown currentPath={window.location.pathname} />
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm font-medium">
          <LanguageDropdown />
          {/* Main Navigation Theme Toggle Button */}
          <button
            id="main-nav-theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} mode`}
            title={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} mode`}
            className="p-2 rounded-full border border-slate-200 dark:border-white/15 text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            {settings.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <button
            onClick={() => {
              if (user) {
                window.history.pushState({}, '', '/dashboard');
                window.dispatchEvent(new PopStateEvent('popstate'));
              } else {
                handleStart('signin');
              }
            }}
            aria-label={user ? t('nav.dashboard', 'Dashboard') : t('nav.signin', 'Sign in')}
            className="px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-white/10 rounded-full transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-white/20 select-none hidden sm:block"
          >
            {user ? t('nav.dashboard', 'Dashboard') : t('nav.signin', 'Sign in')}
          </button>
          <button
            onClick={() => {
              window.history.pushState({}, '', '/download');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="px-4 py-1.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-full hover:opacity-90 transition-opacity font-semibold cursor-pointer"
          >
            {t('nav.download', 'Download')}
          </button>
        </div>
      </nav>

      {/* Hero Section with Interactive Code / Diff Demo */}
      <main className="pt-32 pb-20 px-6 max-w-6xl mx-auto flex flex-col items-center justify-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-semibold uppercase tracking-wider mb-6">
          AI Coding Workspace
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 leading-[1.1] max-w-3xl text-slate-900 dark:text-white mx-auto">
          Build with an AI coding workspace that understands your code.
        </h1>
        <p className="text-lg md:text-xl text-slate-600 dark:text-[#A1A1AA] max-w-2xl mb-8 leading-relaxed">
          Ask questions about your code, work with project files, and review proposed changes before applying them.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14 w-full">
          <button
            data-testid="landing-open-workspace"
            onClick={handleOpenWorkspace}
            className="group px-7 py-3.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-full hover:opacity-90 transition-opacity font-semibold flex items-center justify-center gap-2 shadow-lg w-full sm:w-auto cursor-pointer text-sm"
          >
            <span>Open FLOAT Free</span> <ArrowRight size={16} />
          </button>
          <a
            href="/resources/changelog"
            className="px-6 py-3.5 rounded-full border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors font-medium text-sm w-full sm:w-auto"
          >
            View Changelog (v1.4.0)
          </a>
        </div>

      </main>

      {/* Cursor Parity Feature 1: Tab Autocomplete & Inline AI (Cmd+K) */}
      <section className="py-20 max-w-6xl mx-auto px-6 border-t border-slate-200 dark:border-white/5">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-semibold uppercase tracking-wider mb-4">
            Next-Generation Autocomplete
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            Tab that predicts your next edit
          </h2>
          <p className="mt-4 text-base text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
            Multi-line ghost text autocomplete, cursor prediction, and instant inline edits with <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/10 font-mono text-xs">Ctrl+K</kbd> / <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/10 font-mono text-xs">Cmd+K</kbd>. Review proposed changes as diffs before accepting.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-stretch">
          {/* Tab Autocomplete Card */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#14120E] p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400 font-mono">
                  Tab Completion
                </span>
                <span className="text-[11px] font-mono text-slate-400 dark:text-[#8B949E] px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5">
                  Press Tab ⇥ to accept
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                Multi-line Copilot on steroids
              </h3>
              <p className="text-xs text-slate-600 dark:text-[#A1A1AA] mb-4">
                FLOAT analyzes surrounding files, imports, and symbols to suggest entire blocks and predict where you want to edit next.
              </p>
              <div className="p-4 rounded-xl bg-slate-900 dark:bg-[#0A0A0A] font-mono text-xs text-slate-300 leading-relaxed border border-slate-800 dark:border-white/5 overflow-hidden">
                <div className="text-slate-500">// TypeScript with symbol context</div>
                <div><span className="text-purple-400">export async function</span> <span className="text-blue-400">fetchWorkspaceRules</span>(projectId: string) {'{'}</div>
                <div className="pl-4 text-slate-400">const rules = await rulesService.getEffectiveRules({'{'} projectId {'}'});</div>
                <div className="pl-4 text-emerald-400 bg-emerald-500/10 -mx-4 px-4 py-0.5 border-l-2 border-emerald-400">
                  <span className="text-slate-500">// [Ghost Text Suggestion]</span><br/>
                  return rules.filter(r =&gt; r.enabled).sort((a, b) =&gt; a.priority - b.priority);
                </div>
                <div>{'}'}</div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-xs text-slate-500 dark:text-[#8B949E]">
              <span>✓ Debounced server completions</span>
              <span className="text-purple-600 dark:text-purple-400 font-medium">Active in Monaco</span>
            </div>
          </div>

          {/* Inline Edit (Cmd+K) Card */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#14120E] p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 font-mono">
                  Inline Assistant (Cmd+K)
                </span>
                <span className="text-[11px] font-mono text-slate-400 dark:text-[#8B949E] px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5">
                  Ctrl+K / Cmd+K
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                In-place refactor &amp; diff review
              </h3>
              <p className="text-xs text-slate-600 dark:text-[#A1A1AA] mb-4">
                Highlight any selection in your editor, prompt in natural language, and preview the side-by-side diff before approving.
              </p>
              <div className="p-4 rounded-xl bg-slate-900 dark:bg-[#0A0A0A] font-mono text-xs text-slate-300 leading-relaxed border border-slate-800 dark:border-white/5 overflow-hidden">
                <div className="bg-blue-500/20 text-blue-300 p-2 rounded mb-2 flex items-center justify-between text-[11px]">
                  <span>✨ <strong>Cmd+K:</strong> "Refactor to use TanStack React Query with error boundary"</span>
                  <span className="text-blue-400 text-[10px]">Enter ↵</span>
                </div>
                <div className="text-red-400 bg-red-500/10 -mx-4 px-4 py-0.5">
                  - const [data, setData] = useState(null);
                </div>
                <div className="text-emerald-400 bg-emerald-500/10 -mx-4 px-4 py-0.5">
                  + const {'{ data, error, isLoading }'} = useQuery({'{'} queryKey: ['workspace'], queryFn: fetchWorkspace {'}'});
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-xs text-slate-500 dark:text-[#8B949E]">
              <span>✓ Safe proposal review gate</span>
              <span className="text-blue-600 dark:text-blue-400 font-medium">Reject / Accept Diffs</span>
            </div>
          </div>
        </div>
      </section>

      {/* Feature: Full development lifecycle */}
      <section className="py-24 max-w-6xl mx-auto px-6 border-t border-slate-200 dark:border-white/5">
        <h2 className="text-3xl font-medium tracking-tight mb-2 text-slate-900 dark:text-white">
          {t('features.lifecycle.title', 'Spans the full development lifecycle')}
        </h2>
        <p className="text-slate-600 dark:text-[#A1A1AA] text-xl mb-16">
          {t('features.lifecycle.desc', 'FLOAT supports every phase from planning to writing to reviewing code.')}
        </p>

        <div className="grid md:grid-cols-2 gap-6 text-left">
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.lifecycle.design_title', 'Design')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.lifecycle.design_desc', 'Visually edit any page by selecting an element to instantly rewrite, resize, or move it.')}</p>
              <a
                href="/features/design"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/design');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 relative overflow-hidden h-64 font-serif text-slate-700 dark:text-[#D4D4D4] shadow-xs">
               <h4 className="text-lg text-slate-900 dark:text-white italic mb-2">Acme Labs</h4>
               <p className="text-xs text-slate-600 dark:text-[#A1A1AA] mb-2 leading-relaxed font-sans">{t('preview.acme_text_1', "Software creation is changing. We are a group of researchers, engineers, and technologists inventing at the edge of what's useful and possible.")}</p>
               <div className="text-xs text-slate-600 dark:text-[#A1A1AA] mb-4 font-sans">
                 <span className="bg-blue-500/20 text-blue-500 dark:text-blue-400 px-1 text-[10px] uppercase mr-1">JoinTeamLink &lt;a&gt;</span><br/>
                 <span className="border border-blue-500/50 p-0.5">{t('features.lifecycle.design_mock_join', 'Join our team →')}</span>
               </div>
               <div className="absolute bottom-4 left-4 right-4 bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 p-2 rounded flex items-center justify-between font-sans">
                 <span className="text-[10px] text-slate-900 dark:text-white">{t('features.lifecycle.design_mock_btn', 'Make JoinTeamLink a button')}</span>
                 <span className="text-[10px] text-slate-500 dark:text-[#A1A1AA]">↑</span>
               </div>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.lifecycle.debug_title', 'Debug')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.lifecycle.debug_desc', 'FLOAT instruments your code and uses real execution data to pinpoint the fix.')}</p>
              <a
                href="/features/debug"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/debug');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 relative overflow-hidden h-64 shadow-xs">
               <div className="bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 p-3 rounded-lg mb-4 text-xs text-slate-900 dark:text-white">
                 {t('features.lifecycle.debug_mock_issue', 'Chart tooltips freeze when hovering over data points.')}
               </div>
               <div className="flex flex-col gap-1 text-[10px] text-slate-600 dark:text-[#A1A1AA] mb-4">
                 <div><span className="text-slate-900 dark:text-white font-medium">{t('preview.read', 'Checked')}</span> {t('features.lifecycle.debug_mock_check', 'server output')}</div>
                 <div><span className="text-slate-900 dark:text-white font-medium">{t('preview.read', 'Added')}</span> {t('features.lifecycle.debug_mock_logs', 'console logs')}</div>
                 <div><span className="text-slate-900 dark:text-white font-medium">{t('preview.read', 'Took')}</span> {t('features.lifecycle.debug_mock_screenshot', 'screenshot')}</div>
                 <div><span className="text-slate-900 dark:text-white font-medium">{t('preview.read', 'Read')}</span> ChartRenderer.tsx</div>
                 <div className="text-slate-900 dark:text-white font-medium mt-1">{t('features.lifecycle.debug_mock_found', 'Found it: stale closure in the hover handler.')}</div>
               </div>
               <div className="bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 p-2 rounded text-xs flex justify-between items-center text-slate-600 dark:text-[#A1A1AA]">
                 <span>📄 Tooltip.tsx</span>
                 <span className="text-green-600 dark:text-green-500 font-mono">+3 -1</span>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature: Real engineering */}
      <section className="py-24 max-w-6xl mx-auto px-6 border-t border-slate-200 dark:border-white/5">
        <h2 className="text-3xl font-medium tracking-tight mb-2 text-slate-900 dark:text-white">
          {t('features.engineering.title', 'Equipped to do real engineering')}
        </h2>
        <p className="text-slate-600 dark:text-[#A1A1AA] text-xl mb-16">
          {t('features.engineering.desc', 'FLOAT edits files, runs terminal commands, searches the web, and more.')}
        </p>

        <div className="grid md:grid-cols-2 gap-6 text-left">
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.engineering.terminal_title', 'Terminal')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.engineering.terminal_desc', 'Run shell commands directly from FLOAT, from builds to tests to installs. Sandboxed by default.')}</p>
              <a
                href="/features/terminal"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/terminal');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 h-64 font-mono text-[10px] shadow-xs">
               <div className="bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 p-2 rounded mb-2 text-slate-900 dark:text-white">{t('features.engineering.terminal_mock_input', 'build this project')}</div>
               <div className="text-slate-500 dark:text-[#A1A1AA] mb-2 flex flex-col gap-1">
                 <div>{t('features.engineering.terminal_mock_read', 'Read package.json')}</div>
                 <div>{t('features.engineering.terminal_mock_run', 'Ran terminal command')}</div>
               </div>
               <div className="bg-slate-900 text-slate-300 dark:bg-[#0A0A0A] border border-slate-700 dark:border-white/5 p-2 rounded">
                 <div className="text-white mb-1 font-semibold">$ npm run build</div>
                 <div>{t('features.engineering.terminal_mock_compiling', 'compiling (1047 modules)')}</div>
                 <div>{t('features.engineering.terminal_mock_collect', 'Collecting page data...')}</div>
                 <div>{t('features.engineering.terminal_mock_static', 'Generating static pages (48/48)')}</div>
                 <div>{t('features.engineering.terminal_mock_finalize', 'Finalizing page optimization...')}</div>
                 <div className="text-green-400 dark:text-green-500">{t('features.engineering.terminal_mock_success', '✓ Compiled successfully in 3.8s')}</div>
               </div>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.engineering.context_title', 'Add context')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.engineering.context_desc', 'Point FLOAT at exactly what matters with @-mentions and image uploads for reference.')}</p>
              <a
                href="/features/add-context"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/add-context');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 h-64 flex items-end shadow-xs">
               <div className="w-full bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 p-3 rounded-lg text-sm text-slate-900 dark:text-white flex justify-between items-center shadow-sm">
                 <div>{t('features.engineering.context_mock_msg', 'Make drawer.tsx use vaul.emilkowal.ski and match our brand')}</div>
                 <div className="w-6 h-6 bg-slate-900 text-white dark:bg-white dark:text-black rounded-full flex items-center justify-center text-xs font-bold">↑</div>
               </div>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.engineering.git_title', 'Git & checkpoints')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.engineering.git_desc', 'See how your code has evolved, and roll back to a previous snapshot anytime.')}</p>
              <a
                href="/features/git-checkpoints"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/git-checkpoints');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 h-64 text-[11px] flex flex-col gap-3 shadow-xs">
               <div className="flex justify-between text-slate-600 dark:text-[#A1A1AA]"><span>{t('features.engineering.git_mock_1', 'Set up Next.js project')}</span><span>Jan 8 —</span></div>
               <div className="flex justify-between text-slate-600 dark:text-[#A1A1AA]"><span>{t('features.engineering.git_mock_2', 'Add Google OAuth')}</span><span>Jan 12 —</span></div>
               <div className="flex justify-between text-slate-600 dark:text-[#A1A1AA]"><span>{t('features.engineering.git_mock_3', 'Build canvas editor')}</span><span>Jan 18 —</span></div>
               <div className="flex justify-between text-slate-900 dark:text-white bg-slate-100 dark:bg-white/5 px-2 py-1 rounded -mx-2 items-center font-medium">
                 <span className="flex items-center gap-2">{t('features.engineering.git_mock_4', 'Add multiplayer')} ↶</span>
                 <span>{t('features.engineering.git_time_yesterday', 'Yesterday —')}</span>
               </div>
               <div className="flex justify-between text-slate-600 dark:text-[#A1A1AA]"><span>{t('features.engineering.git_mock_5', 'Improve performance')}</span><span>{t('features.engineering.git_time_3h', '3h ago —')}</span></div>
               <div className="flex justify-between text-slate-600 dark:text-[#A1A1AA]"><span>{t('features.engineering.git_mock_6', 'Add keyboard shortcuts')}</span><span>{t('features.engineering.git_time_1h', '1h ago —')}</span></div>
               <div className="flex justify-between text-slate-600 dark:text-[#A1A1AA]"><span>{t('features.engineering.git_mock_7', 'Ship to production')}</span><span>{t('features.engineering.git_time_now', 'Now —')}</span></div>
            </div>
          </div>
        </div>

      </section>

      {/* Feature: Extend */}
      <section className="py-24 max-w-6xl mx-auto px-6 border-t border-slate-200 dark:border-white/5">
        <h2 className="text-3xl font-medium tracking-tight mb-2 text-slate-900 dark:text-white">
          {t('features.extend.title', 'Extend with tools and knowledge')}
        </h2>
        <p className="text-slate-600 dark:text-[#A1A1AA] text-xl mb-16">
          {t('features.extend.desc', 'Give FLOAT your existing context, and add custom capabilities.')}
        </p>

        <div className="grid md:grid-cols-2 gap-6 text-left">
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.extend.plugins_title', 'Plugins')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.extend.plugins_desc', 'Browse and install community-built plugins to extend FLOAT with new capabilities.')}</p>
              <a
                href="/features/plugins"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/plugins');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 h-64 flex items-center justify-center shadow-xs">
               <div className="w-full bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 rounded-lg p-2 shadow-sm">
                 <div className="text-amber-600 dark:text-[#FFBD2E] text-sm mb-2 px-2 font-mono">/add-plugin|</div>
                 <div className="text-[10px] text-slate-500 dark:text-[#A1A1AA] px-2 mb-2 uppercase">{t('features.extend.add_plugin', 'Add plugin')}</div>
                 <div className="flex flex-col">
                   <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded text-xs text-slate-800 dark:text-white"><span className="text-[#E01E5A]">#</span> Slack Messaging Kit</div>
                   <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded text-xs text-slate-800 dark:text-white"><span className="text-[#F24E1E]">❖</span> Figma Visual Editor</div>
                   <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded text-xs text-slate-800 dark:text-white"><span className="font-bold">N</span> Notion Workspace Integration</div>
                 </div>
               </div>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.extend.skills_title', 'Skills')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.extend.skills_desc', 'Add domain knowledge to let FLOAT discover and run specialized prompts and code.')}</p>
              <a
                href="/features/skills"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/skills');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-slate-100 dark:bg-[#3A3930] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 h-64 flex items-center justify-center shadow-xs">
               <div className="w-full bg-white dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 rounded-lg p-2 shadow-sm relative">
                 <div className="text-slate-900 dark:text-white text-xs mb-3 px-2">{t('features.extend.skills_mock_prompt', "let's /apply-notion-styleguide and /|")}</div>
                 <div className="absolute top-10 left-0 right-0 bg-slate-50 dark:bg-[#2A2824] border border-slate-200 dark:border-white/10 rounded-lg p-2 shadow-xl z-10">
                   <div className="text-[10px] text-slate-500 dark:text-[#A1A1AA] px-2 mb-2 uppercase">{t('features.extend.skills_label', 'Skills')}</div>
                   <div className="flex flex-col gap-2">
                     <div className="px-2 py-1 hover:bg-slate-200/60 dark:hover:bg-white/5 rounded">
                       <div className="text-xs text-slate-900 dark:text-white font-medium">/fix-merge-conflicts</div>
                       <div className="text-[10px] text-slate-500 dark:text-[#A1A1AA]">{t('features.extend.skill_1_desc', 'Resolve git conflicts automatically')}</div>
                     </div>
                     <div className="px-2 py-1 hover:bg-slate-200/60 dark:hover:bg-white/5 rounded">
                       <div className="text-xs text-slate-900 dark:text-white font-medium">/code-review</div>
                       <div className="text-[10px] text-slate-500 dark:text-[#A1A1AA]">{t('features.extend.skill_2_desc', 'Analyze code for issues and improvements')}</div>
                     </div>
                     <div className="px-2 py-1 bg-slate-200/80 dark:bg-white/5 rounded">
                       <div className="text-xs text-slate-900 dark:text-white font-medium">/apply-notion-styleguide</div>
                       <div className="text-[10px] text-slate-500 dark:text-[#A1A1AA]">{t('features.extend.skill_3_desc', 'Format code to match team standards')}</div>
                     </div>
                   </div>
                 </div>
               </div>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.extend.mcp_title', 'MCP')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.extend.mcp_desc', 'Connect external tools and data sources like GitHub and Figma directly to FLOAT.')}</p>
              <a
                href="/features/mcp"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/mcp');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 h-64 flex items-center justify-center relative overflow-hidden shadow-xs">
               <div className="w-16 h-16 bg-slate-900 dark:bg-white text-white dark:text-black rounded flex items-center justify-center relative z-10 shadow-lg">
                 <div className="w-8 h-8 bg-slate-100 dark:bg-[#161410] transform rotate-45" />
               </div>
               {/* Orbital icons */}
               <div className="absolute inset-0 opacity-20 text-slate-800 dark:text-white">
                  <div className="absolute top-8 left-1/2 -translate-x-1/2">❖</div>
                  <div className="absolute bottom-8 left-1/2 -translate-x-1/2">▲</div>
                  <div className="absolute left-8 top-1/2 -translate-y-1/2">N</div>
                  <div className="absolute right-8 top-1/2 -translate-y-1/2">🌐</div>
                  <div className="absolute top-1/4 left-1/4">#</div>
                  <div className="absolute bottom-1/4 right-1/4">⚡</div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature: Codebase understanding */}
      <section className="py-24 max-w-6xl mx-auto px-6 border-t border-slate-200 dark:border-white/5">
        <h2 className="text-3xl font-medium tracking-tight mb-2 text-slate-900 dark:text-white">
          {t('features.codebase.title', 'Find and attach codebase context')}
        </h2>
        <p className="text-slate-600 dark:text-[#A1A1AA] text-xl mb-16">
          {t('features.codebase.desc', 'Search project files and attach relevant context to an AI chat.')}
        </p>

        <div className="grid md:grid-cols-2 gap-6 text-left">
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">Choose a model</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">Select GPT-6 Astra or GPT-6.1 Sol for a chat. Model access depends on server configuration.</p>
              <a
                href="/features/multiple-models"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/multiple-models');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-4 h-64 overflow-hidden shadow-xs">
                <div className="flex flex-col gap-3">
                  <div className="bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 p-3 rounded-lg text-sm text-slate-900 dark:text-white">GPT-6 Astra</div>
                  <div className="bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 p-3 rounded-lg text-sm text-slate-900 dark:text-white">GPT-6.1 Sol</div>
                  <p className="text-xs text-slate-500 dark:text-[#A1A1AA]">Access is determined by the configured provider account.</p>
                </div>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.codebase.rules_title', 'Team rules')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('features.codebase.rules_desc', 'Teach FLOAT your preferences, from team conventions to specific architectural decisions.')}</p>
              <a
                href="/features/team-rules"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/team-rules');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-slate-100 dark:bg-[#3A3930] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 h-64 flex justify-center items-end overflow-hidden shadow-xs">
               <div className="w-full h-[90%] bg-white dark:bg-[#1E1C18] rounded-t-lg border border-slate-200 dark:border-white/10 p-4 border-b-0 font-mono text-[10px] text-slate-600 dark:text-[#A1A1AA] flex flex-col gap-2">
                 <div>---</div>
                 <div><span className="text-emerald-600 dark:text-[#7EE787]">description:</span> Notion-inspired block architecture</div>
                 <div><span className="text-emerald-600 dark:text-[#7EE787]">globs:</span> components/blocks/**/*.tsx</div>
                 <div>---</div>
                 <div className="mt-2 text-slate-900 dark:text-white font-bold"># Notion Block System</div>
                 <div className="mt-2 text-slate-900 dark:text-white font-bold">## Patterns</div>
                 <div>- Use `Block` components for all content types</div>
               </div>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('features.codebase.search_title', 'Search project files')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">Find text and code references in the current project.</p>
              <a
                href="/features/codebase-search"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/codebase-search');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('features.lifecycle.learn_more', 'Learn more')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 h-64 flex flex-col justify-center shadow-xs">
               <div className="bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 p-3 rounded-lg text-xs text-slate-900 dark:text-white shadow-sm mb-4">
                 {t('features.codebase.search_mock_q', 'How does the payment flow handle failed transactions?')}
               </div>
               <div className="flex flex-col gap-2 text-[10px] text-slate-500 dark:text-[#A1A1AA] px-2">
                 <div><span className="text-slate-900 dark:text-white font-medium">{t('features.codebase.search_mock_searched', 'Searched')}</span> {t('features.codebase.search_mock_s1', 'payment retry logic')}</div>
                 <div><span className="text-slate-900 dark:text-white font-medium">{t('preview.read', 'Read')}</span> checkout/PaymentService.ts</div>
                 <div><span className="text-slate-900 dark:text-white font-medium">{t('preview.read', 'Read')}</span> lib/stripe/webhooks.ts</div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Product capabilities */}
      <section className="py-24 max-w-6xl mx-auto px-6 border-t border-slate-200 dark:border-white/5">
        <h2 className="text-3xl font-medium tracking-tight mb-4 text-center text-slate-900 dark:text-white">
          Coding tools in one browser workspace
        </h2>
        <p className="max-w-2xl mx-auto mb-12 text-center text-slate-600 dark:text-[#A1A1AA]">
          Explore a project, ask an AI model for help, review proposed changes, and keep your work organized in FLOAT.
        </p>
        <div className="grid md:grid-cols-3 gap-4 text-left">
          {[
            ['Work with your project', 'Browse files and edit code in the workspace.'],
                  ['Use server-configured AI', 'Choose GPT-6 Astra or GPT-6.1 Sol. Access depends on the server provider configuration.'],
            ['Review before applying', 'Inspect proposed code changes and validation output before accepting them.'],
          ].map(([title, description]) => (
            <div key={title} className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl p-6">
              <h3 className="text-slate-900 dark:text-white font-medium mb-2">{title}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature: Models and workspace */}
      <section className="py-24 max-w-6xl mx-auto px-6 border-t border-slate-200 dark:border-white/5">
        <div className="grid md:grid-cols-2 gap-6 text-left">
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">Choose a model</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">Select GPT-6 Astra or GPT-6.1 Sol. Access depends on the server provider configuration.</p>
              <a
                href="/features/multiple-models"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/multiple-models');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('cards.best_model_cta', 'Explore models')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-6 h-[400px] flex items-center justify-center shadow-xs">
               <div className="w-full bg-slate-50 dark:bg-[#1E1C18] border border-slate-200 dark:border-white/10 rounded-lg shadow-2xl overflow-hidden text-sm relative pb-[200px]">
                 <div className="p-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between text-slate-500 dark:text-[#A1A1AA]">
                    <div>Ask FLOAT about your code</div>
                 </div>
                 <div className="p-3 flex items-center justify-between">
                   <div className="flex items-center gap-2 bg-slate-200/70 dark:bg-white/5 px-2 py-1 rounded text-slate-900 dark:text-white">
                      <span>GPT-6 Astra ∨</span>
                   </div>
                   <div className="w-6 h-6 bg-slate-900 dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center font-bold">↑</div>
                 </div>
                 {/* Dropdown popup */}
                 <div className="absolute bottom-16 left-24 right-8 bg-white dark:bg-[#2A2824] border border-slate-200 dark:border-white/10 rounded-lg shadow-2xl py-2 z-10 flex flex-col text-slate-800 dark:text-white">
                    <div className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/5 flex justify-between"><span>GPT-6 Astra</span><span>✓</span></div>
                    <div className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/5">GPT-6.1 Sol</div>
                 </div>
               </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2 text-slate-900 dark:text-white">{t('cards.enterprise_title', 'Develop enduring software')}</h3>
              <p className="text-slate-600 dark:text-[#A1A1AA] text-sm mb-4">{t('cards.enterprise_desc', 'Keep project files, AI conversations, and development tools together in one workspace.')}</p>
              <a
                href="/features/enterprise"
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', '/features/enterprise');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="text-[#FF5F56] text-sm font-medium flex items-center gap-1 hover:text-[#FF5F56]/80 transition-colors cursor-pointer"
              >
                {t('cards.enterprise_cta', 'Explore the workspace')} <ArrowRight size={14} />
              </a>
            </div>
            <div className="bg-slate-100 dark:bg-[#161410] border border-slate-200 dark:border-white/5 rounded-xl flex-1 p-0 h-[400px] overflow-hidden relative shadow-xs">
               <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1555099962-4199c345e5dd?q=80&w=2070')] bg-cover bg-center opacity-40 mix-blend-luminosity" />
               <div className="absolute inset-0 bg-gradient-to-t from-slate-100 dark:from-[#161410] to-transparent" />
            </div>
          </div>
        </div>
      </section>

      {/* Developer Testimonials & Social Proof */}
      <TestimonialsSection />

      {/* Resources */}
      <section className="py-20 max-w-6xl mx-auto px-6 border-t border-slate-200 dark:border-white/5 text-center">
        <h2 className="text-3xl font-medium tracking-tight mb-4 text-slate-900 dark:text-white">Learn your way around FLOAT</h2>
        <p className="max-w-xl mx-auto mb-8 text-slate-600 dark:text-[#A1A1AA]">Read the documentation or browse guides before starting a workspace.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <a href="/resources/docs" className="px-5 py-2.5 rounded-full border border-slate-300 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/5">Documentation</a>
          <a href="/resources/guides" className="px-5 py-2.5 rounded-full border border-slate-300 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/5">Guides</a>
          <a href="/resources/help" className="px-5 py-2.5 rounded-full border border-slate-300 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/5">Help center</a>
        </div>
      </section>

      {/* CTA */}
      <section className="py-40 flex flex-col items-center text-center border-t border-slate-200 dark:border-white/5">
        <h2 className="text-5xl md:text-7xl font-medium tracking-tight mb-12 text-slate-900 dark:text-white">
          {t('cta.title', 'Try FLOAT now.')}
        </h2>
        <button
          onClick={handleStart}
          className="px-8 py-4 bg-slate-900 dark:bg-white text-white dark:text-black rounded-full hover:bg-slate-800 dark:hover:bg-white/90 transition-colors font-medium flex items-center gap-2 text-lg shadow-[0_0_40px_rgba(0,0,0,0.1)] dark:shadow-[0_0_40px_rgba(255,255,255,0.2)] cursor-pointer"
        >
          Open FLOAT <ArrowRight size={20} />
        </button>
      </section>

      {/* Footer */}
      <footer className="py-16 border-t border-slate-200 dark:border-white/5 px-6 bg-slate-100 dark:bg-[#0A0A08] text-left">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-8 text-sm mb-16">
          <div className="flex flex-col gap-4">
            <h4 className="text-slate-900 dark:text-white font-semibold mb-2">{t('footer.product', 'Product')}</h4>
            <a href="/features" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">Features</a>
            <a href="/pricing" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">{t('footer.pricing', 'Pricing')}</a>
            <a href="/models" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">Models</a>
          </div>
          <div className="flex flex-col gap-4">
            <h4 className="text-slate-900 dark:text-white font-semibold mb-2">{t('footer.resources', 'Resources')}</h4>
            <a href="/resources/changelog" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">{t('footer.changelog', 'Changelog')}</a>
            <a href="/resources/docs" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">{t('footer.docs', 'Docs')}</a>
            <a href="/learn" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">{t('footer.learn', 'Learn')}</a>
            <a href="/resources" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">{t('footer.value_calculator', 'Resource Hub')}</a>
            <a href="/resources/help" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">{t('footer.help', 'Help')}</a>
            <a href="/models/usage" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">Usage</a>
          </div>
          <div className="flex flex-col gap-4">
            <h4 className="text-slate-900 dark:text-white font-semibold mb-2">{t('footer.legal', 'Legal')}</h4>
            <a href="/privacy" className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors">Privacy &amp; Data Handling</a>
          </div>
        </div>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center text-xs text-slate-500 dark:text-[#A1A1AA] gap-4">
          <div>{t('footer.copyright', '© 2026 FLOAT, Inc.')}</div>
        </div>
      </footer>
    </div>
  );
}
