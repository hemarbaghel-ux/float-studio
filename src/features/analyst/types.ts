export interface DatasetColumn {
  name: string;
  type: 'numeric' | 'string' | 'date' | 'boolean';
  nullCount: number;
  uniqueCount: number;
  min?: number | string;
  max?: number | string;
  mean?: number;
  sampleValues: string[];
}

export interface DatasetProfile {
  id: string;
  name: string;
  rowCount: number;
  columnCount: number;
  columns: DatasetColumn[];
  previewRows: Record<string, any>[];
  rawCsv?: string;
  fileSizeBytes?: number;
}

export type StepStatus = 'pending' | 'running' | 'completed' | 'error';

export interface AgentProgressStep {
  id: string;
  title: string;
  description: string;
  status: StepStatus;
  durationMs?: number;
}

export interface ChartSeries {
  key: string;
  name: string;
  color?: string;
}

export type ChartType = 'bar' | 'line' | 'area' | 'scatter' | 'pie';

export interface ChartData {
  type: ChartType;
  title: string;
  description?: string;
  xAxisKey: string;
  yAxisKey?: string;
  series: ChartSeries[];
  data: Record<string, any>[];
}

export interface ReportMetric {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  description?: string;
}

export interface ExecutiveReport {
  id: string;
  title: string;
  summary: string;
  keyMetrics: ReportMetric[];
  charts: ChartData[];
  pythonCode: string;
  pythonOutput: string;
  caveats: string[];
  recommendations: string[];
  generatedAt: number;
  modelUsed: 'GPT-6 Astra' | 'GPT-6.1 Sol' | string;
}

export interface AnalystMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  steps?: AgentProgressStep[];
  report?: ExecutiveReport;
  createdAt: number;
}

export interface SampleDatasetDefinition {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  filename: string;
  description: string;
  suggestedQueries: string[];
  csvData: string;
}

export interface UploadedCsvFile {
  id: string;
  filename: string;
  fileSizeBytes: number;
  rowCount: number;
  columnCount: number;
  profile: DatasetProfile;
  previewRows: Record<string, any>[];
  csvData: string;
  uploadedAt: number;
}

export interface ParsingProgressState {
  isParsing: boolean;
  fileName: string;
  fileSizeBytes: number;
  progressPercent: number;
  statusText: string;
  stage: 'idle' | 'reading' | 'validating' | 'profiling' | 'completed' | 'error';
  currentFileIndex?: number;
  totalFiles?: number;
  error?: string;
}
