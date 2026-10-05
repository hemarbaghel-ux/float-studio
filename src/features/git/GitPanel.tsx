import React, { useCallback, useEffect, useState } from 'react';
import { GitBranch, GitCommitHorizontal, GitPullRequest, RefreshCw, Upload, Download, Link2, Plus, Trash2, ExternalLink, LoaderCircle } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { useIDEStore } from '../../store';
import { useIntegrationStore, type RepositoryItem } from '../../store/integrationStore';
import { flattenFileTree } from '../../lib/utils';

type Change = { path: string; status: 'added' | 'modified' | 'deleted' };
type GitStatus = { connected: boolean; linked: boolean; repository?: { fullName: string; htmlUrl: string; private: boolean }; branch?: string; defaultBranch?: string; branches?: Array<{ name: string; sha: string; protected: boolean }>; changes?: Change[]; remoteChanges?: Change[]; pendingCommit?: { sha: string; message: string } | null; pullRequests?: Array<{ number: number; title: string; state: string; url: string; head: string; base: string; merged: boolean }> };
type GitEvent = { type: 'progress' | 'completed' | 'error'; stage?: string; message?: string; status?: number; conflicts?: string[]; changes?: Change[]; files?: Record<string, string>; pullRequest?: { url: string }; [key: string]: any };

