import { apiFetch } from '../../services/api';
import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart3, Upload, FileSpreadsheet, Sparkles, Send,
  Loader2, CheckCircle2, AlertCircle, Database, ChevronDown,
  ChevronUp, ArrowRight, Table, RotateCcw, ShieldCheck,
  Cpu, Layers, HelpCircle, X, Maximize2
} from 'lucide-react';
import { SAMPLE_DATASETS } from './sampleDatasets';
import {
  DatasetProfile,
  AnalystMessage,
  AgentProgressStep,
  SampleDatasetDefinition,
  UploadedCsvFile,
} from './types';
import { ReportViewer } from './ReportViewer';
import { CsvDropzoneAndFileList } from './CsvDropzoneAndFileList';
import { CsvPreviewModal } from './CsvPreviewModal';

export function DataAnalystWorkspace() {
  const [selectedDataset, setSelectedDataset] = useState<SampleDatasetDefinition | null>(SAMPLE_DATASETS[0]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedCsvFile[]>([]);
  const [selectedUploadedFile, setSelectedUploadedFile] = useState<UploadedCsvFile | null>(null);
  const [datasetProfile, setDatasetProfile] = useState<DatasetProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [selectedModel, setSelectedModel] = useState<'gpt-6-astra' | 'gpt-6.1-sol'>('gpt-6-astra');
  const [showDataPreview, setShowDataPreview] = useState(false);
  const [modalPreviewFile, setModalPreviewFile] = useState<UploadedCsvFile | DatasetProfile | null>(null);

  // Conversation state
  const [messages, setMessages] = useState<AnalystMessage[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentSteps, setCurrentSteps] = useState<AgentProgressStep[]>([]);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Profile dataset on load when selectedDataset changes
  useEffect(() => {
    if (selectedDataset) {
      loadAndProfileCsv(selectedDataset.filename, selectedDataset.csvData);
    }
  }, [selectedDataset]);

  const loadAndProfileCsv = async (name: string, csvData: string) => {
    setLoadingProfile(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/analyst/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, csvData }),
      });
      if (!res.ok) throw new Error(`Profiling error HTTP ${res.status}`);
      const profile: DatasetProfile = await res.json();
      setDatasetProfile(profile);
      setMessages([]); // reset chat thread for fresh dataset
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to profile dataset');
    } finally {
      setLoadingProfile(false);
    }
  };

  /**
   * Handle an uploaded file from CsvDropzone
   */
  const handleUploadComplete = (newFile: UploadedCsvFile, shouldActivate: boolean) => {
    setUploadedFiles((prev) => {
      const filtered = prev.filter((f) => f.filename !== newFile.filename);
      return [newFile, ...filtered];
    });

    if (shouldActivate) {
      setSelectedUploadedFile(newFile);
      setSelectedDataset(null);
      setDatasetProfile(newFile.profile);
      setMessages([]);
    }
  };

  const handleSelectUploadedFile = (file: UploadedCsvFile) => {
    setSelectedUploadedFile(file);
    setSelectedDataset(null);
    setDatasetProfile(file.profile);
    setMessages([]);
  };

  const handleSelectSampleDataset = (ds: SampleDatasetDefinition) => {
    setSelectedDataset(ds);
    setSelectedUploadedFile(null);
    loadAndProfileCsv(ds.filename, ds.csvData);
  };

  const handleRemoveUploadedFile = (fileId: string) => {
    setUploadedFiles((prev) => {
      const remaining = prev.filter((f) => f.id !== fileId);
      if (selectedUploadedFile?.id === fileId) {
        if (remaining.length > 0) {
          handleSelectUploadedFile(remaining[0]);
        } else {
          handleSelectSampleDataset(SAMPLE_DATASETS[0]);
        }
      }
      return remaining;
    });
  };

  const handleClearAllUploadedFiles = () => {
    setUploadedFiles([]);
    setSelectedUploadedFile(null);
    handleSelectSampleDataset(SAMPLE_DATASETS[0]);
  };

  /**
   * Header upload trigger
   */
  const handleHeaderFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoadingProfile(true);
      setErrorMsg(null);
      const text = await file.text();
      const res = await apiFetch('/api/analyst/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, csvData: text }),
      });
      if (!res.ok) throw new Error(`Profiling error HTTP ${res.status}`);
      const profile: DatasetProfile = await res.json();

      const uploadedRecord: UploadedCsvFile = {
        id: `upload_${Date.now()}`,
        filename: file.name,
        fileSizeBytes: file.size,
        rowCount: profile.rowCount,
        columnCount: profile.columnCount,
        profile,
        previewRows: profile.previewRows,
        csvData: text,
        uploadedAt: Date.now(),
      };

      handleUploadComplete(uploadedRecord, true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to upload and parse CSV file');
    } finally {
      setLoadingProfile(false);
      e.target.value = '';
    }
  };

  /**
   * Dynamically build suggested questions for the active dataset
   */
  const getSuggestedQueries = (): string[] => {
    if (selectedDataset) {
      return selectedDataset.suggestedQueries;
    }
    if (datasetProfile) {
      const numCols = datasetProfile.columns.filter((c) => c.type === 'numeric').map((c) => c.name);
      const catCols = datasetProfile.columns.filter((c) => c.type !== 'numeric').map((c) => c.name);

      const suggestions: string[] = [];
      if (numCols.length >= 2) {
        suggestions.push(`Analyze correlation and trends between ${numCols[0]} and ${numCols[1]}.`);
      } else if (numCols.length === 1) {
        suggestions.push(`Compute statistical distribution, mean, and key anomalies for ${numCols[0]}.`);
      }
      if (catCols.length >= 1 && numCols.length >= 1) {
        suggestions.push(`Group by ${catCols[0]} and compare metrics across ${numCols[0]}.`);
      }
      suggestions.push(`What are the primary outliers and strategic takeaways in this dataset?`);
      suggestions.push(`Synthesize an executive summary with multi-series charts and caveats.`);
      return suggestions.slice(0, 4);
    }
    return [];
  };

  const handleRunAnalysis = async (queryText: string) => {
    if (!queryText.trim() || !datasetProfile || isAnalyzing) return;

    const userMessage: AnalystMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: queryText.trim(),
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery('');
    setIsAnalyzing(true);
    setErrorMsg(null);

    // Initial progressive steps
    const initialSteps: AgentProgressStep[] = [
      { id: '1', title: 'Inspect & Profile Dataset', description: 'Checking column statistics & data types', status: 'running' },
      { id: '2', title: 'Formulate Statistical Hypothesis', description: 'Generating analytical Python script', status: 'pending' },
      { id: '3', title: 'Execute in OpenAI Python Sandbox', description: 'Running pandas aggregation & metrics in sandbox', status: 'pending' },
      { id: '4', title: 'Synthesize Interactive Visualizations', description: 'Formatting multi-series chart payloads', status: 'pending' },
      { id: '5', title: 'Compile Executive Findings & Caveats', description: 'Assembling strategic takeaways and limitations', status: 'pending' },
    ];
    setCurrentSteps(initialSteps);
    setActiveStepIndex(0);

    // Progressive step simulation ticker while request is computing
    const stepTimer = setInterval(() => {
      setCurrentSteps((prev) => {
        const next = [...prev];
        const runningIdx = next.findIndex((s) => s.status === 'running');
        if (runningIdx !== -1) {
          next[runningIdx].status = 'completed';
          if (runningIdx + 1 < next.length) {
            next[runningIdx + 1].status = 'running';
            setActiveStepIndex(runningIdx + 1);
          }
        }
        return next;
      });
    }, 900);

    try {
      const response = await apiFetch('/api/analyst/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvData: datasetProfile.rawCsv,
          datasetName: datasetProfile.name,
          query: queryText.trim(),
          model: selectedModel,
          conversationHistory: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      clearInterval(stepTimer);

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      // Mark all steps completed
      const finalizedSteps = (data.steps || initialSteps).map((s: AgentProgressStep) => ({
        ...s,
        status: 'completed' as const,
      }));
      setCurrentSteps(finalizedSteps);

      const agentMessage: AnalystMessage = {
        id: `agent_${Date.now()}`,
        role: 'agent',
        content: `I have completed the analysis for your query: "${queryText.trim()}". Review the executive summary, dynamic charts, and sandboxed Python code below.`,
        steps: finalizedSteps,
        report: data.report,
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, agentMessage]);
    } catch (err: any) {
      clearInterval(stepTimer);
      setErrorMsg(err.message || 'Analysis run failed');
      setCurrentSteps((prev) => prev.map((s) => (s.status === 'running' ? { ...s, status: 'error' as const } : s)));
    } finally {
      setIsAnalyzing(false);
      setTimeout(() => {
        chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-[#0A0A0A] text-slate-900 dark:text-[#C9D1D9]">
      {/* Top Workspace Header */}
      <div className="h-14 border-b border-slate-200 dark:border-[#21262D] px-6 flex items-center justify-between shrink-0 bg-white dark:bg-[#111111]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center">
            <BarChart3 size={17} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                Data Analyst Agent
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Python Sandbox Active
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-[#8B949E]">
              Autonomous data inspection, Python code execution, and interactive chart synthesis
            </p>
          </div>
        </div>

        {/* Model Selector & Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 dark:bg-[#161B22] border border-slate-200 dark:border-[#30363D] rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setSelectedModel('gpt-6-astra')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                selectedModel === 'gpt-6-astra'
                  ? 'bg-white dark:bg-[#21262D] text-slate-900 dark:text-white font-semibold shadow-2xs'
                  : 'text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              GPT-6 Astra
            </button>
            <button
              type="button"
              onClick={() => setSelectedModel('gpt-6.1-sol')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                selectedModel === 'gpt-6.1-sol'
                  ? 'bg-white dark:bg-[#21262D] text-slate-900 dark:text-white font-semibold shadow-2xs'
                  : 'text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              GPT-6.1 Sol
            </button>
          </div>

          <input
            type="file"
            accept=".csv,text/csv,application/vnd.ms-excel"
            ref={fileInputRef}
            onChange={handleHeaderFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#30363D] hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Upload size={13} />
            <span>Upload CSV</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Left Column: Dataset Explorer, Drag & Drop Zone, Preview List & Query Thread */}
        <div className="w-full md:w-[460px] lg:w-[490px] border-r border-slate-200 dark:border-[#21262D] flex flex-col bg-white dark:bg-[#0D1117] shrink-0 min-h-0">
          
          {/* Top Section: Drag-and-Drop Upload Zone & Files Preview List */}
          <div className="p-3.5 border-b border-slate-200 dark:border-[#21262D] bg-slate-50/50 dark:bg-[#0D1117]">
            <CsvDropzoneAndFileList
              uploadedFiles={uploadedFiles}
              onUploadComplete={handleUploadComplete}
              onRemoveFile={handleRemoveUploadedFile}
              onClearAllFiles={handleClearAllUploadedFiles}
              selectedFileId={selectedUploadedFile?.id || null}
              onSelectFile={handleSelectUploadedFile}
              selectedSampleDataset={selectedDataset}
              onSelectSampleDataset={handleSelectSampleDataset}
              onProfileError={(err) => setErrorMsg(err)}
            />
          </div>

          {/* Active Dataset Summary Banner */}
          {datasetProfile && (
            <div className="p-3.5 bg-slate-50 dark:bg-[#12151B] border-b border-slate-200 dark:border-[#21262D] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 truncate">
                  <FileSpreadsheet size={15} className="text-emerald-500 shrink-0" />
                  <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {datasetProfile.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-[#8B949E] font-mono shrink-0">
                  <span>{datasetProfile.rowCount.toLocaleString()} rows</span>
                  <span>·</span>
                  <span>{datasetProfile.columnCount} cols</span>
                </div>
              </div>

              {/* Column Pills */}
              <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                {datasetProfile.columns.map((col) => (
                  <span
                    key={col.name}
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-[#1C2128] border border-slate-200 dark:border-[#30363D] text-slate-600 dark:text-[#C9D1D9]"
                  >
                    <span className="font-mono">{col.name}</span>
                    <span className={`text-[8px] uppercase ${col.type === 'numeric' ? 'text-blue-400' : 'text-slate-400'}`}>
                      {col.type}
                    </span>
                  </span>
                ))}
              </div>

              {/* Toggle Preview Button & Full Modal Trigger */}
              <div className="flex items-center gap-3 pt-0.5">
                <button
                  type="button"
                  onClick={() => setShowDataPreview(!showDataPreview)}
                  className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-[#58A6FF] hover:underline cursor-pointer"
                >
                  <Table size={12} />
                  <span>{showDataPreview ? 'Hide Inline Table' : 'Show Inline Table Preview'}</span>
                </button>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <button
                  type="button"
                  onClick={() => setModalPreviewFile(selectedUploadedFile || datasetProfile)}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-[#8B949E] hover:text-blue-500 dark:hover:text-[#58A6FF] cursor-pointer"
                >
                  <Maximize2 size={11} />
                  <span>Full Schema & Rows</span>
                </button>
              </div>
            </div>
          )}

          {/* Spreadsheet Raw Data Preview Dropdown (Inline) */}
          {showDataPreview && datasetProfile && (
            <div className="border-b border-slate-200 dark:border-[#21262D] bg-[#0D1117] p-3 max-h-56 overflow-auto font-mono text-[10px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#30363D] text-slate-400">
                    {datasetProfile.columns.map((c) => (
                      <th key={c.name} className="p-1 px-2 whitespace-nowrap">
                        {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#21262D] text-slate-300">
                  {datasetProfile.previewRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-white/5">
                      {datasetProfile.columns.map((c) => (
                        <td key={c.name} className="p-1 px-2 whitespace-nowrap">
                          {String(row[c.name] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Chat & Progress Thread */}
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (selectedDataset || datasetProfile) && (
              <div className="space-y-3 pt-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Suggested Questions for {selectedDataset ? selectedDataset.badge : (selectedUploadedFile?.filename || 'Dataset')}
                </span>
                <div className="space-y-2">
                  {getSuggestedQueries().map((q, i) => (
                    <button
                      key={i}
                      type="button"
                      disabled={isAnalyzing}
                      onClick={() => handleRunAnalysis(q)}
                      className="w-full p-2.5 rounded-xl text-left text-xs bg-slate-50 dark:bg-[#161B22] border border-slate-200 dark:border-[#21262D] hover:border-blue-500/50 hover:bg-blue-500/5 text-slate-700 dark:text-[#C9D1D9] transition-all flex items-center justify-between group cursor-pointer"
                    >
                      <span>{q}</span>
                      <ArrowRight size={13} className="text-slate-400 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation Log */}
            {messages.map((m) => (
              <div key={m.id} className="space-y-2">
                {m.role === 'user' ? (
                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-900 dark:text-blue-200 ml-4">
                    <span className="font-semibold block text-[10px] uppercase text-blue-500 dark:text-blue-400 mb-0.5">
                      User Question
                    </span>
                    <p>{m.content}</p>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#12151B] border border-slate-200 dark:border-[#21262D] text-xs text-slate-800 dark:text-[#C9D1D9] mr-4 space-y-2">
                    <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                      <Sparkles size={13} />
                      <span>Data Analyst Response</span>
                    </div>
                    <p className="leading-relaxed">{m.content}</p>
                  </div>
                )}
              </div>
            ))}

            {/* Active Running Progress Card */}
            {isAnalyzing && (
              <div className="p-4 rounded-xl bg-slate-900/50 dark:bg-[#161B22] border border-blue-500/30 space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                    <Loader2 size={13} className="animate-spin text-blue-400" />
                    <span>Agent Running in Python Sandbox...</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Step {activeStepIndex + 1} of {currentSteps.length}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {currentSteps.map((step) => (
                    <div key={step.id} className="flex items-start gap-2 text-[11px]">
                      {step.status === 'completed' ? (
                        <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                      ) : step.status === 'running' ? (
                        <Loader2 size={13} className="animate-spin text-blue-400 shrink-0 mt-0.5" />
                      ) : step.status === 'error' ? (
                        <AlertCircle size={13} className="text-rose-400 shrink-0 mt-0.5" />
                      ) : (
                        <div className="w-3 h-3 rounded-full border border-slate-600 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 truncate">
                        <span className={step.status === 'running' ? 'font-semibold text-white' : 'text-slate-400'}>
                          {step.title}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Input Box for Follow-up Questions */}
          <div className="p-3.5 border-t border-slate-200 dark:border-[#21262D] bg-white dark:bg-[#111111]">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRunAnalysis(inputQuery);
              }}
              className="relative flex items-center"
            >
              <input
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                disabled={isAnalyzing || !datasetProfile}
                placeholder={datasetProfile ? 'Ask questions or request charts...' : 'Upload or select a CSV to begin...'}
                className="w-full bg-slate-50 dark:bg-[#0D1117] border border-slate-200 dark:border-[#30363D] focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#6E7681] focus:outline-none pr-10 transition-colors"
              />
              <button
                type="submit"
                disabled={!inputQuery.trim() || isAnalyzing || !datasetProfile}
                className="absolute right-2 p-1.5 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {isAnalyzing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Visualizations & Executive Report */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0 bg-slate-50/50 dark:bg-[#0A0A0A]">
          {messages.filter((m) => m.report).length > 0 ? (
            messages
              .filter((m) => m.report)
              .slice(-1)
              .map((m) => (
                <ReportViewer
                  key={m.id}
                  report={m.report!}
                  rawCsv={datasetProfile?.rawCsv}
                />
              ))
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400 max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center">
                <BarChart3 size={32} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  No Analysis Run Yet
                </h3>
                <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-1.5 leading-relaxed">
                  Select a suggested question on the left or type your own custom analytical prompt.
                  The agent will inspect your dataset, run code in the OpenAI Python sandbox, and output interactive charts and reports.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CSV Full Modal Preview */}
      {modalPreviewFile && (
        <CsvPreviewModal
          file={modalPreviewFile}
          isOpen={true}
          onClose={() => setModalPreviewFile(null)}
          isActive={
            'id' in modalPreviewFile && selectedUploadedFile?.id === (modalPreviewFile as UploadedCsvFile).id
          }
        />
      )}
    </div>
  );
}
