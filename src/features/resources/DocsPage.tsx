import React, { useState, useMemo } from 'react';
import { ResourcesHeader } from './ResourcesHeader';
import { ResourcesFooter } from './ResourcesFooter';
import { 
  Search, 
  BookOpen, 
  Sparkles, 
  Code, 
  Layers, 
  Settings, 
  AlertCircle, 
  ChevronRight, 
  Terminal, 
  FileCode, 
  CheckCircle2, 
  Copy, 
  Check, 
  ExternalLink 
} from 'lucide-react';

interface DocSection {
  id: string;
  category: string;
  title: string;
  desc: string;
  status?: 'AVAILABLE' | 'COMING SOON';
  content: {
    summary: string;
    steps?: string[];
    details: string[];
    codeSnippet?: string;
    tips?: string[];
  };
}

export function DocsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [activeDocId, setActiveDocId] = useState<string>('getting-started');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  React.useEffect(() => {
    document.title = 'Documentation — FLOAT';
  }, []);

  const docs: DocSection[] = [
    {
      id: 'getting-started',
      category: 'Getting Started',
      title: 'Introduction to FLOAT',
      desc: 'Understand the core concepts of FLOAT and how it transforms software development.',
      status: 'AVAILABLE',
      content: {
        summary: 'FLOAT is an AI-powered development environment designed to help developers create, explore, edit, and review software with high-precision AI assistance.',
        details: [
          'FLOAT combines an intelligent chat workflow, specialized AI modes (Ask, Plan, Edit, and Agent), and a Monaco-powered code editor with rigorous diff reviews.',
          'Built on clean web technologies (React 19, TypeScript, Tailwind CSS) and secured with Firebase, FLOAT provides both cloud convenience and responsive desktop-grade performance.'
        ],
        tips: [
          'Use the top navigation bar to switch between the Workspace, Models Hub, and Pricing.',
          'Open multiple files in the editor tabs to maintain context while asking the AI questions.'
        ]
      }
    },
    {
      id: 'accessing-float',
      category: 'Getting Started',
      title: 'Accessing & Installing FLOAT',
      desc: 'Run FLOAT directly in any modern web browser or as an installed progressive web application.',
      status: 'AVAILABLE',
      content: {
        summary: 'FLOAT can be accessed instantly in the browser without installing local runtime dependencies.',
        steps: [
          'Navigate to the FLOAT website and click "Sign in" or "Download".',
          'Create a secure account or sign in with your email or Google OAuth credentials.',
          'On desktop browsers, you can install FLOAT as a desktop app via the browser install prompt.'
        ],
        details: [
          'Session tokens are authenticated securely via Firebase Auth.',
          'Your workspaces and settings persist automatically across browser restarts.'
        ]
      }
    },
    {
      id: 'first-project',
      category: 'Getting Started',
      title: 'Creating Your First Project',
      desc: 'Set up a new coding project or import an existing codebase into the FLOAT workspace.',
      status: 'AVAILABLE',
      content: {
        summary: 'Start by creating a fresh project from the Dashboard or by opening a workspace template.',
        steps: [
          'Click the "New Project" button on the Dashboard.',
          'Enter a project title and select a language environment (e.g. TypeScript/React, Python).',
          'Click "Create Project" to initialize your workspace with the file tree, Monaco editor, and AI chat panel.'
        ],
        details: [
          'Duplicate submission guards ensure you do not accidentally create duplicate projects.',
          'Project ownership is strictly scoped to your authenticated user ID in Firestore.'
        ]
      }
    },
    {
      id: 'workspace-overview',
      category: 'Workspace',
      title: 'Understanding the Workspace',
      desc: 'Master the 4-panel developer layout: Activity Bar, File Explorer, Editor, and AI Assistant.',
      status: 'AVAILABLE',
      content: {
        summary: 'FLOAT features a familiar, high-productivity developer layout inspired by modern IDEs.',
        details: [
          'Activity Bar: Leftmost rail for switching between File Explorer, Search, Git, Extensions, and Settings.',
          'File Explorer: Interactive tree view supporting file opening, folder expansion, and contextual operations.',
          'Editor Area: Monaco Editor with tab management, syntax highlighting, line numbers, and inline diff viewing.',
          'AI Panel: Right-hand chat and agent interface for conversational questions, planning, and code changes.'
        ],
        tips: [
          'Collapse the AI panel or file explorer to maximize editor screen estate when focused on deep coding.',
          'Check the bottom status bar for current language, encoding, and active AI model indicators.'
        ]
      }
    },
    {
      id: 'ai-chat-workflow',
      category: 'AI Assistance',
      title: 'Using AI Chat',
      desc: 'Communicate naturally with the AI to query files, generate code, and diagnose errors.',
      status: 'AVAILABLE',
      content: {
        summary: 'The AI chat provides contextual assistance with direct awareness of your open files and project state.',
        details: [
          'Conversations maintain multi-turn history with explicit turn budgets to ensure prompt precision.',
          'You can clear conversation history at any time using "New Chat" to start with a fresh context window.',
          'Responses stream in real time and handle network interruptions gracefully.'
        ],
        codeSnippet: `// Example prompt in AI Chat:\n"Explain how the auth middleware in server/authMiddleware.ts validates Firebase tokens"`
      }
    },
    {
      id: 'ai-modes',
      category: 'AI Assistance',
      title: 'Ask, Plan, Edit & Agent Modes',
      desc: 'Choose the exact level of autonomy and intervention appropriate for your task.',
      status: 'AVAILABLE',
      content: {
        summary: 'FLOAT categorizes AI interaction into 4 distinct modes tailored to specific development phases.',
        details: [
          'ASK mode: Read-only exploration. Answers questions and explains architectures without modifying files.',
          'PLAN mode: Architectural roadmapping. Breaks down complex features into structured, verifiable implementation steps.',
          'EDIT mode: Targeted code modifications. Proposes precise diffs with side-by-side review before applying.',
          'AGENT mode: Autonomous task execution. Coordinates multi-step file reads, edits, and diagnostics.'
        ],
        tips: [
          'Always use PLAN mode before launching large multi-file refactors.',
          'Use ASK mode when performing security audits or onboarding to unfamiliar files.'
        ]
      }
    },
    {
      id: 'code-editor-diffs',
      category: 'Editor & Files',
      title: 'Monaco Editor & Diff Review',
      desc: 'Review every AI-generated code change with unified or split diff views before applying.',
      status: 'AVAILABLE',
      content: {
        summary: 'Human-in-the-loop review is a core FLOAT principle: code is never silently overwritten.',
        steps: [
          'When the AI generates or edits code in EDIT or AGENT mode, a Diff Review card is displayed.',
          'Inspect the red (removals) and green (additions) line-by-line diffs.',
          'Click "Accept Change" to apply the diff to your file or "Reject" to discard the proposal.'
        ],
        details: [
          'Monaco Editor provides rich syntax highlighting for TypeScript, JavaScript, Python, JSON, HTML, and CSS.',
          'Unsaved change indicators remind you to save file state.'
        ]
      }
    },
    {
      id: 'model-configuration',
      category: 'AI Models',
      title: 'Models & Provider Routing',
      desc: 'Inspect supported models, context limits, token usage, and centralized routing.',
      status: 'AVAILABLE',
      content: {
        summary: 'FLOAT uses a centralized provider router to handle model dispatching and telemetry.',
        details: [
          'Active Primary: Gemini (gemini-3.8-flash) configured for fast inference and large context windows.',
          'Evaluations & Benchmarks: Compare performance, latency, and cost in the Models Hub (/models).',
          'Token Tracking: Real-time token consumption analytics available at /models/usage.'
        ],
        tips: [
          'FLOAT strictly forbids silent fallback: if a model is unavailable, an honest actionable error is returned.'
        ]
      }
    },
    {
      id: 'account-settings',
      category: 'Settings',
      title: 'Account, Themes & Preferences',
      desc: 'Customize dark/light mode, language preferences, and manage authentication credentials.',
      status: 'AVAILABLE',
      content: {
        summary: 'FLOAT provides extensive personalization while maintaining strict data isolation.',
        details: [
          'Theme System: Toggle between sleek developer dark mode and crisp high-contrast light mode.',
          'Localization: Built-in support for 10 languages (English, Spanish, Chinese, Japanese, French, etc.).',
          'Persistence: Preferences are automatically stored in local storage and synced to user settings.'
        ]
      }
    },
    {
      id: 'cloud-agents',
      category: 'AI Assistance',
      title: 'Cloud Agents & Background Tasks',
      desc: 'Delegate long-running builds, test suites, and refactorings to background cloud agents.',
      status: 'COMING SOON',
      content: {
        summary: 'Cloud Agents will enable asynchronous task execution on remote runners without keeping the browser open.',
        details: [
          'Currently in active development: multi-agent task graph orchestration and isolated execution sandboxes.',
          'Will support automated branch creation, pull request generation, and test execution.'
        ]
      }
    },
    {
      id: 'troubleshooting',
      category: 'Troubleshooting',
      title: 'Common Troubleshooting Steps',
      desc: 'Resolve network timeouts, quota limits, editor synchronization, and authentication issues.',
      status: 'AVAILABLE',
      content: {
        summary: 'Follow these diagnostic steps if you encounter issues during your development session.',
        steps: [
          'Session Expired: If an operation returns an authentication error, sign out and sign in again via the profile menu.',
          'Model Quota Exceeded: Wait 30 seconds or check your token rate limits on the Usage dashboard.',
          'Editor Sync Issue: Use the Reload File command from the command palette to re-fetch the latest document state from Firestore.'
        ],
        details: [
          'FLOAT surfaces clear error notifications rather than failing silently.'
        ]
      }
    }
  ];

  const categories = ['All', 'Getting Started', 'Workspace', 'AI Assistance', 'Editor & Files', 'AI Models', 'Settings', 'Troubleshooting'];

  const filteredDocs = useMemo(() => {
    return docs.filter(doc => {
      const matchesCategory = selectedCategory === 'All' || doc.category === selectedCategory;
      const matchesQuery = searchQuery === '' || 
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [docs, selectedCategory, searchQuery]);

  const activeDoc = docs.find(d => d.id === activeDocId) || docs[0];

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A08] text-slate-900 dark:text-white flex flex-col font-sans transition-colors">
      <ResourcesHeader currentPath="/resources/docs" />

      <main className="flex-1 pt-28 pb-20 max-w-7xl mx-auto w-full px-6">
        {/* Header Title */}
        <div className="mb-8 pb-6 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400 font-medium mb-1">
            <BookOpen size={14} />
            <span>FLOAT DOCUMENTATION</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 dark:text-white mb-2">
            Documentation Index
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#A1A1AA] max-w-2xl">
            Everything you need to build, navigate, and review code with FLOAT AI.
          </p>

          {/* Search bar */}
          <div className="mt-6 max-w-xl relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search documentation (e.g. Monaco diffs, Ask mode, Gemini)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-xs"
            />
          </div>
        </div>

        {/* Layout: Sidebar + Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Category Sidebar */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2 lg:pb-0 lg:flex-wrap">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                    selectedCategory === cat
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-black shadow-xs'
                      : 'bg-white dark:bg-[#161616] text-slate-600 dark:text-[#A1A1AA] border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Document list */}
            <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shadow-xs divide-y divide-slate-100 dark:divide-white/5 max-h-[600px] overflow-y-auto">
              {filteredDocs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No documentation found matching "{searchQuery}".
                </div>
              ) : (
                filteredDocs.map(doc => {
                  const isActive = doc.id === activeDoc.id;
                  return (
                    <button
                      key={doc.id}
                      onClick={() => setActiveDocId(doc.id)}
                      className={`w-full text-left p-3.5 flex items-start justify-between gap-3 transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-purple-50/80 dark:bg-purple-950/20 text-slate-900 dark:text-white border-l-3 border-purple-600'
                          : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-[#A1A1AA]'
                      }`}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-900 dark:text-white">
                            {doc.title}
                          </span>
                          {doc.status === 'COMING SOON' && (
                            <span className="text-[9px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 px-1.5 py-0.2 rounded">
                              Coming soon
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 dark:text-[#8B949E] line-clamp-1">
                          {doc.desc}
                        </span>
                      </div>
                      <ChevronRight size={14} className={`shrink-0 mt-1 transition-transform ${isActive ? 'translate-x-0.5 text-purple-600' : 'text-slate-400'}`} />
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Active Document Reader */}
          <div className="lg:col-span-8 bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-xl p-6 sm:p-8 shadow-xs">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#8B949E] mb-2">
              <span>{activeDoc.category}</span>
              <span aria-hidden="true">/</span>
              <span className="text-slate-900 dark:text-white font-medium">{activeDoc.title}</span>
            </div>

            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                {activeDoc.title}
              </h2>
              {activeDoc.status === 'COMING SOON' && (
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded">
                  Coming soon
                </span>
              )}
            </div>

            <p className="text-sm text-slate-600 dark:text-[#A1A1AA] leading-relaxed mb-6 pb-6 border-b border-slate-100 dark:border-white/5">
              {activeDoc.content.summary}
            </p>

            {/* Steps if any */}
            {activeDoc.content.steps && (
              <div className="mb-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white mb-3">
                  Step-by-step instructions
                </h3>
                <ol className="space-y-3">
                  {activeDoc.content.steps.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
                      <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Details */}
            <div className="space-y-3 mb-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white mb-3">
                Key Details
              </h3>
              {activeDoc.content.details.map((detail, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  <CheckCircle2 size={16} className="text-purple-600 dark:text-purple-400 shrink-0 mt-1" />
                  <span>{detail}</span>
                </div>
              ))}
            </div>

            {/* Code snippet if any */}
            {activeDoc.content.codeSnippet && (
              <div className="mb-6">
                <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-900 text-slate-300 px-4 py-2 rounded-t-lg font-mono">
                  <span>Code Example</span>
                  <button
                    onClick={() => handleCopy(activeDoc.content.codeSnippet!)}
                    className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
                  >
                    {copiedSnippet ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    <span>{copiedSnippet ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="p-4 bg-[#0A0D12] text-slate-200 rounded-b-lg font-mono text-xs overflow-x-auto border-t-0 border border-slate-800">
                  <code>{activeDoc.content.codeSnippet}</code>
                </pre>
              </div>
            )}

            {/* Tips */}
            {activeDoc.content.tips && (
              <div className="p-4 rounded-lg bg-slate-100/80 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs text-slate-600 dark:text-[#A1A1AA] flex flex-col gap-2">
                <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Sparkles size={14} className="text-purple-500" />
                  Pro Tip
                </span>
                {activeDoc.content.tips.map((tip, idx) => (
                  <p key={idx}>{tip}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <ResourcesFooter />
    </div>
  );
}
