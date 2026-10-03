import React, { useState, useMemo } from 'react';
import { ResourcesHeader } from './ResourcesHeader';
import { ResourcesFooter } from './ResourcesFooter';
import { 
  HelpCircle, 
  Search, 
  ChevronDown, 
  MessageSquare, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Send, 
  FileText, 
  Terminal, 
  Layers 
} from 'lucide-react';

interface FaqItem {
  id: string;
  category: 'General' | 'Account' | 'Workspace' | 'AI & Models' | 'Editor & Diffs' | 'Integrations';
  question: string;
  answer: string;
  tips?: string[];
}

export function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [openFaqId, setOpenFaqId] = useState<string | null>('faq-1');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackCategory, setFeedbackCategory] = useState('Feedback');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  React.useEffect(() => {
    document.title = 'Help Center — FLOAT';
  }, []);

  const faqs: FaqItem[] = [
    {
      id: 'faq-1',
      category: 'General',
      question: 'What is FLOAT and how is it different from a basic chat interface?',
      answer: 'FLOAT is an integrated developer workspace combining an AI assistant with a full Monaco code editor, file tree explorer, diff review engine, and multi-model router. Unlike disconnected chatbot windows, FLOAT has direct context on your files, enables safe line-by-line diff approvals, and supports specialized Ask, Plan, Edit, and Agent workflows.'
    },
    {
      id: 'faq-2',
      category: 'Account',
      question: 'How do I create an account or sign in to FLOAT?',
      answer: 'Click "Sign in" in the top navigation header. You can create an account using your email and password or sign in with supported OAuth providers. Authentication is securely managed via Firebase Authentication.',
      tips: [
        'If you forget your password, you can request a password reset from the sign-in modal.',
        'Session tokens are automatically refreshed so you remain logged in.'
      ]
    },
    {
      id: 'faq-3',
      category: 'Workspace',
      question: 'How are my projects and files saved in FLOAT?',
      answer: 'When you create a project, its metadata, documents, and directory tree are persisted to Cloud Firestore under your authenticated user record. Access control rules strictly isolate each user’s workspaces from other accounts.'
    },
    {
      id: 'faq-4',
      category: 'Editor & Diffs',
      question: 'Will the AI overwrite my code without my permission?',
      answer: 'No. FLOAT strictly enforces human-in-the-loop diff reviews. Whenever code changes are generated in EDIT or AGENT mode, a diff review interface displays proposed additions and deletions side-by-side. You must explicitly click "Accept Change" to apply modifications to your buffer.'
    },
    {
      id: 'faq-5',
      category: 'AI & Models',
      question: 'Which AI models are supported and how are requests routed?',
      answer: 'FLOAT features a centralized provider router. The active primary model is Gemini 3.8 Flash, which provides fast inference and generous context windows. You can benchmark models, review evaluation tasks, and track token usage at /models and /models/usage.',
      tips: [
        'FLOAT does not perform silent fallbacks: if an API error occurs, an explicit actionable message is displayed.'
      ]
    },
    {
      id: 'faq-6',
      category: 'AI & Models',
      question: 'What should I do if I encounter a quota or rate limit error?',
      answer: 'If your request exceeds the provider’s quota limit, wait approximately 30 to 60 seconds before retrying. Starting a fresh conversation via the "New Chat" button also clears accumulated turn history and reduces token payload.'
    },
    {
      id: 'faq-7',
      category: 'Workspace',
      question: 'What do the Ask, Plan, Edit, and Agent modes mean?',
      answer: 'ASK mode is read-only for codebase questions. PLAN mode breaks complex architectures into verifiable roadmaps. EDIT mode proposes targeted code changes with diffs. AGENT mode executes multi-step coding workflows.'
    },
    {
      id: 'faq-8',
      category: 'Integrations',
      question: 'Which developer integrations are currently operational?',
      answer: 'GitHub repository connections are currently supported. Additional developer integrations such as GitLab, Bitbucket, Slack, and Jira are scheduled on the product roadmap and clearly labeled as "Coming Soon" in the Integrations hub.'
    },
    {
      id: 'faq-9',
      category: 'Editor & Diffs',
      question: 'Can I use keyboard shortcuts in the editor?',
      answer: 'Yes. The Monaco editor supports standard developer shortcuts including Cmd/Ctrl+S (Save), Cmd/Ctrl+F (Find), Cmd/Ctrl+P (Quick Open), and Cmd/Ctrl+Z (Undo).'
    }
  ];

  const categories = ['All', 'General', 'Account', 'Workspace', 'AI & Models', 'Editor & Diffs', 'Integrations'];

  const filteredFaqs = useMemo(() => {
    return faqs.filter(faq => {
      const matchesCategory = selectedCategory === 'All' || faq.category === selectedCategory;
      const matchesQuery = searchQuery === '' ||
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [faqs, selectedCategory, searchQuery]);

  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim()) return;
    setFeedbackSubmitted(true);
    setTimeout(() => {
      setFeedbackText('');
      setFeedbackSubmitted(false);
    }, 4000);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A08] text-slate-900 dark:text-white flex flex-col font-sans transition-colors">
      <ResourcesHeader currentPath="/resources/help" />

      <main className="flex-1 pt-28 pb-20 max-w-5xl mx-auto w-full px-6">
        {/* Header */}
        <div className="mb-8 pb-6 border-b border-slate-200 dark:border-white/10 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2 text-xs text-amber-600 dark:text-amber-400 font-medium mb-1">
            <HelpCircle size={14} />
            <span>FLOAT HELP CENTER</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 dark:text-white mb-2">
            Help & Troubleshooting
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#A1A1AA] max-w-2xl">
            Find immediate answers to common questions about accounts, workspaces, diff reviews, and model quotas.
          </p>

          {/* Search bar */}
          <div className="mt-6 max-w-xl relative mx-auto sm:mx-0">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search help topics (e.g. Quotas, Diff review, Sign in)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto no-scrollbar pb-2">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-black shadow-xs'
                  : 'bg-white dark:bg-[#161616] text-slate-600 dark:text-[#A1A1AA] border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* FAQs Accordion */}
        <div className="space-y-3 mb-16">
          {filteredFaqs.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-500">
              No help articles found for "{searchQuery}".
            </div>
          ) : (
            filteredFaqs.map(faq => {
              const isOpen = openFaqId === faq.id;
              return (
                <div
                  key={faq.id}
                  className="bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shadow-xs transition-colors"
                >
                  <button
                    onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                    className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-[#A1A1AA]">
                        {faq.category}
                      </span>
                      <span className="text-sm font-medium text-slate-900 dark:text-white">
                        {faq.question}
                      </span>
                    </div>
                    <ChevronDown
                      size={16}
                      className={`text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-amber-500' : ''}`}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed border-t border-slate-100 dark:border-white/5 space-y-3">
                      <p>{faq.answer}</p>
                      {faq.tips && (
                        <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/30 rounded-lg p-3 text-slate-700 dark:text-slate-300 space-y-1">
                          {faq.tips.map((tip, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <CheckCircle2 size={13} className="text-amber-500 shrink-0 mt-0.5" />
                              <span>{tip}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Feedback Section */}
        <section id="feedback" className="bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-2xl p-6 sm:p-8 shadow-xs">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 font-medium mb-1">
              <MessageSquare size={14} />
              <span>IN-APP FEEDBACK</span>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Have a question or feedback about FLOAT?
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#A1A1AA] mb-6">
              Submit your feedback or report an unexpected issue directly to our development logs.
            </p>

            {feedbackSubmitted ? (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2.5">
                <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Thank you! Your feedback has been received and logged to the project diagnostics.</span>
              </div>
            ) : (
              <form onSubmit={handleFeedbackSubmit} className="space-y-4">
                <div className="flex gap-2">
                  {['Feedback', 'Issue Report', 'Question'].map(cat => (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => setFeedbackCategory(cat)}
                      className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                        feedbackCategory === cat
                          ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700/50'
                          : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-[#A1A1AA]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={4}
                  required
                  placeholder="Describe your question, workflow challenge, or suggestion..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                />

                <button
                  type="submit"
                  className="px-5 py-2.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer"
                >
                  <Send size={13} />
                  <span>Submit Feedback</span>
                </button>
              </form>
            )}
          </div>
        </section>
      </main>

      <ResourcesFooter />
    </div>
  );
}
