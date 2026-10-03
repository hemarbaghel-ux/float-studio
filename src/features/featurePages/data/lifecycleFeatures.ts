import { FeatureDetail } from '../types';

export const lifecycleFeatures: FeatureDetail[] = [
  {
    slug: 'plan',
    title: 'Plan',
    badgeCategory: 'Full Development Lifecycle',
    headline: 'Structured architectural planning before touching a single file',
    introParagraph: 'Complex tasks fail when agents rush to edit code without understanding architecture, state flow, and side-effects. Plan mode decomposes your requirements, asks proactive clarifying questions, produces a structured multi-file execution plan, and waits for your confirmation before writing code.',
    primaryAction: {
      label: 'Open Workspace Planner',
      href: '/',
      description: 'Start a session in the FLOAT IDE and select Plan mode'
    },
    secondaryAction: {
      label: 'Explore all features',
      href: '/features'
    },
    mockupType: 'plan',
    whatItDoes: {
      overview: 'Plan mode is a specialized reasoning workflow in FLOAT designed for multi-step features, large refactors, and architectural redesigns.',
      problemSolved: 'Eliminates premature edits, circular file modifications, unhandled edge-cases, and hallucinated dependencies that occur when LLMs start coding before scoping.',
      targetAudience: 'Senior engineers, architects, and product developers implementing non-trivial features across complex codebases.',
      whenToUse: 'Whenever a change impacts three or more files, alters public APIs or database schemas, or involves ambiguous trade-offs.',
      workflowFit: 'Serves as Phase 0 in the development cycle. Once approved, the plan transforms into atomic sub-tasks executed by the active agent.'
    },
    howItWorks: [
      {
        stepNumber: 1,
        title: 'Requirement & Intent Ingestion',
        developerAction: 'Enter your feature requirement or paste an issue ticket into the FLOAT composer.',
        floatAction: 'FLOAT analyzes current repository context, checks recent git diffs, and scans import trees.',
        involvedArtifacts: 'Prompt input, workspace directory map, package.json, schema files.',
        outputProduced: 'Clarification query list identifying ambiguities, missing contracts, or edge cases.',
        inspectionAndApproval: 'Developer selects or types answers to the proactive questions.'
      },
      {
        stepNumber: 2,
        title: 'Dependency Graph & Impact Analysis',
        developerAction: 'Review the identified files and component boundaries.',
        floatAction: 'Constructs an impact graph of caller functions, route endpoints, and store subscribers.',
        involvedArtifacts: 'TypeScript AST, symbol index, route registry.',
        outputProduced: 'Ordered list of target files and expected mutations.',
        inspectionAndApproval: 'Developer can prune or add files to the execution scope.'
      },
      {
        stepNumber: 3,
        title: 'Step-by-Step Execution Plan Generation',
        developerAction: 'Inspect the generated specification document with atomic phases.',
        floatAction: 'Generates markdown task breakdown with rollback conditions and validation tests for each step.',
        involvedArtifacts: 'FLOAT Planner agent synthesis.',
        outputProduced: 'Interactive checklist displaying files, interfaces, and testing strategies.',
        inspectionAndApproval: 'Developer clicks "Approve & Execute" or suggests modifications.'
      }
    ],
    practicalExample: {
      scenarioTitle: 'Adding RBAC permission guards to multi-tenant project routes',
      problem: 'Need to add role-based authorization to 14 API endpoints and 4 UI layouts without breaking existing tenant sessions.',
      developerPrompt: 'Implement role-based access control (Admin, Member, Viewer) on our project workspace routes and backend handlers.',
      executionProcess: [
        'Analyzes src/server/authMiddleware.ts and current user token claims.',
        'Asks: "Should Viewer role have read-only access to Monaco editor, or can they edit drafts locally?"',
        'Developer answers: "Read-only in editor, disabled save button."',
        'Generates 4-phase execution plan: (1) Type declarations, (2) Express middleware, (3) UI Action guards, (4) Regression tests.'
      ],
      codeOrDiffType: 'diff',
      codeOrDiffSnippet: `// Phase 1 Plan Output: src/types/permissions.ts
+ export type UserRole = 'admin' | 'member' | 'viewer';
+ export interface TenantPermission {
+   canEditCode: boolean;
+   canRunTerminal: boolean;
+   canManageIntegrations: boolean;
+ }
+ export const ROLE_PERMISSIONS: Record<UserRole, TenantPermission> = {
+   admin: { canEditCode: true, canRunTerminal: true, canManageIntegrations: true },
+   member: { canEditCode: true, canRunTerminal: true, canManageIntegrations: false },
+   viewer: { canEditCode: false, canRunTerminal: false, canManageIntegrations: false }
+ };`,
      verificationStep: 'Developer approves the plan and monitors the agent sequentially check off each atomic task.'
    },
    keyCapabilities: [
      {
        name: 'Proactive Clarification Engine',
        description: 'Detects ambiguous design decisions and surfaces multiple-choice or short-answer questions before coding.',
        practicalBenefit: 'Prevents wasted iterations and code rollbacks caused by misunderstood requirements.'
      },
      {
        name: 'Multi-File Dependency Mapping',
        description: 'Identifies all upstream callers and downstream consumers that will be affected by a proposed change.',
        practicalBenefit: 'Ensures type definitions and runtime consumers are updated in tandem.'
      },
      {
        name: 'Phase Checkpointing',
        description: 'Splits large jobs into distinct milestones with checkpoints saved before risky modifications.',
        practicalBenefit: 'You can pause, review, or safely revert an individual phase without losing the whole task.'
      }
    ],
    whenToUseScenarios: [
      {
        title: 'Greenfield Feature Implementation',
        description: 'When building a major module such as Stripe billing, OAuth integrations, or canvas editors from scratch.'
      },
      {
        title: 'Core Architecture Refactoring',
        description: 'When migrating from Redux to Zustand, upgrading Next.js app router versions, or updating database schemas.'
      },
      {
        title: 'Cross-Cutting Security Updates',
        description: 'When auditing and applying authenticated route guards across dozens of API controllers.'
      }
    ],
    workflowAndIntegrations: {
      leadText: 'Plan mode integrates natively with FLOAT agents, Codebase Search, and Team Rules:',
      connectedTools: [
        { name: 'Agents', role: 'Executes approved plan milestones step-by-step', slug: 'agents' },
        { name: 'Codebase Search', role: 'Indexes files to verify symbol references during planning', slug: 'codebase-search' },
        { name: 'Team Rules', role: 'Injects architectural guidelines into the generated plan', slug: 'team-rules' },
        { name: 'Git & Checkpoints', role: 'Stores state snapshots before each planned phase runs', slug: 'git-checkpoints' }
      ]
    },
    requirementsAndLimitations: {
      availabilityStatus: 'Available',
      authRequired: true,
      providerKeyRequired: false,
      environmentNotes: 'Runs in FLOAT Web and Desktop IDE. Compatible with all supported AI providers.',
      knownLimitations: [
        'Execution remains subject to developer review; FLOAT does not execute destructive shell commands without consent.',
        'Extremely large repositories (100k+ files) require indexing completion before complete dependency maps are calculated.'
      ]
    },
    faq: [
      {
        question: 'Does Plan mode immediately modify my project files?',
        answer: 'No. Plan mode produces a comprehensive specification and step breakdown. It will only begin modifying files after you explicitly click Approve or instruct the agent to proceed.'
      },
      {
        question: 'Can I edit the generated plan before running it?',
        answer: 'Yes. You can directly edit the plan markdown in the composer, ask the agent to add constraints, or remove files from the scope.'
      },
      {
        question: 'Which AI model powers Plan mode in FLOAT?',
        answer: 'By default, FLOAT routes Plan mode to high-reasoning models (such as Gemini 2.5 Pro or Claude 3.7 Sonnet) which excel at complex dependency mapping and architectural synthesis.'
      },
      {
        question: 'How is this different from asking a general chatbot for a plan?',
        answer: 'FLOAT Plan mode inspects your actual local workspace files, AST symbol tables, and package dependencies, rather than generating abstract hypothetical advice.'
      }
    ],
    relatedFeatures: [
      { slug: 'agents', title: 'Autonomous Agents', category: 'Autonomous Execution', description: 'Executes planned milestones across multiple files in parallel.' },
      { slug: 'codebase-search', title: 'Fast Codebase Search', category: 'Intelligence', description: 'Instant grep and symbol search across your entire codebase.' },
      { slug: 'team-rules', title: 'Team Rules', category: 'Governance', description: 'Enforce team coding standards and architecture constraints during planning.' }
    ]
  },
  {
    slug: 'design',
    title: 'Design',
    badgeCategory: 'Full Development Lifecycle',
    headline: 'Bridge visual interfaces and code with precision UI editing',
    introParagraph: 'Software design is not an afterthought separated from code. In FLOAT, visual components and their underlying TSX/CSS structures are connected directly. Inspect elements in preview, request visual adjustments, and have FLOAT generate clean, idiomatic Tailwind and CSS variables that respect your design system.',
    primaryAction: {
      label: 'Open Workspace',
      href: '/',
      description: 'Test UI editing and preview in the FLOAT IDE'
    },
    secondaryAction: {
      label: 'Explore all features',
      href: '/features'
    },
    mockupType: 'design',
    whatItDoes: {
      overview: 'Design mode connects the rendered web application preview directly to the component hierarchy in Monaco Editor.',
      problemSolved: 'Eliminates tedious back-and-forth guessing of padding, colors, flex arrangements, and responsive breakpoints.',
      targetAudience: 'Frontend engineers, design engineers, and full-stack developers crafting polished user interfaces.',
      whenToUse: 'When styling components, building responsive layouts, adjusting themes, or fixing visual alignment defects.',
      workflowFit: 'Use alongside the live preview window in FLOAT to inspect DOM elements and command design revisions.'
    },
    howItWorks: [
      {
        stepNumber: 1,
        title: 'Element Selection & Component Resolution',
        developerAction: 'Click an element in the application preview or provide its component path.',
        floatAction: 'Maps the DOM element to its source TSX file, line number, and active Tailwind utility classes.',
        involvedArtifacts: 'React DOM tree, Vite sourcemaps, Tailwind CSS tokens.',
        outputProduced: 'Targeted selector and style inspection inspector card.',
        inspectionAndApproval: 'Developer confirms the target component.'
      },
      {
        stepNumber: 2,
        title: 'Visual Modification Directive',
        developerAction: 'Specify the visual adjustment (e.g. "make this CTA button high-contrast with subtle hover lift and rounded-lg").',
        floatAction: 'Determines the existing color tokens, design system constraints, and accessibility requirements.',
        involvedArtifacts: 'Tailwind config, theme CSS variables, Lucide icons.',
        outputProduced: 'Clean TSX diff updating utility classes without introducing inline styles.',
        inspectionAndApproval: 'Developer reviews side-by-side visual diff before applying.'
      },
      {
        stepNumber: 3,
        title: 'Hot Reload & Visual Verification',
        developerAction: 'Observe the updated component in preview and test responsive viewports.',
        floatAction: 'Applies edits through the Monaco diff reviewer with instant hot module replacement.',
        involvedArtifacts: 'Vite dev server, browser iframe viewport.',
        outputProduced: 'Updated production-ready component code.',
        inspectionAndApproval: 'Developer approves the diff or requests further micro-refinements.'
      }
    ],
    practicalExample: {
      scenarioTitle: 'Converting a plain navigation link into a high-visibility CTA',
      problem: 'The "Join our team" link on the landing page is easily missed and lacks accessible hover and focus rings.',
      developerPrompt: 'Transform the JoinTeamLink <a> into a modern dark-mode compatible primary button with icon and accessible focus ring.',
      executionProcess: [
        'Locates JoinTeamLink component in src/components/Navigation.tsx.',
        'Extracts current theme tokens and button component primitives.',
        'Generates precise Tailwind utility classes adhering to WCAG AA contrast standards.'
      ],
      codeOrDiffType: 'diff',
      codeOrDiffSnippet: `// src/components/Navigation.tsx
- <a href="/careers" className="text-slate-600 dark:text-slate-300 text-sm">
-   Join our team &rarr;
- </a>
+ <a 
+   href="/careers" 
+   className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 dark:bg-white dark:text-black rounded-lg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500 transition-all shadow-sm"
+ >
+   Join our team <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
+ </a>`,
      verificationStep: 'Developer tests keyboard navigation with Tab and inspects light/dark mode contrast.'
    },
    keyCapabilities: [
      {
        name: 'Design System Token Respect',
        description: 'Uses existing CSS variables and Tailwind classes rather than hardcoded hexadecimal values or inline styles.',
        practicalBenefit: 'Maintains cohesive styling across all pages without style fragmentation.'
      },
      {
        name: 'WCAG AA Accessibility Discipline',
        description: 'Automatically validates contrast ratios, keyboard focus states, and aria attributes during UI generation.',
        practicalBenefit: 'Produces accessible interfaces by default.'
      },
      {
        name: 'Responsive Viewport Testing',
        description: 'Verify layout behavior across desktop (1440px), tablet (768px), and mobile (375px) boundaries.',
        practicalBenefit: 'Catches overflow, clipping, and cramped typography early.'
      }
    ],
    whenToUseScenarios: [
      {
        title: 'Polishing Customer-Facing Landing Pages',
        description: 'Refining typography, button states, spacing, and mobile navbars for public launches.'
      },
      {
        title: 'Dashboard & Data Grid Styling',
        description: 'Aligning dense tabular data, status indicators, and collapsible panels with pixel accuracy.'
      },
      {
        title: 'Theme Harmonization',
        description: 'Ensuring seamless switching between light and dark modes with proper background contrasts.'
      }
    ],
    workflowAndIntegrations: {
      leadText: 'Design workflows connect directly with FLOAT code editing and preview:',
      connectedTools: [
        { name: 'Desktop & IDE', role: 'Live preview split-pane next to Monaco Editor', slug: 'desktop' },
        { name: 'Git & Checkpoints', role: 'Snapshot previous visual states before applying major design updates', slug: 'git-checkpoints' },
        { name: 'Team Rules', role: 'Enforces component library rules (e.g. no raw CSS, zero-pill discipline)', slug: 'team-rules' }
      ]
    },
    requirementsAndLimitations: {
      availabilityStatus: 'Available',
      authRequired: false,
      providerKeyRequired: false,
      environmentNotes: 'Works with React, Tailwind CSS v4, and standard modern web stacks.',
      knownLimitations: [
        'Direct drag-and-drop spatial canvas manipulation is currently in preview; code-driven prompt modifications with live preview are fully supported.',
        'Requires standard web frameworks (React, Vue, Svelte, or HTML5) for DOM-to-source mapping.'
      ]
    },
    faq: [
      {
        question: 'Does FLOAT write inline CSS styles or Tailwind classes?',
        answer: 'FLOAT strictly prioritizes Tailwind utility classes and CSS variables defined in your project tokens, avoiding messy inline styles.'
      },
      {
        question: 'Can FLOAT generate SVG icons or does it use an icon library?',
        answer: 'FLOAT relies on the installed icon library (such as Lucide React) to keep bundle sizes minimal and icons consistent.'
      },
      {
        question: 'Will FLOAT break my existing CSS modules or Tailwind config?',
        answer: 'No. FLOAT inspects your existing styling setup before proposing changes and adheres to the established project structure.'
      },
      {
        question: 'How do I test my changes across screen sizes?',
        answer: 'The integrated preview panel includes quick viewport toggles for desktop, tablet, and mobile breakpoints.'
      }
    ],
    relatedFeatures: [
      { slug: 'plan', title: 'Plan Mode', category: 'Lifecycle', description: 'Plan complex frontend component hierarchies before styling.' },
      { slug: 'desktop', title: 'Desktop & IDE', category: 'Surfaces', description: 'The split-pane development environment with integrated Monaco editor.' },
      { slug: 'team-rules', title: 'Team Rules', category: 'Governance', description: 'Enforce team design guidelines and layout standards.' }
    ]
  },
  {
    slug: 'debug',
    title: 'Debug',
    badgeCategory: 'Full Development Lifecycle',
    headline: 'Instrument, analyze runtime logs, and pinpoint verified fixes',
    introParagraph: 'Fixing bugs requires real runtime evidence, not guesswork. FLOAT investigates errors by examining stack traces, instrumenting code with surgical logging, inspecting runtime terminal output, and identifying the true root cause rather than applying cosmetic band-aids.',
    primaryAction: {
      label: 'Open Debug Workspace',
      href: '/',
      description: 'Diagnose runtime errors and failing tests in FLOAT'
    },
    secondaryAction: {
      label: 'Explore all features',
      href: '/features'
    },
    mockupType: 'debug',
    whatItDoes: {
      overview: 'Debug mode is a specialized investigative capability in FLOAT that isolates errors, analyzes runtime telemetry, and proposes verified code fixes.',
      problemSolved: 'Stops developers from wasting hours chasing misleading error messages or applying superficial patches that mask underlying race conditions and state bugs.',
      targetAudience: 'Software engineers troubleshooting test failures, production exceptions, memory leaks, and asynchronous race conditions.',
      whenToUse: 'When a test fails, a build breaks, an unhandled exception occurs in dev, or state fails to update as expected.',
      workflowFit: 'Connects directly with the integrated terminal and problems panel. Send any error directly to the AI panel with one click.'
    },
    howItWorks: [
      {
        stepNumber: 1,
        title: 'Error Capture & Context Ingestion',
        developerAction: 'Click "Debug with FLOAT" on a terminal error or paste the exception message.',
        floatAction: 'Extracts file paths, line numbers, error codes, and the active call stack.',
        involvedArtifacts: 'Terminal stdout/stderr, browser console logs, active editor buffers.',
        outputProduced: 'Structured issue diagnosis card identifying the error boundary.',
        inspectionAndApproval: 'Developer confirms the target runtime problem.'
      },
      {
        stepNumber: 2,
        title: 'Causal Hypothesis & Instrumentation',
        developerAction: 'Review the identified hypothesis regarding why the bug occurs.',
        floatAction: 'Traces data flow from source inputs to the failure point, checking for null references, stale closures, or asynchronous timing issues.',
        involvedArtifacts: 'AST call graphs, state stores, hook dependencies.',
        outputProduced: 'Identified root cause explanation with supporting code locations.',
        inspectionAndApproval: 'Developer validates the diagnosis.'
      },
      {
        stepNumber: 3,
        title: 'Patch Generation & Test Verification',
        developerAction: 'Inspect the proposed diff in Monaco Editor.',
        floatAction: 'Proposes minimal surgical fix and offers to re-run the failing test or build command to verify.',
        involvedArtifacts: 'Monaco diff viewer, test runner output.',
        outputProduced: 'Clean fix ready to accept and commit.',
        inspectionAndApproval: 'Developer accepts the diff and verifies passing terminal output.'
      }
    ],
    practicalExample: {
      scenarioTitle: 'Investigating a frozen chart tooltip caused by a React stale closure',
      problem: 'High-frequency mousemove events cause the analytics tooltip to freeze and display obsolete data points.',
      developerPrompt: 'Chart tooltips freeze when hovering over data points in ChartRenderer.tsx. Diagnose and fix the issue.',
      executionProcess: [
        'Inspects server output and browser event listeners.',
        'Reads ChartRenderer.tsx and Tooltip.tsx.',
        'Identifies that useEffect lacked mousePosition in its dependency array, closing over an initial null state.',
        'Refactors event listener to use a ref callback or updated dependencies.'
      ],
      codeOrDiffType: 'diff',
      codeOrDiffSnippet: `// src/features/charts/Tooltip.tsx
- useEffect(() => {
-   const handler = (e: MouseEvent) => setCoords({ x: e.clientX, y: e.clientY });
-   window.addEventListener('mousemove', handler);
-   return () => window.removeEventListener('mousemove', handler);
- }, []); // Stale closure: misses active chart container bounds
+ const latestBounds = useRef(containerBounds);
+ latestBounds.current = containerBounds;
+ useEffect(() => {
+   const handler = (e: MouseEvent) => {
+     if (!latestBounds.current) return;
+     setCoords(computeRelativePosition(e, latestBounds.current));
+   };
+   window.addEventListener('mousemove', handler, { passive: true });
+   return () => window.removeEventListener('mousemove', handler);
+ }, []);`,
      verificationStep: 'Runs dev server check and confirms smooth 60fps tooltip movement with zero console warnings.'
    },
    keyCapabilities: [
      {
        name: 'Stack Trace De-obfuscation',
        description: 'Resolves minified stack traces back to actual TypeScript source lines using build maps.',
        practicalBenefit: 'Instantly identifies the exact file and line causing the failure.'
      },
      {
        name: 'Stale Closure & Race Condition Detection',
        description: 'Analyzes React hook dependency arrays, async/await ordering, and unhandled promise rejections.',
        practicalBenefit: 'Solves complex subtle frontend bugs that simple linters miss.'
      },
      {
        name: 'Automated Regression Verification',
        description: 'Integrates with test runners to run npm test or vitest immediately after generating a proposed fix.',
        practicalBenefit: 'Ensures the fix works and does not introduce side-effect regressions.'
      }
    ],
    whenToUseScenarios: [
      {
        title: 'Failing CI/CD Test Suites',
        description: 'Diagnosing flaky integration tests or unexpected mock mismatches.'
      },
      {
        title: 'Unhandled Production Exceptions',
        description: 'Deciphering cryptic 500 API errors and unhandled promise rejections.'
      },
      {
        title: 'Performance Regressions & Memory Leaks',
        description: 'Finding runaway useEffect re-renders and uncleaned event listeners.'
      }
    ],
    workflowAndIntegrations: {
      leadText: 'Debug mode works hand-in-hand with terminal execution and git history:',
      connectedTools: [
        { name: 'Terminal', role: 'Runs test commands and captures build logs', slug: 'terminal' },
        { name: 'Git & Checkpoints', role: 'Inspects recent commits that introduced the bug', slug: 'git-checkpoints' },
        { name: 'Codebase Search', role: 'Finds all usages of the failing function across the codebase', slug: 'codebase-search' }
      ]
    },
    requirementsAndLimitations: {
      availabilityStatus: 'Available',
      authRequired: true,
      providerKeyRequired: false,
      environmentNotes: 'Works with any language or framework supported in the FLOAT editor.',
      knownLimitations: [
        'AI diagnoses are predictive hypotheses; developers must always verify fixes against test suites before production deployment.',
        'Production debugging requires providing sanitised log samples; FLOAT does not access live customer servers directly without integration setup.'
      ]
    },
    faq: [
      {
        question: 'Does FLOAT automatically apply bug fixes without asking?',
        answer: 'Never. FLOAT presents proposed fixes in the Monaco diff viewer. You always maintain full control to review, edit, or reject any change.'
      },
      {
        question: 'Can FLOAT debug backend Node/Express and database queries?',
        answer: 'Yes. FLOAT analyzes backend API handlers, SQL/ORM queries, middleware errors, and authentication failures.'
      },
      {
        question: 'What if the bug is caused by a third-party npm package?',
        answer: 'FLOAT inspects your package.json, checks for known breaking changes in that package version, and suggests either a workaround or safe upgrade.'
      },
      {
        question: 'How do I pass private log files safely?',
        answer: 'You can sanitize sensitive tokens or user PII before pasting logs into the context panel.'
      }
    ],
    relatedFeatures: [
      { slug: 'terminal', title: 'Terminal', category: 'Developer Tools', description: 'Run builds, tests, and linters with real output inspection.' },
      { slug: 'git-checkpoints', title: 'Git & Checkpoints', category: 'Developer Tools', description: 'Compare working code against earlier functional snapshots.' },
      { slug: 'plan', title: 'Plan Mode', category: 'Lifecycle', description: 'Structure complex bug fixes that span multiple modules.' }
    ]
  }
];
