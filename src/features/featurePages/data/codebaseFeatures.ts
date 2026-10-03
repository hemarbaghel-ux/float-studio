import { FeatureDetail } from '../types';

export const codebaseFeatures: FeatureDetail[] = [
  {
    slug: 'multiple-models',
    title: 'Multiple models',
    badgeCategory: 'Understands Your Codebase',
    headline: 'Deploy specialized AI models across parallel subagents for optimal results',
    introParagraph: 'No single AI model is best at everything. Fast models excel at semantic file searches, while deep reasoning models shine at architectural refactoring. FLOAT orchestrates multiple models simultaneously—spawning parallel subagents where each subtask is handled by the model best suited for it.',
    primaryAction: {
      label: 'Explore Model Catalog',
      href: '/models',
      description: 'Compare benchmarks and capabilities across all supported models'
    },
    secondaryAction: {
      label: 'Explore all features',
      href: '/features'
    },
    mockupType: 'models',
    whatItDoes: {
      overview: 'Multiple Models allows FLOAT to orchestrate heterogeneous AI models (OpenAI, Anthropic, Gemini, xAI) within a single development session.',
      problemSolved: 'Overcomes the trade-offs of speed, cost, and reasoning power by routing code exploration, design, and reasoning to specialized models.',
      targetAudience: 'Software teams requiring top-tier coding performance without paying frontier prices for simple lookup tasks.',
      whenToUse: 'When exploring large codebases, running autonomous multi-file agents, or conducting in-depth architectural audits.',
      workflowFit: 'Configured in the Model Selector dropdown or set to "Auto" for dynamic algorithmic model routing.'
    },
    howItWorks: [
      {
        stepNumber: 1,
        title: 'Task Decomposition & Capability Matching',
        developerAction: 'Submit a complex prompt in the composer (e.g. "Build mission control interface and add evaluation metrics").',
        floatAction: 'Breaks the requirement into distinct subtasks: codebase exploration, UI component generation, and metric calculation.',
        involvedArtifacts: 'Task prompt, project AST, model capability registry.',
        outputProduced: 'Subtask execution graph with assigned model profiles.',
        inspectionAndApproval: 'Developer can inspect assigned models or lock specific tasks to preferred providers.'
      },
      {
        stepNumber: 2,
        title: 'Parallel Subagent Orchestration',
        developerAction: 'Observe the subagents execute concurrently in the activity panel.',
        floatAction: 'Launches Subagent 1 (Claude 3.7 Sonnet for architecture), Subagent 2 (Grok 2 for UI components), and Subagent 3 (Gemini 2.5 Flash for indexing).',
        involvedArtifacts: 'Parallel worker threads, provider API gateways.',
        outputProduced: 'Live status indicators displaying progress per subagent.',
        inspectionAndApproval: 'Developer can pause, redirect, or inspect intermediate outputs of any subagent.'
      },
      {
        stepNumber: 3,
        title: 'Synthesis & Unified Diff Assembly',
        developerAction: 'Review the unified proposal combining all subagent contributions.',
        floatAction: 'Resolves overlapping file edits, runs type checking, and presents a cohesive diff in Monaco Editor.',
        involvedArtifacts: 'Unified AST, Monaco diff viewer.',
        outputProduced: 'Single comprehensive change set ready for review.',
        inspectionAndApproval: 'Developer reviews and accepts the composite change.'
      }
    ],
    practicalExample: {
      scenarioTitle: 'Spawning 3 parallel subagents to build an analytics dashboard and model evaluation pipeline',
      problem: 'Building a large feature requires simultaneous backend API routing, frontend visualization, and math calculations.',
      developerPrompt: 'Set up model architecture and Mission Control interface with evaluation metrics',
      executionProcess: [
        'FLOAT starts 3 parallel subagents.',
        'Subagent 1 (Opus/Sonnet) implements backend database schema and routing.',
        'Subagent 2 (Grok) builds the responsive Mission Control UI dashboard.',
        'Subagent 3 (Gemini Flash) indexes benchmark datasets and computes delta metrics.',
        'FLOAT synthesizes all components into a synchronized commit.'
      ],
      codeOrDiffType: 'code',
      codeOrDiffSnippet: `// Parallel Subagent Execution Ledger:
Subagent 1 [Opus 3] -> src/server/evals/evalEngine.ts (Generated 140 lines)
Subagent 2 [Grok 2] -> src/features/dashboard/MissionControl.tsx (Generated 210 lines)
Subagent 3 [Gemini] -> src/data/benchmarks.json (Indexed 48 model snapshots)
---
Status: 3 of 3 subagents finished in 8.4s (3.2x faster than sequential single-model execution)
Typecheck: 0 errors. All imports resolved.`,
      verificationStep: 'Developer tests the live dashboard and verifies all three modules work in harmony.'
    },
    keyCapabilities: [
      {
        name: 'Heterogeneous Multi-Model Routing',
        description: 'Mix and match OpenAI GPT-4o, Anthropic Claude 3.7 Sonnet, Google Gemini 2.5 Pro, and xAI Grok in one session.',
        practicalBenefit: 'Leverage the unique strengths of each frontier provider without vendor lock-in.'
      },
      {
        name: 'Cost & Latency Optimization',
        description: 'Fast lightweight models handle search and boilerplate, preserving expensive reasoning tokens for hard logic.',
        practicalBenefit: 'Reduces total token costs by up to 60% while speeding up execution.'
      },
      {
        name: 'No Silent Fallbacks',
        description: 'FLOAT never secretly downgrades your model. If a chosen provider experiences an outage, you are alerted immediately.',
        practicalBenefit: 'Full transparency and predictable code generation quality.'
      }
    ],
    whenToUseScenarios: [
      {
        title: 'Large-Scale Repository Migrations',
        description: 'Using fast models to scan thousands of files while deep models refactor critical interfaces.'
      },
      {
        title: 'Full-Stack Feature Development',
        description: 'Simultaneously creating database schemas, Express endpoints, and React components.'
      },
      {
        title: 'Comparative Benchmark Testing',
        description: 'Testing how different models solve the same algorithmic challenge in your codebase.'
      }
    ],
    workflowAndIntegrations: {
      leadText: 'Multiple Models powers autonomous agents and model routing in FLOAT:',
      connectedTools: [
        { name: 'Model Routing', role: 'Algorithmic routing based on benchmark capability and prompt complexity', slug: 'model-routing' },
        { name: 'Autonomous Agents', role: 'Agents utilize multiple subagents to solve complex tasks faster', slug: 'agents' },
        { name: 'Fast Codebase Search', role: 'High-speed models drive Instant Grep across millions of lines', slug: 'codebase-search' }
      ]
    },
    requirementsAndLimitations: {
      availabilityStatus: 'Available',
      authRequired: true,
      providerKeyRequired: false,
      environmentNotes: 'FLOAT provides managed provider access; custom API keys can also be configured in settings.',
      knownLimitations: [
        'Concurrent subagent execution is subject to provider rate limits (TPM/RPM).',
        'Models that do not support structured tool calling cannot be assigned to autonomous tool-execution subtasks.'
      ]
    },
    faq: [
      {
        question: 'Can I bring my own API keys (BYOK)?',
        answer: 'Yes! FLOAT supports direct API keys for OpenAI, Anthropic, Google Gemini, and xAI with zero markup.'
      },
      {
        question: 'How does FLOAT prevent subagents from creating conflicting edits?',
        answer: 'FLOAT uses an AST dependency graph that locks files per subagent. If two subagents touch related files, a merge arbitrator reconciles the changes.'
      },
      {
        question: 'Which model should I use for daily coding?',
        answer: 'We recommend "Auto" mode, which uses Gemini 2.5 Pro or Claude 3.7 Sonnet for complex coding and Gemini 2.5 Flash for fast queries.'
      },
      {
        question: 'Are my prompts shared across providers?',
        answer: 'No. Subtasks are scoped only to the specific provider assigned to that subtask.'
      }
    ],
    relatedFeatures: [
      { slug: 'model-routing', title: 'Model Selection & Routing', category: 'Intelligence', description: 'Intelligent routing between frontier AI models.' },
      { slug: 'agents', title: 'Autonomous Agents', category: 'Execution', description: 'Multi-agent coordination across files.' },
      { slug: 'codebase-search', title: 'Fast Codebase Search', category: 'Intelligence', description: 'Ultra-fast search across large repositories.' }
    ]
  },
  {
    slug: 'team-rules',
    title: 'Team rules',
    badgeCategory: 'Understands Your Codebase',
    headline: 'Teach FLOAT your team conventions, architectural patterns, and style rules',
    introParagraph: 'Every engineering organization has standards that linters can\'t capture: "always use our custom button wrapper," "never mutate global state directly," or "all billing logic must reside in src/domain/billing." FLOAT Team Rules (.float/rules/) teach the AI your organization\'s architectural dogma so generated code conforms on day one.',
    primaryAction: {
      label: 'Read Rules Documentation',
      href: '/resources/docs',
      description: 'Learn how to author and configure team rules in FLOAT'
    },
    secondaryAction: {
      label: 'Explore all features',
      href: '/features'
    },
    mockupType: 'rules',
    whatItDoes: {
      overview: 'Team Rules is a persistent governance engine that injects repository-wide conventions into all AI prompts and agent loops.',
      problemSolved: 'Stops developers from having to repeatedly correct generated code that violates team patterns or introduces unapproved libraries.',
      targetAudience: 'Engineering managers, staff architects, and development teams striving for codebase consistency.',
      whenToUse: 'When establishing architecture boundaries, migrating to new internal frameworks, or standardizing code patterns across engineers.',
      workflowFit: 'Committed as markdown/yaml files in .float/rules/ in the repository root. Inherited automatically by every team member.'
    },
    howItWorks: [
      {
        stepNumber: 1,
        title: 'Rule Definition & Path Scoping',
        developerAction: 'Commit a rule file in .float/rules/design-system.md with glob matching rules.',
        floatAction: 'Parses YAML frontmatter, registers target glob patterns (e.g. components/**/*.tsx), and indexes rules.',
        involvedArtifacts: '.float/rules/*.md, glob matcher, workspace index.',
        outputProduced: 'Active rule registry displayed in project settings.',
        inspectionAndApproval: 'Reviewed and merged via regular Git pull request.'
      },
      {
        stepNumber: 2,
        title: 'Contextual Rule Activation',
        developerAction: 'Developer or agent requests edits to a matching file (e.g. src/components/Modal.tsx).',
        floatAction: 'Dynamically attaches relevant rules to the system prompt based on matching file paths.',
        involvedArtifacts: 'Active target files, matched rule snippets.',
        outputProduced: 'Scoped prompt constraints restricting model generation.',
        inspectionAndApproval: 'Developer can view active rules via the Composer context indicator.'
      },
      {
        stepNumber: 3,
        title: 'Pre-Commit Compliance Verification',
        developerAction: 'Inspect generated diffs.',
        floatAction: 'Performs compliance check against rule criteria, flagging any disallowed libraries or pattern deviations.',
        involvedArtifacts: 'AST validator, diff analyzer.',
        outputProduced: 'Clean, compliant code that matches team patterns perfectly.',
        inspectionAndApproval: 'Developer approves diff with confidence.'
      }
    ],
    practicalExample: {
      scenarioTitle: 'Enforcing custom design system button primitives across all new UI components',
      problem: 'AI frequently suggests native <button> or unapproved third-party button components instead of the company design system.',
      developerPrompt: 'Create a new UserInviteModal component with submit and cancel actions',
      executionProcess: [
        'Matches glob "src/components/**/*.tsx" against .float/rules/design-system.md.',
        'Injects rule: "Never use raw HTML <button>; always import { Button } from @ui/primitives".',
        'Generates UserInviteModal.tsx using exclusively approved Button variants.'
      ],
      codeOrDiffType: 'code',
      codeOrDiffSnippet: `// .float/rules/design-system.md:
---
description: Design System component usage rules
globs: ["src/components/**/*.tsx", "src/features/**/*.tsx"]
---
# UI Component Guidelines
- Never use raw HTML \`<button>\` or \`<input>\` elements.
- Always import \`Button\` and \`Input\` from \`@/components/ui\`.
- All modal dialogs must use the \`Dialog\` primitive with accessibility focus trap.
- Use spacing tokens (gap-2, gap-4) rather than arbitrary margin offsets.`,
      verificationStep: 'Developer inspects imports and verifies 100% adherence to design system primitives.'
    },
    keyCapabilities: [
      {
        name: 'Glob-Based Path Targeting',
        description: 'Apply rules conditionally based on file paths (e.g. backend rules for /api/**, frontend rules for /components/**).',
        practicalBenefit: 'Prevents prompt bloat by only loading rules relevant to the specific files being modified.'
      },
      {
        name: 'Git-Tracked Organization Standards',
        description: 'Rules live in your Git repository alongside code, undergoing standard code review and branching.',
        practicalBenefit: 'Changes to team rules are tracked, versioned, and rolled out automatically to everyone.'
      },
      {
        name: 'Architecture & Security Boundaries',
        description: 'Specify forbidden libraries, mandatory authorization decorators, and sensitive credential handling policies.',
        practicalBenefit: 'Guards against security violations before code reaches code review.'
      }
    ],
    whenToUseScenarios: [
      {
        title: 'Onboarding New Engineers',
        description: 'Ensuring junior engineers produce code that matches senior team conventions immediately.'
      },
      {
        title: 'Design System Migrations',
        description: 'Preventing legacy UI patterns from being reintroduced during new feature builds.'
      },
      {
        title: 'Strict Security & Compliance Regimes',
        description: 'Enforcing HIPAA, SOC 2, or PCI compliance rules in all database queries and API responses.'
      }
    ],
    workflowAndIntegrations: {
      leadText: 'Team Rules integrate with Skills, Plan mode, and Codebase Search:',
      connectedTools: [
        { name: 'Plan Mode', role: 'Incorporates team rules during initial architectural planning', slug: 'plan' },
        { name: 'Skills', role: 'Skills reference team rules for domain-specific tasks', slug: 'skills' },
        { name: 'Codebase Search', role: 'Discovers existing patterns in the repo that exemplify rules', slug: 'codebase-search' }
      ]
    },
    requirementsAndLimitations: {
      availabilityStatus: 'Available',
      authRequired: false,
      providerKeyRequired: false,
      environmentNotes: 'Works in all FLOAT versions. Rules are parsed locally from the workspace filesystem.',
      knownLimitations: [
        'Contradictory rules across multiple files will be flagged in settings; prioritize concise, unambiguous directives.',
        'Rules guide model output generation; they do not replace automated static analysis linters (ESLint/Prettier).'
      ]
    },
    faq: [
      {
        question: 'Where do I create team rules?',
        answer: 'Create a .float/rules/ folder in your project root and add markdown files describing your rules.'
      },
      {
        question: 'Can I have personal rules that are not shared with my team?',
        answer: 'Yes. You can add personal rules in your user settings that apply across all projects on your machine.'
      },
      {
        question: 'How do globs work in rules?',
        answer: 'Use standard minimatch syntax in the frontmatter `globs: ["src/server/**", "!**/*.test.ts"]` to target specific directories.'
      },
      {
        question: 'Do team rules increase API costs?',
        answer: 'FLOAT only loads rules matching the files currently being edited, keeping token overhead minimal.'
      }
    ],
    relatedFeatures: [
      { slug: 'skills', title: 'Skills', category: 'Extension', description: 'Domain-specific instructions and workflows.' },
      { slug: 'plan', title: 'Plan Mode', category: 'Lifecycle', description: 'Plan changes adhering to team conventions.' },
      { slug: 'codebase-search', title: 'Fast Codebase Search', category: 'Intelligence', description: 'Index and search existing patterns.' }
    ]
  },
  {
    slug: 'codebase-search',
    title: 'Fast codebase search',
    badgeCategory: 'Understands Your Codebase',
    headline: 'Instant Grep and semantic symbol search across millions of files in milliseconds',
    introParagraph: 'Finding the right code shouldn\'t take minutes of waiting for a file indexer. FLOAT Codebase Search pairs lightning-fast ripgrep-powered text search with deep AST symbol tables and semantic embedding search. Discover relevant functions, callers, and payment handlers across massive monorepos in milliseconds.',
    primaryAction: {
      label: 'Open Workspace Search',
      href: '/',
      description: 'Test Instant Grep and symbol search in the FLOAT IDE'
    },
    secondaryAction: {
      label: 'Explore all features',
      href: '/features'
    },
    mockupType: 'search',
    whatItDoes: {
      overview: 'Fast Codebase Search is a multi-tier search engine that combines exact text grep, AST symbol indexing, and vector semantic retrieval.',
      problemSolved: 'Eliminates slow, incomplete searches that miss relevant files or crash when navigating massive multi-gigabyte repositories.',
      targetAudience: 'Engineers working in large codebases, monorepos, and unfamiliar open-source projects.',
      whenToUse: 'When locating where an API is handled, tracking down callers of a deprecated function, or researching architecture.',
      workflowFit: 'Triggered via Cmd+Shift+F in the editor, @search in the composer, or autonomously by agents during exploration.'
    },
    howItWorks: [
      {
        stepNumber: 1,
        title: 'Multi-Modal Query Parsing',
        developerAction: 'Type a natural language query ("How does the payment flow handle failed transactions?") or regex pattern.',
        floatAction: 'Identifies keywords ("payment", "retry", "webhook", "failed"), computes embeddings, and triggers parallel search engines.',
        involvedArtifacts: 'Query string, AST symbol index, vector embedding cache.',
        outputProduced: 'Ranked candidate list of files and code snippets.',
        inspectionAndApproval: 'Developer sees live instant preview in search results panel.'
      },
      {
        stepNumber: 2,
        title: 'Instant Grep & AST Filtering',
        developerAction: 'Filter results by file type (e.g. *.ts) or directory.',
        floatAction: 'Executes ripgrep across thousands of files in under 40ms, filtering out gitignored build artifacts.',
        involvedArtifacts: 'Rust-based ripgrep engine, .gitignore rules.',
        outputProduced: 'Highlighted occurrences with surrounding context lines.',
        inspectionAndApproval: 'Developer clicks any result to jump instantly in Monaco Editor.'
      },
      {
        stepNumber: 3,
        title: 'Contextual Agent Ingestion',
        developerAction: 'Click "Pin to Context" or let the agent consume the search findings.',
        floatAction: 'Extracts the most relevant code slices and provides them to the active AI session.',
        involvedArtifacts: 'Search buffer, active conversation context.',
        outputProduced: 'Precise architectural answer citing exact line numbers.',
        inspectionAndApproval: 'Developer verifies file citations directly in the editor.'
      }
    ],
    practicalExample: {
      scenarioTitle: 'Investigating payment failure recovery logic across a high-volume checkout service',
      problem: 'Need to understand how Stripe webhooks handle payment intent failures and whether customer emails are triggered.',
      developerPrompt: 'How does the payment flow handle failed transactions?',
      executionProcess: [
        'Searches for "payment retry logic", "handlePaymentFailure", and "stripe/webhooks".',
        'Reads checkout/PaymentService.ts and lib/stripe/webhooks.ts.',
        'Discovers asynchronous retry queue in src/workers/paymentRetry.ts.',
        'Synthesizes exact explanation with clickable citations.'
      ],
      codeOrDiffType: 'code',
      codeOrDiffSnippet: `// Search Results: "payment failure webhook"
1. lib/stripe/webhooks.ts:84
   case 'payment_intent.payment_failed':
     await PaymentService.handlePaymentFailure(event.data.object);
2. checkout/PaymentService.ts:112
   static async handlePaymentFailure(intent: Stripe.PaymentIntent) {
     await emailQueue.add('payment_failed_notification', { userId: intent.customer });
     await retryQueue.schedule(intent.id, { backoffHours: 4 });
   }`,
      verificationStep: 'Developer clicks directly into line 84 of webhooks.ts to verify the handler implementation.'
    },
    keyCapabilities: [
      {
        name: 'Instant Grep Speed (<50ms)',
        description: 'Native Rust-powered search engine capable of searching millions of lines of code in milliseconds.',
        practicalBenefit: 'No waiting for slow progress bars; search results update as fast as you can type.'
      },
      {
        name: 'Semantic Natural Language Search',
        description: 'Ask conceptual questions like "where are user sessions refreshed?" even if you don\'t know exact function names.',
        practicalBenefit: 'Onboard and orient yourself in unfamiliar codebases in minutes.'
      },
      {
        name: 'Symbol & Call Hierarchy Graph',
        description: 'Trace all callers and implementations of an interface across packages in monorepos.',
        practicalBenefit: 'Perform refactors safely knowing every callsite has been identified.'
      }
    ],
    whenToUseScenarios: [
      {
        title: 'Exploring Unfamiliar Codebases',
        description: 'Understanding how authentication, data layers, or state stores are structured in new projects.'
      },
      {
        title: 'Tracking Down Bug Origins',
        description: 'Searching for error messages or specific status codes emitted during runtime exceptions.'
      },
      {
        title: 'Refactoring Deprecated APIs',
        description: 'Finding every file and line where an old library function is invoked.'
      }
    ],
    workflowAndIntegrations: {
      leadText: 'Codebase Search powers Plan mode, Add Context, and Autonomous Agents:',
      connectedTools: [
        { name: 'Add Context', role: 'Autocomplete and search files to attach with @-mentions', slug: 'add-context' },
        { name: 'Plan Mode', role: 'Maps dependencies and affected files across the repo', slug: 'plan' },
        { name: 'Agents', role: 'Agents use Codebase Search to explore the repository autonomously', slug: 'agents' }
      ]
    },
    requirementsAndLimitations: {
      availabilityStatus: 'Available',
      authRequired: false,
      providerKeyRequired: false,
      environmentNotes: 'Text grep available offline; semantic vector search requires background workspace embedding generation.',
      knownLimitations: [
        'Binary and minified build bundles (e.g. dist/*, node_modules/*) are excluded by default to maintain speed.',
        'Initial semantic embedding indexing for 50,000+ files requires 1-2 minutes in the background on project open.'
      ]
    },
    faq: [
      {
        question: 'Does Codebase Search send my code to third-party vector databases?',
        answer: 'No. Local embeddings and ripgrep indexes are generated and stored locally in your workspace or encrypted user session.'
      },
      {
        question: 'Can I search using regular expressions?',
        answer: 'Yes. Fast Codebase Search fully supports regular expressions, case sensitivity flags, and whole-word matching.'
      },
      {
        question: 'Does search respect my .gitignore?',
        answer: 'Yes. Files and folders listed in .gitignore are automatically ignored to keep results clean and relevant.'
      },
      {
        question: 'How do agents use this feature?',
        answer: 'Autonomous agents invoke Codebase Search tools during their reasoning loop to locate relevant source files without reading the entire repository into memory.'
      }
    ],
    relatedFeatures: [
      { slug: 'add-context', title: 'Add Context', category: 'Tools', description: 'Attach discovered files to AI prompts.' },
      { slug: 'plan', title: 'Plan Mode', category: 'Lifecycle', description: 'Map dependencies before executing changes.' },
      { slug: 'multiple-models', title: 'Multiple Models', category: 'Intelligence', description: 'Use fast models to drive parallel search tasks.' }
    ]
  }
];
