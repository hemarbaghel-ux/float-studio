import React, { useCallback, useEffect, useState } from 'react';
import {
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  RefreshCw,
  Upload,
  Download,
  Link2,
  Plus,
  Trash2,
  ExternalLink,
  LoaderCircle,
  Eye,
  Check,
  ChevronDown,
  ChevronRight,
  FileCode,
  Undo2,
  AlertCircle
} from 'lucide-react';
import { apiFetch } from '../../services/api';
import { useIDEStore } from '../../store';
import { useIntegrationStore, type RepositoryItem } from '../../store/integrationStore';
import { flattenFileTree, cn } from '../../lib/utils';
import { GitDiffModal, type GitDiffItem } from './GitDiffModal';
import { CreatePullRequestModal } from './CreatePullRequestModal';

type Change = { path: string; status: 'added' | 'modified' | 'deleted' };
type GitStatus = {
  connected: boolean;
  linked: boolean;
  repository?: { fullName: string; htmlUrl: string; private: boolean };
  branch?: string;
  defaultBranch?: string;
  branches?: Array<{ name: string; sha: string; protected: boolean }>;
  changes?: Change[];
  remoteChanges?: Change[];
  pendingCommit?: { sha: string; message: string } | null;
  pullRequests?: Array<{
    number: number;
    title: string;
    state: string;
    url: string;
    head: string;
    base: string;
    merged: boolean;
  }>;
};
type GitEvent = {
  type: 'progress' | 'completed' | 'error';
  stage?: string;
  message?: string;
  status?: number;
  conflicts?: string[];
  changes?: Change[];
  files?: Record<string, string>;
  pullRequest?: { url: string };
  [key: string]: any;
};

