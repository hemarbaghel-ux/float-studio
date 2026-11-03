import React, { useState } from 'react';
import { 
  GitBranch, 
  RefreshCw, 
  AlertCircle, 
  AlertTriangle, 
  Check, 
  Cloud, 
  CloudOff, 
  Loader2, 
  Sparkles, 
  Terminal, 
  PanelRight, 
  ChevronUp,
  FolderGit2
} from 'lucide-react';
import { useIDEStore } from '../../store';
import { useAIStore } from '../../store/aiStore';
import { useIntegrationStore } from '../../store/integrationStore';
import { useValidationStore } from '../../store/validationStore';
import { flattenFileTree } from '../../lib/utils';

function getLanguageLabel(fileName: string | null): string {
  if (!fileName) return 'Plain Text';
  if (fileName.endsWith('.tsx')) return 'TypeScript React';
  if (fileName.endsWith('.ts')) return 'TypeScript';
  if (fileName.endsWith('.jsx')) return 'JavaScript React';
  if (fileName.endsWith('.js') || fileName.endsWith('.mjs') || fileName.endsWith('.cjs')) return 'JavaScript';
  if (fileName.endsWith('.py')) return 'Python';
  if (fileName.endsWith('.json')) return 'JSON';
  if (fileName.endsWith('.md')) return 'Markdown';
  if (fileName.endsWith('.css')) return 'CSS';
  if (fileName.endsWith('.html')) return 'HTML';
  if (fileName.endsWith('.sql')) return 'SQL';
  if (fileName.endsWith('.sh') || fileName.endsWith('.bash')) return 'Shell Script';
  if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) return 'YAML';
  return 'Plain Text';
}

