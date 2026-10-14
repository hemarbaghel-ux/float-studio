import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  GitBranch, GitCommit, GitPullRequest, RefreshCw, Link2, ExternalLink,
  CheckCircle2, AlertCircle, ArrowRight, Code2, FolderGit2, Search,
  Download, Upload, ChevronRight, FileCode, Check, Copy, Sparkles,
  Columns, AlignJustify, Eye, Layers, Loader2, ArrowUpRight, ShieldCheck, X
} from 'lucide-react';
import { DiffEditor } from '@monaco-editor/react';
import { useIDEStore } from '../../store';
import { useAuthStore } from '../../store/authStore';
import {
  useIntegrationStore,
  type IntegrationProvider,
  type RepositoryItem,
  type GitCommitItem,
  type GitCommitDiffFile
} from '../../store/integrationStore';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { apiFetch } from '../../services/api';
import { mapToTree } from '../float/projectIO';

interface ProjectOption {
  id: string;
  name: string;
  files?: string;
  updatedAt?: any;
}

interface ProjectGitStatus {
  connected: boolean;
  linked: boolean;
  provider?: 'github' | 'gitlab';
  repository?: {
    fullName: string;
    htmlUrl: string;
    private: boolean;
  };
  branch?: string;
  defaultBranch?: string;
  branches?: Array<{ name: string; sha: string; protected: boolean }>;
  headSha?: string;
  baseSha?: string;
  changes?: Array<{ path: string; status: 'added' | 'modified' | 'deleted' }>;
  remoteChanges?: Array<{ path: string; status: 'added' | 'modified' | 'deleted' }>;
  pendingCommit?: { sha: string; message: string } | null;
  pullRequests?: any[];
}

