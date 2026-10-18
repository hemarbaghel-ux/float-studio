import React from 'react';
import { X, FileSpreadsheet, Hash, Type, Calendar, CheckSquare, Layers, ArrowRight } from 'lucide-react';
import { DatasetProfile, UploadedCsvFile } from './types';

interface CsvPreviewModalProps {
  file: UploadedCsvFile | DatasetProfile;
  isOpen: boolean;
  onClose: () => void;
  onSelectAsActive?: () => void;
  isActive?: boolean;
}

export function CsvPreviewModal({
  file,
  isOpen,
  onClose,
  onSelectAsActive,
  isActive = false,
}: CsvPreviewModalProps) {
  if (!isOpen) return null;

  const profile: DatasetProfile = 'profile' in file ? (file as UploadedCsvFile).profile : (file as DatasetProfile);
  const filename = profile.name || 'dataset.csv';
  const rowCount = profile.rowCount || profile.previewRows.length;
  const colCount = profile.columnCount || profile.columns.length;
  const sizeBytes = profile.fileSizeBytes || (profile.rawCsv ? new Blob([profile.rawCsv]).size : 0);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'numeric':
        return <Hash size={11} className="text-blue-500 shrink-0" />;
      case 'date':
        return <Calendar size={11} className="text-amber-500 shrink-0" />;
      case 'boolean':
        return <CheckSquare size={11} className="text-purple-500 shrink-0" />;
      default:
        return <Type size={11} className="text-slate-400 shrink-0" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-4xl max-h-[88vh] bg-white dark:bg-[#161B22] border border-slate-200 dark:border-[#30363D] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-900 dark:text-[#C9D1D9]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-preview-title"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-[#30363D] flex items-center justify-between shrink-0 bg-slate-50/70 dark:bg-[#0D1117]/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <FileSpreadsheet size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 id="csv-preview-title" className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {filename}
                </h3>
                {isActive && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Active Dataset
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-[#8B949E] font-mono mt-0.5">
                <span>{rowCount.toLocaleString()} rows</span>
                <span>·</span>
                <span>{colCount} columns</span>
                {sizeBytes > 0 && (
                  <>
                    <span>·</span>
                    <span>{formatBytes(sizeBytes)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isActive && onSelectAsActive && (
              <button
                type="button"
                onClick={() => {
                  onSelectAsActive();
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <span>Select for Analysis</span>
                <ArrowRight size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
              aria-label="Close preview modal"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 min-h-0">
          {/* Column Summary Schema */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-[#8B949E] uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={12} />
                <span>Detected Columns & Data Types ({profile.columns.length})</span>
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {profile.columns.map((col) => (
                <div
                  key={col.name}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#0D1117] border border-slate-200 dark:border-[#21262D] text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono font-medium truncate text-slate-900 dark:text-white" title={col.name}>
                      {col.name}
                    </span>
                    <span className="flex items-center gap-1 text-[9px] uppercase px-1.5 py-0.5 rounded bg-white dark:bg-[#1C2128] border border-slate-200 dark:border-[#30363D] shrink-0 font-mono">
                      {getTypeIcon(col.type)}
                      <span>{col.type}</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-[#8B949E]">
                    <span>{col.uniqueCount} unique</span>
                    {col.nullCount > 0 && <span className="text-amber-500">{col.nullCount} nulls</span>}
                  </div>
                  {col.mean !== undefined && (
                    <div className="text-[10px] text-slate-400 truncate">
                      mean: <span className="text-blue-500 dark:text-blue-400 font-mono">{col.mean}</span>
                      {col.min !== undefined && col.max !== undefined && (
                        <span> [{col.min} - {col.max}]</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Table Preview */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-[#8B949E] uppercase tracking-wider block">
              Sample Data Rows (Showing first {profile.previewRows.length} rows)
            </span>
            <div className="border border-slate-200 dark:border-[#30363D] rounded-xl overflow-hidden bg-white dark:bg-[#0D1117]">
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-[#161B22] border-b border-slate-200 dark:border-[#30363D] z-10">
                    <tr>
                      <th className="p-2 px-3 text-[10px] font-mono text-slate-400 uppercase w-10 text-center border-r border-slate-200 dark:border-[#30363D]">
                        #
                      </th>
                      {profile.columns.map((c) => (
                        <th
                          key={c.name}
                          className="p-2 px-3 font-mono font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap text-[11px]"
                        >
                          {c.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#21262D] font-mono text-[11px]">
                    {profile.previewRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                        <td className="p-2 px-3 text-[10px] text-slate-400 text-center bg-slate-50/50 dark:bg-[#12151B]/50 border-r border-slate-200 dark:border-[#30363D]">
                          {idx + 1}
                        </td>
                        {profile.columns.map((c) => (
                          <td
                            key={c.name}
                            className="p-2 px-3 text-slate-800 dark:text-[#C9D1D9] whitespace-nowrap truncate max-w-xs"
                            title={String(row[c.name] ?? '')}
                          >
                            {row[c.name] !== undefined && row[c.name] !== null ? (
                              typeof row[c.name] === 'boolean' ? (
                                <span className={row[c.name] ? 'text-emerald-500 font-semibold' : 'text-rose-500'}>
                                  {String(row[c.name])}
                                </span>
                              ) : (
                                String(row[c.name])
                              )
                            ) : (
                              <span className="text-slate-400 italic">null</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-[#30363D] bg-slate-50 dark:bg-[#0D1117] flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500 dark:text-[#8B949E]">
            Ready for Python sandbox analysis and executive chart synthesis.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-200 dark:border-[#30363D] hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
