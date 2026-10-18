import React from 'react';
import { X, Key } from 'lucide-react';
import { ApiKeysManager } from './ApiKeysManager';

interface ApiConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ApiConfigModal({ isOpen, onClose }: ApiConfigModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-[#0D1117] border border-[#30363D] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#21262D] bg-[#161B22] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white">
              <Key size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                Models & API Keys
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Cursor BYOK
                </span>
              </h2>
              <p className="text-xs text-[#8B949E]">
                Bring your own keys for frontier AI models. Stored locally in your browser.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-[#8B949E] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <ApiKeysManager onSaved={onClose} />
        </div>
      </div>
    </div>
  );
}
