import { useEffect } from 'react';
import { getState } from '../lib/store';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl';

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const s = getState();
      if (e.key === 'Escape' && s.modal) {
        s.setModal(null);
        return;
      }
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'k') {
        e.preventDefault();
        s.setModal(s.modal === 'palette' ? null : 'palette');
      } else if (k === 'b') {
        e.preventDefault();
        s.toggleSidebar();
      } else if (k === 'l' || (k === 'n' && e.shiftKey) || k === 'i') {
        e.preventDefault();
        if (k !== 'l') s.newChat();
        setTimeout(() => document.getElementById('composer-input')?.focus(), 30);
      } else if (k === 'e' && e.shiftKey) {
        e.preventDefault();
        s.setView('codebase');
      } else if (k === '/') {
        e.preventDefault();
        s.setModal('shortcuts');
      } else if (k === ',') {
        e.preventDefault();
        s.setModal('settings');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
