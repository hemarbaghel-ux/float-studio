import React, { useState } from 'react';
import { GitPullRequest, X, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CreatePullRequestModalProps {
  branch: string;
  defaultBranch: string;
  branches: Array<{ name: string; sha: string; protected: boolean }>;
  busy: boolean;
  onSubmit: (title: string, body: string, base: string) => Promise<void>;
  onClose: () => void;
}

export function CreatePullRequestModal({
  branch,
  defaultBranch,
  branches,
  busy,
  onSubmit,
  onClose,
}: CreatePullRequestModalProps) {
  const [baseBranch, setBaseBranch] = useState(defaultBranch || 'main');
  const [title, setTitle] = useState(`Merge ${branch} into ${defaultBranch || 'main'}`);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Pull request title is required.');
      return;
    }
    if (branch === baseBranch) {
      setError('Head and base branches must be different.');
      return;
    }
    setError('');
    try {
      await onSubmit(title.trim(), body.trim(), baseBranch);
    } catch (err: any) {
      setError(err.message || 'Failed to create pull request.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 text-slate-900 dark:text-white">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-2">
            <GitPullRequest size={18} className="text-blue-500" />
            <h3 className="font-semibold text-sm">Create Pull Request</h3>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-lg flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-3 text-xs">
            <div className="flex-1">
              <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">Base branch</label>
              <select
                value={baseBranch}
                onChange={e => setBaseBranch(e.target.value)}
                disabled={busy}
                className="w-full border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 bg-slate-50 dark:bg-[#1a1a1a] text-slate-900 dark:text-white"
              >
                {branches.map(b => (
                  <option key={b.name} value={b.name}>
                    {b.name}{b.name === defaultBranch ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="pt-5 text-slate-400 font-mono">←</div>
            <div className="flex-1">
              <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">Compare branch</label>
              <input
                disabled
                value={branch}
                className="w-full border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 font-mono text-[11px]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1 font-medium">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., feat: add oauth authentication"
              disabled={busy}
              className="w-full border border-slate-200 dark:border-white/10 rounded-lg px-3 py-1.5 bg-transparent text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1 font-medium">Description (optional)</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Describe your changes and link any relevant issues..."
              rows={4}
              disabled={busy}
              className="w-full border border-slate-200 dark:border-white/10 rounded-lg p-2.5 bg-transparent text-xs text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !title.trim() || branch === baseBranch}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {busy ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <GitPullRequest size={13} />
                  <span>Create Pull Request</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
