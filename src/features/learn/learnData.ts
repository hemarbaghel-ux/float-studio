export interface LearnSection {
  id: string;
  heading: string;
  content: string;
  codeSnippet?: {
    language: string;
    filename?: string;
    code: string;
  };
  callout?: {
    type: 'note' | 'tip' | 'warning' | 'insight';
    title: string;
    text: string;
  };
}

export interface LearnArticle {
  slug: string;
  title: string;
  subtitle: string;
  category: 'Foundations' | 'Deep Dives' | 'Engineering & Security' | 'Hands-on Tutorials' | 'Reference';
  readTime: string;
  level: 'Foundational' | 'Intermediate' | 'Advanced';
  updatedAt: string;
  summary: string;
  isTutorial?: boolean;
  sections: LearnSection[];
  keyTakeaways: string[];
  prerequisites?: string[];
  nextSlug?: string;
  prevSlug?: string;
}

export interface GlossaryTerm {
  term: string;
  slug: string;
  letter: string;
  category: string;
  definition: string;
  explanation: string;
  exampleSnippet?: string;
  relatedSlugs: string[];
}

export const LEARN_CATEGORIES = [
  { id: 'all', label: 'All Topics' },
  { id: 'foundations', label: 'Foundations' },
  { id: 'deep-dives', label: 'Deep Dives' },
  { id: 'engineering', label: 'Engineering & Security' },
  { id: 'tutorials', label: 'Tutorials' },
  { id: 'reference', label: 'Reference & Glossary' },
] as const;

export const START_HERE_ARTICLES = [
  {
    slug: 'agentic-development',
    title: 'Agentic Development',
    description: 'Understand how autonomous loops observe, plan, execute tools, and verify diffs instead of passive text completion.',
    icon: 'Bot',
    readTime: '8 min read',
    level: 'Foundational',
    href: '/learn/agentic-development'
  },
  {
    slug: 'getting-started',
    title: 'Getting Started with FLOAT',
    description: 'Explore the workspace layout, Monaco editor, mode selector (Ask, Plan, Edit, Agent), and project creation.',
    icon: 'Compass',
    readTime: '6 min read',
    level: 'Foundational',
    href: '/learn/getting-started'
  },
  {
    slug: 'tutorials/build-your-first-agent',
    title: 'Your First AI Agent',
    description: 'Walk through creating an operational agent with scoped tool permissions, step budgets, and verification checks.',
    icon: 'Sparkles',
    readTime: '12 min read',
    level: 'Intermediate',
    href: '/learn/tutorials/build-your-first-agent'
  },
  {
    slug: 'context-and-codebase',
    title: 'Working with Codebase Context',
    description: 'Master semantic indexing, @-mentions, symbol references, and managing token budgets in multi-file projects.',
    icon: 'Code2',
    readTime: '8 min read',
    level: 'Intermediate',
    href: '/learn/context-and-codebase'
  }
];

