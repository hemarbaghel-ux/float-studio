import React, { useState, useRef, useEffect } from 'react';
import { useIDEStore } from '../../store';
import { useValidationStore } from '../../store/validationStore';
import { X, Trash2, Play, Terminal as TerminalIcon, AlertCircle, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import { cn, flattenFileTree } from '../../lib/utils';
import { runPythonCode } from '../../services/pythonRunner';
import { ValidationPanel } from '../../components/panels/ValidationPanel';
import { isShellCommand, runShell } from '../float/sandbox';
import { useCloudSession } from '../float/cloudSessionStore';
import { sandboxFs } from '../float/workspaceFs';

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
    files
  } = useIDEStore();

  const { currentRun } = useValidationStore();
  const valErrorCount = currentRun ? currentRun.errorCount : 0;

  const [inputVal, setInputVal] = useState('');
  const [isExecutingInput, setIsExecutingInput] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);

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
      return;
    }

    if (isShellCommand(trimmed) && !trimmed.startsWith('python')) {
      if (!useCloudSession.getState().active) {
        if (trimmed !== 'ls') {
          addTerminalEntry({ type: 'error', content: `'${trimmed.split(/\s+/)[0]}' runs in a Cloud Agent session. Start one from the banner above the composer (or type: session start).` });
          return;
        }
      } else {
        setIsExecutingInput(true);
        try {
          const { output, code } = await runShell(trimmed, sandboxFs());
          if (output) addTerminalEntry({ type: code === 0 ? 'output' : 'error', content: output });
        } catch (err: any) {
          addTerminalEntry({ type: 'error', content: err?.message || String(err) });
        } finally {
          setIsExecutingInput(false);
        }
        return;
      }
    }

    if (trimmed === 'session start' || trimmed === 'session stop' || trimmed === 'session') {
      const cs = useCloudSession.getState();
      if (trimmed === 'session start') cs.start('ap-south-1', '2 vCPU · 4 GB');
      if (trimmed === 'session stop') cs.stop();
      const now = useCloudSession.getState();
      addTerminalEntry({ type: 'output', content: now.active ? `Cloud session active (${now.region}, ${now.machine}). node, npm test, grep, cat... are available.` : 'No cloud session. Type: session start' });
      return;
    }

    if (trimmed === 'ls') {
      const virtualFiles = flattenFileTree(files);
      const list = virtualFiles.map(f => f.path).join('  ');
      addTerminalEntry({ type: 'output', content: list || '(empty project)' });
      return;
    }

    if (trimmed === 'help') {
      addTerminalEntry({
        type: 'output',
        content: `FLOAT Python Environment Commands:
  python <filename>   Execute a Python file (e.g., python main.py)
  <python_code>       Execute Python code directly (e.g., print(2 + 2))
  ls                  List all workspace files
  clear               Clear the terminal screen
  help                Display this assistance message

Cloud Agent session (type: session start):
  node <file.js>      Run a JavaScript file in the sandbox
  npm test            Run *.test.js / *.spec.js with a Jest-compatible runner
  cat grep head tail wc tree touch rm mkdir echo   File utilities`
      });
      return;
    }

    setIsExecutingInput(true);
    const virtualFiles = flattenFileTree(files).map(f => ({ path: f.path, content: f.content }));

    try {
      let codeToRun = trimmed;
      if (trimmed.startsWith('python ')) {
        const targetPath = trimmed.replace('python ', '').trim();
        const found = virtualFiles.find(f => f.path === targetPath || f.path.endsWith('/' + targetPath));
        if (found && found.content !== undefined) {
          codeToRun = found.content;
        } else {
          addTerminalEntry({ type: 'error', content: `python: can't open file '${targetPath}': No such file or directory` });
          setIsExecutingInput(false);
          return;
        }
      }

      const result = await runPythonCode(
        codeToRun,
        virtualFiles,
        (out) => addTerminalEntry({ type: 'output', content: out }),
        (err) => addTerminalEntry({ type: 'error', content: err })
      );

      if (result.success && result.output && result.output !== '(Program exited with code 0 and no output)') {
        addTerminalEntry({ type: 'output', content: result.output });
      } else if (!result.success && result.error) {
        addTerminalEntry({ type: 'error', content: result.error });
      }
    } catch (err: any) {
      addTerminalEntry({ type: 'error', content: err?.message || String(err) });
    } finally {
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
            <button
              onClick={clearTerminal}
              title="Clear Terminal"
              className="p-1 text-slate-400 dark:text-[#8B949E] hover:bg-slate-200 dark:hover:bg-[#1C1C1C] hover:text-slate-800 dark:hover:text-white rounded transition-colors cursor-pointer"
            >
              <Trash2 size={13} />
            </button>
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
                  {entry.type === 'command' && <span className="mr-2 text-emerald-600 dark:text-[#7EE787] select-none">$</span>}
                  {entry.content}
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
                placeholder={isExecutingInput ? 'Executing in Pyodide...' : 'Enter python command or expression (e.g., print(42), python main.py)...'} 
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
                <span>Executing Python code in Pyodide...</span>
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
                <p className="text-[11px]">Click <strong className="text-emerald-500">Run</strong> in the top navigation or press <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-white/10 rounded font-mono text-[10px]">Ctrl+Enter</kbd> to execute your active Python file.</p>
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
                <div className="space-y-1">
                  <div className="font-semibold">Python Execution Error</div>
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
