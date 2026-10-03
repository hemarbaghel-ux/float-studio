import React, { useState } from 'react';
import { useIDEStore } from '../../store';
import { Search, File } from 'lucide-react';
import { FileNode } from '../../types';

interface SearchResult {
  fileId: string;
  fileName: string;
  line: number;
  content: string;
}

export function SearchPanel() {
  const { files, openFile } = useIDEStore();
  const [query, setQuery] = useState('');

  const searchInFiles = (nodes: FileNode[], query: string, currentResults: SearchResult[] = []) => {
    if (!query) return currentResults;
    const lowerQuery = query.toLowerCase();
    
    for (const node of nodes) {
      if (node.type === 'file' && node.content) {
        const lines = node.content.split('\n');
        lines.forEach((lineContent, index) => {
          if (lineContent.toLowerCase().includes(lowerQuery)) {
            currentResults.push({
              fileId: node.id,
              fileName: node.name,
              line: index + 1,
              content: lineContent.trim()
            });
          }
        });
      } else if (node.type === 'folder' && node.children) {
        searchInFiles(node.children, query, currentResults);
      }
    }
    return currentResults;
  };

  const results = searchInFiles(files, query);

  return (
    <div className="h-full flex flex-col text-sm bg-white dark:bg-[#0A0A0A]">
      <div className="px-4 py-3 pb-2 select-none border-b border-slate-200 dark:border-[#2A2A2A]">
        <h2 className="font-semibold text-xs tracking-wider uppercase text-slate-500 dark:text-[#8B949E] mb-2">Search</h2>
        <div className="relative">
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#2A2A2A] text-slate-900 dark:text-white rounded-md py-1 px-2 pl-7 text-xs outline-none focus:border-slate-400 dark:focus:border-white/30"
          />
          <Search size={14} className="absolute left-2.5 top-1.5 text-slate-400 dark:text-[#8B949E]" />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto pb-4">
        {query && results.length === 0 && (
          <div className="px-4 py-2 text-xs text-slate-500 dark:text-[#8B949E]">No results found.</div>
        )}
        
        {results.map((result, i) => (
          <div 
            key={`${result.fileId}-${i}`}
            className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-[#1C1C1C] cursor-pointer group transition-colors"
            onClick={() => openFile(result.fileId)}
          >
            <div className="flex items-center text-slate-800 dark:text-[#C9D1D9] mb-0.5">
              <File size={12} className="mr-1.5 text-slate-400 dark:text-[#8B949E] group-hover:text-slate-900 dark:group-hover:text-white" />
              <span className="font-medium text-xs group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{result.fileName}</span>
              <span className="text-slate-400 dark:text-[#8B949E] ml-2 text-[10px]">line {result.line}</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-[#8B949E] truncate pl-4 font-mono">
              {result.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
