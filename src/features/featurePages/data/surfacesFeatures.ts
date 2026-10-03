import { FeatureDetail } from '../types';

export const surfacesFeatures: FeatureDetail[] = [
  {
    slug: 'desktop',
    title: 'Desktop',
    badgeCategory: 'Everywhere You Work',
    headline: 'From manual to agentic coding in a familiar, high-performance editor',
    introParagraph: 'FLOAT Desktop is the flagship local development environment. Built with the full power of Monaco Editor, instant file indexing, split-pane diff viewing, and local terminal execution, FLOAT Desktop gives you the responsiveness of a native code editor combined with autonomous AI workflows.',
    primaryAction: {
      label: 'Download for Windows',
      href: '/',
      description: 'Download the FLOAT Desktop installer for Windows, macOS, or Linux'
    },
    secondaryAction: {
      label: 'Explore all features',
      href: '/features'
    },
    mockupType: 'desktop',
    whatItDoes: {
      overview: 'FLOAT Desktop is the complete developer IDE combining native file editing, git control, and agentic autonomy in a single dark-mode workspace.',
      problemSolved: 'Replaces clumsy browser-based copy-pasting of code with real-time in-editor diff generation, syntax highlighting, and local execution.',
      targetAudience: 'Software engineers building full-stack applications, services, and libraries on local workstations.',
      whenToUse: 'For daily programming, large repository exploration, debugging, and continuous feature building.',
      workflowFit: 'The primary workspace where code editing, terminal commands, AI agents, and file navigation coexist seamlessly.'
    },
    howItWorks: [
      {
        stepNumber: 1,
        title: 'Project Ingestion & Workspace Mounting',
        developerAction: 'Open a local project folder in FLOAT Desktop.',
        floatAction: 'Mounts directory tree, indexes symbols and types, and starts background language servers.',
        involvedArtifacts: 'Local filesystem, .git metadata, package manifests.',
        outputProduced: 'Interactive File Explorer and breadcrumb navigation tree.',
        inspectionAndApproval: 'Developer selects target files from the explorer.'
      },
      {
        stepNumber: 2,
        title: 'High-Performance Monaco Editing',
        developerAction: 'Write code manually or trigger inline AI transformations (Cmd+K).',
        floatAction: 'Provides syntax highlighting, auto-completion, bracket matching, and real-time linter diagnostics.',
        involvedArtifacts: 'Monaco Editor engine, TypeScript language service.',
        outputProduced: 'Fluid code editing experience with 0ms input latency.',
        inspectionAndApproval: 'Developer writes, saves, and formats files with standard keyboard shortcuts.'
      },
      {
        stepNumber: 3,
        title: 'Agentic Split-Pane Coordination',
        developerAction: 'Open the right-hand AI Composer to delegate multi-file tasks.',
        floatAction: 'Generates real-time streaming diffs across tabs while preserving your manual editing position.',
        involvedArtifacts: 'Multi-tab editor layout, side-by-side diff viewer.',
        outputProduced: 'Proposed code diffs highlighting additions and deletions.',
        inspectionAndApproval: 'Developer accepts or rejects diffs file-by-file or all at once.'
      }
    ],
    practicalExample: {
      scenarioTitle: 'Implementing spotlight-style command search (Cmd+K) in a React desktop application',
      problem: 'Need to add global shortcut listeners and a floating modal search interface across the entire application.',
      developerPrompt: 'let\'s add a spotlight-style search triggered by Cmd+K that searches files, actions, and models',
      executionProcess: [
        'Reads App.tsx and Menu.tsx for existing keyboard listeners.',
        'Searches for ⌘K shortcut handlers across the workspace.',
        'Creates SearchModal.tsx with fuzzy filter algorithms.',
        'Wires up global window listener with smooth opening animation.'
      ],
      codeOrDiffType: 'diff',
      codeOrDiffSnippet: `// src/App.tsx
+ useEffect(() => {
+   const handleKeyDown = (e: KeyboardEvent) => {
+     if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
+       e.preventDefault();
+       setIsSearchModalOpen((prev) => !prev);
+     }
+   };
+   window.addEventListener('keydown', handleKeyDown);
+   return () => window.removeEventListener('keydown', handleKeyDown);
+ }, []);`,
      verificationStep: 'Developer presses Cmd+K on their keyboard and verifies instant spotlight modal opening.'
    },
    keyCapabilities: [
      {
        name: 'Monaco-Powered Code Intelligence',
        description: 'Industry-standard editor with multi-cursor support, minimap, syntax tokenization, and language servers.',
        practicalBenefit: 'Immediate familiarity for VS Code and Sublime users with zero learning curve.'
      },
      {
        name: 'Native Local File System Speed',
        description: 'Read and write local files directly without network latency or cloud synchronization delays.',
        practicalBenefit: 'Blazing fast search, build, and edit cycles even on codebases with millions of lines.'
      },
      {
        name: 'Split-Pane Live Preview',
        description: 'Embedded hot-reloading browser window next to the editor for instant visual feedback.',
        practicalBenefit: 'See UI updates live as you or the AI modifies components.'
      }
    ],
    whenToUseScenarios: [
      {
        title: 'Primary Daily Development',
        description: 'Your main editor for authoring full-stack web, mobile, and backend codebases.'
      },
      {
        title: 'Complex Multi-File Refactors',
        description: 'Using split-pane diff review to inspect changes across dozens of files simultaneously.'
      },
      {
        title: 'Offline & Local Development',
        description: 'Writing code without an active internet connection, with local models or queued tasks.'
      }
    ],
    workflowAndIntegrations: {
      leadText: 'FLOAT Desktop unites all FLOAT capabilities into a single environment:',
      connectedTools: [
        { name: 'Terminal', role: 'Embedded bottom panel connected to your local native shell', slug: 'terminal' },
        { name: 'Git & Checkpoints', role: 'Full git branch and snapshot management in the sidebar', slug: 'git-checkpoints' },
        { name: 'Fast Codebase Search', role: 'Instant grep and symbol navigation across project files', slug: 'codebase-search' }
      ]
    },
    requirementsAndLimitations: {
      availabilityStatus: 'Available',
      authRequired: false,
      providerKeyRequired: false,
      environmentNotes: 'Available on Windows (x64/ARM), macOS (Apple Silicon/Intel), and Linux (.deb/.AppImage).',
      knownLimitations: [
        'Native desktop app requires local Node.js or runtime tools installed on your host machine for build commands.',
        'Requires 4GB RAM minimum for large project indexing.'
      ]
    },
    faq: [
      {
        question: 'Is FLOAT Desktop based on VS Code?',
        answer: 'FLOAT Desktop uses the battle-tested Monaco Editor engine combined with FLOAT\'s proprietary agentic orchestrator, lightweight shell, and multi-model router.'
      },
      {
        question: 'Can I import my existing VS Code keybindings?',
        answer: 'Yes. FLOAT Desktop supports standard VS Code keybindings, cursor navigation, and customization options in settings.'
      },
      {
        question: 'Does FLOAT Desktop send my local code to the cloud?',
        answer: 'Only the specific code snippets or files you provide as context to AI prompts are transmitted to your configured AI provider. Your local workspace files remain on your disk.'
      },
      {
        question: 'How do updates work?',
        answer: 'FLOAT Desktop includes seamless background updates with one-click restart.'
      }
    ],
    relatedFeatures: [
      { slug: 'terminal', title: 'Terminal', category: 'Tools', description: 'Embedded shell with interactive verification.' },
      { slug: 'git-checkpoints', title: 'Git & Checkpoints', category: 'Tools', description: 'Visual diff review and one-click rollback.' },
      { slug: 'cli', title: 'CLI', category: 'Surfaces', description: 'Run FLOAT agents in your headless terminal.' }
    ]
  },
  {
    slug: 'cli',
    title: 'CLI',
    badgeCategory: 'Everywhere You Work',
    headline: 'Run autonomous coding agents in any terminal, script, or CI pipeline',
    introParagraph: 'Prefer your own terminal setup or Neovim environment? The FLOAT CLI (float-cli) brings autonomous agent capabilities directly to your command line. Execute multi-step coding tasks, debug failing test suites, and automate repository maintenance from any shell or automated CI/CD pipeline.',
    primaryAction: {
      label: 'View CLI Guide',
      href: '/resources/guides',
      description: 'Learn how to install and configure the FLOAT command-line tool'
    },
    secondaryAction: {
      label: 'Explore all features',
      href: '/features'
    },
    mockupType: 'cli',
    whatItDoes: {
      overview: 'FLOAT CLI is a lightweight, scriptable command-line interface that runs FLOAT agent workflows in headless environments.',
      problemSolved: 'Allows terminal purists and DevOps engineers to leverage FLOAT without leaving their favorite terminal, tmux, or CI environment.',
      targetAudience: 'Terminal power users, DevOps/SRE engineers, open-source maintainers, and Neovim/Vim developers.',
      whenToUse: 'When running headless migrations, automating bug fixes in CI, or executing tasks from tmux or SSH sessions.',
      workflowFit: 'Install via npm install -g float-ai or curl script. Run float "task description" in any repository.'
    },
    howItWorks: [
      {
        stepNumber: 1,
        title: 'CLI Invocation with Task Prompt',
        developerAction: 'Run `float "Add affine gap alignment to sequence_alignment.py"` in your terminal.',
        floatAction: 'Initializes git context, detects repo dependencies, and spins up a headless agent session.',
        involvedArtifacts: 'Current working directory, local git status, task string.',
        outputProduced: 'Interactive terminal TUI with live status indicator.',
        inspectionAndApproval: 'Developer can pass --dry-run or interactive flags (-i).'
      },
      {
        stepNumber: 2,
        title: 'Autonomous Multi-Step Execution',
        developerAction: 'Observe the agent read files, plan steps, and apply diffs in real-time.',
        floatAction: 'Executes AST modifications, runs linters, and outputs clean ANSI-formatted diff streams.',
        involvedArtifacts: 'Source files, local compiler/test runner.',
        outputProduced: 'Streaming step log: [Thought 5s] -> [Read bio/sequence.py] -> [Edit bio/sequence.py].',
        inspectionAndApproval: 'Developer can press Ctrl+C to pause or inspect intermediate changes.'
      },
      {
        stepNumber: 3,
        title: 'Test Verification & Git Staging',
        developerAction: 'Review the final summary table and test suite results.',
        floatAction: 'Runs project tests in the background to ensure no regressions, then prepares a staged git commit.',
        involvedArtifacts: 'Git staging index, test output logs.',
        outputProduced: 'Passing test confirmation and ready-to-push git commit.',
        inspectionAndApproval: 'Developer approves git commit message or makes manual adjustments.'
      }
    ],
    practicalExample: {
      scenarioTitle: 'Running FLOAT CLI in a Python bioinformatics project to implement Gotoh\'s algorithm',
      problem: 'Need to upgrade linear gap alignment to affine gap penalties in a scientific computing repository.',
      developerPrompt: '$ float "Add affine gap alignment using Gotoh algorithm to bio/sequence_alignment.py and run pytest"',
      executionProcess: [
        'Reads bio/sequence_alignment.py.',
        'Implements Gotoh\'s dynamic programming matrix equations.',
        'Runs pytest tests/test_alignment.py --verbose.',
        'Outputs green test results and stages files.'
      ],
      codeOrDiffType: 'terminal',
      codeOrDiffSnippet: `$ float "Add affine gap alignment to bio/sequence_alignment.py and run pytest"
[FLOAT Agent] Initializing workspace ~/projects/bioinformatics
[FLOAT Agent] Read bio/sequence_alignment.py (142 lines)
[FLOAT Agent] Applying Gotoh algorithm matrix updates (+38 -6 lines)
[FLOAT Agent] Running test suite: pytest tests/test_alignment.py
====================== 8 passed in 0.42s ======================
✓ Successfully implemented affine gap alignment.
Files modified:
  bio/sequence_alignment.py (+38 -6)
  tests/test_alignment.py (+14 -0)`,
      verificationStep: 'Developer runs git diff and verifies clean algorithm implementation.'
    },
    keyCapabilities: [
      {
        name: 'Headless CI/CD Automation',
        description: 'Run FLOAT agents inside GitHub Actions, GitLab CI, or Docker containers to auto-fix linting issues and generate changelogs.',
        practicalBenefit: 'Automates routine repository maintenance without human intervention.'
      },
      {
        name: 'Interactive Terminal TUI',
        description: 'Rich curses-based terminal interface with expandable diffs, syntax highlights, and keyboard controls.',
        practicalBenefit: 'Full IDE-grade visualization without leaving your shell.'
      },
      {
        name: 'Pipe & Script Friendly (UNIX Philosophy)',
        description: 'Pipe error logs into FLOAT: `cat test.log | float "fix this crash"` for instant terminal remediation.',
        practicalBenefit: 'Composes naturally with standard UNIX tools like grep, find, and awk.'
      }
    ],
    whenToUseScenarios: [
      {
        title: 'Remote SSH Server Development',
        description: 'Modifying code and diagnosing crashes on remote Linux servers and cloud VMs without a GUI.'
      },
      {
        title: 'Automated CI PR Reviews',
        description: 'Running autonomous agents on pull requests to verify security rules and recommend fixes.'
      },
      {
        title: 'Vim / Neovim Workflows',
        description: 'Invoking FLOAT directly from inside Neovim buffers using :!float or custom Lua keybindings.'
      }
    ],
    workflowAndIntegrations: {
      leadText: 'FLOAT CLI connects directly with Git and cloud agents:',
      connectedTools: [
        { name: 'Terminal', role: 'Shares the same underlying execution engine as the Desktop terminal', slug: 'terminal' },
        { name: 'Git & Checkpoints', role: 'Integrates natively with local git repositories and commits', slug: 'git-checkpoints' },
        { name: 'Web & Mobile', role: 'Queue tasks from the CLI to finish in cloud agents', slug: 'web-mobile' }
      ]
    },
    requirementsAndLimitations: {
      availabilityStatus: 'Available',
      authRequired: true,
      providerKeyRequired: false,
      environmentNotes: 'Works on any POSIX terminal (Linux, macOS) and Windows (PowerShell/WSL). Requires Node.js >= 18.',
      knownLimitations: [
        'Interactive curses UI requires ANSI terminal emulator support (iTerm2, Alacritty, Kitty, Windows Terminal).',
        'Headless CI mode requires configuring a FLOAT API token in your CI secrets.'
      ]
    },
    faq: [
      {
        question: 'How do I install the FLOAT CLI?',
        answer: 'Run `npm install -g @float-ai/cli` or use our one-line installer script `curl -fsSL https://float.dev/install.sh | bash`.'
      },
      {
        question: 'Can I use the CLI without opening the desktop app?',
        answer: 'Yes. FLOAT CLI is completely standalone and operates independently of the desktop application.'
      },
      {
        question: 'How do I authenticate the CLI?',
        answer: 'Run `float login` to open a quick browser authentication page, or export FLOAT_API_KEY in your environment.'
      },
      {
        question: 'Does the CLI support streaming output?',
        answer: 'Yes. The CLI streams agent thinking and file diffs with real-time token rendering.'
      }
    ],
    relatedFeatures: [
      { slug: 'desktop', title: 'Desktop', category: 'Surfaces', description: 'The visual IDE experience for full-screen development.' },
      { slug: 'terminal', title: 'Terminal', category: 'Tools', description: 'Embedded shell execution inside the desktop app.' },
      { slug: 'agents', title: 'Autonomous Agents', category: 'Execution', description: 'Autonomous coding agents powered by FLOAT.' }
    ]
  },
  {
    slug: 'other-surfaces',
    title: 'Other Surfaces',
    badgeCategory: 'Everywhere You Work',
    headline: 'Summon FLOAT agents from GitHub, Slack, Linear, and JetBrains IDEs',
    introParagraph: 'Software collaboration happens across diverse platforms. You shouldn\'t have to switch tools to initiate an AI task. With FLOAT Other Surfaces, mention @float in a GitHub pull request, comment on a Linear issue, or type /float in Slack to launch cloud agents that investigate, fix, and commit code directly.',
    primaryAction: {
      label: 'Connect Integrations',
      href: '/integrations',
      description: 'Set up GitHub, Slack, and Linear connections'
    },
    secondaryAction: {
      label: 'Explore all features',
      href: '/features'
    },
    mockupType: 'other',
    whatItDoes: {
      overview: 'Other Surfaces extends FLOAT agents beyond the editor into your team\'s everyday collaboration software.',
      problemSolved: 'Breaks down the barrier between issue reporting, team discussion, and code execution by enabling in-place task triggering.',
      targetAudience: 'Engineering managers, product managers, developers, and QA leads collaborating across distributed teams.',
      whenToUse: 'When reviewing PRs on GitHub, triaging tickets in Linear, or discussing bug fixes in Slack channels.',
      workflowFit: 'Mention @float in any supported surface with clear instructions. The agent spins up in the cloud, branches the repo, and replies with a PR.'
    },
    howItWorks: [
      {
        stepNumber: 1,
        title: 'Mention & Webhook Ingestion',
        developerAction: 'Comment "@float can you review this PR?" on GitHub or type "/float fix typo" in Slack.',
        floatAction: 'Captures webhook event, validates workspace authentication, and parses referenced PR or issue context.',
        involvedArtifacts: 'Webhook payload, repository branch, comment text.',
        outputProduced: 'Immediate acknowledgment reaction or bot reply (e.g. "FLOAT bot reviewing...").',
        inspectionAndApproval: 'User verifies bot acknowledgment in the chat thread.'
      },
      {
        stepNumber: 2,
        title: 'Cloud Agent Dispatch',
        developerAction: 'Continue with other work while the agent operates asynchronously.',
        floatAction: 'Clones repository branch in a secure ephemeral cloud sandbox, reproduces issue, and prepares code fix.',
        involvedArtifacts: 'Cloud VM container, repository tree, test runner.',
        outputProduced: 'Streaming progress updates posted directly back to the discussion thread.',
        inspectionAndApproval: 'Team members can monitor progress in real-time.'
      },
      {
        stepNumber: 3,
        title: 'Pull Request & Review Delivery',
        developerAction: 'Inspect the generated PR or inline code review comments.',
        floatAction: 'Pushes new branch, creates GitHub pull request with detailed explanation, and links back to the issue.',
        involvedArtifacts: 'GitHub PR, commit history, CI build status.',
        outputProduced: 'Complete PR ready for human team review and merging.',
        inspectionAndApproval: 'Developer merges PR using standard repository branch protections.'
      }
    ],
    practicalExample: {
      scenarioTitle: 'Reviewing and patching a frontend UI bug directly from a GitHub Pull Request comment',
      problem: 'A contributor submitted a PR with a modal state bug; senior engineer requests FLOAT to review and fix.',
      developerPrompt: 'Comment on PR #412: "@float can you review this PR, fix the modal open state bug, and commit to the branch?"',
      executionProcess: [
        'FLOAT bot receives GitHub webhook for PR #412.',
        'Analyzes diff in src/vs/workbench/composer/index.tsx.',
        'Identifies that selectedMode() was invoked instead of composerOpenMode().',
        'Pushes commit 4a8e1b with verified fix and leaves a comment explaining the change.'
      ],
      codeOrDiffType: 'diff',
      codeOrDiffSnippet: `// GitHub Bot Commit on PR #412:
  src/vs/workbench/composer/ComposerView.tsx
- 3292   if (selectedMode().key === 'agent') {
+ 3293   if (composerOpenMode.get() === 'agent') {
           activateAgentPanel();
         }
[FLOAT Bot] Review complete: Fixed stale function invocation. Build passed cleanly.`,
      verificationStep: 'CI passes on GitHub and the PR reviewer approves the merge.'
    },
    keyCapabilities: [
      {
        name: 'GitHub PR Auto-Review & Fix',
        description: 'Summon FLOAT to explain complex PRs, catch hidden security issues, and push corrective commits with your approval.',
        practicalBenefit: 'Accelerates team code reviews and unblocks contributors faster.'
      },
      {
        name: 'Slack & Teams Conversational Triggers',
        description: 'Trigger cloud tasks directly from team channels without leaving your chat application.',
        practicalBenefit: 'Empowers product managers and QA to report bugs and initiate fixes immediately.'
      },
      {
        name: 'Linear & Jira Issue Auto-Resolution',
        description: 'Assign a bug ticket to @float in Linear; the agent creates a branch, implements the fix, and attaches a PR.',
        practicalBenefit: 'Automates low-hanging maintenance and bug tickets effortlessly.'
      }
    ],
    whenToUseScenarios: [
      {
        title: 'Asynchronous Code Reviews',
        description: 'Asking FLOAT to do an initial sanity and security pass before human engineers review.'
      },
      {
        title: 'Slack Incident Remediation',
        description: 'Creating hotfixes and deployment rollbacks directly from an incident response channel.'
      },
      {
        title: 'Backlog Maintenance',
        description: 'Having FLOAT tackle routine dependency updates and deprecation warnings from Linear tickets.'
      }
    ],
    workflowAndIntegrations: {
      leadText: 'Other Surfaces connect with Web, Mobile, and Cloud Agents:',
      connectedTools: [
        { name: 'Web & Mobile', role: 'Monitor surface-triggered cloud agent runs from your phone', slug: 'web-mobile' },
        { name: 'Agents', role: 'The same core autonomous agent powers surface interactions', slug: 'agents' },
        { name: 'Plugins', role: 'Manage credentials and webhook configurations for each service', slug: 'plugins' }
      ]
    },
    requirementsAndLimitations: {
      availabilityStatus: 'Available',
      authRequired: true,
      providerKeyRequired: false,
      environmentNotes: 'Requires configuring the FLOAT GitHub App or Slack Bot in your team organization settings.',
      knownLimitations: [
        'GitHub Bot operates within repository permissions granted during OAuth app installation.',
        'Requires public or webhook-reachable repository access (GitHub Enterprise requires configuring proxy tunnels).'
      ]
    },
    faq: [
      {
        question: 'Does the GitHub bot have permission to merge directly to main?',
        answer: 'No. The bot adheres strictly to your repository branch protection rules and always opens a pull request for human approval.'
      },
      {
        question: 'Which services are supported today?',
        answer: 'GitHub and Slack are fully supported today. Linear, Jira, and JetBrains IDE extensions are currently in active preview.'
      },
      {
        question: 'Can any Slack user trigger an agent?',
        answer: 'No. Only team members with verified FLOAT accounts in your team organization can trigger agent executions.'
      },
      {
        question: 'How do we track usage across different surfaces?',
        answer: 'All executions are attributed to the triggering user and aggregated in your team Usage & Billing dashboard.'
      }
    ],
    relatedFeatures: [
      { slug: 'web-mobile', title: 'Web & Mobile', category: 'Surfaces', description: 'Monitor agents on the go from your phone or browser.' },
      { slug: 'agents', title: 'Autonomous Agents', category: 'Execution', description: 'Autonomous agents executing tasks across surfaces.' },
      { slug: 'plugins', title: 'Plugins', category: 'Extension', description: 'Configure Slack, GitHub, and Jira integrations.' }
    ]
  },
  {
    slug: 'web-mobile',
    title: 'Web & Mobile',
    badgeCategory: 'Everywhere You Work',
    headline: 'Run cloud agents from your browser or smartphone on the go',
    introParagraph: 'Great ideas and critical incidents don\'t wait until you\'re seated at your desk. FLOAT Web & Mobile lets you launch, monitor, and guide cloud coding agents from any device—whether checking a build on your iPad, approving a PR on your phone, or coding in a browser on a borrowed laptop.',
    primaryAction: {
      label: 'Open Web Workspace',
      href: '/',
      description: 'Start using FLOAT in your web browser right now'
    },
    secondaryAction: {
      label: 'Explore all features',
      href: '/features'
    },
    mockupType: 'web-mobile',
    whatItDoes: {
      overview: 'FLOAT Web & Mobile provides a fully cloud-backed development experience accessible from any modern web browser or mobile app.',
      problemSolved: 'Frees engineers from being tied to a specific heavyweight workstation, allowing remote review, quick bug fixes, and agent dispatching from anywhere.',
      targetAudience: 'Engineers on call, digital nomads, managers approving changes, and developers working across multiple computers.',
      whenToUse: 'When away from your primary computer, triaging urgent production issues, or reviewing agent task progress.',
      workflowFit: 'Visit float.dev on your mobile device or desktop browser. Sessions synchronize with your cloud repositories automatically.'
    },
    howItWorks: [
      {
        stepNumber: 1,
        title: 'Cloud Workspace Provisioning',
        developerAction: 'Log in to float.dev or open the FLOAT mobile app.',
        floatAction: 'Connects to your active workspace, synchronizes recent projects, and displays live agent runs.',
        involvedArtifacts: 'Cloud Firestore session store, repository credentials.',
        outputProduced: 'Mobile-responsive dashboard with active task cards.',
        inspectionAndApproval: 'Developer selects an existing project or starts a new task.'
      },
      {
        stepNumber: 2,
        title: 'Task Dispatch & Telemetry Stream',
        developerAction: 'Dictate or type an instruction (e.g. "Fix sign-in redirect on iOS").',
        floatAction: 'Dispatches task to a secure cloud container, streaming logs, file diffs, and thought processes via WebSocket.',
        involvedArtifacts: 'Cloud runner, WebSocket stream, push notifications.',
        outputProduced: 'Live status feed: [Analyzing codebase] -> [Planning next moves].',
        inspectionAndApproval: 'Developer can inspect progress and send guidance messages while walking or commuting.'
      },
      {
        stepNumber: 3,
        title: 'Mobile Diff Inspection & Approval',
        developerAction: 'Receive push notification: "Task complete: Ready for review".',
        floatAction: 'Renders touch-optimized side-by-side diff view with one-tap "Approve & Merge" button.',
        involvedArtifacts: 'Mobile diff viewer, Git pull request engine.',
        outputProduced: 'Merged pull request and deployed staging build.',
        inspectionAndApproval: 'Developer taps approve to ship the fix to production.'
      }
    ],
    practicalExample: {
      scenarioTitle: 'Diagnosing and resolving an urgent OAuth redirect bug on mobile while on-call',
      problem: 'On-call alert fires during a commute: iOS mobile users cannot complete Google Sign-in redirect.',
      developerPrompt: 'Mobile App prompt: "Fix sign-in redirect on iOS mobile Safari in src/features/auth/SignUpPage.tsx and run tests"',
      executionProcess: [
        'Cloud agent pulls repo in an isolated container.',
        'Identifies popup blocking issue in mobile Safari webkit.',
        'Switches mobile auth flow to redirect strategy with state persistence.',
        'Runs test suite and streams passing results to your phone.'
      ],
      codeOrDiffType: 'diff',
      codeOrDiffSnippet: `// src/features/auth/SignUpPage.tsx (Mobile Review):
- await signInWithPopup(auth, googleProvider);
+ if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
+   await signInWithRedirect(auth, googleProvider);
+ } else {
+   await signInWithPopup(auth, googleProvider);
+ }
[Cloud Agent] Tests passed (4/4). Deployed preview URL: https://staging.float.dev/pr-89`,
      verificationStep: 'Developer tests preview URL on their phone, verifies smooth login, and taps Approve.'
    },
    keyCapabilities: [
      {
        name: 'Touch-Optimized Diff Review',
        description: 'Review code diffs on mobile screens with collapsible file cards, swipe gestures, and clear syntax highlighting.',
        practicalBenefit: 'Inspect changes comfortably on small screens without horizontal scrolling fatigue.'
      },
      {
        name: 'Push Notification Alerts',
        description: 'Get notified on your phone when an agent finishes an ambitious multi-hour task or encounters a roadblock.',
        practicalBenefit: 'No need to babysit running agents; stay informed wherever you are.'
      },
      {
        name: 'Cloud-Persistent Sessions',
        description: 'Start a task on your desktop, leave your office, and resume reviewing on your phone with zero state loss.',
        practicalBenefit: 'Seamless continuity across all devices in your workflow.'
      }
    ],
    whenToUseScenarios: [
      {
        title: 'On-Call Incident Response',
        description: 'Responding quickly to high-priority bug alerts while away from your desk.'
      },
      {
        title: 'Async PR Approvals',
        description: 'Reviewing and approving pull requests during commutes or travel.'
      },
      {
        title: 'Long-Running Agent Monitoring',
        description: 'Checking in on multi-hour migration or testing tasks running in the cloud.'
      }
    ],
    workflowAndIntegrations: {
      leadText: 'Web & Mobile connect directly to the Desktop and Cloud Agent infrastructure:',
      connectedTools: [
        { name: 'Desktop', role: 'Synchronizes your workspace and projects between desktop and cloud', slug: 'desktop' },
        { name: 'Other Surfaces', role: 'Interact with the same cloud agents from Slack and GitHub', slug: 'other-surfaces' },
        { name: 'Autonomous Agents', role: 'Cloud agents execute your tasks reliably on high-spec cloud VMs', slug: 'agents' }
      ]
    },
    requirementsAndLimitations: {
      availabilityStatus: 'Available',
      authRequired: true,
      providerKeyRequired: false,
      environmentNotes: 'Web version works in Chrome, Safari, Firefox, and Edge. iOS app in public beta; Android in development.',
      knownLimitations: [
        'Complex multi-cursor keyboard editing is optimized for desktop; mobile interface focuses on prompt guidance and diff approval.',
        'Offline mobile execution is not supported; requires internet connection to communicate with cloud agents.'
      ]
    },
    faq: [
      {
        question: 'Can I write code manually on my phone?',
        answer: 'Yes, but the mobile interface is primarily designed for prompting, reviewing diffs, and approving actions. For heavy manual typing, Desktop or tablet with keyboard is recommended.'
      },
      {
        question: 'Are cloud agents secure?',
        answer: 'Yes. Cloud agents execute in ephemeral, isolated microVM containers with encrypted communication and strict firewall rules.'
      },
      {
        question: 'Does the mobile app drain my phone\'s battery?',
        answer: 'No. Computation and model reasoning occur on FLOAT cloud infrastructure, not on your device.'
      },
      {
        question: 'How do I join the iOS beta?',
        answer: 'Sign in to your FLOAT account and navigate to Resources > Mobile Beta to request TestFlight access.'
      }
    ],
    relatedFeatures: [
      { slug: 'desktop', title: 'Desktop', category: 'Surfaces', description: 'The flagship local IDE for desktop environments.' },
      { slug: 'other-surfaces', title: 'Other Surfaces', category: 'Surfaces', description: 'Trigger agents from Slack, GitHub, and Linear.' },
      { slug: 'agents', title: 'Autonomous Agents', category: 'Execution', description: 'High-power cloud agents executing tasks in parallel.' }
    ]
  }
];
