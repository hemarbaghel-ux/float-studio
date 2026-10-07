import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useIDEStore } from '../../store';
import { Search, FileCode, Play, Save, Moon, Sun, Terminal, GitBranch, Layers, Settings, Eye, RefreshCw } from 'lucide-react';
import { FloatLogo } from '../../components/FloatLogo';
import { flattenFileTree, cn } from '../../lib/utils';

interface CommandEntry {
  id: string;
  category: string;
  label: string;
  shortcut?: string;
  icon?: React.ReactNode;
  action: () => void;
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { 
    files, 
    openFile, 
    saveProject, 
    runActiveCode, 
    toggleLeftSidebar, 
    toggleBottomPanel, 
    toggleRightSidebar, 
    toggleTheme, 
    settings, 
    updateSettings,
    clearProject,
    setActiveSidebarView
  } = useIDEStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Support both Ctrl+Shift+P and Cmd+Shift+P
      if ((e.key === 'p' || e.key === 'P') && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        setIsOpen(true);
        setSearch('');
        setSelectedIndex(0);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    const handleOpenCommandPalette = () => {
      setIsOpen(true);
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('open-command-palette', handleOpenCommandPalette);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('open-command-palette', handleOpenCommandPalette);
    };
  }, [isOpen]);

  // Generate real commands from actual active state
  const commands = useMemo<CommandEntry[]>(() => {
    const list: CommandEntry[] = [
      // Editor & Execution
      {
        id: 'run-code',
        category: 'Editor',
        label: 'Run Python File',
        shortcut: 'Ctrl+Enter',
        icon: <Play size={13} className="text-emerald-500" />,
        action: () => void runActiveCode()
      },
      {
        id: 'save-project',
        category: 'Project',
        label: 'Save Project Workspace',
        shortcut: 'Ctrl+S',
        icon: <Save size={13} className="text-blue-500" />,
        action: () => void saveProject()
      },
      {
        id: 'new-workspace',
        category: 'Project',
        label: 'New Python Workspace',
        icon: <FileCode size={13} className="text-purple-500" />,
        action: () => clearProject()
      },
      // Layout & Views
      {
        id: 'toggle-explorer',
        category: 'View',
        label: 'Toggle File Explorer',
        icon: <Layers size={13} />,
        action: () => {
          setActiveSidebarView('explorer');
          toggleLeftSidebar();
        }
      },
      {
        id: 'toggle-git',
        category: 'View',
        label: 'Toggle Source Control (Git)',
        icon: <GitBranch size={13} className="text-amber-500" />,
        action: () => {
          setActiveSidebarView('source-control');
        }
      },
      {
        id: 'toggle-terminal',
        category: 'View',
        label: 'Toggle Terminal / Output Panel',
        icon: <Terminal size={13} />,
        action: () => toggleBottomPanel()
      },
      {
        id: 'toggle-ai',
        category: 'View',
        label: 'Toggle AI Assistant Panel',
        icon: <FloatLogo className="w-3.5 h-3.5" />,
        action: () => toggleRightSidebar()
      },
      // Theme & Settings
      {
        id: 'toggle-theme',
        category: 'Preferences',
        label: `Switch Theme to ${settings.theme === 'dark' ? 'Light' : 'Dark'} Mode`,
        icon: settings.theme === 'dark' ? <Sun size={13} className="text-amber-400" /> : <Moon size={13} className="text-indigo-400" />,
        action: () => toggleTheme()
      },
      {
        id: 'toggle-word-wrap',
        category: 'Editor',
        label: `Toggle Word Wrap (Currently ${settings.wordWrap.toUpperCase()})`,
        icon: <Eye size={13} />,
        action: () => updateSettings({ wordWrap: settings.wordWrap === 'on' ? 'off' : 'on' })
      },
      {
        id: 'toggle-minimap',
        category: 'Editor',
        label: `Toggle Minimap (Currently ${settings.minimap ? 'ON' : 'OFF'})`,
        icon: <Eye size={13} />,
        action: () => updateSettings({ minimap: !settings.minimap })
      },
      {
        id: 'open-settings',
        category: 'Preferences',
        label: 'Open Settings → Integrations',
        icon: <Settings size={13} />,
        action: () => document.dispatchEvent(new CustomEvent('open-settings'))
      }
    ];

    // Add dynamic file commands for every file in the project
    const flatFiles = flattenFileTree(files).filter(f => f.type === 'file');
    for (const f of flatFiles) {
      list.push({
        id: `open-file-${f.id}`,
        category: 'Files',
        label: `Open File: ${f.path}`,
        icon: <FileCode size={13} className="text-blue-400" />,
        action: () => openFile(f.id)
      });
    }

    return list;
  }, [files, runActiveCode, saveProject, clearProject, setActiveSidebarView, toggleLeftSidebar, toggleBottomPanel, toggleRightSidebar, settings, toggleTheme, updateSettings, openFile]);

  // Filter commands by query
  const filteredCommands = useMemo(() => {
    if (!search.trim()) return commands;
    const query = search.toLowerCase();
    return commands.filter(c => 
      c.label.toLowerCase().includes(query) || 
      c.category.toLowerCase().includes(query)
    );
  }, [commands, search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredCommands[selectedIndex];
      if (selected) {
        selected.action();
        setIsOpen(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-center pt-[15vh]">
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-xs"
        onClick={() => setIsOpen(false)}
      />
      <div className="relative w-full max-w-xl bg-white dark:bg-[#121212] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden flex flex-col max-h-[55vh] text-slate-900 dark:text-white">
        <div className="flex items-center px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02]">
          <Search size={16} className="text-slate-400 mr-2.5 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, file name, or action (Esc to close)..."
            className="flex-1 bg-transparent outline-none text-xs text-slate-900 dark:text-[#C9D1D9] placeholder:text-slate-400"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-200 dark:bg-white/5 rounded border border-slate-300 dark:border-white/10">
            ESC
          </kbd>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.action();
                    setIsOpen(false);
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    "px-3 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer select-none transition-colors",
                    isSelected
                      ? "bg-blue-600 text-white font-medium"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
                  )}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className={cn(isSelected ? "text-white" : "text-slate-400")}>
                      {item.icon || <FloatLogo className="w-3.5 h-3.5" />}
                    </span>
                    <span className="truncate">{item.label}</span>
                    <span className={cn(
                      "text-[9px] uppercase px-1.5 py-0.5 rounded font-mono",
                      isSelected ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-white/5 text-slate-500"
                    )}>
                      {item.category}
                    </span>
                  </div>
                  {item.shortcut && (
                    <kbd className={cn(
                      "text-[10px] font-mono px-1.5 py-0.5 rounded",
                      isSelected ? "text-white/80" : "text-slate-400 bg-slate-100 dark:bg-white/5"
                    )}>
                      {item.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-4 text-center text-xs text-slate-400">
              No matching commands or files found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
