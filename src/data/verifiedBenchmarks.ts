export type EvaluatorType = 'Official provider report' | 'Independent evaluation' | 'FLOAT evaluation';

export interface VerifiedBenchmarkDefinition {
  id: string;
  name: string;
  version: string;
  category: 'Software Engineering' | 'Code Generation' | 'Scientific Reasoning' | 'Mathematics';
  metricName: string;
  scoreUnit: '%';
  higherIsBetter: boolean;
  description: string;
  officialSourceUrl: string;
  maintainer: string;
  datasetSize: string;
  methodologyOverview: string;
  evaluationConditions: string;
  comparabilityGuidelines: string;
}

export interface VerifiedBenchmarkScore {
  id: string;
  benchmarkId: string;
  benchmarkName: string;
  benchmarkVersion: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  providerId: 'openai';
  score: number;
  scoreUnit: '%';
  evalDate: string;
  sourceUrl: string;
  evaluatorType: EvaluatorType;
  evaluatorName: string;
  testConfiguration: string;
  scaffoldingUsed: boolean;
  isComparableWithStandard: boolean;
  notesAndLimitations?: string;
}

export const VERIFIED_BENCHMARK_DEFINITIONS: VerifiedBenchmarkDefinition[] = [
  {
    id: 'swe-bench-verified',
    name: 'SWE-bench Verified',
    version: 'Verified (2024)',
    category: 'Software Engineering',
    metricName: 'Resolved %',
    scoreUnit: '%',
    higherIsBetter: true,
    description: 'Gold-standard benchmark evaluating autonomous agent software engineering capabilities across 500 human-validated real GitHub issues from open-source repositories.',
    officialSourceUrl: 'https://www.swebench.com/',
    maintainer: 'Princeton University / Scale AI',
    datasetSize: '500 validated task instances',
    methodologyOverview: 'Model is provided repository code and problem statement. Resolving patch must pass fail-to-pass unit tests without regressing pass-to-pass tests.',
    evaluationConditions: 'Standard agent scaffolding with tool calling, repository navigation, and test execution capability.',
    comparabilityGuidelines: 'Compare only against standard verified split. Scaffolding differences significantly impact resolution rate.'
  },
  {
    id: 'humaneval',
    name: 'HumanEval',
    version: 'Python Pass@1',
    category: 'Code Generation',
    metricName: 'Pass@1 %',
    scoreUnit: '%',
    higherIsBetter: true,
    description: '164 handcrafted Python programming challenges testing function synthesis from docstrings and passing unit tests on first attempt.',
    officialSourceUrl: 'https://github.com/openai/human-eval',
    maintainer: 'OpenAI (Chen et al.)',
    datasetSize: '164 coding tasks',
    methodologyOverview: 'Zero-shot prompt containing function signature and docstring. Generated code is executed in sandbox against unit assertions.',
    evaluationConditions: 'Standard zero-shot generation without human in the loop.',
    comparabilityGuidelines: 'Highly comparable across all frontier models. Modern frontier models exhibit near-saturation.'
  },
  {
    id: 'gpqa-diamond',
    name: 'GPQA Diamond',
    version: 'Diamond (198 questions)',
    category: 'Scientific Reasoning',
    metricName: 'Accuracy %',
    scoreUnit: '%',
    higherIsBetter: true,
    description: '198 extremely challenging graduate-level biology, physics, and chemistry multiple-choice questions written and validated by domain experts.',
    officialSourceUrl: 'https://github.com/idavidrein/gpqa',
    maintainer: 'NYU / Independent researchers (Rein et al.)',
    datasetSize: '198 multiple-choice questions',
    methodologyOverview: 'Evaluated with chain-of-thought prompting. Questions are designed to be Google-proof and resist superficial memorization.',
    evaluationConditions: 'Chain-of-thought with reasoning effort configured.',
    comparabilityGuidelines: 'Compare diamond split scores with matching reasoning token budgets.'
  },
  {
    id: 'math-500',
    name: 'MATH-500',
    version: 'Representative subset (500 problems)',
    category: 'Mathematics',
    metricName: 'Accuracy %',
    scoreUnit: '%',
    higherIsBetter: true,
    description: '500 challenging high-school competition mathematics problems spanning algebra, geometry, number theory, and calculus.',
    officialSourceUrl: 'https://github.com/openai/prm800k',
    maintainer: 'OpenAI (Lightman et al.)',
    datasetSize: '500 competition math problems',
    methodologyOverview: 'Problems require formal multi-step derivations ending in exact boxed numeric or algebraic expressions.',
    evaluationConditions: 'Evaluated with step-by-step reasoning or thinking tokens enabled.',
    comparabilityGuidelines: 'Directly comparable across test-time reasoning models.'
  }
];

