import React, { useState, useRef, useEffect } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useIDEStore } from '../../store';
import { useValidationStore } from '../../store/validationStore';
import { X, Trash2, Play, Terminal as TerminalIcon, AlertCircle, FileText, Loader2, CheckCircle2, Square, Shield, Sparkles } from 'lucide-react';
import { cn, flattenFileTree } from '../../lib/utils';
import { executeProjectCommand } from '../../services/projectExecution';
import { ValidationPanel } from '../../components/panels/ValidationPanel';
import { useCloudSession, AVAILABLE_PROFILES } from '../float/cloudSessionStore';
import { isShellCommand, runShell } from '../float/sandbox';
import { sandboxFs } from '../float/workspaceFs';
import { auth } from '../../lib/firebase';

export function BottomPanel() {
  const {
    toggleBottomPanel,
    terminalEntries,
    addTerminalEntry,
    clearTerminal,
    bottomPanelTab,
    setBottomPanelTab,
    executionOutput,
    executionError,
    lastExecutionTimeMs,
    isRunningCode,
    runActiveCode,
    files,
    projectId
  } = useIDEStore();

  const handleDebugWithAI = (errorText: string) => {
    if (!useIDEStore.getState().rightSidebarOpen) {
      useIDEStore.getState().toggleRightSidebar();
    }
    useIDEStore.getState().addAiContext({
      type: 'terminal',
      name: 'Error Diagnostics',
      content: errorText,
      sizeBytes: errorText.length
    });
    useIDEStore.getState().setInitialPrompt(`Please analyze and fix this terminal error:\n\`\`\`\n${errorText}\n\`\`\``);
  };

  const { currentRun } = useValidationStore();
  const valErrorCount = currentRun ? currentRun.errorCount : 0;

  const [inputVal, setInputVal] = useState('');
  const [isExecutingInput, setIsExecutingInput] = useState(false);
  const [policyMode, setPolicyMode] = useState<'safe' | 'review' | 'allowlist' | 'manual' | 'sandboxed' | 'auto'>('sandboxed');
  const [terminalConfigError, setTerminalConfigError] = useState<{ message: string; setupSteps: string[] } | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const xtermContainerRef = useRef<HTMLDivElement>(null);
  const xtermInstanceRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const executionController = useRef<AbortController | null>(null);

  useEffect(() => {
    // Fetch execution policy from server
    auth.currentUser?.getIdToken().then(token => {
      if (!token) return;
      fetch('/api/policy', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data?.mode) setPolicyMode(data.mode);
        })
        .catch(() => {});
    });
  }, []);

  // Attach xterm.js and connect to /api/terminal/:sessionId WebSocket
  useEffect(() => {
    if (bottomPanelTab !== 'terminal') return;
    let cancelled = false;
    let term: XTerm | null = null;

    if (xtermContainerRef.current && !xtermInstanceRef.current) {
      term = new XTerm({
        cursorBlink: true,
        fontSize: 12,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        convertEol: true,
        rows: 10,
        cols: 96,
        theme: {
          background: '#080808',
          foreground: '#C9D1D9',
          cursor: '#79C0FF'
        }
      });
      term.open(xtermContainerRef.current);
      xtermInstanceRef.current = term;

      term.onData((data: string) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'input', data }));
        }
      });
    }

    const connectPtySession = async () => {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken().catch(() => null);
      if (!token || cancelled) return;

      const activeProjId = projectId || 'default-project';
      const sessionId = `pty-${activeProjId}`;

      try {
        const checkRes = await fetch(
          `/api/terminal/${encodeURIComponent(sessionId)}?projectId=${encodeURIComponent(activeProjId)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const checkData = await checkRes.json().catch(() => ({}));
        if (cancelled) return;

        if (!checkRes.ok || checkData.configured === false || checkData.code === 'TERMINAL_NOT_CONFIGURED') {
          setWsConnected(false);
          setTerminalConfigError({
            message: checkData.error || 'Terminal not configured: isolated Docker sandbox and node-pty are required.',
            setupSteps: Array.isArray(checkData.setupSteps) ? checkData.setupSteps : []
          });
          return;
        }

        setTerminalConfigError(null);
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${proto}//${window.location.host}/api/terminal/${encodeURIComponent(sessionId)}?projectId=${encodeURIComponent(activeProjId)}&token=${encodeURIComponent(token)}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!cancelled) setWsConnected(true);
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data || '{}'));
            if (msg.type === 'error' && msg.code === 'TERMINAL_NOT_CONFIGURED') {
              setWsConnected(false);
              setTerminalConfigError({
                message: msg.message || 'Terminal not configured.',
                setupSteps: Array.isArray(msg.setupSteps) ? msg.setupSteps : []
              });
              return;
            }
            if (msg.type === 'output' && typeof msg.data === 'string') {
              xtermInstanceRef.current?.write(msg.data);
              if (msg.source === 'agent_run_command') {
                addTerminalEntry({ type: msg.stream === 'stderr' ? 'error' : 'output', content: msg.data });
              }
            } else if (msg.type === 'agent_command_started' && typeof msg.command === 'string') {
              xtermInstanceRef.current?.write(msg.data || `\r\n$ ${msg.command}\r\n`);
              addTerminalEntry({ type: 'command', content: `[Agent] ${msg.command}` });
            } else if (msg.type === 'agent_command_completed') {
              xtermInstanceRef.current?.write(msg.data || '');
            }
          } catch {
            // Ignore malformed WS message
          }
        };

        ws.onclose = () => {
          if (!cancelled) setWsConnected(false);
        };
      } catch {
        // Ignore transient connection error
      }
    };

    void connectPtySession();

    return () => {
      cancelled = true;
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
      if (xtermInstanceRef.current) {
        try { xtermInstanceRef.current.dispose(); } catch {}
        xtermInstanceRef.current = null;
      }
    };
  }, [bottomPanelTab, projectId]);

  const handlePolicyChange = async (newMode: 'safe' | 'review' | 'allowlist' | 'manual' | 'sandboxed' | 'auto') => {
    setPolicyMode(newMode);
    const token = await auth.currentUser?.getIdToken();
    if (token) {
      fetch('/api/policy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ mode: newMode })
      }).catch(() => {});
    }
  };

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalEntries]);

  const handleCommand = async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    addTerminalEntry({ type: 'command', content: trimmed });
    setInputVal('');

    if (trimmed === 'clear') {
      clearTerminal();
      xtermInstanceRef.current?.clear();
      return;
    }

    if (wsConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data: `${trimmed}\n` }));
      return;
    }

    if (useCloudSession.getState().active && isShellCommand(trimmed)) {
        setIsExecutingInput(true);
        try {
          const { output, code } = await runShell(trimmed, sandboxFs());
          if (output) addTerminalEntry({ type: code === 0 ? 'output' : 'error', content: `[Browser worker] ${output}` });
        } catch (err: any) {
          addTerminalEntry({ type: 'error', content: err?.message || String(err) });
        } finally {
          setIsExecutingInput(false);
        }
        return;
    }

    if (trimmed === 'session' || trimmed.startsWith('session ')) {
      const parts = trimmed.split(/\s+/);
      const sub = parts[1]?.toLowerCase();
      const cs = useCloudSession.getState();

      if (sub === 'stop' || sub === 'disconnect') {
        cs.stop();
        addTerminalEntry({
          type: 'output',
          content: 'Session disconnected. Type "session connect" or "session sol" to reconnect.'
        });
        return;
      }

      if (sub === 'sol') {
        const solProfile = AVAILABLE_PROFILES.find(p => p.id === 'sol') || AVAILABLE_PROFILES[0];
        cs.start('cloud-agent', 'sol-ccarenv', solProfile.sessionId, solProfile.environmentId, solProfile.model);
      } else if (sub === 'astra' || sub === 'new') {
        const astraProfile = AVAILABLE_PROFILES.find(p => p.id === 'astra') || AVAILABLE_PROFILES[1];
        cs.start('cloud-agent', 'astra-ccarenv', astraProfile.sessionId, astraProfile.environmentId, astraProfile.model);
      } else if (sub === 'connect') {
        const customSession = parts[2];
        const customEnv = parts[3];
        if (customSession && customEnv) {
          cs.start('cloud-agent', 'custom-ccarenv', customSession, customEnv, 'Custom Agent');
        } else {
          cs.connect();
        }
      }

      const now = useCloudSession.getState();
      if (now.active && now.sessionId && now.environmentId) {
        addTerminalEntry({
          type: 'output',
          content: `Cloud execution session connected & active:
  Agent Target:  ${now.modelAttached || 'GPT-6 Sol'}
  Session ID:    ${now.sessionId}
  Environment:   ${now.environmentId}
  Remote URL:    ${now.remoteUrl || 'NOT_CONFIGURED'}
  Exec Server:   codex exec-server${now.remoteUrl ? ` --remote '${now.remoteUrl}'` : ''} --environment-id '${now.environmentId}'
  Commands:      session sol | session astra | session connect <sessId> <envId> | session stop`
        });
      } else {
        addTerminalEntry({
          type: 'output',
          content: 'NOT_CONFIGURED: Cloud session is currently disconnected or unconfigured. Type: session connect <sessId> <envId> to attach.'
        });
      }
      return;
    }

    if (trimmed === 'help') {
      addTerminalEntry({
        type: 'output',
        content: `FLOAT project terminal:
  Commands execute in the authorized project’s isolated server container.
  npm test / npm run lint / npm run build / npm run typecheck
  python <file.py>, node <file.js>, git status, and other shell commands
  clear               Clear the terminal screen
  help                Display this assistance message

Browser worker (type: session start):
  This is a separate, limited in-browser interpreter and is not a server shell.`
      });
      return;
    }

    setIsExecutingInput(true);
    const controller = new AbortController();
    executionController.current = controller;
    let stdout = '';
    let stderr = '';
    try {
      await useIDEStore.getState().saveProject();
      const state = useIDEStore.getState();
      if (!state.projectId) throw new Error('Save this workspace before running a server command.');
      const virtualFiles = flattenFileTree(state.files).filter(file => file.type === 'file').map(file => ({ path: file.path, content: file.content }));
      const result = await executeProjectCommand({
        projectId: state.projectId,
        command: trimmed,
        files: virtualFiles,
        signal: controller.signal,
        onOutput: (stream, text) => {
          if (stream === 'stdout') stdout += text;
          else stderr += text;
          addTerminalEntry({ type: stream === 'stdout' ? 'output' : 'error', content: text });
        }
      });
      if (result.changedFiles?.length || result.deletedFiles?.length) {
        useIDEStore.getState().applyExecutionChanges(result.changedFiles || [], result.deletedFiles || []);
        await useIDEStore.getState().saveProject();
      }
      const output = stdout + stderr;
      const failure = result.status === 'succeeded' ? null : `${result.status === 'timed_out' ? 'Process timed out' : result.status === 'cancelled' ? 'Process cancelled' : 'Process exited with code ' + result.exitCode}${stderr ? `\n${stderr}` : ''}`;
      useIDEStore.getState().setExecutionResult(output, failure, result.durationMs);
      addTerminalEntry({ type: failure ? 'error' : 'output', content: `[${result.status}; exit code ${result.exitCode ?? 'unknown'}; ${result.durationMs}ms]` });
    } catch (err: any) {
      if (controller.signal.aborted) {
        const message = 'Process cancellation requested. The server is stopping the isolated container.';
        addTerminalEntry({ type: 'error', content: message });
        useIDEStore.getState().setExecutionResult(stdout + stderr, message, null);
      } else {
        const message = err?.message || String(err);
        addTerminalEntry({ type: 'error', content: message });
        useIDEStore.getState().setExecutionResult(stdout + stderr, message, null);
      }
    } finally {
      executionController.current = null;
      setIsExecutingInput(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-[#080808]">
      {/* Panel Tab Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#2A2A2A] select-none pr-2 shrink-0 h-9 bg-slate-100/70 dark:bg-[#080808]">
        <div className="flex h-full">
          <Tab
            name="TERMINAL"
            icon={<TerminalIcon size={12} className="mr-1.5" />}
            isActive={bottomPanelTab === 'terminal'}
            onClick={() => setBottomPanelTab('terminal')}
          />
          <Tab
            name="OUTPUT"
            icon={<FileText size={12} className="mr-1.5" />}
            isActive={bottomPanelTab === 'output'}
            onClick={() => setBottomPanelTab('output')}
          />
          <Tab
            name="PROBLEMS"
            icon={<AlertCircle size={12} className="mr-1.5 text-amber-500" />}
            count={executionError ? 1 : 0}
            isActive={bottomPanelTab === 'problems'}
            onClick={() => setBottomPanelTab('problems')}
          />
          <Tab
            name="VALIDATION"
            icon={<CheckCircle2 size={12} className={cn("mr-1.5", valErrorCount > 0 ? "text-rose-500" : "text-emerald-500")} />}
            count={valErrorCount}
            isActive={bottomPanelTab === 'validation'}
            onClick={() => setBottomPanelTab('validation')}
          />
        </div>

        <div className="flex items-center gap-1">
          {/* Execution Policy Mode Selector */}
          <div className="flex items-center gap-1 mr-2 px-1.5 py-0.5 rounded text-[10px] bg-slate-200/60 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-[#8B949E]">
            <Shield size={11} className={policyMode === 'sandboxed' || policyMode === 'auto' ? "text-emerald-500" : "text-blue-500"} />
            <span className="font-semibold uppercase tracking-wider text-[9px]">Policy:</span>
            <select
              value={policyMode}
              onChange={(e) => handlePolicyChange(e.target.value as any)}
              className="bg-transparent outline-none cursor-pointer font-medium text-slate-800 dark:text-[#C9D1D9] text-[10px]"
              title="Execution policy mode for commands and terminals"
            >
              <option value="sandboxed" className="dark:bg-[#141414]">Sandboxed (Default)</option>
              <option value="auto" className="dark:bg-[#141414]">Auto (Approve sandboxed commands)</option>
              <option value="safe" className="dark:bg-[#141414]">Safe (Read-only)</option>
              <option value="review" className="dark:bg-[#141414]">Review (Prompt per command)</option>
              <option value="allowlist" className="dark:bg-[#141414]">Allowlist (Approved dev)</option>
              <option value="manual" className="dark:bg-[#141414]">Manual (Interactive only)</option>
            </select>
          </div>

          {bottomPanelTab === 'output' && (
            <button
              onClick={runActiveCode}
              disabled={isRunningCode}
              title="Run Python File"
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-slate-200 dark:hover:bg-[#1C1C1C] rounded transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isRunningCode ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} className="fill-current" />}
              <span>{isRunningCode ? 'Running...' : 'Run'}</span>
            </button>
          )}

          {bottomPanelTab === 'terminal' && (
            <>
              {isExecutingInput && <button onClick={() => executionController.current?.abort()} title="Stop process" className="p-1 text-rose-500 hover:bg-slate-200 dark:hover:bg-[#1C1C1C] rounded"><Square size={13} fill="currentColor" /></button>}
              <button onClick={() => { clearTerminal(); xtermInstanceRef.current?.clear(); }} title="Clear Terminal" className="p-1 text-slate-400 dark:text-[#8B949E] hover:bg-slate-200 dark:hover:bg-[#1C1C1C] hover:text-slate-800 dark:hover:text-white rounded transition-colors cursor-pointer"><Trash2 size={13} /></button>
            </>
          )}

          <button
            onClick={toggleBottomPanel}
            title="Close Panel"
            className="p-1 text-slate-400 dark:text-[#8B949E] hover:bg-slate-200 dark:hover:bg-[#1C1C1C] hover:text-slate-800 dark:hover:text-white rounded transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Panel Content */}
      <div className={cn("flex-1 min-h-0", bottomPanelTab === 'validation' ? "overflow-hidden" : "overflow-y-auto p-2.5 font-mono text-xs")}>
        {/* Validation Tab */}
        {bottomPanelTab === 'validation' && (
          <ValidationPanel />
        )}

        {/* Terminal Tab */}
        {bottomPanelTab === 'terminal' && (
          <div className="text-slate-800 dark:text-[#C9D1D9] flex flex-col min-h-full">
            {terminalConfigError && (
              <div className="mb-2.5 p-2.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertCircle size={13} className="shrink-0 text-amber-500" />
                  <span>{terminalConfigError.message}</span>
                </div>
                {terminalConfigError.setupSteps.length > 0 && (
                  <ol className="list-decimal list-inside space-y-0.5 text-[10px] opacity-90 pl-1">
                    {terminalConfigError.setupSteps.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            <div
              ref={xtermContainerRef}
              className={cn(
                "w-full rounded overflow-hidden border border-slate-200 dark:border-[#1F1F1F] mb-2",
                wsConnected ? "block min-h-[120px]" : "hidden"
              )}
            />

            <div className="flex-1 space-y-1">
              {terminalEntries.map(entry => (
                <div
                  key={entry.id}
                  className={cn(
                    "px-2 py-0.5 rounded leading-relaxed whitespace-pre-wrap break-all",
                    entry.type === 'error'
                      ? "text-rose-500 bg-rose-500/5"
                      : entry.type === 'command'
                        ? "font-semibold text-blue-600 dark:text-[#79C0FF]"
                        : "text-slate-700 dark:text-[#C9D1D9]"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      {entry.type === 'command' && <span className="mr-2 text-emerald-600 dark:text-[#7EE787] select-none">$</span>}
                      {entry.content}
                    </div>
                    {entry.type === 'error' && (
                      <button
                        type="button"
                        onClick={() => handleDebugWithAI(entry.content)}
                        className="shrink-0 px-2 py-0.5 rounded text-[10px] font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center gap-1 cursor-pointer transition-colors"
                        title="Send error to FLOAT AI to analyze and fix"
                      >
                        <Sparkles size={11} className="text-amber-500" />
                        <span>Debug with AI</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div ref={terminalEndRef} />
            </div>

            <div className="flex items-center px-2 mt-2 pt-2 border-t border-slate-200/50 dark:border-[#2A2A2A]">
              <span className="text-emerald-600 dark:text-[#7EE787] mr-2 select-none">$</span>
              <input
                type="text"
                value={inputVal}
                disabled={isExecutingInput}
                onChange={(e) => setInputVal(e.target.value)}
                className="flex-1 bg-transparent outline-none caret-blue-600 dark:caret-[#79C0FF] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#555]"
                placeholder={isExecutingInput ? 'Process running…' : 'Run a project command (e.g. npm test, git status, python main.py)…'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && inputVal) {
                    handleCommand(inputVal);
                  }
                }}
              />
              {isExecutingInput && <Loader2 size={13} className="animate-spin text-slate-400 ml-2" />}
            </div>
          </div>
        )}

        {/* Output Tab */}
        {bottomPanelTab === 'output' && (
          <div className="space-y-2 text-slate-800 dark:text-[#C9D1D9]">
            {isRunningCode ? (
              <div className="flex items-center gap-2 text-blue-500 py-2 px-2">
                <Loader2 size={14} className="animate-spin" />
                <span>Executing an isolated project command...</span>
              </div>
            ) : executionOutput || executionError ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-[#8B949E] border-b border-slate-200 dark:border-[#2A2A2A] pb-1.5">
                  <span className="flex items-center gap-1.5">
                    <span className={cn("w-2 h-2 rounded-full", executionError ? "bg-rose-500" : "bg-emerald-500")} />
                    Status: {executionError ? 'Exited with error' : 'Success'}
                  </span>
                  {lastExecutionTimeMs !== null && (
                    <span>Execution time: {lastExecutionTimeMs}ms</span>
                  )}
                </div>

                {executionOutput && (
                  <div className="whitespace-pre-wrap leading-relaxed px-2 text-slate-800 dark:text-[#E6EDF3]">
                    {executionOutput}
                  </div>
                )}

                {executionError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-500 font-mono text-xs whitespace-pre-wrap">
                    {executionError}
                  </div>
                )}
              </div>
            ) : (
              <div className="px-2 py-4 text-slate-500 dark:text-[#8B949E] flex flex-col gap-2">
                <p>No output generated yet.</p>
                <p className="text-[11px]">Run a project command in the Terminal, or click <strong className="text-emerald-500">Run</strong> to execute the active Python file in the isolated project runner.</p>
              </div>
            )}
          </div>
        )}

        {/* Problems Tab */}
        {bottomPanelTab === 'problems' && (
          <div className="space-y-2">
            {executionError ? (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-500 font-mono text-xs flex items-start gap-2.5">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Project Execution / Validation Error</span>
                    <button
                      type="button"
                      onClick={() => handleDebugWithAI(executionError)}
                      className="px-2.5 py-1 rounded text-xs font-medium bg-rose-500/20 hover:bg-rose-500/30 text-rose-700 dark:text-rose-300 border border-rose-500/30 flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Sparkles size={12} className="text-amber-500" />
                      <span>Debug with AI</span>
                    </button>
                  </div>
                  <div className="whitespace-pre-wrap opacity-90">{executionError}</div>
                </div>
              </div>
            ) : (
              <div className="px-2 py-3 text-slate-500 dark:text-[#8B949E] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>No problems detected in current workspace.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Tab({
  name,
  icon,
  count,
  isActive,
  onClick
}: {
  name: string;
  icon?: React.ReactNode;
  count?: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 text-[11px] font-bold tracking-wider transition-colors border-b-2 flex items-center cursor-pointer",
        isActive
          ? "border-slate-900 dark:border-white bg-white dark:bg-[#141414] text-slate-900 dark:text-white font-semibold"
          : "border-transparent text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-transparent"
      )}
    >
      {icon}
      <span>{name}</span>
      {count !== undefined && count > 0 && (
        <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-mono">
          {count}
        </span>
      )}
    </button>
  );
}