export function StatusBar() {
  const {
    activeFileId,
    files,
    settings,
    projectCloudSaveStatus,
    projectCloudSaveMessage,
    activeSelection,
    bottomPanelOpen,
    toggleBottomPanel,
    setBottomPanelTab,
    rightSidebarOpen,
    toggleRightSidebar,
    leftSidebarOpen,
    toggleLeftSidebar,
    setActiveSidebarView
  } = useIDEStore();

  const { selectedModel, setSelectedModel, models } = useAIStore();
  const { currentRun } = useValidationStore();
  const executionError = useIDEStore((s) => s.executionError);
  const openTabs = useIDEStore((s) => s.openTabs);
  const totalErrors = (executionError ? 1 : 0) + (currentRun?.errorCount || 0);
  const totalWarnings = currentRun?.warningCount || 0;
  const hasUnsavedChanges = openTabs.some((t) => t.isModified);
  const { connections } = useIntegrationStore();
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);

  // Find active file name
  const findFileName = (nodes: any[], targetId: string | null): string | null => {
    if (!targetId) return null;
    for (const node of nodes) {
      if (node.id === targetId) return node.name;
      if (node.children) {
        const found = findFileName(node.children, targetId);
        if (found) return found;
      }
    }
    return null;
  };

  const activeFileName = findFileName(files, activeFileId);
  const languageLabel = getLanguageLabel(activeFileName);

  const activeFileContent = React.useMemo(() => {
    if (!activeFileId) return '';
    const flat = flattenFileTree(files);
    const found = flat.find((f) => f.id === activeFileId);
    return found?.content || '';
  }, [files, activeFileId]);
  const lineEnding = activeFileContent.includes('\r\n') ? 'CRLF' : 'LF';

  // Git status / branch
  const githubConn = connections.find(c => c.provider === 'github' && c.status === 'connected');
  const gitBranch = githubConn ? 'main' : 'local';

  // Selection coordinates
  const lineInfo = activeSelection
    ? activeSelection.startLine === activeSelection.endLine
      ? `Ln ${activeSelection.startLine}, Col 1`
      : `Ln ${activeSelection.startLine}-${activeSelection.endLine} (${activeSelection.endLine! - activeSelection.startLine! + 1} lines)`
    : 'Ln 1, Col 1';

  const tabSize = settings.tabSize || 2;
  const currentModelName = selectedModel === 'gpt-6.1-sol' ? 'GPT-6.1 Sol' : 'GPT-6 Astra';

  return (
    <footer 
      role="status"
      aria-label="Cursor IDE Status Bar"
      className="h-6 w-full bg-slate-200/90 dark:bg-[#0A0A0A] border-t border-slate-300 dark:border-[#222222] text-slate-600 dark:text-[#8B949E] text-[11px] font-mono flex items-center justify-between px-2 shrink-0 select-none z-30 transition-colors"
    >
      {/* Left section: Git, Problems, Cloud Sync */}
      <div className="flex items-center gap-1 sm:gap-2 min-w-0">
        {/* Git Branch / Source Control Trigger */}
        <button
          onClick={() => {
            if (!leftSidebarOpen) toggleLeftSidebar();
            setActiveSidebarView('source-control');
          }}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-300/60 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
          title={githubConn ? `Git: Connected (${gitBranch})` : 'Git: Local Workspace (Unlinked)'}
        >
          <GitBranch size={11} className={githubConn ? "text-blue-500" : "text-slate-400"} />
          <span className="font-semibold">{githubConn ? gitBranch : 'local'}</span>
        </button>

        {/* Problems & Diagnostics Trigger */}
        <button
          onClick={() => {
            if (!bottomPanelOpen) toggleBottomPanel();
            setBottomPanelTab('problems');
          }}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-300/60 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
          title={`Diagnostics: ${totalErrors} Errors, ${totalWarnings} Warnings`}
        >
          <div className="flex items-center gap-0.5">
            <AlertCircle size={11} className={totalErrors > 0 ? "text-rose-500" : "text-slate-400 dark:text-[#777]"} />
            <span className={totalErrors > 0 ? "text-rose-500 font-semibold" : ""}>{totalErrors}</span>
          </div>
          <div className="flex items-center gap-0.5 ml-0.5">
            <AlertTriangle size={11} className={totalWarnings > 0 ? "text-amber-500" : "text-slate-400 dark:text-[#777]"} />
            <span className={totalWarnings > 0 ? "text-amber-500 font-semibold" : ""}>{totalWarnings}</span>
          </div>
        </button>

        {/* Cloud Save & Persistence State */}
        <div 
          className="hidden md:flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
          title={hasUnsavedChanges ? 'You have unsaved changes in the editor (Ctrl+S to save)' : (projectCloudSaveMessage || undefined)}
        >
          {projectCloudSaveStatus === 'saving' ? (
            <>
              <Loader2 size={11} className="animate-spin text-blue-500" />
              <span>Saving…</span>
            </>
          ) : hasUnsavedChanges ? (
            <>
              <Cloud size={11} className="text-amber-500" />
              <span className="text-amber-500 font-medium">Unsaved changes</span>
            </>
          ) : projectCloudSaveStatus === 'synced' ? (
            <>
              <Check size={11} className="text-emerald-500" />
              <span>Synced</span>
            </>
          ) : projectCloudSaveStatus === 'local-only' ? (
            <>
              <CloudOff size={11} className="text-amber-500" />
              <span>Local only</span>
            </>
          ) : projectCloudSaveStatus === 'error' ? (
            <>
              <AlertCircle size={11} className="text-rose-500" />
              <span className="text-rose-500 font-semibold">Save failed</span>
            </>
          ) : (
            <>
              <Cloud size={11} className="text-slate-400" />
              <span>Ready</span>
            </>
          )}
        </div>
      </div>

      {/* Right section: Line/Col, Tab Size, Encoding, LF, Language, Model, Dock Toggles */}
      <div className="flex items-center gap-1 sm:gap-2 min-w-0">
        {/* Line & Column Position */}
        <span 
          className="hidden sm:inline-block px-1.5 py-0.5 text-slate-600 dark:text-[#8B949E] truncate"
          title="Cursor Position"
        >
          {lineInfo}
        </span>

        {/* Indentation / Spaces */}
        <span 
          className="hidden md:inline-block px-1.5 py-0.5 text-slate-500 dark:text-[#777]"
          title={`Tab Size: ${tabSize} spaces`}
        >
          Spaces: {tabSize}
        </span>

        {/* Encoding */}
        <span 
          className="hidden lg:inline-block px-1.5 py-0.5 text-slate-500 dark:text-[#777]"
          title="File Encoding: UTF-8"
        >
          UTF-8
        </span>

        {/* Line Endings */}
        <span 
          className="hidden lg:inline-block px-1.5 py-0.5 text-slate-500 dark:text-[#777]"
          title={`End of Line: ${lineEnding}`}
        >
          {lineEnding}
        </span>

        {/* Language Mode */}
        <span 
          className="hidden sm:inline-block px-1.5 py-0.5 text-slate-600 dark:text-[#A1A1AA] truncate max-w-[130px]"
          title={`Language Mode: ${languageLabel}`}
        >
          {languageLabel}
        </span>

        {/* Active Model Selector Badge */}
        <div className="relative">
          <button
            onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-medium transition-colors cursor-pointer border border-blue-500/20"
            title={`Active AI Model: ${currentModelName} (Click to change)`}
          >
            <Sparkles size={11} className="text-blue-500" />
            <span className="truncate max-w-[100px]">{currentModelName}</span>
            <ChevronUp size={10} className={`transition-transform duration-150 ${isModelMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Quick Model Switcher Popover */}
          {isModelMenuOpen && (
            <div 
              className="absolute bottom-full right-0 mb-1 w-52 bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#2A2A2A] rounded-lg shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#666] border-b border-slate-100 dark:border-[#222]">
                Authoritative AI Catalog
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedModel('gpt-6-astra');
                  setIsModelMenuOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between text-xs hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer ${
                  selectedModel === 'gpt-6-astra' ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                <span>GPT-6 Astra</span>
                {selectedModel === 'gpt-6-astra' && <Check size={12} />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedModel('gpt-6.1-sol');
                  setIsModelMenuOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between text-xs hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer ${
                  selectedModel === 'gpt-6.1-sol' ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                <span>GPT-6.1 Sol</span>
                {selectedModel === 'gpt-6.1-sol' && <Check size={12} />}
              </button>
            </div>
          )}
        </div>

        {/* Bottom Drawer Toggle */}
        <button
          onClick={toggleBottomPanel}
          className={`p-1 rounded hover:bg-slate-300/60 dark:hover:bg-white/10 transition-colors cursor-pointer ${
            bottomPanelOpen ? 'text-blue-500' : 'text-slate-500 dark:text-[#777]'
          }`}
          title="Toggle Terminal & Problems Panel"
        >
          <Terminal size={12} />
        </button>

        {/* Right AI Sidebar / Composer Toggle */}
        <button
          onClick={toggleRightSidebar}
          className={`p-1 rounded hover:bg-slate-300/60 dark:hover:bg-white/10 transition-colors cursor-pointer ${
            rightSidebarOpen ? 'text-blue-500' : 'text-slate-500 dark:text-[#777]'
          }`}
          title="Toggle AI Composer & Chat Panel (Ctrl+L / Ctrl+I)"
        >
          <PanelRight size={12} />
        </button>
      </div>
    </footer>
  );
}
