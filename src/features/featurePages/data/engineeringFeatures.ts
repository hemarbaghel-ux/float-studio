import { FeatureDetail } from '../types';

export const engineeringFeatures: FeatureDetail[] = [
  {
    slug: 'terminal',
    title: 'Terminal',
    badgeCategory: 'Real Engineering Tools',
    headline: 'Execute shell commands, run test suites, and inspect builds safely',
    introParagraph: 'Software development is more than editing text; it requires compiling code, installing dependencies, running linters, and monitoring test output. The FLOAT integrated terminal allows you and your AI agent to trigger development commands, analyze real execution streams, and resolve build errors in place.',
    primaryAction: {
      label: 'Open Terminal',
      href: '/',
      description: 'Switch to the bottom terminal panel in FLOAT IDE'
    },
    secondaryAction: {
      label: 'Explore all features',
      href: '/features'
    },
    mockupType: 'terminal',
    whatItDoes: {
      overview: 'The integrated terminal provides command-line interaction directly inside the FLOAT development workspace.',
      problemSolved: 'Eliminates the friction of context-switching between external terminal windows and the editor, enabling automated verification loops.',
      targetAudience: 'Developers running package managers, build tools, database migrations, and automated test runners.',
      whenToUse: 'When running npm install, checking TypeScript build errors (npm run build), starting dev servers, or testing endpoints.',
      workflowFit: 'Embedded as the bottom panel in the FLOAT shell. Agents can request to run specific build and test commands with your permission.'
    },
    howItWorks: [
      {
        stepNumber: 1,
        title: 'Command Initiation or Agent Proposal',
        developerAction: 'Type a shell command or approve an agent-proposed verification command.',
        floatAction: 'Validates command syntax, checks path restrictions, and displays confirmation prompt for potentially destructive commands.',
        involvedArtifacts: 'Shell process, package.json scripts, workspace root.',
        outputProduced: 'Interactive terminal process execution.',
        inspectionAndApproval: 'Developer retains full authorization over shell actions.'
      },
      {
        stepNumber: 2,
        title: 'Real-Time Stream Processing',
        developerAction: 'Watch standard output and standard error streams in the terminal panel.',
        floatAction: 'Buffers output, highlights warning/error codes, and detects build success or failure exit codes.',
        involvedArtifacts: 'Pty terminal stream, ANSI color renderer.',
        outputProduced: 'Formatted console log output with clickable file paths.',
        inspectionAndApproval: 'Developer can cancel long-running processes at any time (Ctrl+C).'
      },
      {
        stepNumber: 3,
        title: 'Post-Execution Analysis',
        developerAction: 'Click "Analyze error with FLOAT" on any non-zero exit code.',
        floatAction: 'Feeds the exact command output back to the active agent to explain the failure and propose a fix.',
        involvedArtifacts: 'Command output buffer, compiler diagnostics.',
        outputProduced: 'Diagnosis and proposed code correction.',
        inspectionAndApproval: 'Developer inspects the proposed fix in Monaco editor.'
      }
    ],
    practicalExample: {
      scenarioTitle: 'Running production build and fixing an unhandled TypeScript compilation error',
      problem: 'Running npm run build fails with TS2339 property does not exist on type.',
      developerPrompt: 'Build this project and resolve any TypeScript errors.',
      executionProcess: [
        'Reads package.json scripts.',
        'Executes npm run build in terminal.',
        'Detects compilation failure on line 42 of src/store/aiStore.ts.',
        'Proposes type definition update and re-runs build to verify 0 errors.'
      ],
      codeOrDiffType: 'terminal',
      codeOrDiffSnippet: `$ npm run build
> float-app@0.1.0 build
> tsc && vite build

src/store/aiStore.ts:42:18 - error TS2339: Property 'tokenCount' does not exist on type 'ChatMessage'.

42   totalTokens += msg.tokenCount;
                    ~~~~~~~~~~

Found 1 error in src/store/aiStore.ts:42

[FLOAT Agent] Analyzing error: ChatMessage interface in src/types/ai.ts needs optional 'tokenCount?: number'. Applying fix...
[FLOAT Agent] Re-running build:
✓ Compiled successfully in 2.4s`,
      verificationStep: 'Terminal displays green checkmark with successful Vite production bundle generation.'
    },
    keyCapabilities: [
      {
        name: 'Sandboxed Command Execution',
        description: 'Runs within authorized workspace boundaries with strict protection against dangerous system commands.',
        practicalBenefit: 'Prevents accidental filesystem damage or credential exposure.'
      },
      {
        name: 'Clickable Error Links',
        description: 'File paths and line numbers emitted by Node, Vite, or Go compilers are parsed into instant editor jump links.',
        practicalBenefit: 'Jump straight to the broken code without manual file searching.'
      },
      {
        name: 'Automated Agent Loop',
        description: 'Agents can run linters and test suites to verify their own code edits before asking for your review.',
        practicalBenefit: 'You receive working, pre-verified code instead of syntactically broken snippets.'
      }
    ],
    whenToUseScenarios: [
      {
        title: 'Verifying Production Builds',
        description: 'Ensuring TypeScript types and bundler plugins succeed before pushing to GitHub.'
      },
      {
        title: 'Running Test Suites',
        description: 'Executing Jest, Vitest, or Playwright tests to validate edge-case handling.'
      },
      {
        title: 'Managing Dependencies',
        description: 'Safely installing new npm or pnpm packages with automated lockfile management.'
      }
    ],
    workflowAndIntegrations: {
      leadText: 'The terminal connects with FLOAT debugging and agent verification:',
      connectedTools: [
        { name: 'Debug', role: 'Analyzes stderr and stack traces from crashed processes', slug: 'debug' },
        { name: 'Agents', role: 'Triggers build and test verification after generating code', slug: 'agents' },
        { name: 'Git & Checkpoints', role: 'Enables git status, commit, and branch management from the shell', slug: 'git-checkpoints' }
      ]
    },
    requirementsAndLimitations: {
      availabilityStatus: 'Available',
      authRequired: true,
      providerKeyRequired: false,
      environmentNotes: 'Web version runs in a secured containerized WebContainer/Node environment; Desktop connects to local system shells.',
      knownLimitations: [
        'Web environment restricts raw root-level system daemons and kernel-level drivers.',
        'Interactive curses-based terminal applications (like vim or htop) have limited keybinding support in web view.'
      ]
    },
    faq: [
      {
        question: 'Can the AI agent run commands without my permission?',
        answer: 'By default, FLOAT requires explicit user approval before running non-read-only terminal commands. You can configure trusted commands in project settings.'
      },
      {
        question: 'Which shells are supported?',
        answer: 'Bash and Zsh on macOS/Linux, and PowerShell or Git Bash on Windows.'
      },
      {
        question: 'Are my private environment variables hidden?',
        answer: 'Yes. FLOAT filters sensitive environment variables and API keys from terminal output buffers to prevent leakage into logs or AI prompts.'
      },
      {
        question: 'Can I open multiple terminal tabs?',
        answer: 'Yes. The bottom panel supports multiple concurrent terminal tabs, allowing you to keep a dev server running in one while executing test commands in another.'
      }
    ],
    relatedFeatures: [
      { slug: 'debug', title: 'Debug', category: 'Lifecycle', description: 'Deep-dive into stack traces and runtime exceptions.' },
      { slug: 'cli', title: 'CLI', category: 'Surfaces', description: 'Run FLOAT agents directly from your existing terminal setup.' },
      { slug: 'agents', title: 'Autonomous Agents', category: 'Execution', description: 'Let agents run verification commands autonomously.' }
    ]
  },
  {
    slug: 'add-context',
    title: 'Add context',
    badgeCategory: 'Real Engineering Tools',
    headline: 'Provide exact files, symbols, documentation, and screenshots with @-mentions',
    introParagraph: 'AI accuracy depends directly on context quality. Rather than overwhelming the model with irrelevant files or guessing context, FLOAT gives you granular control with @-mentions. Pin exact files, functions, active git diffs, images, or web documentation to provide surgical guidance.',
    primaryAction: {
      label: 'Open Workspace Composer',
      href: '/',
      description: 'Try @-mentioning files in the FLOAT chat composer'
    },
    secondaryAction: {
      label: 'Explore all features',
      href: '/features'
    },
    mockupType: 'context',
    whatItDoes: {
      overview: 'Add Context is a rich context injection engine built into the FLOAT composer and command palette.',
      problemSolved: 'Prevents token waste, hallucinated APIs, and degraded reasoning caused by dumping entire massive codebases into the prompt window.',
      targetAudience: 'Engineers who want precise, predictable AI responses tailored to exact project artifacts.',
      whenToUse: 'When asking questions about specific components, referencing UI mockups or bug screenshots, or targeting specific APIs.',
      workflowFit: 'Triggered simply by typing "@" in the composer, search bar, or inline editor command.'
    },
    howItWorks: [
      {
        stepNumber: 1,
        title: 'Context Item Triggering',
        developerAction: 'Type "@" in the composer prompt.',
        floatAction: 'Presents an instant fuzzy-search dropdown of files, folders, symbols, git diffs, and attachments.',
        involvedArtifacts: 'Workspace file index, active buffers, symbol table.',
        outputProduced: 'Interactive autocomplete list categorized by artifact type.',
        inspectionAndApproval: 'Developer selects the exact items using keyboard arrows or mouse click.'
      },
      {
        stepNumber: 2,
        title: 'AST & Token Optimization',
        developerAction: 'Select @components/Navigation.tsx and attach a screenshot.',
        floatAction: 'Extracts relevant AST signatures, prunes unnecessary comments or whitespace, and estimates token consumption.',
        involvedArtifacts: 'Tokenizer, vision encoder, tree-sitter parser.',
        outputProduced: 'Pinned context chips with live token budget indicators.',
        inspectionAndApproval: 'Developer can remove or re-order context chips before sending.'
      },
      {
        stepNumber: 3,
        title: 'Grounded Model Execution',
        developerAction: 'Submit the prompt.',
        floatAction: 'Embeds pinned artifacts into the system context structure with clear demarcation boundaries.',
        involvedArtifacts: 'AI provider API request payload.',
        outputProduced: 'Response grounded in the exact source files provided.',
        inspectionAndApproval: 'Developer reviews answer with explicit citations back to the provided files.'
      }
    ],
    practicalExample: {
      scenarioTitle: 'Adapting an existing drawer component to match a third-party UI library spec',
      problem: 'Need to replace a custom CSS modal drawer with vaul library patterns while matching brand color tokens.',
      developerPrompt: 'Make @src/components/drawer.tsx use @docs/vaul-spec.md and match our brand colors in @tailwind.config.ts',
      executionProcess: [
        'Ingests drawer.tsx implementation.',
        'Extracts accessibility guidelines from vaul-spec.md.',
        'Extracts color palette from tailwind.config.ts.',
        'Generates smooth swipeable drawer adhering to both specifications.'
      ],
      codeOrDiffType: 'code',
      codeOrDiffSnippet: `// Grounded generated code in src/components/drawer.tsx
import { Drawer } from 'vaul';
import { useThemeTokens } from '../hooks/useThemeTokens';

export function MobileDrawer({ open, onOpenChange, children }: DrawerProps) {
  const { brandBg, surfaceBorder } = useThemeTokens();
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-xs" />
        <Drawer.Content className={\`fixed bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl \${brandBg} border-t \${surfaceBorder} p-6\`}>
          <div className="mx-auto w-12 h-1.5 rounded-full bg-slate-300 dark:bg-white/20 mb-6" />
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}`,
      verificationStep: 'Developer verifies that drawer matches the exact tokens and accessibility attributes requested.'
    },
    keyCapabilities: [
      {
        name: 'Multi-Modal Vision Support',
        description: 'Paste screenshots of UI bugs, Figma wireframes, or error dialogues directly into the composer.',
        practicalBenefit: 'Models analyze visual layouts alongside code to diagnose alignment and styling defects.'
      },
      {
        name: 'Symbol & Function-Level Pinning',
        description: 'Instead of passing an entire 3,000-line file, pin just @PaymentService#processWebhook.',
        practicalBenefit: 'Saves context window capacity and focuses the model on the relevant logic.'
      },
      {
        name: 'Git Diff Context (@git-diff)',
        description: 'Provide unstaged or committed changes to ask for code reviews or commit message generation.',
        practicalBenefit: 'Immediate review of work in progress without manual copy-pasting.'
      }
    ],
    whenToUseScenarios: [
      {
        title: 'Targeted Component Refactoring',
        description: 'Updating a specific component while referencing its tests and interface types.'
      },
      {
        title: 'Visual Bug Resolution',
        description: 'Attaching a screenshot of a broken mobile menu alongside the relevant CSS and TSX files.'
      },
      {
        title: 'External Documentation Grounding',
        description: 'Providing a new SDK README or API spec to implement a feature with unfamiliar libraries.'
      }
    ],
    workflowAndIntegrations: {
      leadText: 'Add Context powers intelligent queries across search, skills, and MCP:',
      connectedTools: [
        { name: 'Fast Codebase Search', role: 'Finds candidate files to pin via instant autocomplete', slug: 'codebase-search' },
        { name: 'MCP', role: 'Allows @-mentioning external servers like Figma, GitHub, or Postgres', slug: 'mcp' },
        { name: 'Skills', role: 'Injects persistent domain instructions alongside pinned files', slug: 'skills' }
      ]
    },
    requirementsAndLimitations: {
      availabilityStatus: 'Available',
      authRequired: false,
      providerKeyRequired: false,
      environmentNotes: 'Available across all composer interfaces in FLOAT.',
      knownLimitations: [
        'Image attachments require multi-modal capable models (e.g. Gemini 2.5 Flash/Pro, GPT-4o, Claude 3.5/3.7).',
        'Total file size must remain within the active model context window limit.'
      ]
    },
    faq: [
      {
        question: 'What types of context can I @-mention?',
        answer: 'You can @-mention files, folders, code symbols (classes/functions), active git diffs, terminal outputs, documentation links, and uploaded images.'
      },
      {
        question: 'Does attaching large files slow down response generation?',
        answer: 'FLOAT optimizes file buffers and caches context where supported by the AI provider, minimizing latency and cost.'
      },
      {
        question: 'Can I drag and drop images directly into the chat?',
        answer: 'Yes. You can drag and drop PNG, JPEG, WEBP, or SVG files directly into the prompt box.'
      },
      {
        question: 'Is my context shared with other users or public training sets?',
        answer: 'No. Context remains strictly within your authenticated session and is never used to train public foundational models.'
      }
    ],
    relatedFeatures: [
      { slug: 'codebase-search', title: 'Fast Codebase Search', category: 'Intelligence', description: 'Search and discover files to attach as context.' },
      { slug: 'mcp', title: 'MCP', category: 'Extension', description: 'Connect external knowledge sources and database schemas.' },
      { slug: 'skills', title: 'Skills', category: 'Extension', description: 'Create reusable prompt context for common development tasks.' }
    ]
  },
  {
    slug: 'git-checkpoints',
    title: 'Git & checkpoints',
    badgeCategory: 'Real Engineering Tools',
    headline: 'Time-travel through code evolution with automatic safety checkpoints',
    introParagraph: 'Autonomous coding is only viable when you have an unbreakable safety net. FLOAT combines standard Git version control with automatic micro-checkpoints. Every time an agent modifies files or runs a terminal task, a lightweight snapshot is recorded, enabling instant one-click rollback if something breaks.',
    primaryAction: {
      label: 'View Timeline in Workspace',
      href: '/',
      description: 'Open the project timeline and checkpoints in the FLOAT IDE'
    },
    secondaryAction: {
      label: 'Explore all features',
      href: '/features'
    },
    mockupType: 'git',
    whatItDoes: {
      overview: 'Git & Checkpoints is a dual-tier version safety system in FLOAT combining full Git branching with sub-commit operational snapshots.',
      problemSolved: 'Eliminates the fear of an AI agent scrambling your working tree or introducing subtle regressions across dozens of files.',
      targetAudience: 'Engineers who want to experiment fearlessly with autonomous agents while preserving total operational control.',
      whenToUse: 'Before and after every agent execution, refactor, or dependency upgrade.',
      workflowFit: 'Visible in the Timeline view of the sidebar and automatically triggered before destructive changes.'
    },
    howItWorks: [
      {
        stepNumber: 1,
        title: 'Automatic Pre-Flight Checkpoint',
        developerAction: 'Instruct the agent to execute a task or accept a proposed plan.',
        floatAction: 'Captures a clean snapshot of all uncommitted workspace files before initiating edits.',
        involvedArtifacts: 'Local snapshot ledger, git staging area.',
        outputProduced: 'Timestamped checkpoint record (e.g. "Pre-agent: Add authentication").',
        inspectionAndApproval: 'Logged non-intrusively in the bottom status bar and timeline.'
      },
      {
        stepNumber: 2,
        title: 'Granular Mutation Tracking',
        developerAction: 'Watch the agent apply modifications across multiple files.',
        floatAction: 'Records delta changes per file with line-level diff calculations.',
        involvedArtifacts: 'File system watcher, Monaco diff engine.',
        outputProduced: 'Visual diff list displaying additions, deletions, and touched files.',
        inspectionAndApproval: 'Developer can inspect individual file diffs side-by-side.'
      },
      {
        stepNumber: 3,
        title: 'One-Click Rollback or Commit',
        developerAction: 'If satisfied, click "Commit to Git"; if unsatisfied, click "Revert to Checkpoint".',
        floatAction: 'Restores the exact working tree files in milliseconds without requiring complicated git stash/reset maneuvers.',
        involvedArtifacts: 'Working tree, Git repository.',
        outputProduced: 'Restored functional workspace or structured Git commit.',
        inspectionAndApproval: 'Developer verifies file tree returns to clean state.'
      }
    ],
    practicalExample: {
      scenarioTitle: 'Safely reverting an experimental WebSocket refactor that broke build tests',
      problem: 'Agent attempted to migrate HTTP polling to WebSockets but introduced 12 compilation errors across state stores.',
      developerPrompt: 'Revert to yesterday\'s checkpoint before the multiplayer refactor.',
      executionProcess: [
        'Locates checkpoint "Jan 18 - Add multiplayer (Pre-refactor)".',
        'Compares current corrupted tree with snapshot hash.',
        'Restores original 4 files in 120ms.',
        'Verifies that npm run build passes cleanly.'
      ],
      codeOrDiffType: 'diff',
      codeOrDiffSnippet: `// Checkpoint Timeline Inspection:
- [CORRUPTED] Jan 19 14:22: Experimental WebSocket transport (12 TS errors)
+ [CHECKPOINT] Jan 18 18:05: Stable canvas editor checkpoint
✓ Reverted 4 files:
  ↺ src/store/socketStore.ts (removed)
  ↺ src/features/editor/Canvas.tsx (restored to v1.4.2)
  ↺ src/server/websocket.ts (removed)
  ↺ package.json (restored lockfile)`,
      verificationStep: 'Developer runs tests and confirms the project builds and runs without any lingering socket bugs.'
    },
    keyCapabilities: [
      {
        name: 'Sub-Commit Micro-Snapshots',
        description: 'Creates temporary safety points without cluttering your public Git commit history with dirty commit messages.',
        practicalBenefit: 'Keep your git history clean while enjoying full rewind capability.'
      },
      {
        name: 'Visual Side-by-Side Diff Inspector',
        description: 'Built directly on Monaco Editor with color-coded token highlights, minimap indicators, and inline diff viewing.',
        practicalBenefit: 'Inspect every character an AI agent modified before accepting.'
      },
      {
        name: 'Native Git Branch & Remote Sync',
        description: 'Full compatibility with Git branches, remotes, GitHub pull requests, and SSH/HTTPS credentials.',
        practicalBenefit: 'Integrates into standard team GitHub/GitLab workflows effortlessly.'
      }
    ],
    whenToUseScenarios: [
      {
        title: 'Exploratory Architectural Refactors',
        description: 'Testing whether a new library or state management approach is viable without risking current working code.'
      },
      {
        title: 'Autonomous Multi-File Agent Runs',
        description: 'Letting an agent modify 10+ files simultaneously with the guarantee that you can revert with one click.'
      },
      {
        title: 'Pre-Production Staging Verification',
        description: 'Reviewing cumulative diffs before creating a GitHub pull request.'
      }
    ],
    workflowAndIntegrations: {
      leadText: 'Git and checkpoints integrate with all editing and agent systems in FLOAT:',
      connectedTools: [
        { name: 'Desktop & IDE', role: 'Provides side-by-side Monaco diff review for every file', slug: 'desktop' },
        { name: 'Agents', role: 'Automatically creates checkpoints before multi-file agent runs', slug: 'agents' },
        { name: 'Terminal', role: 'Allows executing advanced git rebase, cherry-pick, or commit commands', slug: 'terminal' }
      ]
    },
    requirementsAndLimitations: {
      availabilityStatus: 'Available',
      authRequired: false,
      providerKeyRequired: false,
      environmentNotes: 'Works in standard Git repositories. In web sandbox, project snapshots are stored in encrypted browser IndexedDB/Firestore.',
      knownLimitations: [
        'Checkpoints apply to text source files; large binary assets (>50MB) should be tracked via Git LFS.',
        'Uncommitted untracked files ignored by .gitignore are not included in automatic snapshots.'
      ]
    },
    faq: [
      {
        question: 'Does FLOAT push checkpoints to my public GitHub repository?',
        answer: 'No. Micro-checkpoints are stored locally in your workspace session. Only explicit Git commits created or approved by you are pushed to remotes.'
      },
      {
        question: 'How many checkpoints can FLOAT maintain?',
        answer: 'FLOAT retains up to 100 historical checkpoints per project session, automatically pruning older unchanged snapshots.'
      },
      {
        question: 'What happens if the browser closes during an agent run?',
        answer: 'FLOAT restores the last verified checkpoint on reload so you never open a half-written, corrupted file.'
      },
      {
        question: 'Can I cherry-pick changes from an earlier checkpoint?',
        answer: 'Yes. You can inspect an earlier checkpoint and restore individual files without reverting the entire project.'
      }
    ],
    relatedFeatures: [
      { slug: 'desktop', title: 'Desktop & IDE', category: 'Surfaces', description: 'Monaco-powered diff review and file management.' },
      { slug: 'agents', title: 'Autonomous Agents', category: 'Execution', description: 'Autonomous coding safeguarded by automatic checkpoints.' },
      { slug: 'plan', title: 'Plan Mode', category: 'Lifecycle', description: 'Plan changes with milestone checkpoints.' }
    ]
  }
];