export function GitSyncDashboard() {
  const { user } = useAuthStore();
  const { setProject, settings } = useIDEStore();
  const {
    connections,
    configuredProviders,
    fetchIntegrations,
    getAuthUrl,
    getRepositories,
    getCommits,
    getCommitDiff
  } = useIntegrationStore();

  // Projects list
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // Project Git status
  const [gitStatus, setGitStatus] = useState<ProjectGitStatus | null>(null);
  const [loadingGitStatus, setLoadingGitStatus] = useState(false);
  const [gitStatusError, setGitStatusError] = useState<string | null>(null);

  // Link repository state
  const [linkProvider, setLinkProvider] = useState<'github' | 'gitlab'>('github');
  const [repos, setRepos] = useState<RepositoryItem[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  const [selectedRepoFullName, setSelectedRepoFullName] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('main');
  const [isLinking, setIsLinking] = useState(false);
  const [linkSuccessMessage, setLinkSuccessMessage] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Commits list
  const [commits, setCommits] = useState<GitCommitItem[]>([]);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<GitCommitItem | null>(null);

  // Diff inspection
  const [activeDiffMode, setActiveDiffMode] = useState<'workspace' | 'commit'>('workspace');
  const [workspacePatches, setWorkspacePatches] = useState<Array<{ path: string; status: string; patch: string }>>([]);
  const [commitDiffFiles, setCommitDiffFiles] = useState<GitCommitDiffFile[]>([]);
  const [selectedDiffFileIndex, setSelectedDiffFileIndex] = useState(0);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [isSideBySide, setIsSideBySide] = useState(true);

  // Load user projects
  useEffect(() => {
    async function loadProjects() {
      if (!user) {
        setLoadingProjects(false);
        return;
      }
      try {
        const q = query(collection(db, 'projects'), where('ownerId', '==', user.uid));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProjectOption));
        list.sort((a, b) => {
          const tA = a.updatedAt?.toMillis?.() || 0;
          const tB = b.updatedAt?.toMillis?.() || 0;
          return tB - tA;
        });
        setProjects(list);
        if (list.length > 0 && !selectedProjectId) {
          setSelectedProjectId(list[0].id);
        }
      } catch (e) {
        console.error('Failed to load user projects for Git Sync:', e);
      } finally {
        setLoadingProjects(false);
      }
    }
    loadProjects();
    fetchIntegrations();
  }, [user, fetchIntegrations]);

  // Check connection status
  const githubConnection = connections.find(c => c.provider === 'github' && c.status === 'connected');
  const gitlabConnection = connections.find(c => c.provider === 'gitlab' && c.status === 'connected');

  // Load Git status when selected project changes
  const loadProjectGitStatus = useCallback(async (projId: string) => {
    if (!projId) return;
    setLoadingGitStatus(true);
    setGitStatusError(null);
    try {
      const res = await apiFetch(`/api/projects/${encodeURIComponent(projId)}/git`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch project Git status');
      }
      setGitStatus(data);
      if (data.linked && data.provider) {
        setLinkProvider(data.provider);
      }
    } catch (e: any) {
      setGitStatusError(e.message || 'Could not fetch Git status');
      setGitStatus(null);
    } finally {
      setLoadingGitStatus(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectGitStatus(selectedProjectId);
    }
  }, [selectedProjectId, loadProjectGitStatus]);

  // Load repositories for linking
  const loadAccessibleRepos = async (provider: 'github' | 'gitlab') => {
    setLoadingRepos(true);
    setLinkError(null);
    try {
      const res = await getRepositories(provider);
      if (!res.success) {
        throw new Error(res.error || `Could not fetch ${provider} repositories.`);
      }
      setRepos(res.repositories);
      if (res.repositories.length > 0) {
        setSelectedRepoFullName(res.repositories[0].fullName);
        setSelectedBranch(res.repositories[0].defaultBranch || 'main');
      }
    } catch (e: any) {
      setLinkError(e.message || 'Failed to load repositories');
      setRepos([]);
    } finally {
      setLoadingRepos(false);
    }
  };

  useEffect(() => {
    if (linkProvider === 'github' && githubConnection) {
      loadAccessibleRepos('github');
    } else if (linkProvider === 'gitlab' && gitlabConnection) {
      loadAccessibleRepos('gitlab');
    } else {
      setRepos([]);
    }
  }, [linkProvider, githubConnection, gitlabConnection]);

  // Fetch commits for linked project or selected repo
  const fetchLatestCommits = useCallback(async () => {
    setLoadingCommits(true);
    try {
      if (gitStatus?.linked && selectedProjectId) {
        // Fetch via project Git endpoint
        const res = await apiFetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/git/commits?branch=${encodeURIComponent(gitStatus.branch || 'main')}`);
        const data = await res.json();
        if (res.ok && data.commits) {
          setCommits(data.commits);
          if (data.commits.length > 0) {
            setSelectedCommit(data.commits[0]);
          }
          return;
        }
      }

      // Fallback: fetch via provider repositories endpoint
      if (selectedRepoFullName) {
        const [owner, repo] = selectedRepoFullName.split('/');
        if (owner && repo) {
          const res = await getCommits(linkProvider, owner, repo, selectedBranch);
          if (res.success && res.commits) {
            setCommits(res.commits);
            if (res.commits.length > 0) {
              setSelectedCommit(res.commits[0]);
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch commits:', e);
    } finally {
      setLoadingCommits(false);
    }
  }, [gitStatus, selectedProjectId, selectedRepoFullName, linkProvider, selectedBranch, getCommits]);

  useEffect(() => {
    if (gitStatus?.linked) {
      fetchLatestCommits();
    }
  }, [gitStatus?.linked, fetchLatestCommits]);

  // Load workspace diffs
  const loadWorkspaceDiff = useCallback(async () => {
    if (!selectedProjectId || !gitStatus?.linked) return;
    setLoadingDiff(true);
    try {
      const res = await apiFetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/git/diff`);
      const data = await res.json();
      if (res.ok && data.patches) {
        setWorkspacePatches(data.patches);
        setSelectedDiffFileIndex(0);
      }
    } catch (e) {
      console.error('Failed to load workspace diff:', e);
    } finally {
      setLoadingDiff(false);
    }
  }, [selectedProjectId, gitStatus?.linked]);

  // Load commit diff
  const loadCommitDiff = useCallback(async (commit: GitCommitItem) => {
    setLoadingDiff(true);
    setSelectedCommit(commit);
    setActiveDiffMode('commit');
    try {
      if (gitStatus?.linked && selectedProjectId) {
        const res = await apiFetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/git/commits/${encodeURIComponent(commit.sha)}`);
        const data = await res.json();
        if (res.ok && data.files) {
          setCommitDiffFiles(data.files);
          setSelectedDiffFileIndex(0);
          return;
        }
      }

      if (selectedRepoFullName) {
        const [owner, repo] = selectedRepoFullName.split('/');
        if (owner && repo) {
          const res = await getCommitDiff(linkProvider, owner, repo, commit.sha);
          if (res.success && res.files) {
            setCommitDiffFiles(res.files);
            setSelectedDiffFileIndex(0);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load commit diff:', e);
    } finally {
      setLoadingDiff(false);
    }
  }, [gitStatus?.linked, selectedProjectId, selectedRepoFullName, linkProvider, getCommitDiff]);

  // Link repository action
  const handleLinkRepository = async () => {
    if (!selectedProjectId || !selectedRepoFullName) return;
    setIsLinking(true);
    setLinkError(null);
    setLinkSuccessMessage(null);
    try {
      const res = await apiFetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/git/operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          action: 'link',
          provider: linkProvider,
          fullName: selectedRepoFullName,
          branch: selectedBranch
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to link repository (HTTP ${res.status})`);
      }

      setLinkSuccessMessage(`Successfully linked to ${selectedRepoFullName} (${selectedBranch})`);
      await loadProjectGitStatus(selectedProjectId);
      await fetchLatestCommits();
    } catch (e: any) {
      setLinkError(e.message || 'Failed to link repository');
    } finally {
      setIsLinking(false);
    }
  };

  // Open in FLOAT IDE action
  const handleOpenInIDE = () => {
    const proj = projects.find(p => p.id === selectedProjectId);
    if (!proj) return;
    let parsedFiles = [];
    try {
      parsedFiles = proj.files ? JSON.parse(proj.files) : [];
    } catch {
      parsedFiles = [];
    }
    setProject(proj.name || 'Project Workspace', parsedFiles, proj.id);
    useIDEStore.getState().setActiveSidebarView('source-control');
    useIDEStore.getState().setActiveWorkspace('code');
    window.history.pushState({}, '', '/ide');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  // Filter repos by search
  const filteredRepos = useMemo(() => {
    if (!repoSearch.trim()) return repos;
    const q = repoSearch.toLowerCase();
    return repos.filter(r => r.fullName.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [repos, repoSearch]);

  // Current diff content resolution
  const currentDiffData = useMemo(() => {
    if (activeDiffMode === 'workspace') {
      const patch = workspacePatches[selectedDiffFileIndex];
      if (!patch) return { filename: 'No file', original: '', modified: '' };
      return {
        filename: patch.path,
        original: '',
        modified: patch.patch
      };
    } else {
      const diffFile = commitDiffFiles[selectedDiffFileIndex];
      if (!diffFile) return { filename: 'No file', original: '', modified: '' };
      return {
        filename: diffFile.filename,
        original: '',
        modified: diffFile.patch
      };
    }
  }, [activeDiffMode, workspacePatches, commitDiffFiles, selectedDiffFileIndex]);

  return (
    <div className="flex flex-col gap-6 text-slate-900 dark:text-[#C9D1D9]">
      {/* 1. Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-[#222]">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-1">
            <GitBranch size={14} />
            <span>FLOAT Git Sync Engine</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Git Synchronization & Review
          </h1>
          <p className="text-sm text-slate-500 dark:text-[#8B949E] mt-1 max-w-2xl">
            Link GitHub and GitLab repositories to your workspaces, fetch latest commits, and inspect side-by-side code diffs directly in the FLOAT IDE.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              if (selectedProjectId) {
                loadProjectGitStatus(selectedProjectId);
                fetchLatestCommits();
              }
            }}
            disabled={loadingGitStatus || loadingCommits}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#2C2C2C] bg-white dark:bg-[#141414] hover:bg-slate-50 dark:hover:bg-[#1E1E1E] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={loadingGitStatus || loadingCommits ? 'animate-spin' : ''} />
            <span>Refresh Sync</span>
          </button>
          <button
            onClick={handleOpenInIDE}
            disabled={!selectedProjectId}
            className="px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-black hover:opacity-90 text-xs font-medium flex items-center gap-1.5 transition-opacity cursor-pointer shadow-xs disabled:opacity-50"
          >
            <Code2 size={13} />
            <span>Open in IDE</span>
          </button>
        </div>
      </div>

      {/* 2. Provider Authentication Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* GitHub Card */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-[#222] bg-white dark:bg-[#111111] flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-white/10 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 fill-current text-slate-800 dark:text-white" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-slate-900 dark:text-white">GitHub</span>
                {githubConnection ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/40">
                    <CheckCircle2 size={11} /> Connected
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500 dark:text-[#8B949E] bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full">
                    Disconnected
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5">
                {githubConnection ? `@${githubConnection.accountName || 'Authorized User'}` : 'Authorize to access repositories & commits'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              window.history.pushState({}, '', '/integrations');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
          >
            {githubConnection ? 'Manage' : 'Connect'}
          </button>
        </div>

        {/* GitLab Card */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-[#222] bg-white dark:bg-[#111111] flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-950/20 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 fill-current text-orange-600 dark:text-orange-400" viewBox="0 0 24 24">
                <path d="M23.955 13.587l-1.342-4.135-2.664-8.189c-.135-.423-.73-.423-.867 0L16.418 9.45H7.582L4.918 1.263c-.136-.423-.732-.423-.867 0L1.387 9.452.045 13.587a.972.972 0 00.354 1.09l11.6 8.433 11.602-8.433a.972.972 0 00.354-1.09" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-slate-900 dark:text-white">GitLab</span>
                {gitlabConnection ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/40">
                    <CheckCircle2 size={11} /> Connected
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500 dark:text-[#8B949E] bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full">
                    Disconnected
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5">
                {gitlabConnection ? `@${gitlabConnection.accountName || 'Authorized User'}` : 'Authorize to access GitLab projects & diffs'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              window.history.pushState({}, '', '/integrations');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
          >
            {gitlabConnection ? 'Manage' : 'Connect'}
          </button>
        </div>
      </div>

      {/* 3. Workspace Selection & Remote Link Status */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-[#222] bg-white dark:bg-[#111111] flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <FolderGit2 size={16} className="text-purple-600 dark:text-purple-400" />
              <span>Workspace & Remote Repository Link</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5">
              Select an active FLOAT workspace to inspect its remote status and sync changes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 dark:text-[#8B949E] shrink-0">Workspace:</label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2C2C2C] bg-slate-50 dark:bg-[#181818] text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Link Status Banner */}
        {loadingGitStatus ? (
          <div className="py-8 flex items-center justify-center text-xs text-slate-400">
            <Loader2 size={16} className="animate-spin mr-2" />
            Inspecting Git repository link status...
          </div>
        ) : gitStatus?.linked ? (
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#161616] border border-slate-200 dark:border-[#282828] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300">
                  {gitStatus.provider === 'gitlab' ? 'GitLab' : 'GitHub'}
                </span>
                <a
                  href={gitStatus.repository?.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  {gitStatus.repository?.fullName}
                  <ExternalLink size={12} />
                </a>
                {gitStatus.repository?.private && (
                  <span className="text-[10px] text-slate-500 bg-slate-200 dark:bg-white/10 px-1.5 py-0.2 rounded">
                    private
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-[#8B949E]">
                <span>Branch: <strong className="text-slate-800 dark:text-white">{gitStatus.branch || 'main'}</strong></span>
                <span>•</span>
                <span>Base Commit: <code className="font-mono text-purple-600 dark:text-purple-400">{gitStatus.baseSha?.slice(0, 7) || 'latest'}</code></span>
                <span>•</span>
                <span>Workspace Edits: <strong className={gitStatus.changes?.length ? 'text-amber-500' : 'text-emerald-500'}>{gitStatus.changes?.length || 0} modified</strong></span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setActiveDiffMode('workspace');
                  loadWorkspaceDiff();
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#333] hover:bg-slate-100 dark:hover:bg-[#202020] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Eye size={13} />
                <span>Inspect Workspace Diff ({gitStatus.changes?.length || 0})</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  Workspace is not linked to a remote repository
                </h3>
                <p className="text-xs text-amber-700 dark:text-amber-300/80 mt-0.5">
                  Link this workspace to GitHub or GitLab below to enable commit tracking, pull/push sync, and diff reviews.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Repository Link Picker (Expandable if unlinked or changing repo) */}
        <div className="pt-2 border-t border-slate-100 dark:border-[#1E1E1E] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700 dark:text-[#C9D1D9]">
              {gitStatus?.linked ? 'Switch / Re-link Remote Repository' : 'Link a Remote Repository'}
            </span>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#1A1A1A] p-0.5 rounded-lg">
              <button
                onClick={() => setLinkProvider('github')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  linkProvider === 'github'
                    ? 'bg-white dark:bg-[#2A2A2A] text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                GitHub
              </button>
              <button
                onClick={() => setLinkProvider('gitlab')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  linkProvider === 'gitlab'
                    ? 'bg-white dark:bg-[#2A2A2A] text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                GitLab
              </button>
            </div>
          </div>

          {linkError && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-600 dark:text-rose-400 flex items-center justify-between">
              <span>{linkError}</span>
              <button onClick={() => setLinkError(null)} className="cursor-pointer"><X size={12} /></button>
            </div>
          )}

          {linkSuccessMessage && (
            <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
              <span>{linkSuccessMessage}</span>
              <button onClick={() => setLinkSuccessMessage(null)} className="cursor-pointer"><X size={12} /></button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2 relative">
              <input
                type="text"
                placeholder={`Search accessible ${linkProvider === 'gitlab' ? 'GitLab' : 'GitHub'} repositories...`}
                value={repoSearch}
                onChange={(e) => setRepoSearch(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#2C2C2C] bg-slate-50 dark:bg-[#141414] text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={selectedRepoFullName}
                onChange={(e) => {
                  setSelectedRepoFullName(e.target.value);
                  const found = repos.find(r => r.fullName === e.target.value);
                  if (found) setSelectedBranch(found.defaultBranch || 'main');
                }}
                disabled={loadingRepos || filteredRepos.length === 0}
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2C2C2C] bg-slate-50 dark:bg-[#141414] text-xs font-medium text-slate-900 dark:text-white focus:outline-none truncate"
              >
                {filteredRepos.length === 0 ? (
                  <option value="">{loadingRepos ? 'Loading repositories...' : 'No repositories found'}</option>
                ) : (
                  filteredRepos.map((r) => (
                    <option key={r.id} value={r.fullName}>
                      {r.fullName} {r.private ? '🔒' : ''}
                    </option>
                  ))
                )}
              </select>

              <button
                onClick={handleLinkRepository}
                disabled={isLinking || !selectedRepoFullName || !selectedProjectId}
                className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              >
                {isLinking ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                <span>Link</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Commits & Diff Inspection Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Latest Commits Feed */}
        <div className="lg:col-span-5 p-5 rounded-xl border border-slate-200 dark:border-[#222] bg-white dark:bg-[#111111] flex flex-col gap-3 min-h-[420px]">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[#222]">
            <div className="flex items-center gap-2">
              <GitCommit size={16} className="text-purple-600 dark:text-purple-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Latest Remote Commits
              </h2>
            </div>
            <button
              onClick={fetchLatestCommits}
              disabled={loadingCommits}
              title="Fetch latest commits"
              className="p-1 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1E1E1E] transition-colors cursor-pointer"
            >
              <RefreshCw size={13} className={loadingCommits ? 'animate-spin' : ''} />
            </button>
          </div>

          {loadingCommits ? (
            <div className="flex-1 flex items-center justify-center py-16 text-xs text-slate-400">
              <Loader2 size={16} className="animate-spin mr-2" />
              Fetching remote commits from {linkProvider}...
            </div>
          ) : commits.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-slate-400 text-xs">
              <GitCommit size={32} className="text-slate-300 dark:text-[#333] mb-2" />
              <p>No commits fetched yet.</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Link a repository above or click Refresh to sync commit history.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto max-h-[500px] space-y-2 pr-1">
              {commits.map((c) => {
                const isSelected = selectedCommit?.sha === c.sha;
                return (
                  <div
                    key={c.sha}
                    onClick={() => loadCommitDiff(c)}
                    className={`p-3 rounded-lg border transition-all cursor-pointer flex flex-col gap-1.5 ${
                      isSelected
                        ? 'border-purple-500/80 bg-purple-50/50 dark:bg-purple-950/20 shadow-xs'
                        : 'border-slate-200 dark:border-[#222] hover:border-slate-300 dark:hover:border-[#333] bg-slate-50/60 dark:bg-[#161616]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-slate-900 dark:text-white line-clamp-2">
                        {c.message || 'No commit message'}
                      </span>
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-purple-600 dark:text-purple-400 shrink-0">
                        {c.shortSha || c.sha.slice(0, 7)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-[#8B949E] pt-1 border-t border-slate-100 dark:border-white/5">
                      <span>{c.author.name}</span>
                      <span>{c.date ? new Date(c.date).toLocaleDateString() : 'recent'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Interactive Diff Viewer */}
        <div className="lg:col-span-7 p-5 rounded-xl border border-slate-200 dark:border-[#222] bg-white dark:bg-[#111111] flex flex-col gap-3 min-h-[420px]">
          {/* Diff Controls Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-[#222]">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setActiveDiffMode('workspace');
                  loadWorkspaceDiff();
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  activeDiffMode === 'workspace'
                    ? 'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Workspace Diff ({workspacePatches.length})
              </button>
              <button
                onClick={() => {
                  if (selectedCommit) loadCommitDiff(selectedCommit);
                  else setActiveDiffMode('commit');
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  activeDiffMode === 'commit'
                    ? 'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Commit Diff {selectedCommit ? `(${selectedCommit.shortSha || selectedCommit.sha.slice(0, 7)})` : ''}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSideBySide(!isSideBySide)}
                title={isSideBySide ? 'Switch to inline diff' : 'Switch to side-by-side diff'}
                className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1E1E1E] transition-colors cursor-pointer"
              >
                {isSideBySide ? <Columns size={14} /> : <AlignJustify size={14} />}
              </button>
            </div>
          </div>

          {/* Files Selector Bar if multiple diff files */}
          {activeDiffMode === 'workspace' && workspacePatches.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {workspacePatches.map((patch, idx) => (
                <button
                  key={patch.path}
                  onClick={() => setSelectedDiffFileIndex(idx)}
                  className={`px-2.5 py-1 rounded text-xs font-mono shrink-0 transition-colors cursor-pointer flex items-center gap-1.5 ${
                    selectedDiffFileIndex === idx
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-black font-medium'
                      : 'bg-slate-100 dark:bg-[#1A1A1A] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className={patch.status === 'added' ? 'text-emerald-500' : patch.status === 'deleted' ? 'text-rose-500' : 'text-amber-500'}>
                    {patch.status === 'added' ? 'A' : patch.status === 'deleted' ? 'D' : 'M'}
                  </span>
                  <span>{patch.path}</span>
                </button>
              ))}
            </div>
          )}

          {activeDiffMode === 'commit' && commitDiffFiles.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {commitDiffFiles.map((f, idx) => (
                <button
                  key={f.filename}
                  onClick={() => setSelectedDiffFileIndex(idx)}
                  className={`px-2.5 py-1 rounded text-xs font-mono shrink-0 transition-colors cursor-pointer flex items-center gap-1.5 ${
                    selectedDiffFileIndex === idx
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-black font-medium'
                      : 'bg-slate-100 dark:bg-[#1A1A1A] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className={f.status === 'added' ? 'text-emerald-500' : f.status === 'deleted' ? 'text-rose-500' : 'text-amber-500'}>
                    {f.status === 'added' ? 'A' : f.status === 'deleted' ? 'D' : 'M'}
                  </span>
                  <span>{f.filename}</span>
                </button>
              ))}
            </div>
          )}

          {/* Monaco DiffEditor Component Container */}
          <div className="w-full h-[400px] rounded-lg border border-slate-200 dark:border-[#222] overflow-hidden bg-white dark:bg-[#0E0E0E] relative">
            {loadingDiff ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                <Loader2 size={16} className="animate-spin mr-2" />
                Loading diff representation...
              </div>
            ) : (activeDiffMode === 'workspace' && workspacePatches.length === 0) ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-400 text-xs">
                <CheckCircle2 size={32} className="text-emerald-500 mb-2" />
                <p className="font-semibold text-slate-800 dark:text-white">Working Tree Clean</p>
                <p className="text-slate-500 text-[11px] mt-1 max-w-xs">
                  All files in this workspace match the tracked remote base commit.
                </p>
              </div>
            ) : (activeDiffMode === 'commit' && commitDiffFiles.length === 0) ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-400 text-xs">
                <FileCode size={32} className="text-slate-300 dark:text-[#333] mb-2" />
                <p>Select a commit from the left column to inspect file changes.</p>
              </div>
            ) : (
              <DiffEditor
                height="100%"
                language="typescript"
                theme={settings.theme === 'light' ? 'light' : 'vs-dark'}
                original={currentDiffData.original}
                modified={currentDiffData.modified}
                options={{
                  readOnly: true,
                  renderSideBySide: isSideBySide,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  lineNumbers: 'on',
                  fontSize: 12
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
