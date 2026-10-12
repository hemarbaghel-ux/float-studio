import { 
  VerifiedModel, 
  BenchmarkDefinition, 
  VerifiedBenchmarkResult 
} from '../../types/modelIntelligence';

export const VERIFIED_BENCHMARK_DEFINITIONS: BenchmarkDefinition[] = [
  {
    id: 'swe-bench-verified',
    name: 'SWE-bench Verified',
    category: 'Agentic',
    version: 'August 2024 human-validated subset (500 tasks)',
    description: 'Human-validated subset of SWE-bench containing 500 real GitHub issue resolution tasks requiring repository understanding, multi-file editing, and passing unit test suites.',
    methodology: 'Models are executed in a scaffolding environment with repo access, prompted to fix an issue description, and verified against unit tests added in the resolving PR.',
    officialUrl: 'https://www.swebench.com/',
    maintainer: 'SWE-bench Team (Jimenez et al., Princeton / Scale AI)',
    scoringUnit: '% resolved',
    caveats: [
      'Scoring depends heavily on the agentic harness and tool scaffolding used.',
      'Tasks are bounded to open-source repository architectures.',
      'Differences in sampling budgets alter results substantially.'
    ]
  },
  {
    id: 'humaneval',
    name: 'HumanEval',
    category: 'Coding',
    version: '164 programming problems (Pass@1, zero-shot)',
    description: 'Standard benchmark measuring Python function synthesis from docstrings with strict functional unit test verification.',
    methodology: 'Zero-shot prompt providing function signature and docstring. Output code is executed in an isolated environment against hidden test assertions.',
    officialUrl: 'https://github.com/openai/human-eval',
    maintainer: 'OpenAI (Chen et al., 2021)',
    scoringUnit: '% pass@1',
    caveats: [
      'High saturation among frontier models.',
      'Evaluates single-file algorithmic logic, not real-world multi-file software engineering.'
    ]
  },
  {
    id: 'livecodebench',
    name: 'LiveCodeBench',
    category: 'Coding',
    version: 'Contamination-free continuously updated problems (Sept 2024 - Jan 2025 window)',
    description: 'Continuously updated programming benchmark collecting fresh competitive programming problems to prevent data leakage and memorization.',
    methodology: 'Evaluates models on problems published strictly after model pre-training cutoff dates across code generation, self-repair, and test execution.',
    officialUrl: 'https://livecodebench.github.io/',
    maintainer: 'LiveCodeBench Research Group (Jain et al., 2024)',
    scoringUnit: '% pass@1',
    caveats: [
      'Time-window dependent: scores must be compared against the exact problem snapshot window.',
      'High algorithmic complexity typical of competitive programming platforms.'
    ]
  },
  {
    id: 'mmlu-pro',
    name: 'MMLU-Pro',
    category: 'Reasoning',
    version: 'Multi-choice reasoning with 10 options and reasoning steps',
    description: 'An upgraded, more challenging version of MMLU designed to test advanced reasoning in STEM, law, and technical domains with reduced guessability.',
    methodology: '5-shot chain-of-thought evaluation with 10 multiple-choice alternatives per question.',
    officialUrl: 'https://github.com/TIGER-AI-Lab/MMLU-Pro',
    maintainer: 'TIGER-AI-Lab (Wang et al., 2024)',
    scoringUnit: '% accuracy',
    caveats: [
      'Evaluates broad academic and conceptual reasoning rather than hands-on code authoring.',
      'Chain-of-thought prompting style impacts performance.'
    ]
  },
  {
    id: 'gpqa-diamond',
    name: 'GPQA Diamond',
    category: 'Reasoning',
    version: 'Diamond subset (198 PhD-level science questions)',
    description: 'A graduate-level science and reasoning benchmark written and peer-reviewed by domain experts (physics, chemistry, biology).',
    methodology: '0-shot / 5-shot chain-of-thought evaluation on verified expert-level scientific reasoning problems.',
    officialUrl: 'https://github.com/idavidrein/gpqa',
    maintainer: 'NYU / Independent Researchers (Rein et al., 2023)',
    scoringUnit: '% accuracy',
    caveats: [
      'Extremely high difficulty designed to resist search and shallow memorization.',
      'Small sample size (198 questions).'
    ]
  }
];