export function GitPanel() {
  const { projectId, applyExecutionChanges, saveProject } = useIDEStore();
  const { connections, fetchIntegrations, getRepositories } = useIntegrationStore();
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [repositories, setRepositories] = useState<RepositoryItem[]>([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [patches, setPatches] = useState<Array<{ path: string; status: string; patch: string }>>([]);
  const [message, setMessage] = useState('');
  const [branchName, setBranchName] = useState('');
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/git`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Git status failed (HTTP ${response.status}).`);
      setStatus(data);
    } catch (err: any) { setError(err.message || 'Could not load Git status.'); }
  }, [projectId]);

  useEffect(() => { void fetchIntegrations(); void refresh(); }, [fetchIntegrations, refresh]);

  const run = async (action: string, body: Record<string, unknown> = {}) => {
    if (!projectId || busy) return;
    setBusy(true); setError(''); setProgress([]); setPatches([]);
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/git/operations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ action, ...body })
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
        const chunks = buffer.split('\n\n'); buffer = chunks.pop() || '';
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
        const current = new Map(flattenFileTree(useIDEStore.getState().files).filter(file => file.type === 'file').map(file => [file.path, file.content || '']));
        const incoming = new Map(Object.entries(completed.files));
        const changedFiles = [...incoming].filter(([path, content]) => current.get(path) !== content).map(([path, content]) => ({ path, content }));
        const deletedFiles = [...current.keys()].filter(path => !incoming.has(path));
        applyExecutionChanges(changedFiles, deletedFiles);
        await saveProject();
      }
      await refresh();
    } catch (err: any) { setError(err.message || 'Git operation failed.'); }
    finally { setBusy(false); }
  };

  const loadRepositories = async () => {
    setError('');
    const result = await getRepositories('github');
    if (!result.success) { setError(result.error || 'Could not load authorized GitHub repositories.'); return; }
    setRepositories(result.repositories);
    if (result.repositories.length) setSelectedRepo(result.repositories[0].fullName);
  };

  const loadDiff = async () => {
    if (!projectId) return;
    setBusy(true); setError('');
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/git/diff`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Diff failed (HTTP ${response.status}).`);
      setPatches(data.patches || []);
    } catch (err: any) { setError(err.message || 'Could not load diff.'); }
    finally { setBusy(false); }
  };

  const switchBranch = (name: string) => {
    const dirty = (status?.changes?.length || 0) > 0;
    const hasPending = Boolean(status?.pendingCommit);
    const confirmed = (!dirty && !hasPending) || window.confirm(`Switch to ${name} and replace this project workspace with that branch snapshot?${dirty ? ' Local changes will be discarded.' : ''}${hasPending ? ' The pending commit will be discarded.' : ''}`);
    if (confirmed) void run('switch-branch', { name, confirmDiscard: dirty, confirmDiscardPending: hasPending });
  };

  if (!projectId) return <div className="p-4 text-xs text-slate-500">Save this workspace to your account before using GitHub.</div>;
  const connected = connections.some(connection => connection.provider === 'github' && connection.status === 'connected');

  return <div className="h-full overflow-y-auto bg-white dark:bg-[#0A0A0A] text-slate-800 dark:text-[#C9D1D9] text-xs">
    <div className="px-4 py-3 border-b border-slate-200 dark:border-[#2A2A2A] flex items-center justify-between">
      <span className="font-semibold uppercase tracking-wider text-slate-500">Source Control</span>
      <button title="Refresh Git status" disabled={busy} onClick={() => void refresh()} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#1c1c1c]"><RefreshCw size={14}/></button>
    </div>
    {error && <div role="alert" className="mx-3 mt-3 p-2 rounded bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 break-words">{error}</div>}
    {!connected && <p className="m-4 text-slate-500">Connect GitHub in Settings → Integrations to authorize repository operations.</p>}
    {connected && !status?.linked && <div className="p-4 space-y-2">
      <p className="text-slate-500">Link this project to a repository in your authorized GitHub account.</p>
      <button onClick={() => void loadRepositories()} disabled={busy} className="w-full border rounded px-2 py-1.5 text-left">Load accessible repositories</button>
      {repositories.length > 0 && <><select value={selectedRepo} onChange={event => setSelectedRepo(event.target.value)} className="w-full border rounded p-1.5 bg-white dark:bg-[#111]">{repositories.map(repo => <option key={repo.id} value={repo.fullName}>{repo.fullName}{repo.private ? ' · private' : ''}</option>)}</select>
        <button disabled={busy || !selectedRepo} onClick={() => void run('link', { fullName: selectedRepo })} className="w-full rounded px-2 py-1.5 bg-blue-600 text-white disabled:opacity-50"><Link2 className="inline mr-1" size={13}/>Link repository</button></>}
    </div>}
    {status?.linked && <>
      <div className="px-4 py-3 border-b border-slate-200 dark:border-[#2A2A2A] space-y-2">
        <a href={status.repository?.htmlUrl} target="_blank" rel="noreferrer" className="font-medium inline-flex items-center gap-1 text-blue-600">{status.repository?.fullName}<ExternalLink size={12}/></a>
        <div className="flex gap-1"><GitBranch size={14}/><select aria-label="Current Git branch" value={status.branch} onChange={event => switchBranch(event.target.value)} disabled={busy} className="min-w-0 flex-1 bg-transparent">{(status.branches || []).map(branch => <option key={branch.name} value={branch.name}>{branch.name}{branch.protected ? ' · protected' : ''}</option>)}</select></div>
        <div className="flex gap-1"><input value={branchName} onChange={event => setBranchName(event.target.value)} placeholder="New branch name" className="min-w-0 flex-1 border rounded px-2 py-1 bg-transparent"/><button title="Create branch from current branch" disabled={busy || !branchName.trim()} onClick={() => void run('create-branch', { name: branchName })} className="border rounded px-2"><Plus size={14}/></button></div>
        <button disabled={busy || !status.branch || status.branch === status.defaultBranch || (status.branches || []).find(branch => branch.name === status.branch)?.protected} onClick={() => { if (status.branch && window.confirm(`Delete branch ${status.branch} from GitHub?`)) void run('delete-branch', { name: status.branch }); }} className="flex items-center gap-1 text-red-600 disabled:opacity-40"><Trash2 size={13}/>Delete current branch</button>
      </div>
      <div className="p-3 border-b border-slate-200 dark:border-[#2A2A2A]">
        <div className="font-medium mb-2">Changes ({status.changes?.length || 0})</div>
        {status.changes?.length ? <div className="max-h-40 overflow-y-auto">{status.changes.map(change => <div key={change.path} className="flex gap-2 py-0.5"><span className={change.status === 'added' ? 'text-green-600' : change.status === 'deleted' ? 'text-red-500' : 'text-amber-600'}>{change.status === 'added' ? 'A' : change.status === 'deleted' ? 'D' : 'M'}</span><span className="truncate">{change.path}</span></div>)}</div> : <div className="text-slate-500">Working tree clean.</div>}
        <div className="flex gap-1 mt-2"><button onClick={() => void loadDiff()} disabled={busy || !status.changes?.length} className="border rounded px-2 py-1">View diff</button><button onClick={() => void run('pull')} disabled={busy} className="border rounded px-2 py-1 inline-flex items-center gap-1"><Download size={12}/>Pull</button><button onClick={() => void run('push')} disabled={busy || !status.pendingCommit} title={status.pendingCommit ? 'Push pending commit' : 'Create a confirmed commit first'} className="border rounded px-2 py-1 inline-flex items-center gap-1"><Upload size={12}/>Push</button></div>
        {status.remoteChanges?.length ? <p className="mt-2 text-amber-600">Remote has {status.remoteChanges.length} change(s); pull will stop on overlapping edits.</p> : null}
      </div>
      <div className="p-3 space-y-2 border-b border-slate-200 dark:border-[#2A2A2A]">
        <div className="font-medium">Commit</div>
        {status.pendingCommit ? <div className="text-amber-600 break-words">Pending: {status.pendingCommit.sha.slice(0, 8)} · {status.pendingCommit.message}</div> : <><input value={message} onChange={event => setMessage(event.target.value)} placeholder="Commit message" className="w-full border rounded px-2 py-1.5 bg-transparent"/><button disabled={busy || !message.trim() || !status.changes?.length} onClick={() => { if (window.confirm('Create a Git commit object from the listed changes? It will not reach GitHub branch until you press Push.')) void run('commit', { message, confirmed: true }); }} className="border rounded px-2 py-1 inline-flex items-center gap-1 disabled:opacity-40"><GitCommitHorizontal size={13}/>Review & create commit</button></>}
      </div>
      <div className="p-3 space-y-2 border-b border-slate-200 dark:border-[#2A2A2A]">
        <div className="font-medium">Pull requests</div>
        {(status.pullRequests || []).map(pr => <a key={pr.number} href={pr.url} target="_blank" rel="noreferrer" className="block truncate text-blue-600">#{pr.number} {pr.title} · {pr.state}{pr.merged ? ' · merged' : ''}</a>)}
        <input value={prTitle} onChange={event => setPrTitle(event.target.value)} placeholder="Pull request title" className="w-full border rounded px-2 py-1.5 bg-transparent"/>
        <textarea value={prBody} onChange={event => setPrBody(event.target.value)} placeholder="Description" rows={3} className="w-full border rounded px-2 py-1.5 bg-transparent resize-y"/>
        <button disabled={busy || !prTitle.trim() || !status.branch || status.branch === status.defaultBranch} onClick={() => void run('create-pr', { title: prTitle, body: prBody })} className="border rounded px-2 py-1 inline-flex items-center gap-1 disabled:opacity-40"><GitPullRequest size={13}/>Create pull request</button>
      </div>
    </>}
    {(busy || progress.length > 0) && <div aria-live="polite" className="p-3 space-y-1"><div className="font-medium flex items-center gap-1">{busy && <LoaderCircle size={13} className="animate-spin"/>}Operation progress</div>{progress.map((line, index) => <div key={index} className="text-slate-500 break-words">{line}</div>)}</div>}
    {patches.length > 0 && <div className="p-3 space-y-2 border-t border-slate-200 dark:border-[#2A2A2A]"><div className="font-medium">Diff</div>{patches.map(item => <details key={item.path} open><summary className="cursor-pointer truncate">{item.status}: {item.path}</summary><pre className="mt-1 p-2 overflow-x-auto bg-slate-50 dark:bg-[#111] text-[10px]">{item.patch}</pre></details>)}</div>}
  </div>;
}
