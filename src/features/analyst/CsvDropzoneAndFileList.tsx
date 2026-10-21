import { apiFetch } from '../../services/api';
import React, { useState, useRef, useCallback } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Eye,
  ArrowRight,
  Database,
  Plus,
  RefreshCw,
  X,
  FileCheck
} from 'lucide-react';
import { DatasetProfile, UploadedCsvFile, ParsingProgressState, SampleDatasetDefinition } from './types';
import { SAMPLE_DATASETS } from './sampleDatasets';
import { CsvPreviewModal } from './CsvPreviewModal';

interface CsvDropzoneAndFileListProps {
  uploadedFiles: UploadedCsvFile[];
  onUploadComplete: (newFile: UploadedCsvFile, shouldActivate: boolean) => void;
  onRemoveFile: (fileId: string) => void;
  onClearAllFiles: () => void;
  selectedFileId: string | null;
  onSelectFile: (file: UploadedCsvFile) => void;
  selectedSampleDataset: SampleDatasetDefinition | null;
  onSelectSampleDataset: (ds: SampleDatasetDefinition) => void;
  onProfileError?: (error: string) => void;
}

export function CsvDropzoneAndFileList({
  uploadedFiles,
  onUploadComplete,
  onRemoveFile,
  onClearAllFiles,
  selectedFileId,
  onSelectFile,
  selectedSampleDataset,
  onSelectSampleDataset,
  onProfileError,
}: CsvDropzoneAndFileListProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [parsingState, setParsingState] = useState<ParsingProgressState>({
    isParsing: false,
    fileName: '',
    fileSizeBytes: 0,
    progressPercent: 0,
    statusText: '',
    stage: 'idle',
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [previewingFile, setPreviewingFile] = useState<UploadedCsvFile | null>(null);
  const [activeTab, setActiveTab] = useState<'uploaded' | 'curated'>('uploaded');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  /**
   * Parse a single CSV file with smooth progress stages
   */
  const processCsvFile = async (
    file: File,
    fileIndex: number = 1,
    totalFiles: number = 1
  ): Promise<UploadedCsvFile | null> => {
    setParsingState({
      isParsing: true,
      fileName: file.name,
      fileSizeBytes: file.size,
      progressPercent: 15,
      statusText: 'Reading CSV file contents...',
      stage: 'reading',
      currentFileIndex: fileIndex,
      totalFiles,
    });

    try {
      // Step 1: Read text from file
      const text = await file.text();

      if (!text.trim()) {
        throw new Error(`File "${file.name}" is empty.`);
      }

      // Step 2: Validate delimiters and basic formatting
      setParsingState((prev) => ({
        ...prev,
        progressPercent: 40,
        statusText: 'Validating CSV delimiters & headers...',
        stage: 'validating',
      }));
      await new Promise((r) => setTimeout(r, 220));

      // Step 3: Call backend profiling endpoint
      setParsingState((prev) => ({
        ...prev,
        progressPercent: 70,
        statusText: 'Inferring column data types & computing statistics...',
        stage: 'profiling',
      }));

      const response = await apiFetch('/api/analyst/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          csvData: text,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${response.status} profiling error`);
      }

      const profile: DatasetProfile = await response.json();

      // Step 4: Finalize progress
      setParsingState((prev) => ({
        ...prev,
        progressPercent: 100,
        statusText: 'Parsing complete! Dataset profile ready.',
        stage: 'completed',
      }));

      const uploadedRecord: UploadedCsvFile = {
        id: `upload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        filename: file.name,
        fileSizeBytes: file.size,
        rowCount: profile.rowCount,
        columnCount: profile.columnCount,
        profile,
        previewRows: profile.previewRows,
        csvData: text,
        uploadedAt: Date.now(),
      };

      await new Promise((r) => setTimeout(r, 300));
      return uploadedRecord;
    } catch (err: any) {
      const msg = err.message || `Failed to parse ${file.name}`;
      setParsingState((prev) => ({
        ...prev,
        isParsing: false,
        stage: 'error',
        error: msg,
      }));
      if (onProfileError) onProfileError(msg);
      return null;
    }
  };

  /**
   * Handle incoming files (from input or drop)
   */
  const handleFiles = async (files: FileList | File[]) => {
    setValidationError(null);
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    // Validate that at least one file is a CSV
    const csvFiles = fileList.filter(
      (f) =>
        f.name.toLowerCase().endsWith('.csv') ||
        f.type === 'text/csv' ||
        f.type === 'application/vnd.ms-excel'
    );

    const nonCsvFiles = fileList.filter(
      (f) =>
        !f.name.toLowerCase().endsWith('.csv') &&
        f.type !== 'text/csv' &&
        f.type !== 'application/vnd.ms-excel'
    );

    if (nonCsvFiles.length > 0 && csvFiles.length === 0) {
      setValidationError(
        `Only CSV files are supported. Unsupported file: ${nonCsvFiles.map((f) => f.name).join(', ')}`
      );
      return;
    }

    if (nonCsvFiles.length > 0) {
      setValidationError(
        `Skipped non-CSV file(s): ${nonCsvFiles.map((f) => f.name).join(', ')}. Processing valid CSVs.`
      );
    }

    // Process files sequentially
    setActiveTab('uploaded');
    for (let i = 0; i < csvFiles.length; i++) {
      const isFirst = i === 0;
      const uploaded = await processCsvFile(csvFiles[i], i + 1, csvFiles.length);
      if (uploaded) {
        onUploadComplete(uploaded, isFirst);
      }
    }

    // Reset progress indicator after a brief pause
    setTimeout(() => {
      setParsingState({
        isParsing: false,
        fileName: '',
        fileSizeBytes: 0,
        progressPercent: 0,
        statusText: '',
        stage: 'idle',
      });
    }, 700);
  };

  // Drag and drop event handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounterRef.current = 0;

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
        e.dataTransfer.clearData();
      }
    },
    [onUploadComplete]
  );

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-3.5">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleInputChange}
        accept=".csv,text/csv,application/vnd.ms-excel"
        multiple
        className="hidden"
      />

      {/* Drag & Drop File Upload Zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleBrowseClick}
        className={`relative border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer select-none group ${
          isDragging
            ? 'border-blue-500 bg-blue-500/10 dark:bg-blue-500/15 scale-[1.01] shadow-lg shadow-blue-500/5'
            : 'border-slate-300 dark:border-[#30363D] hover:border-blue-500/50 hover:bg-slate-50 dark:hover:bg-[#161B22]/60 bg-white/50 dark:bg-[#0D1117]/50'
        }`}
      >
        <div className="flex flex-col items-center justify-center gap-2">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform ${
              isDragging
                ? 'bg-blue-500 text-white scale-110 shadow-md animate-bounce'
                : 'bg-blue-500/10 text-blue-500 dark:text-blue-400 group-hover:scale-105'
            }`}
          >
            <UploadCloud size={20} />
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-800 dark:text-white">
              {isDragging ? 'Release to upload & parse CSV' : 'Drag & drop CSV files here'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-[#8B949E] mt-0.5">
              or <span className="text-blue-600 dark:text-[#58A6FF] font-medium group-hover:underline">browse files</span> from your computer
            </p>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-[#6E7681]">
            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#161B22] border border-slate-200 dark:border-[#21262D] font-mono">
              .csv
            </span>
            <span>·</span>
            <span>Comma or semicolon delimited</span>
            <span>·</span>
            <span>Multi-file support</span>
          </div>
        </div>
      </div>

      {/* Validation Error Toast */}
      {validationError && (
        <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-start justify-between gap-2 animate-in fade-in">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{validationError}</span>
          </div>
          <button
            type="button"
            onClick={() => setValidationError(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Progress Indicator for Parsing */}
      {parsingState.isParsing && (
        <div className="p-3.5 rounded-xl bg-blue-500/5 dark:bg-[#161B22] border border-blue-500/30 space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 truncate">
              <Loader2 size={14} className="animate-spin text-blue-500 shrink-0" />
              <span className="font-semibold text-slate-900 dark:text-white truncate">
                {parsingState.fileName}
              </span>
              {parsingState.fileSizeBytes > 0 && (
                <span className="text-[10px] text-slate-400 font-mono shrink-0">
                  ({formatBytes(parsingState.fileSizeBytes)})
                </span>
              )}
            </div>
            <span className="text-[11px] font-mono font-semibold text-blue-600 dark:text-blue-400 shrink-0 ml-2">
              {parsingState.progressPercent}%
            </span>
          </div>

          {/* Animated Progress Bar */}
          <div className="w-full h-1.5 bg-slate-200 dark:bg-[#21262D] rounded-full overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${parsingState.progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-[#8B949E]">
            <span className="truncate">{parsingState.statusText}</span>
            {parsingState.totalFiles && parsingState.totalFiles > 1 && (
              <span className="font-mono text-[10px] shrink-0 ml-2">
                File {parsingState.currentFileIndex} of {parsingState.totalFiles}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Dataset Selection Tabs (Uploaded Files vs Curated) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#21262D] pb-1.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('uploaded')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'uploaded'
                  ? 'bg-slate-200 dark:bg-[#21262D] text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileSpreadsheet size={13} />
              <span>Uploaded CSVs</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  uploadedFiles.length > 0
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-400'
                }`}
              >
                {uploadedFiles.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('curated')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'curated'
                  ? 'bg-slate-200 dark:bg-[#21262D] text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Database size={13} />
              <span>Curated Datasets</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-slate-100 dark:bg-white/5 text-slate-400">
                {SAMPLE_DATASETS.length}
              </span>
            </button>
          </div>

          {activeTab === 'uploaded' && uploadedFiles.length > 1 && (
            <button
              type="button"
              onClick={onClearAllFiles}
              className="text-[11px] text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Tab 1: Preview List of Uploaded Files */}
        {activeTab === 'uploaded' && (
          <div className="space-y-2">
            {uploadedFiles.length === 0 ? (
              <div className="py-6 px-4 rounded-xl border border-dashed border-slate-200 dark:border-[#21262D] text-center text-slate-400 space-y-1.5">
                <FileSpreadsheet size={24} className="mx-auto text-slate-300 dark:text-slate-600" />
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  No CSV files uploaded yet
                </p>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  Drag and drop your spreadsheet files above or browse to begin analyzing your data.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                {uploadedFiles.map((f) => {
                  const isActive = selectedFileId === f.id && !selectedSampleDataset;

                  return (
                    <div
                      key={f.id}
                      className={`p-2.5 rounded-xl border text-xs transition-all flex items-center justify-between gap-3 group ${
                        isActive
                          ? 'bg-blue-500/10 border-blue-500/40 text-blue-900 dark:text-blue-100 shadow-2xs'
                          : 'bg-slate-50 dark:bg-[#161B22] border-slate-200 dark:border-[#21262D] text-slate-700 dark:text-[#C9D1D9] hover:border-slate-300 dark:hover:border-[#30363D]'
                      }`}
                    >
                      {/* Left: Icon & File Meta */}
                      <div
                        onClick={() => onSelectFile(f)}
                        className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                      >
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isActive
                              ? 'bg-blue-500 text-white shadow-2xs'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          }`}
                        >
                          <FileSpreadsheet size={15} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-900 dark:text-white truncate" title={f.filename}>
                              {f.filename}
                            </span>
                            {isActive && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0 flex items-center gap-1">
                                <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                                Active
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-[#8B949E] font-mono mt-0.5">
                            <span>{f.rowCount.toLocaleString()} rows</span>
                            <span>·</span>
                            <span>{f.columnCount} cols</span>
                            <span>·</span>
                            <span>{formatBytes(f.fileSizeBytes)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Preview button */}
                        <button
                          type="button"
                          onClick={() => setPreviewingFile(f)}
                          title="Preview raw CSV table and schema"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-white dark:hover:bg-white/10 transition-colors cursor-pointer"
                        >
                          <Eye size={13} />
                        </button>

                        {/* Select button if not active */}
                        {!isActive ? (
                          <button
                            type="button"
                            onClick={() => onSelectFile(f)}
                            title="Load for analysis"
                            className="px-2 py-1 rounded-md text-[11px] font-medium bg-white dark:bg-[#21262D] border border-slate-200 dark:border-[#30363D] hover:border-blue-500 text-slate-700 dark:text-slate-200 hover:text-blue-500 transition-all cursor-pointer"
                          >
                            Analyze
                          </button>
                        ) : null}

                        {/* Remove file button */}
                        <button
                          type="button"
                          onClick={() => onRemoveFile(f.id)}
                          title="Remove file"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-white dark:hover:bg-white/10 transition-colors cursor-pointer opacity-70 group-hover:opacity-100"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Curated Sample Datasets */}
        {activeTab === 'curated' && (
          <div className="grid grid-cols-1 gap-2">
            {SAMPLE_DATASETS.map((ds) => {
              const isActive = selectedSampleDataset?.id === ds.id && !selectedFileId;

              return (
                <button
                  key={ds.id}
                  type="button"
                  onClick={() => onSelectSampleDataset(ds)}
                  className={`p-2.5 rounded-xl text-left text-xs transition-all cursor-pointer border flex items-center justify-between ${
                    isActive
                      ? 'bg-blue-500/10 border-blue-500/40 text-blue-600 dark:text-blue-300 font-semibold'
                      : 'bg-slate-50 dark:bg-[#161B22] border-slate-200 dark:border-[#21262D] text-slate-700 dark:text-[#8B949E] hover:border-slate-300 dark:hover:border-[#30363D]'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-900 dark:text-white truncate">
                        {ds.title}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-[#21262D] font-normal text-slate-600 dark:text-slate-300">
                        {ds.badge}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">
                      {ds.subtitle}
                    </p>
                  </div>
                  <ArrowRight size={13} className="text-slate-400 shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* CSV Raw Data & Schema Preview Modal */}
      {previewingFile && (
        <CsvPreviewModal
          file={previewingFile}
          isOpen={true}
          onClose={() => setPreviewingFile(null)}
          onSelectAsActive={() => onSelectFile(previewingFile)}
          isActive={selectedFileId === previewingFile.id && !selectedSampleDataset}
        />
      )}
    </div>
  );
}