export function GitPanel() {
  const { projectId, applyExecutionChanges, saveProject } = useIDEStore();
  const { configuredProviders, connections, fetchIntegrations, getRepositories } = useIntegrationStore();
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [repositories, setRepositories] = useState<RepositoryItem[]>([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [stagedPaths, setStagedPaths] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [branchName, setBranchName] = useState('');
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [showPRModal, setShowPRModal] = useState(false);
  const [diffPatches, setDiffPatches] = useState<GitDiffItem[] | null>(null);
  const [diffInitialPath, setDiffInitialPath] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState('');

  // Discard changes confirmation state
  const [discardingPath, setDiscardingPath] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/git`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Git status failed (HTTP ${response.status}).`);
      setStatus(data);
    } catch (err: any) {
      setError(err.message || 'Could not load Git status.');
    }
  }, [projectId]);

  useEffect(() => {
    void fetchIntegrations();
    void refresh();
  }, [fetchIntegrations, refresh]);

  const run = async (action: string, body: Record<string, unknown> = {}) => {
    if (!projectId || busy) return;
    setBusy(true);
    setError('');
    setProgress([]);
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/git/operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ action, ...body }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Git operation could not start (HTTP ${response.status}).`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed: GitEvent | null = null;
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';
        for (const chunk of chunks) {
          const line = chunk.split('\n').find(row => row.startsWith('data: '));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as GitEvent;
          if (event.type === 'progress') setProgress(previous => [...previous, `${event.stage}: ${event.message}`]);
          else if (event.type === 'error') {
            const conflictText = event.conflicts?.length ? ` Conflicting files: ${event.conflicts.join(', ')}` : '';
            throw new Error((event.message || 'Git operation failed.') + conflictText);
          } else if (event.type === 'completed') completed = event;
        }
        if (done) break;
      }
      if (!completed) throw new Error('Git operation ended without a completion result.');
      setProgress(previous => [...previous, completed!.message || 'GitHub operation completed.']);
      if (completed.files) {
        const current = new Map(
          flattenFileTree(useIDEStore.getState().files)
            .filter(file => file.type === 'file')
            .map(file => [file.path, file.content || ''])
        );
        const incoming = new Map(Object.entries(completed.files));
        const changedFiles = [...incoming]
          .filter(([path, content]) => current.get(path) !== content)
          .map(([path, content]) => ({ path, content }));
        const deletedFiles = [...current.keys()].filter(path => !incoming.has(path));
        applyExecutionChanges(changedFiles, deletedFiles);
        await saveProject();
      }
      await refresh();
    } catch (err: any) {
      setError(err.message || 'Git operation failed.');
    } finally {
      setBusy(false);
    }
  };

  const loadRepositories = async () => {
    setError('');
    const result = await getRepositories('github');
    if (!result.success) {
      setError(result.error || 'Could not load authorized GitHub repositories.');
      return;
    }
    setRepositories(result.repositories);
    if (result.repositories.length) setSelectedRepo(result.repositories[0].fullName);
  };

  const openDiffForFile = async (filePath?: string) => {
    if (!projectId) return;
    setBusy(true);
    setError('');
    try {
      const url = filePath
        ? `/api/projects/${encodeURIComponent(projectId)}/git/diff?path=${encodeURIComponent(filePath)}`
        : `/api/projects/${encodeURIComponent(projectId)}/git/diff`;
      const response = await apiFetch(url);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Diff failed (HTTP ${response.status}).`);
      setDiffPatches(data.patches || []);
      setDiffInitialPath(filePath);
    } catch (err: any) {
      setError(err.message || 'Could not load diff.');
    } finally {
      setBusy(false);
    }
  };

  const toggleStage = (path: string) => {
    setStagedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const stageAll = () => {
    if (!status?.changes) return;
    setStagedPaths(new Set(status.changes.map(c => c.path)));
  };

  const unstageAll = () => {
    setStagedPaths(new Set());
  };

  const handleDiscard = async (path: string) => {
    setDiscardingPath(null);
    await run('discard-changes', { path });
    setStagedPaths(prev => {
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  };

  const handleCommit = async () => {
    if (!message.trim() || !status?.changes?.length) return;
    await run('commit', { message: message.trim(), confirmed: true });
    setMessage('');
    setStagedPaths(new Set());
  };

  const switchBranch = (name: string) => {
    const dirty = (status?.changes?.length || 0) > 0;
    const hasPending = Boolean(status?.pendingCommit);
    const confirmed =
      (!dirty && !hasPending) ||
      window.confirm(
        `Switch to ${name} and replace this project workspace with that branch snapshot?${
          dirty ? ' Local changes will be discarded.' : ''
        }${hasPending ? ' The pending commit will be discarded.' : ''}`
      );
    if (confirmed) void run('switch-branch', { name, confirmDiscard: dirty, confirmDiscardPending: hasPending });
  };

  if (!projectId) {
    return (
      <div className="p-4 text-xs text-slate-500">
        Save this workspace to your account before using GitHub.
      </div>
    );
  }

  const githubConfigured = configuredProviders.includes('github');
  const githubConnection = connections.find(c => c.provider === 'github');
  const connected = githubConnection?.status === 'connected';

  const allChanges = status?.changes || [];
  const stagedChanges = allChanges.filter(c => stagedPaths.has(c.path));
  const unstagedChanges = allChanges.filter(c => !stagedPaths.has(c.path));

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#0A0A0A] text-slate-800 dark:text-[#C9D1D9] text-xs select-none">
      {/* Top Header */}
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#2A2A2A] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-[11px] text-slate-500 dark:text-slate-400">
          <GitBranch size={13} className="text-blue-500" />
          <span>Source Control</span>
        </div>
        <button
          title="Refresh Git status"
          disabled={busy}
          onClick={() => void refresh()}
          className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-[#1c1c1c] text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {error && (
          <div role="alert" className="mx-3 mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-start gap-2 break-words">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {/* Not Configured State */}
        {!githubConfigured && (
          <div className="p-4 space-y-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 space-y-2">
              <p className="font-semibold text-slate-900 dark:text-white">GitHub isn&apos;t configured yet</p>
              <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                Configure GitHub OAuth credentials in environment settings to enable synchronization, branch reviews, and pull requests.
              </p>
            </div>
            <button
              onClick={() => document.dispatchEvent(new CustomEvent('open-settings'))}
              className="w-full border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-center hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer font-medium"
            >
              Open Settings → Integrations
            </button>
          </div>
        )}

        {/* Not Connected State */}
        {githubConfigured && !connected && (
          <div className="p-4 space-y-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 space-y-2">
              {githubConnection?.status === 'expired' ? (
                <>
                  <p className="font-semibold text-amber-600 dark:text-amber-400">GitHub authorization expired</p>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Reconnect your GitHub account in Settings → Integrations to restore repository access.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-slate-900 dark:text-white">Connect GitHub</p>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Connect your GitHub account to import repositories, branch, review changes, and create pull requests from FLOAT.
                  </p>
                </>
              )}
            </div>
            <button
              onClick={() => document.dispatchEvent(new CustomEvent('open-settings'))}
              className="w-full rounded-lg px-3 py-2 bg-slate-900 text-white dark:bg-white dark:text-black hover:opacity-90 font-medium transition-opacity cursor-pointer text-center"
            >
              Open Integrations
            </button>
          </div>
        )}

        {/* Connected but Not Linked State */}
        {connected && !status?.linked && (
          <div className="p-4 space-y-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 space-y-1.5">
              <p className="font-semibold text-slate-900 dark:text-white">Link a Repository</p>
              <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                Link this workspace to an authorized GitHub repository.
              </p>
            </div>
            <button
              onClick={() => void loadRepositories()}
              disabled={busy}
              className="w-full border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-between"
            >
              <span>Load accessible repositories</span>
              {busy && <LoaderCircle size={13} className="animate-spin" />}
            </button>
            {repositories.length > 0 && (
              <div className="space-y-2 pt-1">
                <select
                  value={selectedRepo}
                  onChange={e => setSelectedRepo(e.target.value)}
                  className="w-full border border-slate-200 dark:border-white/10 rounded-lg p-2 bg-white dark:bg-[#141414] text-slate-900 dark:text-white text-xs"
                >
                  {repositories.map(repo => (
                    <option key={repo.id} value={repo.fullName}>
                      {repo.fullName} {repo.private ? '(private)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  disabled={busy || !selectedRepo}
                  onClick={() => void run('link', { fullName: selectedRepo })}
                  className="w-full rounded-lg px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Link2 size={13} />
                  <span>Link repository</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Connected & Linked State: Full Source Control IDE Experience */}
        {status?.linked && (
          <div>
            {/* Repository & Branch Header */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-[#2A2A2A] space-y-2.5 bg-slate-50/50 dark:bg-white/[0.01]">
              <div className="flex items-center justify-between">
                <a
                  href={status.repository?.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-[200px]"
                  title={status.repository?.fullName}
                >
                  <span className="truncate">{status.repository?.fullName}</span>
                  <ExternalLink size={11} className="shrink-0" />
                </a>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                  {status.repository?.private ? 'Private' : 'Public'}
                </span>
              </div>

              {/* Branch Selector & Switcher */}
              <div className="flex items-center gap-1.5">
                <div className="flex-1 flex items-center gap-1 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 bg-white dark:bg-[#141414]">
                  <GitBranch size={13} className="text-slate-400 shrink-0" />
                  <select
                    aria-label="Current Git branch"
                    value={status.branch}
                    onChange={e => switchBranch(e.target.value)}
                    disabled={busy}
                    className="w-full bg-transparent text-xs text-slate-900 dark:text-white border-0 p-0 focus:outline-none cursor-pointer"
                  >
                    {(status.branches || []).map(b => (
                      <option key={b.name} value={b.name} className="bg-white dark:bg-[#141414]">
                        {b.name}{b.name === status.defaultBranch ? ' (default)' : ''}{b.protected ? ' [protected]' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  title="New branch"
                  disabled={busy}
                  onClick={() => setIsCreatingBranch(!isCreatingBranch)}
                  className="p-1.5 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <Plus size={13} />
                </button>
              </div>

              {/* Create Branch Input */}
              {isCreatingBranch && (
                <div className="flex items-center gap-1.5 pt-1">
                  <input
                    value={branchName}
                    onChange={e => setBranchName(e.target.value)}
                    placeholder="branch-name"
                    disabled={busy}
                    className="flex-1 border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1 text-xs bg-white dark:bg-[#141414] text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && branchName.trim()) {
                        void run('create-branch', { name: branchName.trim() });
                        setBranchName('');
                        setIsCreatingBranch(false);
                      }
                    }}
                  />
                  <button
                    disabled={busy || !branchName.trim()}
                    onClick={() => {
                      void run('create-branch', { name: branchName.trim() });
                      setBranchName('');
                      setIsCreatingBranch(false);
                    }}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Create
                  </button>
                </div>
              )}
            </div>

            {/* Commit Message Box */}
            <div className="p-3 border-b border-slate-200 dark:border-[#2A2A2A] space-y-2">
              {status.pendingCommit ? (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 space-y-1.5">
                  <div className="font-semibold text-[11px] flex items-center gap-1">
                    <Check size={12} />
                    <span>Commit Queued (Unpushed)</span>
                  </div>
                  <div className="text-[11px] font-mono break-words">
                    {status.pendingCommit.sha.slice(0, 8)}: {status.pendingCommit.message}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => void run('push')}
                      disabled={busy}
                      className="flex-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Upload size={12} />
                      <span>Push to GitHub</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Commit message (Ctrl+Enter to commit)..."
                    rows={2}
                    disabled={busy}
                    onKeyDown={e => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        void handleCommit();
                      }
                    }}
                    className="w-full border border-slate-200 dark:border-white/10 rounded-lg p-2 bg-transparent text-xs text-slate-900 dark:text-white placeholder:text-slate-400 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="flex items-center gap-1.5">
                    <button
                      disabled={busy || !message.trim() || !allChanges.length}
                      onClick={() => void handleCommit()}
                      className="flex-1 py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                    >
                      <GitCommitHorizontal size={13} />
                      <span>Commit</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Action Buttons: Pull, Push, Diff All */}
            <div className="px-3 py-2 border-b border-slate-200 dark:border-[#2A2A2A] flex items-center gap-1.5 bg-slate-50/30 dark:bg-white/[0.01]">
              <button
                onClick={() => void run('pull')}
                disabled={busy}
                title="Pull latest changes from branch"
                className="flex-1 py-1 px-2 border border-slate-200 dark:border-white/10 rounded-md hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center gap-1 text-[11px] cursor-pointer disabled:opacity-50"
              >
                <Download size={12} />
                <span>Pull</span>
              </button>
              <button
                onClick={() => void run('push')}
                disabled={busy || !status.pendingCommit}
                title={status.pendingCommit ? 'Push pending commit' : 'Create a commit first'}
                className="flex-1 py-1 px-2 border border-slate-200 dark:border-white/10 rounded-md hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center gap-1 text-[11px] cursor-pointer disabled:opacity-40"
              >
                <Upload size={12} />
                <span>Push</span>
              </button>
              <button
                onClick={() => void openDiffForFile()}
                disabled={busy || !allChanges.length}
                title="Review all changes in Monaco Diff Editor"
                className="flex-1 py-1 px-2 border border-slate-200 dark:border-white/10 rounded-md hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center gap-1 text-[11px] cursor-pointer disabled:opacity-40"
              >
                <Eye size={12} />
                <span>Review</span>
              </button>
            </div>

            {/* Staged Changes Section */}
            {stagedChanges.length > 0 && (
              <div className="border-b border-slate-200 dark:border-[#2A2A2A]">
                <div className="px-3 py-1.5 flex items-center justify-between bg-slate-100/50 dark:bg-white/[0.02]">
                  <span className="font-semibold text-[11px] uppercase tracking-wider text-slate-500">
                    Staged Changes ({stagedChanges.length})
                  </span>
                  <button
                    onClick={unstageAll}
                    className="text-[10px] text-blue-500 hover:underline cursor-pointer"
                  >
                    Unstage All
                  </button>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-white/[0.03]">
                  {stagedChanges.map(change => (
                    <div
                      key={change.path}
                      className="group px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-white/[0.03] flex items-center justify-between text-xs transition-colors"
                    >
                      <button
                        onClick={() => void openDiffForFile(change.path)}
                        className="flex items-center gap-2 truncate text-left flex-1 cursor-pointer"
                      >
                        <span
                          className={cn(
                            "font-mono font-bold text-[10px] shrink-0",
                            change.status === 'added' ? 'text-emerald-500' :
                            change.status === 'deleted' ? 'text-rose-500' :
                            'text-amber-500'
                          )}
                        >
                          {change.status === 'added' ? 'A' : change.status === 'deleted' ? 'D' : 'M'}
                        </span>
                        <span className="truncate text-slate-800 dark:text-slate-200 text-[11px] font-mono">
                          {change.path}
                        </span>
                      </button>
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
                        <button
                          title="Unstage file"
                          onClick={() => toggleStage(change.path)}
                          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          -
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Changes (Unstaged) Section */}
            <div className="border-b border-slate-200 dark:border-[#2A2A2A]">
              <div className="px-3 py-1.5 flex items-center justify-between bg-slate-100/50 dark:bg-white/[0.02]">
                <span className="font-semibold text-[11px] uppercase tracking-wider text-slate-500">
                  Changes ({unstagedChanges.length})
                </span>
                {unstagedChanges.length > 0 && (
                  <button
                    onClick={stageAll}
                    className="text-[10px] text-blue-500 hover:underline cursor-pointer"
                  >
                    Stage All
                  </button>
                )}
              </div>

              {unstagedChanges.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-white/[0.03]">
                  {unstagedChanges.map(change => (
                    <div
                      key={change.path}
                      className="group px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-white/[0.03] flex items-center justify-between text-xs transition-colors"
                    >
                      <button
                        onClick={() => void openDiffForFile(change.path)}
                        className="flex items-center gap-2 truncate text-left flex-1 cursor-pointer"
                      >
                        <span
                          className={cn(
                            "font-mono font-bold text-[10px] shrink-0",
                            change.status === 'added' ? 'text-emerald-500' :
                            change.status === 'deleted' ? 'text-rose-500' :
                            'text-amber-500'
                          )}
                        >
                          {change.status === 'added' ? 'A' : change.status === 'deleted' ? 'D' : 'M'}
                        </span>
                        <span className="truncate text-slate-800 dark:text-slate-200 text-[11px] font-mono">
                          {change.path}
                        </span>
                      </button>
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
                        <button
                          title="Stage file"
                          onClick={() => toggleStage(change.path)}
                          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          +
                        </button>
                        <button
                          title="Discard file changes"
                          onClick={() => setDiscardingPath(change.path)}
                          className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-500/20 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                        >
                          <Undo2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-slate-400 dark:text-slate-500 text-[11px]">
                  Working tree clean.
                </div>
              )}
            </div>

            {/* Remote Changes Notification */}
            {status.remoteChanges && status.remoteChanges.length > 0 && (
              <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex items-center justify-between">
                <span>Remote has {status.remoteChanges.length} unpulled change(s).</span>
                <button
                  onClick={() => void run('pull')}
                  disabled={busy}
                  className="font-medium underline ml-2 cursor-pointer"
                >
                  Pull now
                </button>
              </div>
            )}

            {/* Pull Requests Section */}
            <div className="p-3 border-b border-slate-200 dark:border-[#2A2A2A] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-500">
                  Pull Requests
                </span>
                <button
                  onClick={() => setShowPRModal(true)}
                  disabled={busy || !status.branch || status.branch === status.defaultBranch}
                  className="text-[11px] text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                >
                  <Plus size={11} />
                  <span>Create PR</span>
                </button>
              </div>

              {status.pullRequests && status.pullRequests.length > 0 ? (
                <div className="space-y-1.5 pt-1">
                  {status.pullRequests.map(pr => (
                    <a
                      key={pr.number}
                      href={pr.url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-lg border border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] block text-xs hover:border-blue-500/50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-medium text-slate-900 dark:text-white truncate">
                          #{pr.number} {pr.title}
                        </span>
                        <span className={cn(
                          "text-[9px] font-mono uppercase font-bold px-1 py-0.5 rounded shrink-0",
                          pr.merged ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' :
                          pr.state === 'open' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                          'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400'
                        )}>
                          {pr.merged ? 'merged' : pr.state}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {pr.head} → {pr.base}
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                  No open pull requests for this repository.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Operation Progress Display */}
        {(busy || progress.length > 0) && (
          <div aria-live="polite" className="p-3 border-t border-slate-200 dark:border-[#2A2A2A] space-y-1 bg-slate-50/50 dark:bg-white/[0.01]">
            <div className="font-medium flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
              {busy && <LoaderCircle size={13} className="animate-spin text-blue-500" />}
              <span>Operation status</span>
            </div>
            <div className="space-y-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400 max-h-24 overflow-y-auto">
              {progress.map((line, index) => (
                <div key={index} className="break-words">{line}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Monaco Diff Viewer Modal */}
      {diffPatches && diffPatches.length > 0 && (
        <GitDiffModal
          patches={diffPatches}
          initialPath={diffInitialPath}
          onClose={() => setDiffPatches(null)}
        />
      )}

      {/* Create Pull Request Modal */}
      {showPRModal && status && (
        <CreatePullRequestModal
          branch={status.branch || 'main'}
          defaultBranch={status.defaultBranch || 'main'}
          branches={status.branches || []}
          busy={busy}
          onSubmit={async (title, body, base) => {
            await run('create-pr', { title, body, base });
            setShowPRModal(false);
          }}
          onClose={() => setShowPRModal(false)}
        />
      )}

      {/* Discard Confirmation Modal */}
      {discardingPath && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-sm bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl p-5 flex flex-col gap-3 text-slate-900 dark:text-white">
            <h4 className="font-semibold text-sm">Discard changes?</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Are you sure you want to discard local changes in{' '}
              <strong className="font-mono text-slate-800 dark:text-slate-200">{discardingPath}</strong>?
              This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
              <button
                onClick={() => setDiscardingPath(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDiscard(discardingPath)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-rose-600 hover:bg-rose-500 transition-colors cursor-pointer"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
