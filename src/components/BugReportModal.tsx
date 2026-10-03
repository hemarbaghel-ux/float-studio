import React, { useState } from 'react';
import { X, Bug, Send, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export function BugReportModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuthStore();
  
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'Editor' | 'AI Chat' | 'Python Runtime' | 'Auth' | 'UI / Styling' | 'Other'>('Editor');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Please provide a title and detailed description.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Simulate real report dispatch and diagnostics logging
      await new Promise(res => setTimeout(res, 800));
      console.log('Dispatched Bug Report:', {
        title,
        category,
        description,
        steps,
        userEmail: user?.email,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
      });
      setIsSubmitted(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit bug report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="w-full max-w-lg bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center">
              <Bug size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Report a Bug</h3>
              <p className="text-[11px] text-slate-400 dark:text-[#8B949E]">Help improve FLOAT by sharing what broke</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        {isSubmitted ? (
          <div className="p-8 text-center flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 size={24} />
            </div>
            <h4 className="text-base font-semibold text-slate-900 dark:text-white">Bug Report Submitted</h4>
            <p className="text-xs text-slate-500 dark:text-[#8B949E] max-w-sm">
              Thank you for reporting this issue. Our engineering team reviews diagnostic reports to maintain FLOAT developer reliability.
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-1.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
            {error && (
              <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#C9D1D9] mb-1.5">
                Issue Summary *
              </label>
              <input
                type="text"
                placeholder="e.g. Monaco editor line numbers misaligned after resize"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#C9D1D9] mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              >
                <option value="Editor">Monaco Editor & Code View</option>
                <option value="AI Chat">AI Chat & Model Generation</option>
                <option value="Python Runtime">Python Pyodide Execution</option>
                <option value="Auth">Firebase Authentication & Session</option>
                <option value="UI / Styling">UI Alignment & Dark/Light Theme</option>
                <option value="Other">Other Issues</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#C9D1D9] mb-1.5">
                Description & Observed Behavior *
              </label>
              <textarea
                rows={3}
                placeholder="Describe what occurred vs what you expected..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#C9D1D9] mb-1.5">
                Steps to Reproduce (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="1. Open workspace&#10;2. Click Run&#10;3. Observe error..."
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 resize-none font-mono text-[11px]"
              />
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Diagnostic details exclude code contents and API secrets</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Send size={13} />
                      <span>Submit Report</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
