import React, { useEffect, useState, useRef } from 'react';
import { useIDEStore } from '../../store';
import { Search } from 'lucide-react';
import { FloatLogo } from '../../components/FloatLogo';

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'P' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    const handleOpenCommandPalette = () => {
      setIsOpen(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('open-command-palette', handleOpenCommandPalette);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('open-command-palette', handleOpenCommandPalette);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-center pt-[15vh]">
      <div 
        className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
      />
      <div className="relative w-full max-w-xl bg-[#0D1117] rounded-xl shadow-2xl border border-[#30363D] overflow-hidden flex flex-col max-h-[50vh]">
        <div className="flex items-center px-4 py-3 border-b border-[#30363D]">
          <FloatLogo className="w-4 h-4 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type a command or search FLOAT..."
            className="flex-1 bg-transparent outline-none text-sm text-[#C9D1D9] placeholder:text-[#8B949E]"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {/* Static commands for phase 1 */}
          <CommandItem label="Open Settings" onClick={() => { document.dispatchEvent(new Event('open-settings')); setIsOpen(false); }} />
          <CommandItem label="Toggle Explorer" onClick={() => { useIDEStore.getState().toggleLeftSidebar(); setIsOpen(false); }} />
          <CommandItem label="Toggle Terminal" onClick={() => { useIDEStore.getState().toggleBottomPanel(); setIsOpen(false); }} />
          <CommandItem label="Toggle AI Panel" onClick={() => { useIDEStore.getState().toggleRightSidebar(); setIsOpen(false); }} />
          <CommandItem label="Theme: Toggle Dark Mode" onClick={() => { 
            const state = useIDEStore.getState();
            state.updateSettings({ theme: state.settings.theme === 'dark' ? 'light' : 'dark' });
            setIsOpen(false);
          }} />
        </div>
      </div>
    </div>
  );
}

function CommandItem({ label, onClick }: { label: string, onClick: () => void }) {
  return (
    <div 
      className="px-3 py-2 text-sm text-[#C9D1D9] hover:bg-[#7C3AED] hover:text-white rounded-md cursor-pointer select-none"
      onClick={onClick}
    >
      {label}
    </div>
  );
}
