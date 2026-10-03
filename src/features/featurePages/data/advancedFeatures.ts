import { FeatureDetail } from '../types';

export const advancedFeatures: FeatureDetail[] = [
  {
    slug: 'agents',
    title: 'Autonomous Agents',
    badgeCategory: 'Autonomous Execution',
    headline: 'Launch autonomous agents that turn ambitious ideas into verified code',
    introParagraph: 'Software engineering is an iterative loop: read code, write changes, run builds, fix errors, and verify diffs. FLOAT Autonomous Agents operate this full engineering loop—autonomously navigating files, running terminal tests, and resolving issues over minutes or hours while you retain supervisory control.',
    primaryAction: {
      label: 'Open Agent Workspace',
      href: '/',
      description: 'Start a session in FLOAT IDE with the autonomous agent active'
    },
    secondaryAction: {
      label: 'Explore all features',
      href: '/features'
    },
    mockupType: 'agents',
    whatItDoes: {
      overview: 'Autonomous Agents in FLOAT are multi-step AI systems equipped with tools to read files, write diffs, run terminal commands, and verify test output.',
      problemSolved: 'Replaces passive chatbot conversations with active task execution, allowing engineers to delegate full feature builds, bug fixes, and refactors.',
      targetAudience: 'Software engineers, startup founders, and technical teams looking to multiply their development velocity.',
      whenToUse: 'When implementing complex multi-file features, running regression investigations, or undertaking large library upgrades.',
      workflowFit: 'Select "Agent" in the Composer mode switcher. Describe your high-level goal and review proposed changes.'
    },
    howItWorks: [
      {
        stepNumber: 1,
        title: 'Goal Ingestion & Pre-Flight Checkpoint',
        developerAction: 'Provide task description (e.g. "Implement webhook retry queue with exponential backoff").',
        floatAction: 'Creates a safety checkpoint of current uncommitted files and initializes the agent reasoning loop.',
        involvedArtifacts: 'Task prompt, repository files, git working tree.',
        outputProduced: 'Timestamped checkpoint and initial step hypothesis.',
        inspectionAndApproval: 'Developer observes the agent start the execution sequence.'
      },
      {
        stepNumber: 2,
        title: 'Autonomous Observe-Plan-Act Loop',
        developerAction: 'Monitor streaming agent actions, file reads, and terminal executions.',
        floatAction: 'Iteratively inspects codebase, writes targeted code diffs, runs linters, and diagnoses any failures.',
        involvedArtifacts: 'AST parser, file mutation engine, terminal runner.',
        outputProduced: 'Real-time telemetry showing thoughts, file edits, and test results.',
        inspectionAndApproval: 'Developer can pause execution, modify constraints, or redirect the agent at any point.'
      },
      {
        stepNumber: 3,
        title: 'Comprehensive Review & Commit',
        developerAction: 'Review the cumulative diff across all modified files.',
        floatAction: 'Presents Monaco diff review with passing test confirmation and summary of completed actions.',
        involvedArtifacts: 'Monaco diff viewer, test logs.',
        outputProduced: 'Production-ready code and structured git commit.',
        inspectionAndApproval: 'Developer clicks "Accept All Changes" or rejects with feedback.'
      }
    ],
    practicalExample: {
      scenarioTitle: 'Autonomous implementation of an exponential backoff webhook retry system',
      problem: 'Webhook delivery fails intermittently without retry mechanisms, losing critical payment notifications.',
      developerPrompt: 'Implement an exponential backoff webhook retry system in src/server/webhooks.ts with tests',
      executionProcess: [
        'Agent reads existing webhook delivery logic in webhooks.ts.',
        'Implements exponential backoff with jitter and max retry bounds.',
        'Creates unit test suite in src/server/__tests__/webhooks.test.ts.',
        'Runs `npm test webhooks` in terminal; catches boundary bug and fixes it.',
        'Presents passing diff ready for human review.'
      ],
      codeOrDiffType: 'code',
      codeOrDiffSnippet: `// Autonomous Agent Execution Log:
[Thought] Need to implement retry with jitter: t_wait = min(max_wait, base * 2^attempt + jitter)
[Action] Edit src/server/webhooks.ts (+42 -8 lines)
[Action] Create src/server/__tests__/webhooks.test.ts (+85 lines)
[Action] Terminal: npm test webhooks
  ✓ attempts delivery on initial trigger
  ✓ retries after failure with backoff interval
  ✓ aborts after 5 failed attempts
[Agent] Task complete. 2 files modified, all 3 tests passing.`,
      verificationStep: 'Developer runs terminal tests and reviews side-by-side diff in Monaco Editor.'
    },
    keyCapabilities: [
      {
        name: 'Full Self-Correcting Execution Loop',
        description: 'Agents don\'t just write code; they run compilers and tests to verify and fix their own errors before showing you the result.',
        practicalBenefit: 'Significantly fewer syntax errors and broken imports reaching developer review.'
      },
      {
        name: 'Step & Time Limit Guards',
        description: 'Configurable step limits and execution budgets prevent runaway loops or infinite retries.',
        practicalBenefit: 'Predictable token spend and strict human oversight.'
      },
      {
        name: 'Pre-Execution Checkpoint Safety',
        description: 'Automatic snapshot before every agent session guarantees one-click rollback if you dislike the outcome.',
        practicalBenefit: 'Total peace of mind when letting agents touch multiple files.'
      }
    ],
    whenToUseScenarios: [
      {
        title: 'End-to-End Feature Scaffolding',
        description: 'Creating API endpoints, validation schemas, database models, and UI forms in one coordinated run.'
      },
      {
        title: 'Comprehensive Test Suite Generation',
        description: 'Writing thorough unit and integration test coverage for legacy untested code.'
      },
      {
        title: 'Library & Framework Upgrades',
        description: 'Upgrading deprecated APIs (e.g. React 18 to 19, Tailwind v3 to v4) across dozens of files.'
      }
    ],
    workflowAndIntegrations: {
      leadText: 'Autonomous Agents integrate with all core FLOAT tools:',
      connectedTools: [
        { name: 'Plan Mode', role: 'Generates structured step breakdown that agents execute', slug: 'plan' },
        { name: 'Terminal', role: 'Runs builds and test suites to verify agent code', slug: 'terminal' },
        { name: 'Git & Checkpoints', role: 'Creates rollback safety points before and after agent tasks', slug: 'git-checkpoints' },
        { name: 'Fast Codebase Search', role: 'Allows agents to search and locate relevant files autonomously', slug: 'codebase-search' }
      ]
    },
    requirementsAndLimitations: {
      availabilityStatus: 'Available',
      authRequired: true,
      providerKeyRequired: false,
      environmentNotes: 'Web agent runs in secured container; Desktop agent operates on your local project directory.',
      knownLimitations: [
        'Agent autonomy does not execute destructive system commands (e.g. rm -rf, drop database) without explicit approval.',
        'High-step tasks (>20 iterations) require active internet connection to stream provider tokens.'
      ]
    },
    faq: [
      {
        question: 'Can the agent delete files on my computer?',
        answer: 'FLOAT prompts for confirmation before any file deletion or irreversible destructive command.'
      },
      {
        question: 'What models power FLOAT Autonomous Agents?',
        answer: 'Agents are powered by high-reasoning frontier models such as Claude 3.7 Sonnet, OpenAI o3-mini/GPT-4o, and Gemini 2.5 Pro.'
      },
      {
        question: 'How do I stop an agent if it goes off-track?',
        answer: 'Click the "Stop" button in the composer or press Escape at any time to halt agent execution instantly.'
      },
      {
        question: 'Can agents work while I am away from my computer?',
        answer: 'Yes! Cloud agents can run in the background and notify you via Slack, GitHub, or mobile push notification when ready.'
      }
    ],
    relatedFeatures: [
      { slug: 'plan', title: 'Plan Mode', category: 'Lifecycle', description: 'Architectural planning before agent execution.' },
      { slug: 'terminal', title: 'Terminal', category: 'Tools', description: 'Command execution and test verification.' },
      { slug: 'git-checkpoints', title: 'Git & Checkpoints', category: 'Tools', description: 'Snapshot history with instant rollback.' }
    ]
  },
  {
    slug: 'model-routing',
    title: 'Model Selection & Routing',
    badgeCategory: 'Intelligence & Routing',
    headline: 'Intelligently route every task to the best frontier AI model',
    introParagraph: 'Different programming tasks demand different model strengths. Frontier reasoning models dominate complex architectural refactoring, while lightweight models provide instantaneous search and syntax completion. FLOAT Model Selection & Routing intelligently selects the optimal model based on task complexity, context size, and real benchmark scores.',
    primaryAction: {
      label: 'Explore Models & Benchmarks',
      href: '/models',
      description: 'View the live verified benchmark matrix across all models'
    },
    secondaryAction: {
      label: 'Explore all features',
      href: '/features'
    },
    mockupType: 'routing',
    whatItDoes: {
      overview: 'Model Routing is an algorithmic gateway in FLOAT that selects and directs tasks to frontier models from Google, Anthropic, OpenAI, and xAI.',
      problemSolved: 'Eliminates guesswork, prevents overpaying for simple queries, and protects developers from hitting rate limits or slow responses on complex tasks.',
      targetAudience: 'Engineers, team leads, and organizations seeking peak performance and cost-efficiency across multiple AI providers.',
      whenToUse: 'On every interaction: set to "Auto" for dynamic routing or manually pick specific models for specialized tasks.',
      workflowFit: 'Integrated directly into the bottom model selector in the Composer and configurable in team workspace settings.'
    },
    howItWorks: [
      {
        stepNumber: 1,
        title: 'Prompt Classification & Complexity Scoring',
        developerAction: 'Submit a prompt or task in the editor or composer.',
        floatAction: 'Analyzes prompt intent, estimated reasoning steps, token context size, and required capabilities (vision, tool calling, JSON schema).',
        involvedArtifacts: 'Prompt text, pinned attachments, model capability table.',
        outputProduced: 'Task classification vector (e.g. Deep Reasoning vs Quick Search).',
        inspectionAndApproval: 'Developer can lock the model selector if manual choice is preferred.'
      },
      {
        stepNumber: 2,
        title: 'Benchmark & Availability Matrix Evaluation',
        developerAction: 'Observe the active model badge in the chat header.',
        floatAction: 'Evaluates verified benchmark scores (SWE-bench, LiveCodeBench, MMLU-Pro) and real-time provider health to pick the best candidate.',
        involvedArtifacts: 'Verified model catalog, provider uptime monitors.',
        outputProduced: 'Selected model identifier with reason badge.',
        inspectionAndApproval: 'Displayed transparently: "Routed to Claude 3.7 Sonnet for multi-file refactor".'
      },
      {
        stepNumber: 3,
        title: 'Normalized Response Streaming',
        developerAction: 'Receive unified streaming code and tool outputs.',
        floatAction: 'Normalizes diverse provider API schemas into a unified, type-safe stream with token usage tracking.',
        involvedArtifacts: 'Provider adapter layer, Monaco streaming parser.',
        outputProduced: 'Consistent, high-quality code generation.',
        inspectionAndApproval: 'Developer inspects token usage and latency metrics in the dashboard.'
      }
    ],
    practicalExample: {
      scenarioTitle: 'Automatic routing of a dual-step request: large file search followed by deep algorithmic refactor',
      problem: 'Searching 40 files requires low latency, but refactoring state synchronization requires frontier reasoning.',
      developerPrompt: 'Find where user session tokens are parsed and refactor the token refresh logic to prevent race conditions',
      executionProcess: [
        'FLOAT routes search phase to Gemini 2.5 Flash (1M token context, 180 tokens/sec).',
        'Locates src/server/authMiddleware.ts and tokenStore.ts.',
        'Switches reasoning phase to Claude 3.7 Sonnet / Gemini 2.5 Pro for race-condition analysis.',
        'Produces verifiedMutex-wrapped refresh implementation.'
      ],
      codeOrDiffType: 'code',
      codeOrDiffSnippet: `// FLOAT Model Router Dispatch:
Phase 1: Codebase Search -> Gemini 2.5 Flash (Latency: 280ms, Context: 48,000 tokens)
Phase 2: Concurrency Refactor -> Claude 3.7 Sonnet (SWE-bench: 70.3%, Deep Reasoning)
---
Result: Mutex lock added to prevent simultaneous refresh requests.
Total latency: 3.4s (Saved 62% latency vs single deep model for both phases).`,
      verificationStep: 'Developer reviews token metrics and verifies smooth race-free token refresh.'
    },
    keyCapabilities: [
      {
        name: 'Verified Benchmark Grounding',
        description: 'Routing decisions are backed by empirical benchmark scores from SWE-bench Verified, HumanEval, and LiveCodeBench.',
        practicalBenefit: 'No marketing hype; models are selected based on real verified coding performance.'
      },
      {
        name: 'Zero Silent Downgrades',
        description: 'FLOAT never secretly routes an expensive model request to a lower-tier model without telling you.',
        practicalBenefit: 'Guaranteed quality and complete architectural honesty.'
      },
      {
        name: 'Multi-Provider Failover',
        description: 'If an upstream provider experiences an outage, FLOAT alerts you and offers one-click failover to an equivalent frontier model.',
        practicalBenefit: 'Uninterrupted development uptime even during third-party provider downtime.'
      }
    ],
    whenToUseScenarios: [
      {
        title: 'Optimizing Token Spend & Latency',
        description: 'Letting FLOAT automatically route routine queries to fast models and hard problems to frontier reasoners.'
      },
      {
        title: 'Multi-Model Team Preferences',
        description: 'Allowing team members to use Claude, GPT-4o, or Gemini based on personal preference under one company account.'
      },
      {
        title: 'Provider Outage Resilience',
        description: 'Seamlessly switching models without rewriting prompts or reconfiguring IDE extensions.'
      }
    ],
    workflowAndIntegrations: {
      leadText: 'Model Routing connects directly with Multiple Models and Evaluations in FLOAT:',
      connectedTools: [
        { name: 'Multiple Models', role: 'Orchestrates the selected models across parallel subagents', slug: 'multiple-models' },
        { name: 'Autonomous Agents', role: 'Routes agent subtasks to the most capable reasoning models', slug: 'agents' },
        { name: 'Fast Codebase Search', role: 'Utilizes high-throughput models for instantaneous codebase indexing', slug: 'codebase-search' }
      ]
    },
    requirementsAndLimitations: {
      availabilityStatus: 'Available',
      authRequired: true,
      providerKeyRequired: false,
      environmentNotes: 'Available across all FLOAT interfaces. Managed access included in FLOAT Pro/Enterprise; BYOK available on all plans.',
      knownLimitations: [
        'Fine-tuned or self-hosted local models (e.g. Ollama/vLLM) currently require desktop runner configuration.',
        'Model availability is subject to third-party provider API regional operational status.'
      ]
    },
    faq: [
      {
        question: 'What is the "Auto" model setting?',
        answer: 'Auto analyzes your prompt and workspace context to select the best model dynamically—saving you money on simple tasks and maximizing reasoning on complex engineering.'
      },
      {
        question: 'Can I force FLOAT to always use a specific model like Claude 3.7 Sonnet?',
        answer: 'Yes! You can lock any specific model from the dropdown at any time.'
      },
      {
        question: 'How does FLOAT track token usage?',
        answer: 'View granular per-model token consumption, request latency, and cost in the Usage Dashboard (/models/usage).'
      },
      {
        question: 'Are reasoning tokens included in model pricing?',
        answer: 'Yes. All pricing displayed in the model catalog reflects official provider pricing with zero hidden surcharges.'
      }
    ],
    relatedFeatures: [
      { slug: 'multiple-models', title: 'Multiple Models', category: 'Intelligence', description: 'Parallel subagents powered by diverse models.' },
      { slug: 'agents', title: 'Autonomous Agents', category: 'Execution', description: 'Autonomous agents powered by routed reasoning.' },
      { slug: 'enterprise', title: 'Enterprise Capabilities', category: 'Enterprise', description: 'Private VPC model routing and compliance controls.' }
    ]
  },
  {
    slug: 'enterprise',
    title: 'Enterprise Capabilities',
    badgeCategory: 'Enterprise & Security',
    headline: 'Scale AI-assisted engineering with bank-grade security and governance',
    introParagraph: 'Adopting AI across hundreds of developers requires rigorous data privacy, single sign-on, centralized audit logging, and strict intellectual property guarantees. FLOAT Enterprise gives engineering organizations the control, compliance, and dedicated infrastructure needed to deploy AI at scale.',
    primaryAction: {
      label: 'Explore Pricing & Plans',
      href: '/pricing',
      description: 'View Enterprise tier details and contact our solutions team'
    },
    secondaryAction: {
      label: 'Explore all features',
      href: '/features'
    },
    mockupType: 'enterprise',
    whatItDoes: {
      overview: 'FLOAT Enterprise is the governance, security, and administrative suite designed for organizations with strict compliance, security, and scale requirements.',
      problemSolved: 'Eliminates security concerns regarding proprietary source code leaks, unmanaged developer API keys, and unmonitored shadow AI adoption.',
      targetAudience: 'CTOs, CISOs, engineering leaders, and IT security teams managing dozens to thousands of developers.',
      whenToUse: 'When rolling out FLOAT across teams, enforcing SAML/SSO, auditing AI code generation, or requiring zero data retention.',
      workflowFit: 'Managed via the Enterprise Admin Portal with automated SCIM user provisioning and centralized billing.'
    },
    howItWorks: [
      {
        stepNumber: 1,
        title: 'Single Sign-On & SCIM Provisioning',
        developerAction: 'Log in with existing corporate identity provider (Okta, Azure AD, Google Workspace).',
        floatAction: 'Enforces SAML 2.0 / OIDC authentication, maps role-based group permissions, and provisions user seat via SCIM.',
        involvedArtifacts: 'SAML metadata, corporate identity provider, SCIM directory sync.',
        outputProduced: 'Authenticated enterprise session with organizational policies applied.',
        inspectionAndApproval: 'IT administrators manage access directly through corporate identity groups.'
      },
      {
        stepNumber: 2,
        title: 'Zero Data Retention & IP Indemnification',
        developerAction: 'Engineers author code with AI assistance across confidential repositories.',
        floatAction: 'Routes requests through enterprise zero-data-retention (ZDR) tunnels with strict contract guarantees against model training.',
        involvedArtifacts: 'Zero-retention API endpoints, end-to-end encryption.',
        outputProduced: 'Secure code generation with complete IP ownership retained by customer.',
        inspectionAndApproval: 'Legal and security teams review compliance certifications (SOC 2, ISO 27001).'
      },
      {
        stepNumber: 3,
        title: 'Audit Logging & Centralized Telemetry',
        developerAction: 'Administrators inspect team usage, security events, and compliance metrics.',
        floatAction: 'Streams comprehensive audit logs (SIEM export via Splunk, Datadog) recording user actions, models accessed, and IP addresses.',
        involvedArtifacts: 'SIEM webhook stream, admin compliance dashboard.',
        outputProduced: 'Real-time observability into organizational AI adoption.',
        inspectionAndApproval: 'Security teams audit access logs for regulatory compliance.'
      }
    ],
    practicalExample: {
      scenarioTitle: 'Enforcing zero data retention and secret scanning across 500 corporate repositories',
      problem: 'Enterprise policy prohibits source code from being used for AI training or stored outside company-approved boundaries.',
      developerPrompt: 'Enterprise Policy: "Enforce zero retention on all developer prompts and auto-redact proprietary tokens"',
      executionProcess: [
        'FLOAT Enterprise proxy intercepts all outbound model payloads.',
        'Runs client-side secret scanner to redact internal AWS keys, database passwords, and PII.',
        'Transmits over Zero Data Retention (ZDR) enterprise agreement endpoints.',
        'Logs event hash to corporate Datadog SIEM for compliance audit.'
      ],
      codeOrDiffType: 'code',
      codeOrDiffSnippet: `// FLOAT Enterprise Security Gateway Log:
[Audit] User: alex@enterprise-corp.com
[Policy Check] SAML Session: Valid (Okta MFA verified)
[Secret Scanner] Redacted 1 detected credential: AWS_SECRET_ACCESS_KEY -> [REDACTED_BY_ENTERPRISE_GATEWAY]
[Provider Route] Dedicated ZDR Enterprise Tunnel (Zero Data Retention)
[Compliance Status] SOC 2 Type II / ISO 27001 verified. Model training: NEVER.`,
      verificationStep: 'Compliance team verifies audit record in corporate SIEM dashboard.'
    },
    keyCapabilities: [
      {
        name: 'Zero Data Retention (ZDR)',
        description: 'Contractually guaranteed zero data retention. Your code and prompts are never stored, logged, or used to train public or private models.',
        practicalBenefit: 'Complete intellectual property protection for proprietary enterprise software.'
      },
      {
        name: 'SAML 2.0 / OIDC & SCIM Sync',
        description: 'Integrate with Okta, Microsoft Entra ID (Azure AD), Ping, or Google Workspace for centralized user lifecycle management.',
        practicalBenefit: 'Immediate onboarding and automated revocation when employees leave the company.'
      },
      {
        name: 'SOC 2 Type II & ISO 27001 Certified',
        description: 'Independently audited and certified against rigorous global security, availability, and confidentiality standards.',
        practicalBenefit: 'Meets the stringent security requirements of banks, healthcare providers, and government agencies.'
      }
    ],
    whenToUseScenarios: [
      {
        title: 'Company-Wide AI Rollouts',
        description: 'Equipping hundreds or thousands of engineers with unified billing, governance, and admin controls.'
      },
      {
        title: 'Regulated Industry Compliance',
        description: 'Developing healthcare, financial, or defense applications subject to strict regulatory oversight.'
      },
      {
        title: 'Self-Hosted VPC Deployments',
        description: 'Running FLOAT on dedicated private cloud instances isolated from the public internet.'
      }
    ],
    workflowAndIntegrations: {
      leadText: 'Enterprise Capabilities oversee all developer workflows in FLOAT:',
      connectedTools: [
        { name: 'Model Routing', role: 'Enforces approved model providers and private VPC endpoints', slug: 'model-routing' },
        { name: 'Team Rules', role: 'Enforces company-wide security standards across all repositories', slug: 'team-rules' },
        { name: 'Plugins', role: 'Controls allowed third-party extensions and plugin permissions', slug: 'plugins' }
      ]
    },
    requirementsAndLimitations: {
      availabilityStatus: 'Available',
      authRequired: true,
      providerKeyRequired: false,
      environmentNotes: 'Available on FLOAT Enterprise tier. Supports cloud multi-tenant ZDR or dedicated private VPC deployment.',
      knownLimitations: [
        'SAML/SSO configuration requires Enterprise organization setup by an account administrator.',
        'Dedicated private cloud instances require coordination with the FLOAT enterprise infrastructure team.'
      ]
    },
    faq: [
      {
        question: 'Will our proprietary code ever be used to train AI models?',
        answer: 'Never. FLOAT Enterprise agreements strictly prohibit model training on customer data, backed by contractual Zero Data Retention terms.'
      },
      {
        question: 'Can we run FLOAT entirely inside our own AWS or GCP VPC?',
        answer: 'Yes. FLOAT Enterprise offers dedicated VPC deployments and self-hosted machine runners for maximum data isolation.'
      },
      {
        question: 'Can we restrict which AI models our engineers are allowed to use?',
        answer: 'Yes. Administrators can selectively enable or disable specific models (e.g. allow only Anthropic or only Gemini) from the admin console.'
      },
      {
        question: 'How do we request a security review or SOC 2 report?',
        answer: 'Contact our solutions team via the Enterprise page or email security@float.dev to receive our SOC 2 Type II report and security whitepaper under NDA.'
      }
    ],
    relatedFeatures: [
      { slug: 'model-routing', title: 'Model Selection & Routing', category: 'Intelligence', description: 'Centralized model routing and usage tracking.' },
      { slug: 'team-rules', title: 'Team Rules', category: 'Governance', description: 'Enforce team coding and security conventions.' },
      { slug: 'agents', title: 'Autonomous Agents', category: 'Execution', description: 'Autonomous agents operating under enterprise compliance.' }
    ]
  }
];