export const VERIFIED_MODELS: VerifiedModel[] = [
  {
    id: 'gpt-4o',
    displayName: 'GPT-4o',
    providerId: 'openai',
    family: 'gpt',
    version: 'gpt-4o-2024-11-20',
    releaseDate: '2024-11-20',
    status: 'AVAILABLE',
    statusReason: 'Catalog metadata verified. Server execution supported via OPENAI_API_KEY.',
    officialDocUrl: 'https://platform.openai.com/docs/models/gpt-4o',
    description: 'OpenAI’s flagship omni model featuring strong multilingual code comprehension and fast tool-calling adherence.',
    capabilities: {
      coding: true,
      reasoning: true,
      vision: true,
      tools: true,
      structuredOutput: true,
      streaming: true
    },
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportedModalities: ['text', 'image', 'audio'],
    pricing: {
      inputCostPerMillion: 2.50,
      outputCostPerMillion: 10.00,
      cachedInputCostPerMillion: 1.25,
      currency: 'USD',
      effectiveDate: '2024-11-20',
      sourceUrl: 'https://openai.com/api/pricing/',
      sourceName: 'OpenAI Official Pricing Page',
      pricingUnit: 'per 1M tokens'
    },
    benchmarks: [
      {
        id: 'gpt4o-swe',
        benchmarkId: 'swe-bench-verified',
        benchmarkName: 'SWE-bench Verified',
        benchmarkVersion: 'August 2024 (500 tasks)',
        modelId: 'gpt-4o',
        modelName: 'GPT-4o',
        modelVersion: '2024-11-20 snapshot',
        score: 38.8,
        unit: '%',
        evaluator: 'OpenAI Official System Card',
        sourceType: 'official_provider',
        evaluationDate: '2024-11-20',
        sourceUrl: 'https://openai.com/index/gpt-4o-system-card/',
        testConditions: 'SWE-bench Verified 500 tasks, pass@1.',
        sampleSize: 500
      },
      {
        id: 'gpt4o-he',
        benchmarkId: 'humaneval',
        benchmarkName: 'HumanEval',
        benchmarkVersion: 'v1.0 (164 tasks)',
        modelId: 'gpt-4o',
        modelName: 'GPT-4o',
        modelVersion: '2024-05-13',
        score: 90.2,
        unit: '%',
        evaluator: 'OpenAI Research',
        sourceType: 'official_provider',
        evaluationDate: '2024-05-13',
        sourceUrl: 'https://openai.com/index/hello-gpt-4o/',
        testConditions: '0-shot pass@1 Python generation.',
        sampleSize: 164
      },
      {
        id: 'gpt4o-lcb',
        benchmarkId: 'livecodebench',
        benchmarkName: 'LiveCodeBench',
        benchmarkVersion: 'August 2024 snapshot',
        modelId: 'gpt-4o',
        modelName: 'GPT-4o',
        modelVersion: '2024-08-06',
        score: 44.5,
        unit: '%',
        evaluator: 'LiveCodeBench Official Leaderboard',
        sourceType: 'independent_benchmark',
        evaluationDate: '2024-08-25',
        sourceUrl: 'https://livecodebench.github.io/leaderboard.html',
        testConditions: 'Contamination-free code generation pass@1.',
        sampleSize: 420
      },
      {
        id: 'gpt4o-mmlu-pro',
        benchmarkId: 'mmlu-pro',
        benchmarkName: 'MMLU-Pro',
        benchmarkVersion: 'v1.0 (Reasoning)',
        modelId: 'gpt-4o',
        modelName: 'GPT-4o',
        modelVersion: '2024-05-13',
        score: 72.6,
        unit: '%',
        evaluator: 'TIGER-AI-Lab / OpenAI Research',
        sourceType: 'official_provider',
        evaluationDate: '2024-05-13',
        sourceUrl: 'https://openai.com/index/hello-gpt-4o/',
        testConditions: '5-shot chain-of-thought, expert reasoning questions.',
        sampleSize: 12000
      },
      {
        id: 'gpt4o-gpqa',
        benchmarkId: 'gpqa-diamond',
        benchmarkName: 'GPQA Diamond',
        benchmarkVersion: 'Diamond subset (198 tasks)',
        modelId: 'gpt-4o',
        modelName: 'GPT-4o',
        modelVersion: '2024-05-13',
        score: 49.9,
        unit: '%',
        evaluator: 'OpenAI Research',
        sourceType: 'official_provider',
        evaluationDate: '2024-05-13',
        sourceUrl: 'https://openai.com/index/hello-gpt-4o/',
        testConditions: 'Zero-shot chain-of-thought expert scientific reasoning.',
        sampleSize: 198
      }
    ],
    limitations: [
      '128k context window.',
      'Requires server-side OPENAI_API_KEY environment variable.'
    ],
    lastVerified: '2026-03-20'
  },
  {
    id: 'o3-mini',
    displayName: 'o3-mini',
    providerId: 'openai',
    family: 'gpt',
    version: 'o3-mini-2025-01-31',
    releaseDate: '2025-01-31',
    status: 'AVAILABLE',
    statusReason: 'Catalog metadata verified. Server execution supported via OPENAI_API_KEY.',
    officialDocUrl: 'https://platform.openai.com/docs/models/o3-mini',
    description: 'OpenAI’s cost-efficient reasoning model specialized in STEM, competitive programming, and structured tool calling.',
    capabilities: {
      coding: true,
      reasoning: true,
      vision: false,
      tools: true,
      structuredOutput: true,
      streaming: true
    },
    contextWindow: 200000,
    maxOutputTokens: 100000,
    supportedModalities: ['text'],
    pricing: {
      inputCostPerMillion: 1.10,
      outputCostPerMillion: 4.40,
      cachedInputCostPerMillion: 0.55,
      currency: 'USD',
      effectiveDate: '2025-01-31',
      sourceUrl: 'https://openai.com/api/pricing/',
      sourceName: 'OpenAI Official Pricing Page',
      pricingUnit: 'per 1M tokens'
    },
    benchmarks: [
      {
        id: 'o3mini-swe',
        benchmarkId: 'swe-bench-verified',
        benchmarkName: 'SWE-bench Verified',
        benchmarkVersion: 'August 2024 (500 tasks)',
        modelId: 'o3-mini',
        modelName: 'o3-mini',
        modelVersion: '2025-01-31 (high reasoning effort)',
        score: 71.7,
        unit: '%',
        evaluator: 'OpenAI Official System Card',
        sourceType: 'official_provider',
        evaluationDate: '2025-01-31',
        sourceUrl: 'https://openai.com/index/openai-o3-mini/',
        testConditions: 'SWE-bench Verified 500 tasks with high reasoning effort.',
        sampleSize: 500
      },
      {
        id: 'o3mini-lcb',
        benchmarkId: 'livecodebench',
        benchmarkName: 'LiveCodeBench',
        benchmarkVersion: 'Jan 2025 snapshot',
        modelId: 'o3-mini',
        modelName: 'o3-mini',
        modelVersion: '2025-01-31 (high effort)',
        score: 64.3,
        unit: '%',
        evaluator: 'LiveCodeBench Leaderboard',
        sourceType: 'independent_benchmark',
        evaluationDate: '2025-02-05',
        sourceUrl: 'https://livecodebench.github.io/leaderboard.html',
        testConditions: 'Competitive programming problems pass@1.',
        sampleSize: 420
      },
      {
        id: 'o3mini-he',
        benchmarkId: 'humaneval',
        benchmarkName: 'HumanEval',
        benchmarkVersion: 'v1.0 (164 tasks)',
        modelId: 'o3-mini',
        modelName: 'o3-mini',
        modelVersion: '2025-01-31',
        score: 92.4,
        unit: '%',
        evaluator: 'OpenAI Official System Card',
        sourceType: 'official_provider',
        evaluationDate: '2025-01-31',
        sourceUrl: 'https://openai.com/index/openai-o3-mini/',
        testConditions: 'Zero-shot pass@1 Python generation with reasoning tokens.',
        sampleSize: 164
      },
      {
        id: 'o3mini-mmlu-pro',
        benchmarkId: 'mmlu-pro',
        benchmarkName: 'MMLU-Pro',
        benchmarkVersion: 'v1.0 (Reasoning)',
        modelId: 'o3-mini',
        modelName: 'o3-mini',
        modelVersion: '2025-01-31 (high effort)',
        score: 83.2,
        unit: '%',
        evaluator: 'OpenAI Official System Card',
        sourceType: 'official_provider',
        evaluationDate: '2025-01-31',
        sourceUrl: 'https://openai.com/index/openai-o3-mini/',
        testConditions: '5-shot chain-of-thought with high reasoning effort.',
        sampleSize: 12000
      },
      {
        id: 'o3mini-gpqa',
        benchmarkId: 'gpqa-diamond',
        benchmarkName: 'GPQA Diamond',
        benchmarkVersion: 'Diamond subset (198 tasks)',
        modelId: 'o3-mini',
        modelName: 'o3-mini',
        modelVersion: '2025-01-31 (high effort)',
        score: 79.7,
        unit: '%',
        evaluator: 'OpenAI Official System Card',
        sourceType: 'official_provider',
        evaluationDate: '2025-01-31',
        sourceUrl: 'https://openai.com/index/openai-o3-mini/',
        testConditions: 'Zero-shot chain-of-thought with high reasoning effort.',
        sampleSize: 198
      }
    ],
    limitations: [
      'Text-only model: does not accept image or multimodal input.',
      'Reasoning tokens are billed as output tokens at $4.40 / 1M tokens.',
      'Requires server-side OPENAI_API_KEY.'
    ],
    lastVerified: '2026-03-20'
  },
  {
    id: 'gpt-4o-mini',
    displayName: 'GPT-4o mini',
    providerId: 'openai',
    family: 'gpt',
    version: 'gpt-4o-mini-2024-07-18',
    releaseDate: '2024-07-18',
    status: 'AVAILABLE',
    statusReason: 'Catalog metadata verified. Server execution supported via OPENAI_API_KEY.',
    officialDocUrl: 'https://platform.openai.com/docs/models/gpt-4o-mini',
    description: 'Lightweight, low-cost model for high-frequency autocomplete, summarization, and lightweight coding tasks.',
    capabilities: {
      coding: true,
      reasoning: true,
      vision: true,
      tools: true,
      structuredOutput: true,
      streaming: true
    },
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportedModalities: ['text', 'image'],
    pricing: {
      inputCostPerMillion: 0.15,
      outputCostPerMillion: 0.60,
      cachedInputCostPerMillion: 0.075,
      currency: 'USD',
      effectiveDate: '2024-07-18',
      sourceUrl: 'https://openai.com/api/pricing/',
      sourceName: 'OpenAI Official Pricing Page',
      pricingUnit: 'per 1M tokens'
    },
    benchmarks: [
      {
        id: 'gpt4omini-he',
        benchmarkId: 'humaneval',
        benchmarkName: 'HumanEval',
        benchmarkVersion: 'v1.0 (164 tasks)',
        modelId: 'gpt-4o-mini',
        modelName: 'GPT-4o mini',
        modelVersion: '2024-07-18',
        score: 87.2,
        unit: '%',
        evaluator: 'OpenAI Research',
        sourceType: 'official_provider',
        evaluationDate: '2024-07-18',
        sourceUrl: 'https://openai.com/index/gpt-4o-mini-advancing-cost-efficient-intelligence/',
        testConditions: '0-shot pass@1 Python generation.',
        sampleSize: 164
      },
      {
        id: 'gpt4omini-swe',
        benchmarkId: 'swe-bench-verified',
        benchmarkName: 'SWE-bench Verified',
        benchmarkVersion: 'August 2024 (500 tasks)',
        modelId: 'gpt-4o-mini',
        modelName: 'GPT-4o mini',
        modelVersion: '2024-07-18 snapshot',
        score: 14.2,
        unit: '%',
        evaluator: 'OpenAI Official System Card',
        sourceType: 'official_provider',
        evaluationDate: '2024-07-18',
        sourceUrl: 'https://openai.com/index/gpt-4o-mini-advancing-cost-efficient-intelligence/',
        testConditions: 'SWE-bench Verified 500 tasks, pass@1.',
        sampleSize: 500
      },
      {
        id: 'gpt4omini-gpqa',
        benchmarkId: 'gpqa-diamond',
        benchmarkName: 'GPQA Diamond',
        benchmarkVersion: 'Diamond subset (198 tasks)',
        modelId: 'gpt-4o-mini',
        modelName: 'GPT-4o mini',
        modelVersion: '2024-07-18',
        score: 40.2,
        unit: '%',
        evaluator: 'OpenAI Research',
        sourceType: 'official_provider',
        evaluationDate: '2024-07-18',
        sourceUrl: 'https://openai.com/index/gpt-4o-mini-advancing-cost-efficient-intelligence/',
        testConditions: 'Zero-shot chain-of-thought expert scientific reasoning.',
        sampleSize: 198
      }
    ],
    limitations: [
      'Lower benchmark scores on multi-file repo refactoring (SWE-bench < 20%).',
      'Context window limited to 128k.'
    ],
    lastVerified: '2026-03-20'
  },
  {
    id: 'o1',
    displayName: 'OpenAI o1',
    providerId: 'openai',
    family: 'gpt',
    version: 'o1-2024-12-17',
    releaseDate: '2024-12-17',
    status: 'AVAILABLE',
    statusReason: 'Catalog metadata verified. Server execution supported via OPENAI_API_KEY.',
    officialDocUrl: 'https://platform.openai.com/docs/models/o1',
    description: 'Advanced reasoning model trained with reinforcement learning to generate internal chains of thought before responding.',
    capabilities: {
      coding: true,
      reasoning: true,
      vision: true,
      tools: true,
      structuredOutput: true,
      streaming: true
    },
    contextWindow: 200000,
    maxOutputTokens: 100000,
    supportedModalities: ['text', 'image'],
    pricing: {
      inputCostPerMillion: 15.00,
      outputCostPerMillion: 60.00,
      cachedInputCostPerMillion: 7.50,
      currency: 'USD',
      effectiveDate: '2024-12-17',
      sourceUrl: 'https://openai.com/api/pricing/',
      sourceName: 'OpenAI Official Pricing Page',
      pricingUnit: 'per 1M tokens'
    },
    benchmarks: [
      {
        id: 'o1-swe',
        benchmarkId: 'swe-bench-verified',
        benchmarkName: 'SWE-bench Verified',
        benchmarkVersion: 'August 2024 (500 tasks)',
        modelId: 'o1',
        modelName: 'OpenAI o1',
        modelVersion: '2024-12-17',
        score: 48.9,
        unit: '%',
        evaluator: 'OpenAI Official System Card',
        sourceType: 'official_provider',
        evaluationDate: '2024-12-17',
        sourceUrl: 'https://openai.com/index/openai-o1-system-card/',
        testConditions: 'SWE-bench Verified 500 tasks with high reasoning effort.',
        sampleSize: 500
      },
      {
        id: 'o1-gpqa',
        benchmarkId: 'gpqa-diamond',
        benchmarkName: 'GPQA Diamond',
        benchmarkVersion: 'Diamond subset (198 tasks)',
        modelId: 'o1',
        modelName: 'OpenAI o1',
        modelVersion: '2024-12-17',
        score: 75.7,
        unit: '%',
        evaluator: 'OpenAI Official System Card',
        sourceType: 'official_provider',
        evaluationDate: '2024-12-17',
        sourceUrl: 'https://openai.com/index/openai-o1-system-card/',
        testConditions: 'High reasoning effort mode.',
        sampleSize: 198
      }
    ],
    limitations: [
      'Higher latency due to thinking tokens.',
      'Requires server-side OPENAI_API_KEY.'
    ],
    lastVerified: '2026-03-20'
  }
];

export function getVerifiedModelById(id: string): VerifiedModel | undefined {
  return VERIFIED_MODELS.find(m => m.id === id);
}

export function getVerifiedBenchmarkDefinitionById(id: string): BenchmarkDefinition | undefined {
  return VERIFIED_BENCHMARK_DEFINITIONS.find(b => b.id === id);
}

export function getAllVerifiedBenchmarks(): VerifiedBenchmarkResult[] {
  const results: VerifiedBenchmarkResult[] = [];
  for (const model of VERIFIED_MODELS) {
    if (model.benchmarks) {
      results.push(...model.benchmarks);
    }
  }
  return results;
}
