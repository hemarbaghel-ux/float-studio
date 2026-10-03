import React, { useState } from 'react';
import { ResourcesHeader } from './ResourcesHeader';
import { ResourcesFooter } from './ResourcesFooter';
import { 
  Users, 
  MessageSquare, 
  Share2, 
  Lightbulb, 
  Sparkles, 
  Send, 
  CheckCircle2, 
  Clock, 
  Code, 
  Compass 
} from 'lucide-react';

export function CommunityPage() {
  const [featureTitle, setFeatureTitle] = useState('');
  const [featureDescription, setFeatureDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);

  React.useEffect(() => {
    document.title = 'Community — FLOAT';
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!featureTitle.trim()) return;
    setSubmitted(true);
    setTimeout(() => {
      setFeatureTitle('');
      setFeatureDescription('');
      setSubmitted(false);
    }, 4000);
  };

  const sections = [
    {
      title: 'Community Discussions',
      icon: <MessageSquare size={18} className="text-purple-600 dark:text-purple-400" />,
      desc: 'Ask questions, discuss agent architectures, and exchange prompt engineering techniques with fellow developers.',
      status: 'Coming soon',
      note: 'Developer forums and discussion channels are preparing for launch.'
    },
    {
      title: 'Project Showcase',
      icon: <Share2 size={18} className="text-blue-600 dark:text-blue-400" />,
      desc: 'Showcase web applications, APIs, and tools you have created using FLOAT’s Ask, Plan, Edit, and Agent workflows.',
      status: 'Coming soon',
      note: 'Community project directory will open alongside our public showcase.'
    },
    {
      title: 'Feature Requests & Voting',
      icon: <Lightbulb size={18} className="text-amber-600 dark:text-amber-400" />,
      desc: 'Propose new features, AI agent capabilities, and IDE improvements directly to the FLOAT product team.',
      status: 'Active In-App',
      note: 'Use the interactive submission form below to submit requests directly.'
    },
    {
      title: 'Developer Tips & Workflows',
      icon: <Code size={18} className="text-emerald-600 dark:text-emerald-400" />,
      desc: 'Learn advanced shortcuts, prompt strategies, and multi-file refactoring patterns contributed by the community.',
      status: 'Explore Guides',
      note: 'Check out our practical developer tutorials in the Guides hub.'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A08] text-slate-900 dark:text-white flex flex-col font-sans transition-colors">
      <ResourcesHeader currentPath="/resources/community" />

      <main className="flex-1 pt-28 pb-20 max-w-5xl mx-auto w-full px-6">
        {/* Title */}
        <div className="mb-10 pb-6 border-b border-slate-200 dark:border-white/10 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2 text-xs text-rose-600 dark:text-rose-400 font-medium mb-1">
            <Users size={14} />
            <span>FLOAT DEVELOPER COMMUNITY</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 dark:text-white mb-2">
            Connect & Collaborate
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#A1A1AA] max-w-2xl">
            A central space for developers building ambitious software with FLOAT AI.
          </p>
        </div>

        {/* Coming Soon Notice */}
        <div className="mb-12 bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-2xl p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Sparkles size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Community Hub in Preparation
                </h2>
                <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 px-2 py-0.5 rounded">
                  Coming soon
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed max-w-xl">
                We are setting up dedicated developer forums and community channels. In the meantime, you can submit feature requests directly below or explore our published guides.
              </p>
            </div>
          </div>

          <a
            href="/resources/guides"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, '', '/resources/guides');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="px-4 py-2 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <Compass size={14} />
            <span>Explore Guides</span>
          </a>
        </div>

        {/* Community Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          {sections.map((sec, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-xl p-6 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center">
                    {sec.icon}
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                    sec.status === 'Coming soon'
                      ? 'text-slate-500 dark:text-[#8B949E] bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10'
                      : 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800/40'
                  }`}>
                    {sec.status}
                  </span>
                </div>

                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
                  {sec.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed mb-4">
                  {sec.desc}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-white/5 text-[11px] text-slate-400">
                {sec.note}
              </div>
            </div>
          ))}
        </div>

        {/* Feature Request & Suggestions Form */}
        <section className="bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-2xl p-6 sm:p-8 shadow-xs">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 font-medium mb-1">
              <Lightbulb size={14} />
              <span>COMMUNITY INPUT</span>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Submit a Feature Request or Suggestion
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#A1A1AA] mb-6">
              Tell us what capabilities or workflow improvements would make FLOAT more valuable for your software engineering.
            </p>

            {submitted ? (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2.5">
                <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Thank you! Your feature suggestion has been registered for the FLOAT product roadmap.</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Feature Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Support for custom agent system prompts in settings"
                    value={featureTitle}
                    onChange={(e) => setFeatureTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Details & Use Case
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Describe how this feature would work and why it would improve your development workflow..."
                    value={featureDescription}
                    onChange={(e) => setFeatureDescription(e.target.value)}
                    className="w-full p-3.5 bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="px-5 py-2.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer"
                >
                  <Send size={13} />
                  <span>Submit Suggestion</span>
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
