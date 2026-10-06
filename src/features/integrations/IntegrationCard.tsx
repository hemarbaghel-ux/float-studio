import React, { useState } from 'react';
import { IntegrationDefinition, IntegrationConnection, useIntegrationStore, RepositoryItem } from '../../store/integrationStore';
import { Github, Slack, Trello, CheckCircle2, AlertCircle, Settings2, Trash2, GitFork, Lock, Globe, Loader2, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useIDEStore } from '../../store';
import { importGitHubRepository } from '../../services/repoImporter';

interface IntegrationCardProps {
  definition: IntegrationDefinition;
  connection?: IntegrationConnection;
  isConfigured: boolean;
  isConnecting?: boolean;
  onConnect: () => void;
  onConfigure: () => void;
  onDisconnect: () => void;
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  github: <Github size={24} className="text-slate-900 dark:text-white" />,
  gitlab: <div className="w-6 h-6 flex items-center justify-center font-bold text-orange-500">GL</div>,
  bitbucket: <div className="w-6 h-6 flex items-center justify-center font-bold text-blue-500">BB</div>,
  slack: <Slack size={24} className="text-[#E01E5A]" />,
  teams: <div className="w-6 h-6 flex items-center justify-center font-bold text-indigo-500">MT</div>,
  linear: <div className="w-6 h-6 flex items-center justify-center font-bold text-indigo-400">L</div>,
  jira: <Trello size={24} className="text-blue-500" />,
  sentry: <div className="w-6 h-6 flex items-center justify-center font-bold text-red-500">S</div>,
};

