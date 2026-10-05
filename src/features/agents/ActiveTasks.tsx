import React, { useEffect, useState } from 'react';
import { useAgentOrchestratorStore } from '../../store/agentOrchestratorStore';
import { useIDEStore } from '../../store';
import { useAIStore } from '../../store/aiStore';
import { Play, Pause, XCircle, Plus, Loader2 } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { flattenFileTree } from '../../lib/utils';
import { v4 as uuidv4 } from 'uuid';
import type { FileNode } from '../../types';
import { streamAgentTaskEvents } from '../../services/agentEventStream';

export function ActiveTasks() {
  const { tasks, fetchTasks } = useAgentOrchestratorStore();
  const receiveTaskEvent = useAgentOrchestratorStore((state) => state.receiveTaskEvent);
  const createTask = useAgentOrchestratorStore((state) => state.createTask);
  const { projectId, projectName } = useIDEStore();
  const modelId = useAIStore((state) => state.selectedModel);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [applyingTaskId, setApplyingTaskId] = useState<string | null>(null);
  const [applyNotice, setApplyNotice] = useState('');
  const [githubBusyTaskId, setGithubBusyTaskId] = useState<string | null>(null);
  const [requestedChecks, setRequestedChecks] = useState<Array<'test' | 'lint' | 'typecheck' | 'build'>>([]);
  const streamTaskIds = tasks.filter(task => ['QUEUED', 'PLANNING', 'INSPECTING', 'WAITING_FOR_TOOL', 'EXECUTING', 'VALIDATING'].includes(task.status) || Date.now() - task.updatedAt < 30_000).slice(0, 6).map(task => task.id).join(',');

  useEffect(() => {
    const controller = new AbortController();
    for (const taskId of streamTaskIds.split(',').filter(Boolean)) {
      void streamAgentTaskEvents(taskId, event => receiveTaskEvent(taskId, event), controller.signal);
    }
    return () => controller.abort();
  }, [streamTaskIds, receiveTaskEvent]);

  const applyResult = async (task: (typeof tasks)[number]) => {
    const changeSet = task.result?.changeSet;
    const proposalId = changeSet?.proposalId;
    const currentProjectId = useIDEStore.getState().projectId;
    if (!proposalId || !changeSet?.changes?.length) return;
    if (!currentProjectId || currentProjectId !== task.projectId) {
      setApplyNotice('Open the same project that this task used before applying its proposal.');
      return;
    }
    if (!window.confirm(`Apply all ${changeSet.changes.length} proposed file change(s) to this workspace?`)) return;

    setApplyingTaskId(task.id);
    setApplyNotice('');
    try {
      const currentFiles = flattenFileTree(useIDEStore.getState().files)
        .filter((file) => file.type === 'file')
        .map((file) => ({ path: file.path, content: file.content || '' }));
      const response = await apiFetch(`/api/projects/${encodeURIComponent(task.projectId!)}/proposals/${encodeURIComponent(proposalId)}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedPaths: changeSet.changes.map((change: any) => change.path), currentFiles }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'The proposal could not be applied. Review any file conflicts and retry.');
      }

      const applied = new Set<string>(result.appliedFiles || []);
      let updated = applyChangesToFileTree(useIDEStore.getState().files, changeSet.changes.filter((change: any) => applied.has(change.path)));
      useIDEStore.getState().setProject(projectName || 'Workspace', updated, currentProjectId);
      setApplyNotice(`Applied ${applied.size} file change(s).`);
    } catch (applyError) {
      setApplyNotice(applyError instanceof Error ? applyError.message : 'Could not apply the proposal.');
    } finally {
      setApplyingTaskId(null);
    }
  };

  const retryTask = async (task: (typeof tasks)[number]) => {
    setApplyingTaskId(task.id);
    setApplyNotice('');
    try {
      const response = await apiFetch(`/api/agents/tasks/${encodeURIComponent(task.id)}/retry`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not retry task from its saved workspace snapshot.');
      await fetchTasks();
      setApplyNotice('A new task was queued with the same project snapshot.');
    } catch (retryError) {
      setApplyNotice(retryError instanceof Error ? retryError.message : 'Could not retry this task.');
    } finally {
      setApplyingTaskId(null);
    }
  };

  const runGithubAction = async (task: (typeof tasks)[number], action: 'publish' | 'pull-request' | 'approve' | 'refresh' | 'merge') => {
    const publication = task.github;
    const messages = {
      publish: `Publish the reviewed proposal as a new branch in ${publication?.repository || 'the linked GitHub repository'}? The default branch will not be changed.`,
      'pull-request': `Create a pull request from ${publication?.branch} into ${publication?.baseBranch}?`,
      approve: `Submit an approval review for pull request #${publication?.pullRequest?.number} on GitHub?`,
      refresh: '',
      merge: `Merge pull request #${publication?.pullRequest?.number} into ${publication?.baseBranch}? This is an explicit GitHub merge; FLOAT will not merge without this confirmation.`,
    };
    if (messages[action] && !window.confirm(messages[action])) return;
    setGithubBusyTaskId(task.id);
    setApplyNotice('');
    try {
      const response = await apiFetch(`/api/agents/tasks/${encodeURIComponent(task.id)}/github/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'merge' ? { confirmed: true } : {}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || `GitHub ${action} failed.`);
      await fetchTasks();
      setApplyNotice(data.message || `GitHub ${action} completed.`);
    } catch (githubError) {
      setApplyNotice(githubError instanceof Error ? githubError.message : `GitHub ${action} failed.`);
    } finally {
      setGithubBusyTaskId(null);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const prompt = description.trim();
    if (!prompt) return setError('Describe the task you want the agent to work on.');
    setBusy(true);
    setError('');
    try {
      if (!projectId) throw new Error('Save a project to your FLOAT account before starting a background task.');
      await createTask({
        name: name.trim() || prompt.slice(0, 80),
        description: prompt,
        assignedAgentId: 'main-agent',
        modelId: modelId?.startsWith('gemini-') ? modelId : 'gemini-3.1-flash-lite',
        projectId,
        context: { objectives: [] },
        requestedChecks,
      });
      setName('');
      setDescription('');
      setCreating(false);
      await fetchTasks();
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : 'Could not start the task.');
    } finally {
      setBusy(false);
    }
  };
  
  const handlePause = async (id: string) => {
    try { const response = await apiFetch(`/api/agents/tasks/${encodeURIComponent(id)}/pause`, { method: 'POST' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not pause task.'); await fetchTasks(); }
    catch (error) { setApplyNotice(error instanceof Error ? error.message : 'Could not pause task.'); }
  };
  const handleResume = async (id: string) => {
    try { const response = await apiFetch(`/api/agents/tasks/${encodeURIComponent(id)}/resume`, { method: 'POST' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not resume task.'); await fetchTasks(); }
    catch (error) { setApplyNotice(error instanceof Error ? error.message : 'Could not resume task.'); }
  };
  const handleCancel = async (id: string) => {
    try { const response = await apiFetch(`/api/agents/tasks/${encodeURIComponent(id)}/cancel`, { method: 'POST' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not cancel task.'); await fetchTasks(); }
    catch (error) { setApplyNotice(error instanceof Error ? error.message : 'Could not cancel task.'); }
  };
  const activeTasks = tasks.filter(t => !['COMPLETED', 'FAILED', 'CANCELLED'].includes(t.status));

  return (
    <div className="p-8 max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Active Tasks</h1>
        <button type="button" onClick={() => { setCreating((value) => !value); setError(''); }} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500">
          <Plus size={15} /> New task
        </button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} className="flex flex-col gap-3 rounded-lg border border-[#30363D] bg-[#0D1117] p-5">
          <div className="text-xs text-[#8B949E]">Saved project snapshot: <span className="text-[#C9D1D9]">{projectName || 'Workspace'}</span></div>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} placeholder="Task name (optional)" className="rounded-md border border-[#30363D] bg-[#010409] px-3 py-2 text-sm text-white placeholder:text-[#8B949E]" />
          <textarea required value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} rows={4} placeholder="Describe the change you want FLOAT to work on..." className="resize-y rounded-md border border-[#30363D] bg-[#010409] px-3 py-2 text-sm text-white placeholder:text-[#8B949E]" />
          <fieldset className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#C9D1D9]">
            <legend className="mb-2 text-[#8B949E]">Run after proposal (isolated sandbox required)</legend>
            {(['test', 'lint', 'typecheck', 'build'] as const).map(check => <label key={check} className="flex items-center gap-1.5"><input type="checkbox" checked={requestedChecks.includes(check)} onChange={event => setRequestedChecks(current => event.target.checked ? [...current, check] : current.filter(item => item !== check))}/>{check}</label>)}
          </fieldset>
          {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreating(false)} disabled={busy} className="rounded-md px-3 py-2 text-xs text-[#C9D1D9] hover:bg-[#21262D]">Cancel</button>
            <button type="submit" disabled={busy || !description.trim()} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 size={13} className="animate-spin" />}{busy ? 'Starting…' : 'Start task'}
            </button>
          </div>
        </form>
      )}
      
      <div className="flex flex-col gap-4">
        {activeTasks.length === 0 ? (
          <div className="border border-[#30363D] rounded-md p-8 text-center text-[#8B949E] bg-[#0D1117]">
            No active tasks. Start one here to delegate work against the current project snapshot.
          </div>
        ) : (
          activeTasks.map(task => (
            <div key={task.id} className="bg-[#0D1117] border border-[#30363D] rounded-lg p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-medium text-white">{task.name}</h3>
                  <p className="text-sm text-[#8B949E] mt-1">{task.description}</p>
                  {task.lastEvent?.message && <p className="mt-2 text-xs text-blue-300">{task.lastEvent.message}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {task.status === 'PAUSED' ? (
                    <button onClick={() => handleResume(task.id)} className="p-1.5 text-[#8B949E] hover:text-white bg-[#21262D] rounded-md" title="Resume">
                      <Play size={16} />
                    </button>
                  ) : (
                    <button onClick={() => handlePause(task.id)} className="p-1.5 text-[#8B949E] hover:text-white bg-[#21262D] rounded-md" title="Pause">
                      <Pause size={16} />
                    </button>
                  )}
                  <button onClick={() => handleCancel(task.id)} className="p-1.5 text-red-400 hover:text-red-300 bg-[#21262D] rounded-md" title="Cancel">
                    <XCircle size={16} />
                  </button>
                </div>
              </div>
              
              <div>
                <div className="flex items-center justify-between text-xs text-[#8B949E] mb-1.5">
                  <span className="font-medium px-2 py-0.5 rounded-sm bg-[#161B22] border border-[#30363D]">{task.status}</span>
                  <span>{task.progress}%</span>
                </div>
                <div className="w-full h-2 bg-[#010409] rounded-full overflow-hidden border border-[#30363D]">
                  <div 
                    className={`h-full transition-all duration-300 ${task.status === 'PAUSED' ? 'bg-yellow-500' : 'bg-[#58A6FF]'}`}
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-white">Recent results</h2>
        {tasks.filter((task) => task.result || task.error).slice(0, 10).length === 0 ? (
          <div className="rounded-md border border-[#30363D] bg-[#0D1117] p-6 text-center text-sm text-[#8B949E]">
            Completed agent output and proposed file changes will appear here.
          </div>
        ) : tasks.filter((task) => task.result || task.error).slice(0, 10).map((task) => {
          const changeSet = task.result?.changeSet;
          const isExpanded = expandedResult === task.id;
          return (
            <article key={task.id} className="rounded-lg border border-[#30363D] bg-[#0D1117]">
              <button type="button" onClick={() => setExpandedResult(isExpanded ? null : task.id)} aria-expanded={isExpanded} className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-[#161B22]">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-white">{task.name}</span>
                  <span className="mt-1 block text-xs text-[#8B949E]">{changeSet?.changes?.length ? `${changeSet.changes.length} proposed file change(s)` : task.error ? 'Task failed' : 'Agent response'}</span>
                </span>
                <span className="shrink-0 text-xs text-blue-300">{isExpanded ? 'Hide details' : 'Review result'}</span>
              </button>
              {isExpanded && (
                <div className="flex flex-col gap-3 border-t border-[#30363D] p-4">
                  {task.error && <p role="alert" className="text-sm text-red-300">{task.error}</p>}
                  {task.result?.text && <p className="whitespace-pre-wrap text-sm leading-6 text-[#C9D1D9]">{task.result.text}</p>}
                  {task.result?.gitWorkspace && <details className="rounded-md border border-[#30363D]">
                    <summary className="cursor-pointer bg-[#161B22] px-3 py-2 text-xs text-[#C9D1D9]">Isolated Git branch {task.result.gitWorkspace.branch} · {task.result.gitWorkspace.diff ? 'review worktree diff' : 'no file changes'}</summary>
                    <div className="p-3">
                      <p className="mb-2 text-[11px] text-[#8B949E]">Base commit {task.result.gitWorkspace.baseCommit}. This task branch was private to the agent; review the saved proposal below before applying it to the active project.</p>
                      {task.result.gitWorkspace.diff && <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-[#010409] p-3 text-[11px] text-[#C9D1D9]">{task.result.gitWorkspace.diff}</pre>}
                    </div>
                  </details>}
                  {changeSet?.changes?.length > 0 && task.status === 'COMPLETED' && (
                    <section className="rounded-md border border-[#30363D] bg-[#010409] p-3">
                      <h4 className="text-xs font-semibold text-[#C9D1D9]">GitHub agent branch</h4>
                      {task.github?.branch ? (
                        <div className="mt-2 flex flex-col gap-2 text-xs text-[#8B949E]">
                          <p>Repository <span className="text-[#C9D1D9]">{task.github.repository}</span> · branch <code className="text-[#C9D1D9]">{task.github.branch}</code> → <code>{task.github.baseBranch}</code></p>
                          {task.github.commitUrl ? <p>Published commit <a className="text-blue-300 hover:underline" href={task.github.commitUrl} target="_blank" rel="noreferrer">{task.github.commitSha?.slice(0, 12)}</a></p> : <p>Commit <code>{task.github.commitSha?.slice(0, 12)}</code></p>}
                          {task.github.pullRequest ? <div className="flex flex-wrap items-center gap-2">
                            <a className="text-blue-300 hover:underline" href={task.github.pullRequest.url} target="_blank" rel="noreferrer">PR #{task.github.pullRequest.number}: {task.github.pullRequest.title || task.github.pullRequest.state}</a>
                            <span>{task.github.pullRequest.merged ? 'merged' : task.github.pullRequest.state}</span>
                            <span>Review: {String(task.github.pullRequest.reviewState || 'unknown').replace('_', ' ')}</span>
                            {task.github.pullRequest.mergeable === false && <span className="text-red-300">Merge conflicts reported by GitHub</span>}
                          </div> : <p>No pull request created.</p>}
                          <div className="flex flex-wrap gap-2">
                            {!task.github.pullRequest && <button type="button" onClick={() => void runGithubAction(task, 'pull-request')} disabled={githubBusyTaskId === task.id} className="rounded border border-[#30363D] px-2.5 py-1.5 text-xs text-[#C9D1D9] hover:bg-[#21262D] disabled:opacity-50">{githubBusyTaskId === task.id ? 'Working…' : 'Create pull request'}</button>}
                            {task.github.pullRequest && <button type="button" onClick={() => void runGithubAction(task, 'refresh')} disabled={githubBusyTaskId === task.id} className="rounded border border-[#30363D] px-2.5 py-1.5 text-xs text-[#C9D1D9] hover:bg-[#21262D] disabled:opacity-50">Refresh status</button>}
                            {task.github.pullRequest?.state === 'open' && !task.github.pullRequest.merged && task.github.pullRequest.reviewState !== 'approved' && <button type="button" onClick={() => void runGithubAction(task, 'approve')} disabled={githubBusyTaskId === task.id} className="rounded border border-green-700 px-2.5 py-1.5 text-xs text-green-300 hover:bg-green-950 disabled:opacity-50">{githubBusyTaskId === task.id ? 'Submitting…' : 'Approve review…'}</button>}
                            {task.github.pullRequest?.state === 'open' && !task.github.pullRequest.merged && task.github.pullRequest.mergeable !== false && <button type="button" onClick={() => void runGithubAction(task, 'merge')} disabled={githubBusyTaskId === task.id} className="rounded bg-green-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-50">{githubBusyTaskId === task.id ? 'Merging…' : 'Merge pull request…'}</button>}
                          </div>
                        </div>
                      ) : <div className="mt-2 flex flex-wrap items-center gap-2">
                        <p className="text-xs text-[#8B949E]">Publish the saved proposal as a new task branch in the project’s linked repository.</p>
                        <button type="button" onClick={() => void runGithubAction(task, 'publish')} disabled={githubBusyTaskId === task.id} className="rounded bg-[#238636] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2EA043] disabled:opacity-50">{githubBusyTaskId === task.id ? 'Publishing…' : 'Publish agent branch'}</button>
                      </div>}
                      {githubBusyTaskId === task.id && <p role="status" className="mt-2 text-[11px] text-blue-300">Contacting GitHub…</p>}
                    </section>
                  )}
                  {task.result?.validation?.map((check: any) => <details key={`${task.id}:${check.type}`} className="rounded border border-[#30363D] p-2"><summary className="cursor-pointer text-xs">{check.type}: {check.status}{check.exitCode !== null && check.exitCode !== undefined ? ` (exit ${check.exitCode})` : ''}</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[11px] text-[#8B949E]">{[check.stdout, check.stderr, check.message, check.error].filter(Boolean).join('\n')}</pre></details>)}
                  {changeSet?.changes?.map((change: any) => (
                    <details key={`${task.id}:${change.path}`} className="overflow-hidden rounded-md border border-[#30363D]">
                      <summary className="cursor-pointer bg-[#161B22] px-3 py-2 text-xs font-medium text-[#C9D1D9]">{change.operation} · {change.path}</summary>
                      <div className="grid gap-2 p-3 lg:grid-cols-2">
                        {change.originalContent !== undefined && <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-[#010409] p-3 text-[11px] text-red-200">{change.originalContent}</pre>}
                        {change.proposedContent !== undefined && <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-[#010409] p-3 text-[11px] text-green-200">{change.proposedContent}</pre>}
                      </div>
                    </details>
                  ))}
                  {changeSet?.proposalId && changeSet?.changes?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-3">
                      <button type="button" onClick={() => void applyResult(task)} disabled={applyingTaskId === task.id} className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
                        {applyingTaskId === task.id ? 'Applying…' : 'Apply all reviewed changes'}
                      </button>
                      {applyNotice && <span role="status" className="text-xs text-[#C9D1D9]">{applyNotice}</span>}
                    </div>
                  )}
                  {applyNotice && <p role="status" className="text-xs text-[#C9D1D9]">{applyNotice}</p>}
                  {task.status === 'FAILED' && (
                    <button type="button" onClick={() => void retryTask(task)} disabled={applyingTaskId === task.id} className="w-fit rounded-md border border-[#30363D] px-3 py-2 text-xs text-[#C9D1D9] hover:bg-[#21262D] disabled:opacity-50">
                      {applyingTaskId === task.id ? 'Retrying…' : 'Retry with saved snapshot'}
                    </button>
                  )}
                  {changeSet?.changes?.length > 0 && !changeSet?.proposalId && <p className="text-[11px] text-[#8B949E]">This result has no saved proposal and cannot be applied from this view.</p>}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}

function applyChangesToFileTree(files: FileNode[], changes: Array<any>): FileNode[] {
  const byPath = new Map<string, any>();
  for (const change of changes) {
    const path = String(change.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!path || path.split('/').some((part: string) => !part || part === '.' || part === '..')) continue;
    byPath.set(path, change);
  }

  const walk = (nodes: FileNode[], prefix = ''): FileNode[] => nodes.flatMap((node) => {
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    const change = byPath.get(path);
    if (change?.operation === 'delete') return [];
    const updatedNode = node.type === 'folder'
      ? { ...node, children: walk(node.children || [], path) }
      : change && typeof change.proposedContent === 'string'
        ? { ...node, content: change.proposedContent }
        : node;
    return [updatedNode];
  });

  const insert = (nodes: FileNode[], parts: string[], content: string): FileNode[] => {
    const [head, ...tail] = parts;
    if (!head) return nodes;
    const index = nodes.findIndex((node) => node.name === head);
    if (tail.length === 0) {
      if (index >= 0) return nodes.map((node, i) => i === index && node.type === 'file' ? { ...node, content } : node);
      return [...nodes, { id: uuidv4(), name: head, type: 'file', content }];
    }
    if (index < 0) {
      const folder: FileNode = { id: uuidv4(), name: head, type: 'folder', children: [] };
      return [...nodes, { ...folder, children: insert([], tail, content) }];
    }
    const existing = nodes[index];
    if (existing.type !== 'folder') return nodes;
    return nodes.map((node, i) => i === index ? { ...node, children: insert(node.children || [], tail, content) } : node);
  };

  let result = walk(files);
  for (const [path, change] of byPath) {
    if ((change.operation === 'create' || change.operation === 'rename') && typeof change.proposedContent === 'string') {
      result = insert(result, path.split('/'), change.proposedContent);
    }
  }
  return result;
}