export const LEARN_ARTICLES: Record<string, LearnArticle> = {
  'agentic-development': {
    slug: 'agentic-development',
    title: 'Agentic Development Fundamentals',
    subtitle: 'From Static Code Prompts to Autonomous Software Engineering',
    category: 'Foundations',
    readTime: '8 min read',
    level: 'Foundational',
    updatedAt: 'March 2026',
    summary: 'Explore the fundamental shift in software engineering: moving away from reactive code autocomplete toward proactive, multi-step agentic systems that perceive, plan, act with real tools, and verify their own output.',
    nextSlug: 'getting-started',
    keyTakeaways: [
      'Agentic development replaces single-turn autocomplete with closed-loop reasoning and action cycles.',
      'Autonomous loops must always maintain human review checkpoints for destructive and architectural actions.',
      'Diff-driven development ensures transparent verification before changes are written to disk.',
      'A true agent observes feedback from tools (compilers, linters, tests) to correct its own errors.'
    ],
    sections: [
      {
        id: 'paradigm-shift',
        heading: 'The Paradigm Shift: Autocomplete vs. Agentic Systems',
        content: `Traditional AI coding assistants function as sophisticated predictive text engines. When a developer pauses typing, the model predicts the next statistically probable tokens. While helpful for boilerplate, this model is fundamentally passive: it cannot inspect test logs, navigate directory trees, or correct compilation failures.

Agentic development inverts this dynamic. An agent is given an objective—such as "Refactor the authentication provider to support OAuth2 refresh tokens"—and executes a continuous reasoning cycle:

1. **Perception**: It reads existing configuration files, types, and route handlers.
2. **Planning**: It breaks the objective into ordered, verifiable subtasks.
3. **Tool Execution**: It runs queries, checks git status, and proposes edits.
4. **Self-Correction**: It observes compiler or test output, identifies regressions, and resolves them autonomously.`,
        callout: {
          type: 'insight',
          title: 'The Closed-Loop Difference',
          text: 'Passive LLMs operate open-loop: input prompt → output text. Agentic systems operate closed-loop: prompt → action → observation → reflection → iteration until verified.'
        }
      },
      {
        id: 'react-loop',
        heading: 'The ReAct Loop in Code: Reason + Act',
        content: `At the architectural heart of FLOAT agents is the ReAct (Reasoning and Acting) paradigm. Rather than hallucinating a massive monolithic code block, the agent alternates between explicit thought steps and concrete tool invocations:

- **Thought**: The agent articulates its understanding of the current state and decides the next smallest action.
- **Action**: The agent issues a structured tool call (e.g. \`view_file\`, \`run_command\`, \`edit_file\`).
- **Observation**: The runtime executes the tool in a sandbox and returns the real result (file lines, compiler errors, test logs).
- **Reflection**: The agent assesses whether the action succeeded or created an unexpected failure.`,
        codeSnippet: {
          language: 'typescript',
          filename: 'agent-loop-conceptual.ts',
          code: `async function executeAgentLoop(task: Task, context: CodebaseContext): Promise<RunResult> {
  const history: Turn[] = [{ role: 'user', content: task.prompt }];
  
  while (!task.isCompleted && task.stepCount < task.stepBudget) {
    // 1. Model produces thought and structured tool call
    const decision = await router.generateDecision(history, availableTools);
    
    if (decision.type === 'FINAL_ANSWER') {
      return { status: 'SUCCESS', summary: decision.content };
    }

    // 2. Validate tool permissions & arguments
    const validatedCall = validateToolCall(decision.toolCall, task.scope);
    
    // 3. Execute in sandboxed environment
    const observation = await executeTool(validatedCall);
    
    // 4. Feed ground truth back into context for next cycle
    history.push({ role: 'assistant', content: decision.thought, toolCall: validatedCall });
    history.push({ role: 'tool', content: observation });
    
    task.stepCount++;
  }
}`
        }
      },
      {
        id: 'human-in-the-loop',
        heading: 'Human-in-the-Loop & The Autonomy Slider',
        content: `Full autonomy without boundary controls is dangerous in enterprise codebases. FLOAT implements a strict "Autonomy Slider" model:

- **Ask Mode**: Read-only exploration. The agent answers architectural questions and traces dependencies without modifying code.
- **Plan Mode**: The agent produces structured, dependency-ordered specifications with acceptance criteria for your review before touching a single file.
- **Edit Mode**: Focused inline transformations with side-by-side Monaco diff inspection.
- **Agent Mode**: Multi-step autonomous task execution with mandatory human approval gates for critical operations (e.g. database schema migrations, credential updates, or production deployments).`,
        callout: {
          type: 'warning',
          title: 'Preserve Human Review for Consequential Changes',
          text: 'Never let an agent apply code changes without diff review. FLOAT surfaces every modification in an explicit diff viewer where you can accept, reject, or request adjustments.'
        }
      },
      {
        id: 'diff-driven-development',
        heading: 'Diff-Driven Development: The Foundation of Trust',
        content: `When developers collaborate with other humans, they do not simply replace entire files; they create pull requests and inspect diffs. FLOAT treats AI agents the same way.

Proposed changes are calculated as unified diffs against the current working checkpoint. This guarantees:
- **Zero Accidental Overwrites**: Changes outside the requested scope are immediately visible.
- **Verifiable Syntax**: Proposed patches must compile cleanly in the editor before acceptance.
- **Immediate Rollback**: If a change fails testing, FLOAT allows 1-click rollback to the prior checkpoint.`
      }
    ]
  },

  'getting-started': {
    slug: 'getting-started',
    title: 'Getting Started with FLOAT',
    subtitle: 'Navigating the Workspace, Editor, AI Panel, and Modes',
    category: 'Foundations',
    readTime: '6 min read',
    level: 'Foundational',
    updatedAt: 'March 2026',
    summary: 'A complete practical guide to the FLOAT workspace. Learn how the Monaco editor, file tree, activity bar, and AI interaction modes work harmoniously together.',
    prevSlug: 'agentic-development',
    nextSlug: 'agents',
    keyTakeaways: [
      'FLOAT uses Monaco Editor for full VS Code keybinding, syntax highlighting, and language services.',
      'The AI panel supports four distinct modes: Ask, Plan, Edit, and Agent.',
      'Active editor tabs automatically provide file context to the AI model.',
      'All user-owned projects and code states are securely persisted in Cloud Firestore.'
    ],
    sections: [
      {
        id: 'workspace-overview',
        heading: 'FLOAT Workspace Anatomy',
        content: `The FLOAT workspace is designed for speed and clarity. It consists of four integrated panels:

- **Activity Bar (Left)**: Quick switches between File Explorer, Search, Source Control (Git), Problems, and Extension Integrations.
- **File Explorer & Tabs**: Browse and organize project files. Click any file to open it in an editor tab.
- **Monaco Code Editor (Center)**: The industrial-standard editor powering syntax highlighting, IntelliSense, error markers, and multi-file tabs.
- **AI Workspace Panel (Right)**: The primary command center for interacting with your AI agent, selecting models, and reviewing proposed diffs.`
      },
      {
        id: 'mode-selection',
        heading: 'Choosing the Right Mode: Ask, Plan, Edit, Agent',
        content: `Rather than a one-size-fits-all chatbot, FLOAT provides specialized operational modes:

- **Ask**: Use when you need to understand existing code, query algorithms, or trace API contracts. It is guaranteed read-only.
- **Plan**: Use before undertaking complex features. The model asks clarifying questions and creates a numbered task breakdown.
- **Edit**: Trigger with \`Cmd+K\` (or \`Ctrl+K\` on Windows) directly within the editor to transform selected lines.
- **Agent**: Use for end-to-end tasks like "Implement user password reset with email verification and unit tests."`,
        codeSnippet: {
          language: 'markdown',
          filename: 'mode-comparison.md',
          code: `| Mode    | Can Edit Files? | Steps Limit | Best For                                    |
|---------|-----------------|-------------|---------------------------------------------|
| Ask     | No              | 1 turn      | Codebase queries, explaining algorithms     |
| Plan    | No              | 1-3 turns   | Architectural specs, dependency analysis    |
| Edit    | Yes (Single)    | 1 turn      | Targeted refactors, inline fixes            |
| Agent   | Yes (Multi)     | Multi-step  | End-to-end feature builds, bug repair loops |`
        }
      },
      {
        id: 'keyboard-shortcuts',
        heading: 'Essential Keyboard Shortcuts',
        content: `Keep your hands on the keyboard for maximum flow state:
- \`Cmd + K\` / \`Ctrl + K\`: Open inline AI edit on current selection
- \`Cmd + L\` / \`Ctrl + L\`: Focus the AI chat panel
- \`Cmd + P\` / \`Ctrl + P\`: Quick file search palette
- \`Cmd + B\` / \`Ctrl + B\`: Toggle file explorer sidebar
- \`Shift + Cmd + M\`: Open Problems and compiler diagnostics view`
      }
    ]
  },

  'agents': {
    slug: 'agents',
    title: 'AI Agents & Roles in FLOAT',
    subtitle: 'Main Agent, Planner, Explorer, Coder, and Reviewer Specializations',
    category: 'Foundations',
    readTime: '7 min read',
    level: 'Intermediate',
    updatedAt: 'March 2026',
    summary: 'Discover FLOAT’s specialized agent architecture. Learn how constraining an agent’s role, tools, and step budgets prevents scope creep and delivers reliable, deterministic code changes.',
    prevSlug: 'getting-started',
    nextSlug: 'agent-workflows',
    keyTakeaways: [
      'Single general-purpose agents often suffer from prompt drift and hallucinated side-effects.',
      'Role specialization limits tool privileges and enforces clear responsibility boundaries.',
      'The Reviewer Agent acts as an objective quality gate before changes are merged.',
      'Step budgets and token caps prevent infinite loops and runaway costs.'
    ],
    sections: [
      {
        id: 'why-specialized-agents',
        heading: 'Why Specialized Roles Outperform Generic Bots',
        content: `When a single AI agent is responsible for planning, coding, reviewing, and testing simultaneously, it easily falls into cognitive traps: it accepts its own faulty assumptions, skips edge-case validation, and drifts away from initial requirements.

FLOAT structures agentic work around distinct specialized personas:
1. **Planner Agent**: Analyzes requirements, checks codebase dependencies, and produces structured checklists. Cannot write file modifications directly.
2. **Explorer Agent**: Navigates large repos, builds symbol graphs, and identifies relevant call sites.
3. **Coder Agent**: Focused strictly on implementing code changes against approved specifications.
4. **Debugger Agent**: Ingests error logs, stack traces, and failing tests to isolate root causes.
5. **Reviewer Agent**: Conducts adversarial code reviews, checking security vulnerabilities, type cleanliness, and performance regressions.`
      },
      {
        id: 'tool-permissions',
        heading: 'Role-Based Tool Permissions',
        content: `Each agent receives only the tools required for its mission. For example, an Explorer Agent has access to search and view tools, but has zero write permissions:`,
        codeSnippet: {
          language: 'typescript',
          filename: 'agent-role-definition.ts',
          code: `export interface AgentRoleConfig {
  id: 'planner' | 'explorer' | 'coder' | 'reviewer';
  displayName: string;
  allowedTools: Array<'view_file' | 'list_dir' | 'edit_file' | 'run_command' | 'search_code'>;
  maxStepBudget: number;
  temperature: number;
  systemPrompt: string;
}

export const REVIEWER_AGENT: AgentRoleConfig = {
  id: 'reviewer',
  displayName: 'Reviewer Agent',
  allowedTools: ['view_file', 'list_dir', 'search_code'], // Read-only!
  maxStepBudget: 5,
  temperature: 0.1, // Near deterministic
  systemPrompt: 'You are an adversarial code reviewer. Identify bugs, type safety holes, and security risks.'
};`
        }
      }
    ]
  },

  'agent-workflows': {
    slug: 'agent-workflows',
    title: 'Agent Workflows & Lifecycles',
    subtitle: 'Task Scoping, Multi-Step Execution, Checkpoints, and Safe Rollback',
    category: 'Foundations',
    readTime: '9 min read',
    level: 'Intermediate',
    updatedAt: 'March 2026',
    summary: 'Follow the lifecycle of an agentic run from the initial user prompt through multi-file diff generation, verification, checkpoint management, and rollback mechanisms.',
    prevSlug: 'agents',
    nextSlug: 'prompting',
    keyTakeaways: [
      'Always establish a clean checkpoint before initiating a multi-step agent run.',
      'Small, focused steps with intermediate verification prevent cascading failures.',
      'Checkpoints allow instant rollback if tests or linters fail.',
      'Every applied change leaves an audit trail in source control.'
    ],
    sections: [
      {
        id: 'execution-lifecycle',
        heading: 'The 5-Phase Agent Execution Lifecycle',
        content: `Every agentic task in FLOAT follows a deterministic lifecycle:

1. **Pre-flight & Checkpointing**: The system captures the current file state. If an existing unsaved change exists, the user is prompted to stash or commit.
2. **Context Assembly**: Active tabs, relevant symbols, and error diagnostics are packed into the prompt payload within token limits.
3. **Iterative Step Execution**: The agent calls allowed tools, inspecting outputs turn-by-turn.
4. **Verification**: Compiler (\`tsc\`) and linter checks run automatically against proposed changes.
5. **Diff Presentation & Acceptance**: The user reviews the unified diff in Monaco. Acceptance writes to disk; rejection rolls back cleanly.`
      }
    ]
  },

  'prompting': {
    slug: 'prompting',
    title: 'High-Precision Prompting for Code Agents',
    subtitle: 'Directing Autonomous Agents with Intent, Constraints, and Examples',
    category: 'Deep Dives',
    readTime: '6 min read',
    level: 'Foundational',
    updatedAt: 'March 2026',
    summary: 'Learn practical patterns for communicating with AI code agents. Discover how providing concrete constraints, file references, and expected output formats eliminates hallucinations.',
    prevSlug: 'agent-workflows',
    nextSlug: 'context-and-codebase',
    keyTakeaways: [
      'Specify what NOT to touch just as clearly as what you want changed.',
      'Reference specific files using @-mentions to anchor model attention.',
      'Include expected test cases or error messages in your prompt.',
      'Break massive tasks into 2-3 logical milestones rather than one colossal instruction.'
    ],
    sections: [
      {
        id: 'anatomy-of-good-prompt',
        heading: 'The Anatomy of a High-Precision Agent Prompt',
        content: `Vague prompts yield vague code. High-performing agent prompts typically contain four core ingredients:

1. **Concrete Objective**: What functionality must exist when this turn finishes?
2. **Target Files**: Explicitly mention the components or endpoints involved.
3. **Architectural Constraints**: Library versions, style rules, or forbidden dependencies.
4. **Verification Criteria**: How will the agent (and you) know the task succeeded?`,
        codeSnippet: {
          language: 'markdown',
          filename: 'prompt-example.md',
          code: `### ❌ Low-Signal Prompt
"Fix the login bug and make it better."

### ✅ High-Precision Prompt
"Investigate why sign-in fails when users have an empty profile photo in @src/features/auth/LoginPage.tsx.

Constraints:
- Do not modify @src/store/authStore.ts.
- Provide a fallback avatar SVG if photoURL is undefined or null.
- Ensure TypeScript passes with no 'any' types.
- Verify by running 'npm run lint'."`
        }
      }
    ]
  },

  'context-and-codebase': {
    slug: 'context-and-codebase',
    title: 'Codebase Context & Semantic Indexing',
    subtitle: 'Context Windows, Embeddings, File Mentions, and Token Budget Management',
    category: 'Deep Dives',
    readTime: '8 min read',
    level: 'Intermediate',
    updatedAt: 'March 2026',
    summary: 'Master how FLOAT indexes repositories, extracts AST symbol definitions, prioritizes relevant files, and maximizes effective context window utilization without blowing token budgets.',
    prevSlug: 'prompting',
    nextSlug: 'models',
    keyTakeaways: [
      'Modern LLMs have large context windows, but prompt bloat degrades reasoning speed and precision.',
      'AST-based symbol extraction provides higher signal-to-noise ratio than raw chunk embeddings.',
      'Explicit @-file mentions ensure the model reads authoritative code directly.',
      'FLOAT truncates irrelevant node_modules and build artifacts automatically.'
    ],
    sections: [
      {
        id: 'indexing-strategy',
        heading: 'How FLOAT Understands Your Repository',
        content: `A real-world repository contains thousands of files and millions of tokens. Dumping an entire codebase into an LLM context window causes severe reasoning degradation ("needle-in-a-haystack" fatigue) and prohibitive latency.

FLOAT solves this using multi-tiered context assembly:
1. **Active Working Set**: Files currently open in Monaco tabs are prioritized at full fidelity.
2. **AST Symbol Indexing**: TypeScript/JavaScript files are parsed to extract exported interfaces, functions, and types.
3. **Deterministic References**: When you type \`@components/FloatLogo.tsx\`, the exact file contents are injected into the active prompt frame.
4. **Automated Exclusion**: Directories like \`node_modules\`, \`dist\`, \`coverage\`, and \`.git\` are excluded from context ingestion.`
      }
    ]
  },

  'models': {
    slug: 'models',
    title: 'Selecting and Routing Models for Agentic Tasks',
    subtitle: 'Gemini 2.5 Flash, GPT-4o, Claude 3.7 Sonnet, and Smart Provider Routing',
    category: 'Deep Dives',
    readTime: '7 min read',
    level: 'Intermediate',
    updatedAt: 'March 2026',
    summary: 'Compare leading frontier models for code generation, multi-step tool calling, reasoning latency, and cost efficiency. Understand FLOAT’s multi-provider routing architecture.',
    prevSlug: 'context-and-codebase',
    nextSlug: 'tools-and-integrations',
    keyTakeaways: [
      'Gemini models offer massive context windows and near-instant latency for exploratory tasks.',
      'Claude 3.7 Sonnet excels at nuanced architectural refactoring and strict instruction adherence.',
      'FLOAT enforces explicit model availability: unsupported models never silently fall back.',
      'Token consumption and latency metrics are tracked transparently in the Usage Dashboard.'
    ],
    sections: [
      {
        id: 'model-tradeoffs',
        heading: 'Model Matrix: Capabilities and Best Fit',
        content: `Choosing the right model depends on the nature of your engineering task:

- **Gemini 2.5 / Flash**: Ultra-fast iteration, broad multi-modal input, and million-token context windows. Ideal for repository-wide symbol searching and rapid inline edits.
- **Claude 3.7 Sonnet / 3.5 Sonnet**: Industry-leading multi-turn agentic coding benchmarks. High fidelity when executing complex multi-file diffs without syntax errors.
- **GPT-4o**: Reliable reasoning and robust tool-calling compliance across standard REST and TypeScript tool interfaces.`
      }
    ]
  },

  'tools-and-integrations': {
    slug: 'tools-and-integrations',
    title: 'Tools, Sandboxed Execution & Integrations',
    subtitle: 'File Read/Write, Sandboxed Terminal, Git State, and External APIs',
    category: 'Deep Dives',
    readTime: '8 min read',
    level: 'Advanced',
    updatedAt: 'March 2026',
    summary: 'A deep architectural dive into agent tools: JSON schemas, argument sanitization, sandboxed shell execution, and bidirectional integrations with GitHub and developer services.',
    prevSlug: 'models',
    nextSlug: 'testing-and-evals',
    keyTakeaways: [
      'Tools are the agent’s hands: without them, an LLM is merely a passive text generator.',
      'All tool arguments must undergo rigorous server-side validation against injection attacks.',
      'Filesystem operations must be constrained within the authorized project directory boundary.',
      'Terminal execution requires isolation, timeouts, and resource quotas.'
    ],
    sections: [
      {
        id: 'tool-schemas',
        heading: 'Tool Calling Architecture',
        content: `FLOAT agents do not execute arbitrary shell commands directly. Instead, they produce structured tool call invocations defined via strict JSON Schema.

Each invocation is intercepted by the server runtime, validated against project ownership and permission boundaries, executed, and returned as a structured observation.`
      }
    ]
  },

  'testing-and-evals': {
    slug: 'testing-and-evals',
    title: 'Testing, Evals & Automated Quality Benchmarks',
    subtitle: 'Evaluating AI-Generated Code and Running SWE-Bench Style Tasks',
    category: 'Engineering & Security',
    readTime: '8 min read',
    level: 'Advanced',
    updatedAt: 'March 2026',
    summary: 'Learn how to verify AI-generated code systematically. Discover FLOAT’s built-in evaluation harness, benchmark suites, and regression testing pipelines.',
    prevSlug: 'tools-and-integrations',
    nextSlug: 'security-and-privacy',
    keyTakeaways: [
      'Never trust generated code without automated testing.',
      'FLOAT includes an Evals engine to benchmark models on realistic coding tasks.',
      'Unit test generation should accompany every agentic feature build.',
      'Standardized tasks (like SWE-bench) measure pass@1 accuracy across model versions.'
    ],
    sections: [
      {
        id: 'float-eval-system',
        heading: 'FLOAT’s Built-in Evaluation Harness',
        content: `Under \`/models/evals\`, FLOAT provides an operational evaluation runner that executes standardized programming challenges against supported models.

Each evaluation measures:
- **Correctness**: Did the proposed patch pass unit and integration test assertions?
- **Speed**: Time to complete reasoning and tool execution cycles.
- **Cost**: Total prompt and completion token expenditure.
- **Diff Cleanliness**: Were only necessary lines modified, or did the model introduce gratuitous refactoring?`
      }
    ]
  },

  'security-and-privacy': {
    slug: 'security-and-privacy',
    title: 'Security, Authorization & Privacy in Agentic Workflows',
    subtitle: 'Token Boundaries, Secret Protection, and Sandboxed Execution Limits',
    category: 'Engineering & Security',
    readTime: '7 min read',
    level: 'Advanced',
    updatedAt: 'March 2026',
    summary: 'Critical security practices for AI developer platforms. How FLOAT protects private keys, enforces Firebase Firestore user-level authorization, and prevents prompt injection.',
    prevSlug: 'testing-and-evals',
    nextSlug: 'automation',
    keyTakeaways: [
      'Provider API keys must live strictly on the server; never expose secrets to frontend bundles.',
      'Firebase Auth tokens must be validated on every API route.',
      'User data must be isolated in Firestore with strictly enforced security rules.',
      'Agents must never have access to raw administrative credentials or private service accounts.'
    ],
    sections: [
      {
        id: 'secrets-management',
        heading: 'Server-Side Secret Isolation',
        content: `A fundamental rule of FLOAT architecture: credentials, provider API keys, and service tokens are kept exclusively in server environment variables.

Frontend code communicates with LLMs through authenticated proxy routes (\`/api/ai/*\`). When an agent needs to execute a tool, the server checks the user's verified Firebase auth token before delegating the action.`
      }
    ]
  },

  'automation': {
    slug: 'automation',
    title: 'Automations, Triggers & Background Agents',
    subtitle: 'Scheduled Code Maintenance, Webhook Handlers, and Autonomous CI Fixers',
    category: 'Engineering & Security',
    readTime: '7 min read',
    level: 'Intermediate',
    updatedAt: 'March 2026',
    summary: 'How to configure background developer automations in FLOAT: automated dependency updates, recurring security audits, and webhook-triggered pull request reviewers.',
    prevSlug: 'security-and-privacy',
    nextSlug: 'best-practices',
    keyTakeaways: [
      'Automations run repeatable workflows on schedules or event triggers (e.g. GitHub webhooks).',
      'Always set explicit execution budgets and timeout guards on background tasks.',
      'Automations should open draft PRs rather than pushing directly to main.',
      'Alerting and error notifications keep developers informed of background runs.'
    ],
    sections: [
      {
        id: 'automation-types',
        heading: 'Core Automation Patterns',
        content: `FLOAT Automations allow developers to offload repetitive hygiene tasks:
- **Nightly Linter/Dep Upgrades**: Automatically create PRs resolving deprecated methods.
- **Webhook Bug Responder**: Trigger an investigation agent when Sentry captures a production crash.
- **PR Code Reviewer**: Run static analysis and style guide audits on incoming developer branches.`
      }
    ]
  },

  'best-practices': {
    slug: 'best-practices',
    title: 'Production Best Practices for Engineering with AI',
    subtitle: 'The Core Principles of Professional Agentic Development',
    category: 'Engineering & Security',
    readTime: '6 min read',
    level: 'Foundational',
    updatedAt: 'March 2026',
    summary: 'A curated set of battle-tested rules for working efficiently with AI coding agents: atomic changes, verified testing, intentional checkpointing, and clean communication.',
    prevSlug: 'automation',
    nextSlug: 'tutorials/build-your-first-agent',
    keyTakeaways: [
      'Keep individual agent tasks focused on a single verifiable objective.',
      'Review diffs before clicking accept—never let changes slip into your codebase unverified.',
      'Establish test suites before asking an agent to refactor complex logic.',
      'Document project conventions in explicit guidelines or README files for the agent to read.'
    ],
    sections: [
      {
        id: 'ten-commandments',
        heading: 'The 7 Principles of Agentic Development in FLOAT',
        content: `1. **Inspect Before Editing**: Always verify existing code state rather than assuming previous conversation memory.
2. **Small, Atomic Steps**: Break large refactors into small verifiable increments.
3. **Preserve What Works**: Never rewrite functioning architecture to add a localized feature.
4. **Explicit Verification**: Run \`npm run lint\` and \`compile_applet\` after every change sequence.
5. **No Speculative Implementations**: If an API or SDK behavior is uncertain, verify it directly against package exports.
6. **Diff Transparency**: Treat AI changes with the same scrutiny as an external pull request.
7. **Clean Separation of Concerns**: Keep frontend UI decoupled from backend business logic.`
      }
    ]
  },

  // Tutorials
  'tutorials/build-your-first-agent': {
    slug: 'tutorials/build-your-first-agent',
    title: 'Build Your First AI Agent in FLOAT',
    subtitle: 'Step-by-Step Hands-on Guide to Configured Autonomy',
    category: 'Hands-on Tutorials',
    readTime: '12 min read',
    level: 'Intermediate',
    updatedAt: 'March 2026',
    isTutorial: true,
    summary: 'Follow this complete hands-on tutorial to configure a specialized Code Refactoring Agent in FLOAT. Learn how to specify tool constraints, write system instructions, and run a safe test cycle.',
    prerequisites: ['Basic TypeScript familiarity', 'A working FLOAT account or local development session'],
    prevSlug: 'best-practices',
    nextSlug: 'tutorials/build-a-feature',
    keyTakeaways: [
      'Configuring an agent requires clear system prompts, scoped toolsets, and step limits.',
      'Testing an agent on a small fixture codebase verifies stability before production use.',
      'Observation logs reveal where an agent gets stuck or encounters tool validation errors.'
    ],
    sections: [
      {
        id: 'step-1-define-role',
        heading: 'Step 1: Define the Agent’s Purpose and Tool Boundaries',
        content: `Start by specifying what your agent will do and which tools it may access. For this tutorial, we will create a "Refactor Agent" whose sole job is converting legacy React class components into modern functional components with hooks.

Its allowed tools:
- \`view_file\`: Read target files.
- \`edit_file\`: Write focused replacement blocks.
- \`lint_applet\`: Validate TypeScript syntax.

Notice what is omitted: no command-line execution or package installation permissions.`,
        codeSnippet: {
          language: 'typescript',
          filename: 'refactorAgent.ts',
          code: `export const RefactorAgentConfig = {
  name: 'React Hook Refactorer',
  description: 'Converts legacy class components to modern React 19 functional hooks.',
  allowedTools: ['view_file', 'edit_file', 'lint_applet'],
  maxSteps: 4,
  temperature: 0.2
};`
        }
      },
      {
        id: 'step-2-run-task',
        heading: 'Step 2: Triggering the Task and Inspecting Intermediate Steps',
        content: `In FLOAT’s AI panel, switch the mode selector to **Agent**. Submit your prompt:
\`Refactor @src/components/LegacyUserCard.tsx to a functional component with useMemo. Keep props identical.\`

Watch the step tracker:
- Step 1: Agent views \`LegacyUserCard.tsx\` and reads the state structure.
- Step 2: Agent calculates the hook replacement and issues an \`edit_file\` patch.
- Step 3: Agent runs \`lint_applet\` to confirm zero type errors.
- Step 4: Agent reports completion and presents the Monaco diff view.`
      },
      {
        id: 'step-3-review-diff',
        heading: 'Step 3: Reviewing the Unified Diff',
        content: `Inspect the diff in the editor. Verify that:
- All original prop types are preserved.
- No unrelated styling or imports were modified.
- Click **Accept Changes** to finalize the edit.`
      }
    ]
  },

  'tutorials/build-a-feature': {
    slug: 'tutorials/build-a-feature',
    title: 'Build and Ship a Full-Stack Feature End-to-End',
    subtitle: 'From Database Schema to Frontend UI with FLOAT Agents',
    category: 'Hands-on Tutorials',
    readTime: '15 min read',
    level: 'Advanced',
    updatedAt: 'March 2026',
    isTutorial: true,
    summary: 'A comprehensive tutorial guiding you through building a complete user bookmarking feature: Firestore document schema, Express API endpoints, Zustand state management, and Tailwind UI components.',
    prerequisites: ['TypeScript & React knowledge', 'Understanding of Express REST APIs'],
    prevSlug: 'tutorials/build-your-first-agent',
    nextSlug: 'tutorials/debug-with-ai',
    keyTakeaways: [
      'Use Plan Mode first to draft the architecture contract before executing changes.',
      'Build backend endpoints first, test them, then wire up the frontend UI.',
      'Always enforce user-level ownership checks on new database collections.'
    ],
    sections: [
      {
        id: 'step-1-plan',
        heading: 'Step 1: Architectural Planning in Plan Mode',
        content: `Begin in **Plan Mode**. Ask FLOAT to design the bookmarking feature. The model will produce an architectural breakdown:
1. Firestore collection: \`users/{userId}/bookmarks/{bookmarkId}\`
2. Backend routes: \`GET /api/bookmarks\` and \`POST /api/bookmarks\`
3. Store hook: \`useBookmarkStore\`
4. UI component: \`<BookmarkButton />\` in the editor header.`
      },
      {
        id: 'step-2-backend',
        heading: 'Step 2: Implementing the Server Endpoints',
        content: `Switch to **Agent Mode** and instruct FLOAT to add the Express routes with token authentication. Review the generated routes to ensure the user ID is derived strictly from the verified Firebase Auth token.`
      }
    ]
  },

  'tutorials/debug-with-ai': {
    slug: 'tutorials/debug-with-ai',
    title: 'Debug and Resolve a Production Bug with AI',
    subtitle: 'Tracing Stack Traces, Reproducing Issues, and Fixing Regressions',
    category: 'Hands-on Tutorials',
    readTime: '10 min read',
    level: 'Intermediate',
    updatedAt: 'March 2026',
    isTutorial: true,
    summary: 'Learn how to feed error logs, compiler diagnostics, and failing tests into FLOAT to isolate tricky edge cases and craft targeted, non-breaking bug fixes.',
    prerequisites: ['Basic debugging concepts'],
    prevSlug: 'tutorials/build-a-feature',
    nextSlug: 'tutorials/review-and-test-code',
    keyTakeaways: [
      'Pass the exact error message and stack trace into the prompt.',
      'Have the agent reproduce the failure in a minimal test case before patching code.',
      'Check for adjacent regressions in affected components.'
    ],
    sections: [
      {
        id: 'step-1-trace',
        heading: 'Step 1: Providing Ground Truth to the Agent',
        content: `When encountering an error, paste the exact stack trace directly into the AI chat. Mention the file where the exception was thrown. FLOAT will inspect the surrounding call stack and identify whether the bug stems from an unhandled null, an asynchronous race condition, or an incorrect API signature.`
      }
    ]
  },

  'tutorials/review-and-test-code': {
    slug: 'tutorials/review-and-test-code',
    title: 'Automated Code Review and Test Generation',
    subtitle: 'Rigorous Quality Assurance Using the Reviewer Agent',
    category: 'Hands-on Tutorials',
    readTime: '11 min read',
    level: 'Intermediate',
    updatedAt: 'March 2026',
    isTutorial: true,
    summary: 'A step-by-step walkthrough demonstrating how to use the Reviewer Agent to audit security boundaries, check edge cases, and auto-generate comprehensive unit tests.',
    prerequisites: ['Familiarity with Vitest or Jest'],
    prevSlug: 'tutorials/debug-with-ai',
    nextSlug: 'tutorials/connect-github',
    keyTakeaways: [
      'Reviewer agents identify blind spots developers commonly overlook.',
      'Generate edge-case tests (empty states, invalid characters, network timeouts) automatically.',
      'Maintain human judgment over whether an architectural tradeoff is acceptable.'
    ],
    sections: [
      {
        id: 'step-1-review',
        heading: 'Step 1: Running an Adversarial Code Review',
        content: `Before committing a branch, run the Reviewer Agent. Prompt:
\`Review the changes in @src/features/models/ModelDetailsPage.tsx for accessibility, responsive overflow on mobile, and theme token consistency.\``
      }
    ]
  },

  'tutorials/connect-github': {
    slug: 'tutorials/connect-github',
    title: 'Connect GitHub and Automate PR Reviews',
    subtitle: 'Linking Repositories, Webhooks, and Cloud Agent Actions',
    category: 'Hands-on Tutorials',
    readTime: '13 min read',
    level: 'Advanced',
    updatedAt: 'March 2026',
    isTutorial: true,
    summary: 'Learn how to link your GitHub repository to FLOAT, configure secure OAuth credentials, and establish automated pull request reviews powered by background agents.',
    prerequisites: ['A GitHub account and repository'],
    prevSlug: 'tutorials/review-and-test-code',
    nextSlug: 'glossary',
    keyTakeaways: [
      'OAuth tokens must be securely stored server-side and never leaked.',
      'Automated PR comments should be constructive, pointing to specific line numbers.',
      'Never give external bots automatic push privileges to protected production branches.'
    ],
    sections: [
      {
        id: 'step-1-connect',
        heading: 'Step 1: Authorizing the GitHub Integration',
        content: `Navigate to **Integrations** in the FLOAT dashboard. Click **Connect GitHub**. You will be guided through OAuth authentication, allowing FLOAT to securely access your repositories with read and pull request review permissions.`
      }
    ]
  }
};

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    term: 'Agent',
    slug: 'agent',
    letter: 'A',
    category: 'Architecture',
    definition: 'An autonomous software entity powered by a language model that observes context, plans steps, invokes tools, and self-corrects to achieve an objective.',
    explanation: 'Unlike passive autocomplete models, an agent operates in an iterative loop: evaluating the outcome of each action against its intended goal until finished or halted.',
    relatedSlugs: ['agentic-development', 'react-loop']
  },
  {
    term: 'Agentic Workflow',
    slug: 'agentic-workflow',
    letter: 'A',
    category: 'Workflows',
    definition: 'A structured software development process where AI agents execute multi-step engineering tasks with defined tools, bounds, and review checkpoints.',
    explanation: 'Agentic workflows combine prompt engineering, tool orchestration, diff calculation, and human oversight into a reproducible development pipeline.',
    relatedSlugs: ['agent-workflows', 'best-practices']
  },
  {
    term: 'AST (Abstract Syntax Tree)',
    slug: 'ast',
    letter: 'A',
    category: 'Codebase Context',
    definition: 'A hierarchical tree representation of source code structure used by compilers and AI context indexers to understand symbols, scopes, and relationships.',
    explanation: 'FLOAT uses AST parsing to extract exported types and function signatures, feeding high-signal structural context to the model while conserving token budgets.',
    relatedSlugs: ['context-and-codebase']
  },
  {
    term: 'Checkpoint',
    slug: 'checkpoint',
    letter: 'C',
    category: 'Safety & Versioning',
    definition: 'A snapshot of the project file tree captured before an agent executes modifications, allowing 1-click rollback if errors occur.',
    explanation: 'Checkpoints prevent loss of work by ensuring any unsuccessful or regressive agent run can be cleanly undone without manual git recovery.',
    relatedSlugs: ['agent-workflows']
  },
  {
    term: 'Codebase Context',
    slug: 'codebase-context',
    letter: 'C',
    category: 'Context',
    definition: 'The curated subset of files, symbols, types, dependencies, and git metadata assembled and provided to the model during an AI turn.',
    explanation: 'High context quality is the single largest determinant of code generation accuracy. Effective indexing balances completeness with prompt token efficiency.',
    relatedSlugs: ['context-and-codebase', 'prompting']
  },
  {
    term: 'Context Window',
    slug: 'context-window',
    letter: 'C',
    category: 'LLM Fundamentals',
    definition: 'The maximum quantity of tokens (both input and output) that a model can process in a single generation call.',
    explanation: 'Modern models support context windows from 128k to 2M tokens. However, excessive context can induce reasoning fatigue and increase latency.',
    relatedSlugs: ['models', 'context-and-codebase']
  },
  {
    term: 'Diff-Driven Development',
    slug: 'diff-driven-development',
    letter: 'D',
    category: 'Workflows',
    definition: 'A development methodology where AI agents propose modifications exclusively as transparent diffs for developer review before disk application.',
    explanation: 'Diff-driven development prevents silent overwrites and ensures developers retain full authority over every line entering the codebase.',
    relatedSlugs: ['agentic-development', 'getting-started']
  },
  {
    term: 'Evaluation Benchmark (Eval)',
    slug: 'evaluation-benchmark',
    letter: 'E',
    category: 'Quality & Testing',
    definition: 'A standardized set of coding challenges, test cases, and assertions used to measure model accuracy, latency, and cost.',
    explanation: 'FLOAT runs evals against coding tasks to verify whether model versions improve or regress on real-world refactoring and bug-fixing tasks.',
    relatedSlugs: ['testing-and-evals']
  },
  {
    term: 'Grounding',
    slug: 'grounding',
    letter: 'G',
    category: 'Reliability',
    definition: 'Anchoring model outputs in verifiable facts, concrete codebase files, and real compiler feedback rather than parametric guesswork.',
    explanation: 'Grounded agents do not guess API signatures; they view the actual file or type definition before proposing dependent code.',
    relatedSlugs: ['agentic-development', 'prompting']
  },
  {
    term: 'Hallucination Guardrail',
    slug: 'hallucination-guardrail',
    letter: 'H',
    category: 'Safety',
    definition: 'Algorithmic or prompt-level checks designed to detect and block fabricated package names, nonexistent API endpoints, or phantom imports.',
    explanation: 'FLOAT uses post-generation compiler verification (\`tsc --noEmit\`) to catch hallucinated identifiers before showing diffs to users.',
    relatedSlugs: ['testing-and-evals', 'best-practices']
  },
  {
    term: 'Human-in-the-Loop (HITL)',
    slug: 'human-in-the-loop',
    letter: 'H',
    category: 'Workflows',
    definition: 'An operating philosophy where autonomous agents require explicit human authorization before executing destructive, sensitive, or irreversible actions.',
    explanation: 'In FLOAT, humans approve code changes, database migrations, and deployments, ensuring autonomy remains a productivity multiplier rather than a hazard.',
    relatedSlugs: ['agentic-development', 'agent-workflows']
  },
  {
    term: 'Monaco Editor',
    slug: 'monaco-editor',
    letter: 'M',
    category: 'Editor',
    definition: 'The industrial-strength browser code editor that powers VS Code, integrated into FLOAT for editing, syntax highlighting, and diff reviews.',
    explanation: 'Monaco provides native keyboard shortcuts, multi-cursor support, language server diagnostics, and side-by-side diff comparison.',
    relatedSlugs: ['getting-started']
  },
  {
    term: 'Multi-Agent Orchestration',
    slug: 'multi-agent-orchestration',
    letter: 'M',
    category: 'Architecture',
    definition: 'Coordinating multiple specialized agents (e.g. Planner, Coder, Reviewer) in sequence or parallel to solve complex multi-faceted engineering challenges.',
    explanation: 'Orchestration assigns clear task boundaries, hands off intermediate outputs, and enforces separation of concerns across agents.',
    relatedSlugs: ['agents', 'agent-workflows']
  },
  {
    term: 'ReAct (Reason + Act)',
    slug: 'react',
    letter: 'R',
    category: 'Architecture',
    definition: 'A cognitive framework where a model interleaves explicit natural-language thoughts with concrete tool actions and environment observations.',
    explanation: 'ReAct loops allow agents to dynamically adapt to unexpected errors, compiler messages, or missing files during task execution.',
    relatedSlugs: ['agentic-development']
  },
  {
    term: 'Rollback',
    slug: 'rollback',
    letter: 'R',
    category: 'Safety & Versioning',
    definition: 'The process of restoring project files to a prior verified checkpoint following an unsuccessful or unwanted code change.',
    explanation: 'Rollback provides psychological safety, empowering developers to experiment freely with agentic suggestions without risking repository damage.',
    relatedSlugs: ['agent-workflows']
  },
  {
    term: 'Semantic Indexing',
    slug: 'semantic-indexing',
    letter: 'S',
    category: 'Context',
    definition: 'Indexing code using high-dimensional vector embeddings or keyword-symbol inverted indices to retrieve relevant snippets based on natural language queries.',
    explanation: 'Semantic indexing helps agents discover relevant helper functions and configuration files even when the user prompt does not use exact keyword matches.',
    relatedSlugs: ['context-and-codebase']
  },
  {
    term: 'Step Budget',
    slug: 'step-budget',
    letter: 'S',
    category: 'Safety & Cost',
    definition: 'A hard upper limit on the number of sequential tool execution turns an agent is permitted to perform before requiring user check-in.',
    explanation: 'Step budgets prevent runaway infinite loops, recursive tool calling, and unplanned token expenses on ambiguous prompts.',
    relatedSlugs: ['agents', 'agent-workflows']
  },
  {
    term: 'Token Budget',
    slug: 'token-budget',
    letter: 'T',
    category: 'Performance & Cost',
    definition: 'The calculated ceiling on input and output tokens allocated to a specific turn or conversation to maintain low latency and predictable costs.',
    explanation: 'Token budgeting prunes distant conversation history and truncates extraneous logs while preserving critical system instructions and active files.',
    relatedSlugs: ['context-and-codebase', 'models']
  },
  {
    term: 'Tool Calling / Function Calling',
    slug: 'tool-calling',
    letter: 'T',
    category: 'Architecture',
    definition: 'A model capability where the LLM produces structured arguments matching a predefined schema to trigger external programs or APIs.',
    explanation: 'Tool calling connects the model to the external world, allowing it to view files, run commands, query databases, or call web services.',
    relatedSlugs: ['tools-and-integrations', 'agentic-development']
  }
];