export function IntegrationCard({ 
  definition, 
  connection, 
  isConfigured, 
  isConnecting = false,
  onConnect, 
  onConfigure,
  onDisconnect 
}: IntegrationCardProps) {
  const [showManage, setShowManage] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repositories, setRepositories] = useState<RepositoryItem[]>([]);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [hasFetchedRepos, setHasFetchedRepos] = useState(false);
  const [importingRepoId, setImportingRepoId] = useState<string | number | null>(null);

  const { getRepositories } = useIntegrationStore();
  const isConnected = connection?.status === 'connected';

  const handleFetchRepositories = async () => {
    setLoadingRepos(true);
    setRepoError(null);
    try {
      const res = await getRepositories(definition.id);
      if (res.success) {
        setRepositories(res.repositories);
        setHasFetchedRepos(true);
      } else {
        setRepoError(res.error || 'Failed to fetch repositories');
      }
    } catch (e: any) {
      setRepoError(e.message || 'Network error');
    } finally {
      setLoadingRepos(false);
    }
  };

  return (
    <div className={cn(
      "bg-white dark:bg-[#111111] border rounded-xl p-5 flex flex-col gap-4 shadow-sm transition-all",
      isConnected ? "border-emerald-500/30 dark:border-emerald-500/30 ring-1 ring-emerald-500/10" : "border-slate-200 dark:border-white/10"
    )}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-white/5 flex items-center justify-center border border-slate-200 dark:border-white/5 shadow-sm">
            {PROVIDER_ICONS[definition.id] || <div className="w-6 h-6 bg-slate-300 dark:bg-white/20 rounded" />}
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white leading-tight">{definition.name}</h3>
            {isConnecting ? (
              <div className="flex items-center gap-1 mt-0.5 text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                <Loader2 size={12} className="animate-spin" /> Connecting...
              </div>
            ) : isConnected ? (
              <div className="flex items-center gap-1 mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 size={12} /> Connected
              </div>
            ) : connection?.status === 'expired' ? (
              <div className="flex items-center gap-1 mt-0.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                <AlertCircle size={12} /> Authorization expired
              </div>
            ) : connection?.status === 'error' ? (
              <div className="flex items-center gap-1 mt-0.5 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                <AlertCircle size={12} /> Connection failed
              </div>
            ) : !isConfigured ? (
              <div className="flex items-center gap-1 mt-0.5 text-[11px] text-amber-600 dark:text-amber-400/90 font-medium">
                <AlertCircle size={12} /> Not configured
              </div>
            ) : (
              <div className="flex items-center gap-1 mt-0.5 text-[11px] text-slate-500 dark:text-[#A1A1AA]">
                Ready to connect
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-[#A1A1AA] flex-1 line-clamp-3">
        {definition.description}
      </p>

      {isConnected && connection ? (
        <div className="flex flex-col gap-3 pt-3 border-t border-slate-200 dark:border-white/5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500 dark:text-[#8B949E]">Account</span>
            <span className="font-medium text-slate-900 dark:text-white truncate max-w-[140px]" title={connection.accountName}>
              @{connection.accountName || 'Unknown'}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500 dark:text-[#8B949E]">Last Verified</span>
            <span className="text-slate-900 dark:text-[#C9D1D9]">
              {connection.lastVerifiedAt ? new Date(connection.lastVerifiedAt).toLocaleDateString() : 'Just now'}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => {
                setShowManage(true);
                if ((definition.id === 'github' || definition.id === 'gitlab') && !hasFetchedRepos) {
                  handleFetchRepositories();
                }
              }}
              className="flex-1 py-1.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-md text-xs font-medium text-slate-900 dark:text-white transition-colors cursor-pointer"
            >
              Manage &amp; Repositories
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-auto pt-4">
          <button
            onClick={isConfigured ? onConnect : onConfigure}
            disabled={isConnecting}
            className={cn(
              "w-full py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
              isConfigured 
                ? "bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:opacity-90"
                : "bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-white/10 dark:hover:bg-white/15 dark:text-white border border-slate-200 dark:border-white/10"
            )}
          >
            {isConnecting ? (
              <>
                <Loader2 size={16} className="animate-spin text-current" />
                <span>Connecting...</span>
              </>
            ) : isConfigured ? (
              connection?.status === 'expired' || connection?.status === 'error' ? 'Reconnect' : 'Connect'
            ) : (
              'Configure Integration'
            )}
          </button>
        </div>
      )}

      {/* Manage / Repositories Modal */}
      {showManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowManage(false)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-5 text-slate-900 dark:text-white max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center">
                  {PROVIDER_ICONS[definition.id]}
                </div>
                <div>
                  <h3 className="text-base font-semibold">{definition.name} Connection</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#8B949E]">
                    <span>Linked as <strong>@{connection?.accountName}</strong></span>
                    <span>•</span>
                    <span className="text-emerald-500">Authorized</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Repositories Viewer for code hosts */}
            {(definition.id === 'github' || definition.id === 'gitlab') && (
              <div className="flex flex-col gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-[#C9D1D9]">Available Repositories</span>
                  <button 
                    onClick={handleFetchRepositories}
                    disabled={loadingRepos}
                    className="text-[11px] text-[#3B82F6] hover:underline cursor-pointer disabled:opacity-50"
                  >
                    {loadingRepos ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>

                {loadingRepos ? (
                  <div className="py-6 flex flex-col items-center justify-center gap-2 text-xs text-slate-500 dark:text-[#8B949E] bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-xl">
                    <Loader2 size={16} className="animate-spin text-slate-400" />
                    <span>Fetching authorized repositories from {definition.name}...</span>
                  </div>
                ) : repoError ? (
                  <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-lg flex items-center justify-between">
                    <span>{repoError}</span>
                    <button onClick={handleFetchRepositories} className="underline ml-2">Retry</button>
                  </div>
                ) : repositories.length > 0 ? (
                  <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                    {repositories.map(repo => {
                      const isLinked = useIDEStore.getState().projectName === repo.name;
                      return (
                        <div 
                          key={repo.id}
                          className="p-2.5 rounded-lg border border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] text-xs flex items-center justify-between gap-2"
                        >
                          <div className="flex flex-col truncate min-w-0">
                            <a 
                              href={repo.htmlUrl} 
                              target="_blank" 
                              rel="noreferrer"
                              className="font-mono text-[11px] font-medium text-slate-900 dark:text-white hover:text-blue-500 dark:hover:text-blue-400 flex items-center gap-1 truncate"
                            >
                              <span className="truncate">{repo.fullName}</span>
                              <ExternalLink size={10} className="shrink-0" />
                            </a>
                            <span className="text-[10px] text-slate-500 dark:text-[#8B949E]">
                              {repo.defaultBranch} • {repo.language || 'Code'} • Updated {new Date(repo.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[9px] text-slate-400 dark:text-[#8B949E] uppercase font-medium px-1.5 py-0.5 bg-slate-200 dark:bg-white/5 rounded">
                              {repo.private ? 'Private' : 'Public'}
                            </span>
                            {definition.id === 'github' && (
                              <button
                                onClick={async () => {
                                  if (importingRepoId) return;
                                  setImportingRepoId(repo.id);
                                  try {
                                    const [owner, repoName] = repo.fullName.split('/');
                                    const result = await importGitHubRepository(owner || repo.name, repoName || repo.name, repo.defaultBranch);
                                    if (!result.success || !result.files) {
                                      alert(result.error || 'Failed to import repository.');
                                      return;
                                    }
                                    const { setProject, saveProject } = useIDEStore.getState();
                                    setProject(result.projectName || repo.name, result.files, result.projectId);
                                    await saveProject();
                                    setShowManage(false);
                                  } catch (err: any) {
                                    alert(err.message || 'Import failed.');
                                  } finally {
                                    setImportingRepoId(null);
                                  }
                                }}
                                disabled={importingRepoId === repo.id}
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-medium rounded transition-colors disabled:opacity-50 cursor-pointer"
                              >
                                {importingRepoId === repo.id ? 'Importing...' : 'Import'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-slate-500 dark:text-[#8B949E] bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-xl">
                    No repositories found or access not granted for this scope.
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-white/10">
              <button 
                onClick={() => {
                  onDisconnect();
                  setShowManage(false);
                }}
                className="px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 size={14} /> Disconnect Account
              </button>
              <button 
                onClick={() => setShowManage(false)}
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg hover:opacity-90 transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
