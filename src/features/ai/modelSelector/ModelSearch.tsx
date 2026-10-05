import React from 'react';
import { Search } from 'lucide-react';

export interface ModelSearchProps {
  value: string;
  onChange: (value: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
}

export const ModelSearch: React.FC<ModelSearchProps> = ({
  value,
  onChange,
  inputRef,
  onKeyDown,
  placeholder = 'Search models'
}) => {
  return (
    <div className="px-3 pt-2.5 pb-2 border-b border-slate-100 dark:border-white/5 shrink-0 bg-inherit flex items-center gap-2">
      <Search size={13} className="text-slate-400 dark:text-[#6E7681] shrink-0" />
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="w-full bg-transparent text-[13px] text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#6E7681] focus:outline-none leading-normal font-sans"
        aria-label="Filter models"
      />
    </div>
  );
};