export const VERIFIED_BENCHMARK_SCORES: VerifiedBenchmarkScore[] = [
  // --- SWE-bench Verified ---
  {
    id: 'swe-o3-mini-high',
    benchmarkId: 'swe-bench-verified',
    benchmarkName: 'SWE-bench Verified',
    benchmarkVersion: 'Verified (2024)',
    modelId: 'o3-mini',
    modelName: 'OpenAI o3-mini',
    modelVersion: 'o3-mini-2025-01-31',
    providerId: 'openai',
    score: 71.7,
    scoreUnit: '%',
    evalDate: '2025-01-31',
    sourceUrl: 'https://openai.com/index/openai-o3-mini/',
    evaluatorType: 'Official provider report',
    evaluatorName: 'OpenAI',
    testConfiguration: 'Reasoning effort: high, with SWE-bench scaffold and tool calling.',
    scaffoldingUsed: true,
    isComparableWithStandard: true,
    notesAndLimitations: 'Evaluated with high reasoning effort and agent scaffolding.'
  },
  {
    id: 'swe-o1-high',
    benchmarkId: 'swe-bench-verified',
    benchmarkName: 'SWE-bench Verified',
    benchmarkVersion: 'Verified (2024)',
    modelId: 'o1',
    modelName: 'OpenAI o1',
    modelVersion: 'o1-2024-12-17',
    providerId: 'openai',
    score: 48.9,
    scoreUnit: '%',
    evalDate: '2024-12-17',
    sourceUrl: 'https://openai.com/index/openai-o1-system-card/',
    evaluatorType: 'Official provider report',
    evaluatorName: 'OpenAI',
    testConfiguration: 'Full o1 release with high reasoning effort and scaffolding.',
    scaffoldingUsed: true,
    isComparableWithStandard: true,
    notesAndLimitations: 'Evaluated with high reasoning effort.'
  },
  {
    id: 'swe-gpt-4o',
    benchmarkId: 'swe-bench-verified',
    benchmarkName: 'SWE-bench Verified',
    benchmarkVersion: 'Verified (2024)',
    modelId: 'gpt-4o',
    modelName: 'GPT-4o',
    modelVersion: 'gpt-4o-2024-11-20',
    providerId: 'openai',
    score: 38.8,
    scoreUnit: '%',
    evalDate: '2024-11-20',
    sourceUrl: 'https://openai.com/index/gpt-4o-system-card/',
    evaluatorType: 'Official provider report',
    evaluatorName: 'OpenAI',
    testConfiguration: 'Standard SWE-bench agent scaffold with file inspection and execution tools.',
    scaffoldingUsed: true,
    isComparableWithStandard: true,
    notesAndLimitations: 'Snapshot gpt-4o-2024-11-20.'
  },
  {
    id: 'swe-gpt-4o-mini',
    benchmarkId: 'swe-bench-verified',
    benchmarkName: 'SWE-bench Verified',
    benchmarkVersion: 'Verified (2024)',
    modelId: 'gpt-4o-mini',
    modelName: 'GPT-4o mini',
    modelVersion: 'gpt-4o-mini-2024-07-18',
    providerId: 'openai',
    score: 14.2,
    scoreUnit: '%',
    evalDate: '2024-07-18',
    sourceUrl: 'https://openai.com/index/gpt-4o-mini-advancing-cost-efficient-intelligence/',
    evaluatorType: 'Official provider report',
    evaluatorName: 'OpenAI',
    testConfiguration: 'Lightweight SWE-bench scaffolding.',
    scaffoldingUsed: true,
    isComparableWithStandard: true,
    notesAndLimitations: 'Snapshot gpt-4o-mini-2024-07-18.'
  },

  // --- HumanEval (Python Pass@1) ---
  {
    id: 'he-o3-mini',
    benchmarkId: 'humaneval',
    benchmarkName: 'HumanEval',
    benchmarkVersion: 'Python Pass@1',
    modelId: 'o3-mini',
    modelName: 'OpenAI o3-mini',
    modelVersion: 'o3-mini-2025-01-31',
    providerId: 'openai',
    score: 92.4,
    scoreUnit: '%',
    evalDate: '2025-01-31',
    sourceUrl: 'https://openai.com/index/openai-o3-mini/',
    evaluatorType: 'Official provider report',
    evaluatorName: 'OpenAI',
    testConfiguration: 'Zero-shot with high reasoning effort.',
    scaffoldingUsed: false,
    isComparableWithStandard: true,
    notesAndLimitations: 'Evaluated with test-time reasoning.'
  },
  {
    id: 'he-gpt-4o',
    benchmarkId: 'humaneval',
    benchmarkName: 'HumanEval',
    benchmarkVersion: 'Python Pass@1',
    modelId: 'gpt-4o',
    modelName: 'GPT-4o',
    modelVersion: 'gpt-4o-2024-11-20',
    providerId: 'openai',
    score: 90.2,
    scoreUnit: '%',
    evalDate: '2024-11-20',
    sourceUrl: 'https://openai.com/index/hello-gpt-4o/',
    evaluatorType: 'Official provider report',
    evaluatorName: 'OpenAI',
    testConfiguration: 'Zero-shot prompt.',
    scaffoldingUsed: false,
    isComparableWithStandard: true,
    notesAndLimitations: 'Snapshot gpt-4o-2024-11-20.'
  },
  {
    id: 'he-gpt-4o-mini',
    benchmarkId: 'humaneval',
    benchmarkName: 'HumanEval',
    benchmarkVersion: 'Python Pass@1',
    modelId: 'gpt-4o-mini',
    modelName: 'GPT-4o mini',
    modelVersion: 'gpt-4o-mini-2024-07-18',
    providerId: 'openai',
    score: 87.2,
    scoreUnit: '%',
    evalDate: '2024-07-18',
    sourceUrl: 'https://openai.com/index/gpt-4o-mini-advancing-cost-efficient-intelligence/',
    evaluatorType: 'Official provider report',
    evaluatorName: 'OpenAI',
    testConfiguration: 'Zero-shot prompt.',
    scaffoldingUsed: false,
    isComparableWithStandard: true,
    notesAndLimitations: 'Snapshot gpt-4o-mini-2024-07-18.'
  },

  // --- GPQA Diamond ---
  {
    id: 'gpqa-o3-mini-high',
    benchmarkId: 'gpqa-diamond',
    benchmarkName: 'GPQA Diamond',
    benchmarkVersion: 'Diamond (198 questions)',
    modelId: 'o3-mini',
    modelName: 'OpenAI o3-mini',
    modelVersion: 'o3-mini-2025-01-31',
    providerId: 'openai',
    score: 79.7,
    scoreUnit: '%',
    evalDate: '2025-01-31',
    sourceUrl: 'https://openai.com/index/openai-o3-mini/',
    evaluatorType: 'Official provider report',
    evaluatorName: 'OpenAI',
    testConfiguration: 'Chain-of-thought with high reasoning effort.',
    scaffoldingUsed: false,
    isComparableWithStandard: true,
    notesAndLimitations: 'High reasoning effort mode.'
  },
  {
    id: 'gpqa-o1-high',
    benchmarkId: 'gpqa-diamond',
    benchmarkName: 'GPQA Diamond',
    benchmarkVersion: 'Diamond (198 questions)',
    modelId: 'o1',
    modelName: 'OpenAI o1',
    modelVersion: 'o1-2024-12-17',
    providerId: 'openai',
    score: 75.7,
    scoreUnit: '%',
    evalDate: '2024-12-17',
    sourceUrl: 'https://openai.com/index/openai-o1-system-card/',
    evaluatorType: 'Official provider report',
    evaluatorName: 'OpenAI',
    testConfiguration: 'Chain-of-thought with high reasoning effort.',
    scaffoldingUsed: false,
    isComparableWithStandard: true,
    notesAndLimitations: 'Full release checkpoint with high reasoning effort.'
  },
  {
    id: 'gpqa-gpt-4o',
    benchmarkId: 'gpqa-diamond',
    benchmarkName: 'GPQA Diamond',
    benchmarkVersion: 'Diamond (198 questions)',
    modelId: 'gpt-4o',
    modelName: 'GPT-4o',
    modelVersion: 'gpt-4o-2024-11-20',
    providerId: 'openai',
    score: 53.6,
    scoreUnit: '%',
    evalDate: '2024-11-20',
    sourceUrl: 'https://openai.com/index/hello-gpt-4o/',
    evaluatorType: 'Official provider report',
    evaluatorName: 'OpenAI',
    testConfiguration: '0-shot chain-of-thought prompt.',
    scaffoldingUsed: false,
    isComparableWithStandard: true,
    notesAndLimitations: 'Snapshot gpt-4o-2024-11-20.'
  },
  {
    id: 'gpqa-gpt-4o-mini',
    benchmarkId: 'gpqa-diamond',
    benchmarkName: 'GPQA Diamond',
    benchmarkVersion: 'Diamond (198 questions)',
    modelId: 'gpt-4o-mini',
    modelName: 'GPT-4o mini',
    modelVersion: 'gpt-4o-mini-2024-07-18',
    providerId: 'openai',
    score: 40.2,
    scoreUnit: '%',
    evalDate: '2024-07-18',
    sourceUrl: 'https://openai.com/index/gpt-4o-mini-advancing-cost-efficient-intelligence/',
    evaluatorType: 'Official provider report',
    evaluatorName: 'OpenAI',
    testConfiguration: '0-shot chain-of-thought prompt.',
    scaffoldingUsed: false,
    isComparableWithStandard: true,
    notesAndLimitations: 'Snapshot gpt-4o-mini-2024-07-18.'
  },

  // --- MATH-500 ---
  {
    id: 'math-o3-mini-high',
    benchmarkId: 'math-500',
    benchmarkName: 'MATH-500',
    benchmarkVersion: 'Representative subset (500 problems)',
    modelId: 'o3-mini',
    modelName: 'OpenAI o3-mini',
    modelVersion: 'o3-mini-2025-01-31',
    providerId: 'openai',
    score: 97.9,
    scoreUnit: '%',
    evalDate: '2025-01-31',
    sourceUrl: 'https://openai.com/index/openai-o3-mini/',
    evaluatorType: 'Official provider report',
    evaluatorName: 'OpenAI',
    testConfiguration: 'High reasoning effort derivation mode.',
    scaffoldingUsed: false,
    isComparableWithStandard: true,
    notesAndLimitations: 'Official score from OpenAI o3-mini announcement.'
  },
  {
    id: 'math-o1-high',
    benchmarkId: 'math-500',
    benchmarkName: 'MATH-500',
    benchmarkVersion: 'Representative subset (500 problems)',
    modelId: 'o1',
    modelName: 'OpenAI o1',
    modelVersion: 'o1-2024-12-17',
    providerId: 'openai',
    score: 96.4,
    scoreUnit: '%',
    evalDate: '2024-12-17',
    sourceUrl: 'https://openai.com/index/openai-o1-system-card/',
    evaluatorType: 'Official provider report',
    evaluatorName: 'OpenAI',
    testConfiguration: 'High reasoning effort mode.',
    scaffoldingUsed: false,
    isComparableWithStandard: true,
    notesAndLimitations: 'Full release checkpoint with high reasoning effort.'
  },
  {
    id: 'math-gpt-4o',
    benchmarkId: 'math-500',
    benchmarkName: 'MATH-500',
    benchmarkVersion: 'Representative subset (500 problems)',
    modelId: 'gpt-4o',
    modelName: 'GPT-4o',
    modelVersion: 'gpt-4o-2024-11-20',
    providerId: 'openai',
    score: 76.6,
    scoreUnit: '%',
    evalDate: '2024-11-20',
    sourceUrl: 'https://openai.com/index/hello-gpt-4o/',
    evaluatorType: 'Official provider report',
    evaluatorName: 'OpenAI',
    testConfiguration: 'Standard multi-step reasoning prompt.',
    scaffoldingUsed: false,
    isComparableWithStandard: true,
    notesAndLimitations: 'Snapshot gpt-4o-2024-11-20.'
  },
  {
    id: 'math-gpt-4o-mini',
    benchmarkId: 'math-500',
    benchmarkName: 'MATH-500',
    benchmarkVersion: 'Representative subset (500 problems)',
    modelId: 'gpt-4o-mini',
    modelName: 'GPT-4o mini',
    modelVersion: 'gpt-4o-mini-2024-07-18',
    providerId: 'openai',
    score: 70.2,
    scoreUnit: '%',
    evalDate: '2024-07-18',
    sourceUrl: 'https://openai.com/index/gpt-4o-mini-advancing-cost-efficient-intelligence/',
    evaluatorType: 'Official provider report',
    evaluatorName: 'OpenAI',
    testConfiguration: 'Standard multi-step reasoning prompt.',
    scaffoldingUsed: false,
    isComparableWithStandard: true,
    notesAndLimitations: 'Snapshot gpt-4o-mini-2024-07-18.'
  }
];

export function getBenchmarkDefinition(id: string): VerifiedBenchmarkDefinition | undefined {
  return VERIFIED_BENCHMARK_DEFINITIONS.find(b => b.id === id);
}

export function getScoresForModel(modelId: string): VerifiedBenchmarkScore[] {
  return VERIFIED_BENCHMARK_SCORES.filter(s => s.modelId === modelId);
}

export function getScoresForBenchmark(benchmarkId: string): VerifiedBenchmarkScore[] {
  return VERIFIED_BENCHMARK_SCORES.filter(s => s.benchmarkId === benchmarkId);
}
