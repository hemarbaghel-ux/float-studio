import { FeatureDetail } from '../types';

export const extensionFeatures: FeatureDetail[] = [
  {
    slug: 'plugins',
    title: 'Plugins',
    badgeCategory: 'Extend with Tools and Knowledge',
    headline: 'Expand FLOAT capabilities with modular community and team integrations',
    introParagraph: 'Every team has a unique toolchain. The FLOAT Plugin architecture provides an open extensibility model to add third-party integrations, language servers, custom linters, and team-specific workflows directly into the editor. Install vetted extensions or build your own with clean JavaScript/TypeScript SDKs.',
    primaryAction: {
      label: 'Browse Integrations',
      href: '/integrations',
      description: 'Explore active and available integrations in the FLOAT dashboard'
    },
    secondaryAction: {
      label: 'Explore all features',
      href: '/features'
    },
    mockupType: 'plugins',
    whatItDoes: {
      overview: 'Plugins extend FLOAT with external service connections, custom commands, syntax engines, and specialized developer utilities.',
      problemSolved: 'Prevents developers from being locked into rigid monolithic toolchains by allowing custom integrations with issue trackers, design software, and cloud providers.',
      targetAudience: 'Engineering teams, platform engineers, and open-source contributors looking to customize their AI development environment.',
      whenToUse: 'When connecting FLOAT to Slack notifications, Figma design tokens, Jira/Linear tickets, or private company APIs.',
      workflowFit: 'Managed via the Integrations view in the Dashboard and accessible in the command palette via /add-plugin.'
    },
    howItWorks: [
      {
        stepNumber: 1,
        title: 'Discovery & Installation',
        developerAction: 'Open the Integrations catalog or type /add-plugin in the composer.',
        floatAction: 'Fetches verified plugin manifests, checks permission requirements, and displays capability disclosures.',
        involvedArtifacts: 'Plugin manifest (float-plugin.json), OAuth scope contracts.',
        outputProduced: 'Interactive plugin installation dialogue with permission review.',
        inspectionAndApproval: 'Developer explicitly authorizes requested scopes (e.g. read issues, write messages).'
      },
      {
        stepNumber: 2,
        title: 'Sandboxed Runtime Initialization',
        developerAction: 'Authenticate with the third-party service via secure OAuth.',
        floatAction: 'Initializes the plugin inside a scoped Web Worker or server-side adapter with zero access to private workspace tokens.',
        involvedArtifacts: 'Auth token vault, iframe/worker sandbox.',
        outputProduced: 'Active plugin service ready for command palette and agent invocation.',
        inspectionAndApproval: 'Developer can toggle permissions or revoke access at any time.'
      },
      {
        stepNumber: 3,
        title: 'Agent & Command Palette Interactivity',
        developerAction: 'Ask FLOAT to query the plugin (e.g. "import Figma styles into Tailwind config").',
        floatAction: 'Routes tool calls through the plugin adapter, validating inputs and formatting JSON responses.',
        involvedArtifacts: 'Plugin API endpoints, agent tool dispatcher.',
        outputProduced: 'Structured data injected directly into the development workflow.',
        inspectionAndApproval: 'Developer reviews proposed changes before committing.'
      }
    ],
    practicalExample: {
      scenarioTitle: 'Connecting the Slack messaging plugin to broadcast deployment notifications',
      problem: 'Need to notify the #engineering-releases channel whenever a production build succeeds.',
      developerPrompt: '/add-plugin slack and configure release notification on npm run build success',
      executionProcess: [
        'Opens secure Slack OAuth flow.',
        'Injects Slack Webhook tool into active agent registry.',
        'Configures post-build script hook in package.json.',
        'Sends test payload with commit hash and author.'
      ],
      codeOrDiffType: 'code',
      codeOrDiffSnippet: `// float-plugin.json manifest example:
{
  "id": "slack-messaging-kit",
  "name": "Slack Messaging Kit",
  "version": "1.2.0",
  "permissions": ["network:slack.com", "hooks:post-build"],
  "tools": [
    {
      "name": "send_slack_message",
      "description": "Post build status or test summary to team channel",
      "parameters": {
        "channel": "string",
        "message": "string",
        "status": "success | failure"
      }
    }
  ]
}`,
      verificationStep: 'Developer tests message delivery in Slack and verifies no unexpected network requests occur.'
    },
    keyCapabilities: [
      {
        name: 'Fine-Grained Permission Scoping',
        description: 'Every plugin must declare exact network domains and file permissions in its manifest.',
        practicalBenefit: 'Eliminates security risks associated with unvetted third-party editor extensions.'
      },
      {
        name: 'Agent Tool Exposing',
        description: 'Plugins can register functions directly as AI tools for agents to query and execute with approval.',
        practicalBenefit: 'Enables your AI agent to pull live issues from Linear, mockups from Figma, or error rates from Sentry.'
      },
      {
        name: 'Zero-Reboot Hot Reloading',
        description: 'Install or update plugins dynamically without needing to restart your editor or lose active chat sessions.',
        practicalBenefit: 'Seamless developer experience with immediate availability.'
      }
    ],
    whenToUseScenarios: [
      {
        title: 'Team Workflow Automation',
        description: 'Connecting Jira, GitHub, or Linear to auto-assign PRs and close bug tickets from code commits.'
      },
      {
        title: 'Design-to-Code Sync',
        description: 'Syncing design tokens from Figma directly into React components and Tailwind configuration.'
      },
      {
        title: 'Observability & Error Monitoring',
        description: 'Pulling Sentry error traces directly into FLOAT Debug mode to reproduce production bugs.'
      }
    ],
    workflowAndIntegrations: {
      leadText: 'Plugins complement Skills and the Model Context Protocol (MCP):',
      connectedTools: [
        { name: 'Skills', role: 'Define repeatable prompt workflows that call plugin tools', slug: 'skills' },
        { name: 'MCP', role: 'Use standardized MCP servers as pluggable data providers', slug: 'mcp' },
        { name: 'Agents', role: 'Invoke installed plugin actions during multi-step tasks', slug: 'agents' }
      ]
    },
    requirementsAndLimitations: {
      availabilityStatus: 'Configured / Beta',
      authRequired: true,
      providerKeyRequired: false,
      environmentNotes: 'Core integrations (GitHub, Slack) available in Dashboard; community marketplace currently expanding in private beta.',
      knownLimitations: [
        'Public plugin marketplace is currently curated; enterprise teams can load private plugins via URL or npm package.',
        'Third-party services require separate developer accounts and OAuth credentials.'
      ]
    },
    faq: [
      {
        question: 'Can I write my own FLOAT plugin?',
        answer: 'Yes! Any developer can build a plugin using standard TypeScript and our open float-plugin schema.'
      },
      {
        question: 'How are plugin secrets and API keys stored?',
        answer: 'All external credentials are encrypted at rest using server-side key management and never exposed to client-side logs or public repos.'
      },
      {
        question: 'Can plugins execute arbitrary code on my computer?',
        answer: 'No. Plugins run in sandboxed environments with strict network and filesystem permission boundaries that you explicitly authorize.'
      },
      {
        question: 'What is the difference between a Plugin and a Skill?',
        answer: 'A Plugin is executable code and integrations (like connecting to Slack or Figma). A Skill is a structured markdown instruction set that teaches FLOAT domain-specific engineering rules.'
      }
    ],
    relatedFeatures: [
      { slug: 'skills', title: 'Skills', category: 'Extension', description: 'Domain-specific instructions and repeatable workflows.' },
      { slug: 'mcp', title: 'MCP', category: 'Extension', description: 'Connect external tools and servers via standard protocols.' },
      { slug: 'team-rules', title: 'Team Rules', category: 'Governance', description: 'Define team coding standards and conventions.' }
    ]
  },
  {
    slug: 'skills',
    title: 'Skills',
    badgeCategory: 'Extend with Tools and Knowledge',
    headline: 'Teach FLOAT specialized domain expertise, style guides, and workflows',
    introParagraph: 'Every codebase has unique conventions, architectural patterns, and review rules. Instead of typing the same instructions over and over in every prompt, FLOAT Skills allow you to define modular, version-controlled skill packages (.float/skills/*.md) that agents automatically discover and execute.',
    primaryAction: {
      label: 'Explore Skills in Docs',
      href: '/resources/docs',
      description: 'Read the documentation on authoring custom FLOAT skills'
    },
    secondaryAction: {
      label: 'Explore all features',
      href: '/features'
    },
    mockupType: 'skills',
    whatItDoes: {
      overview: 'Skills are modular markdown documents containing specialized instructions, validation checklists, and reference examples for specific tasks.',
      problemSolved: 'Prevents repetitive prompt engineering, enforces team standards reliably, and ensures complex workflows (like database migrations or accessibility audits) are executed consistently.',
      targetAudience: 'Tech leads, senior engineers, and specialized developers encoding domain practices for their teams.',
      whenToUse: 'When conducting code reviews, formatting to internal style guides, fixing merge conflicts, or generating API documentation.',
      workflowFit: 'Stored in your repository (.float/skills/) or user profile, and invoked via /slash-commands in the composer.'
    },
    howItWorks: [
      {
        stepNumber: 1,
        title: 'Skill Definition in Repository',
        developerAction: 'Create a markdown file with YAML frontmatter in .float/skills/code-review.md.',
        floatAction: 'Indexes the skill definition, validates schema rules, and registers the slash command /code-review.',
        involvedArtifacts: 'Markdown file, YAML frontmatter, workspace indexer.',
        outputProduced: 'Interactive slash command in the composer autocomplete list.',
        inspectionAndApproval: 'Committed to Git so the entire team inherits the skill automatically.'
      },
      {
        stepNumber: 2,
        title: 'Contextual Triggering or Auto-Activation',
        developerAction: 'Type "/code-review" or instruct FLOAT to review a pull request.',
        floatAction: 'Detects the skill trigger, loads its specialized system instructions, and scopes the prompt context accordingly.',
        involvedArtifacts: 'Skill instruction prompt, target files, git diff.',
        outputProduced: 'Active skill banner in the chat header with loaded guidelines.',
        inspectionAndApproval: 'Developer can adjust skill parameters or override specific rules.'
      },
      {
        stepNumber: 3,
        title: 'Constrained Domain Execution',
        developerAction: 'Review the output generated according to the skill\'s exact rubric.',
        floatAction: 'Enforces the checklist, flags violations, and suggests compliant code modifications.',
        involvedArtifacts: 'Code diffs, structured assessment reports.',
        outputProduced: 'Comprehensive, structured result conforming to team quality benchmarks.',
        inspectionAndApproval: 'Developer accepts recommendations or applies changes.'
      }
    ],
    practicalExample: {
      scenarioTitle: 'Enforcing the Notion-inspired block component architecture via a team skill',
      problem: 'New team members frequently write monolithic HTML pages instead of using the modular Block system.',
      developerPrompt: 'let\'s /apply-notion-styleguide to the new PricingTable component',
      executionProcess: [
        'Loads .float/skills/notion-styleguide.md.',
        'Scans PricingTable.tsx for non-compliant nested divs.',
        'Refactors component into atomic BlockHeader, BlockRow, and BlockFeature primitives.',
        'Verifies that all child components adhere to the standard Block interface.'
      ],
      codeOrDiffType: 'code',
      codeOrDiffSnippet: `---
name: notion-styleguide
description: Formats UI components to conform to modular block architecture.
triggers: ["/apply-notion-styleguide", "styleguide"]
---
### Notion Block Architecture Rules
1. Never render hardcoded container divs without the \`<Block>\` wrapper.
2. Every block must accept \`id\`, \`type\`, and \`metadata\` props.
3. Spacing between blocks is controlled by the parent \`<BlockCanvas>\`, not child margins.
4. All text elements must use typography tokens from \`src/theme/tokens.ts\`.`,
      verificationStep: 'Developer runs linter and confirms 100% adherence to architectural rubric.'
    },
    keyCapabilities: [
      {
        name: 'Version-Controlled Team Standards',
        description: 'Store skills in your Git repository under .float/skills/ so every teammate uses identical guidelines.',
        practicalBenefit: 'Eliminates discrepancies between different developers\' AI prompts and coding standards.'
      },
      {
        name: 'Automatic Skill Discovery',
        description: 'Agents automatically match user requests to relevant skills based on frontmatter descriptions and triggers.',
        practicalBenefit: 'You don\'t even need to remember the slash command; FLOAT activates the right skill automatically.'
      },
      {
        name: 'Executable Code Examples',
        description: 'Include pristine reference examples directly in the skill markdown for few-shot prompt accuracy.',
        practicalBenefit: 'Guides the model with exact code patterns tested and approved by your team.'
      }
    ],
    whenToUseScenarios: [
      {
        title: 'Team Code Reviews',
        description: 'Checking PR diffs against security standards, accessibility rules, and performance guidelines.'
      },
      {
        title: 'Database Schema Migrations',
        description: 'Enforcing safe migration practices (e.g. non-blocking column additions, backward-compatible schemas).'
      },
      {
        title: 'API Client Generation',
        description: 'Generating strongly typed REST/GraphQL SDKs following company-wide naming conventions.'
      }
    ],
    workflowAndIntegrations: {
      leadText: 'Skills work seamlessly with Team Rules and Codebase Search:',
      connectedTools: [
        { name: 'Team Rules', role: 'Global project conventions that operate across all skills', slug: 'team-rules' },
        { name: 'Plugins', role: 'Provide executable tools that skills can invoke in their steps', slug: 'plugins' },
        { name: 'MCP', role: 'Feed external schema definitions into skill prompts', slug: 'mcp' }
      ]
    },
    requirementsAndLimitations: {
      availabilityStatus: 'Available',
      authRequired: false,
      providerKeyRequired: false,
      environmentNotes: 'Works in both web and desktop versions of FLOAT. Read directly from the project filesystem.',
      knownLimitations: [
        'Skills are markdown-based prompt directives; they do not execute arbitrary bash scripts unless paired with the Terminal tool.',
        'Excessively verbose skills (>5,000 words) consume prompt token budget and may reduce reasoning depth.'
      ]
    },
    faq: [
      {
        question: 'Where are skills stored in my project?',
        answer: 'Skills live in the .float/skills/ directory in your project root. Each skill is an individual markdown file (e.g. code-review.md).'
      },
      {
        question: 'Can I share skills across multiple repositories?',
        answer: 'Yes. You can publish skills as part of a team ruleset or package them into a reusable FLOAT plugin.'
      },
      {
        question: 'How do I test if my skill is working properly?',
        answer: 'Type the slash command (e.g. /my-skill) in the chat composer with a sample file to observe the agent\'s constrained output.'
      },
      {
        question: 'Can a skill restrict the AI from editing certain files?',
        answer: 'Yes. You can specify file pattern exclusions in the skill frontmatter to prevent the agent from touching sensitive directories.'
      }
    ],
    relatedFeatures: [
      { slug: 'team-rules', title: 'Team Rules', category: 'Governance', description: 'Persistent repository-wide rules and guidelines.' },
      { slug: 'plugins', title: 'Plugins', category: 'Extension', description: 'Add executable tools and third-party integrations.' },
      { slug: 'plan', title: 'Plan Mode', category: 'Lifecycle', description: 'Plan complex implementations using custom domain skills.' }
    ]
  },
  {
    slug: 'mcp',
    title: 'MCP',
    badgeCategory: 'Extend with Tools and Knowledge',
    headline: 'Connect any database, documentation, or tool via Model Context Protocol',
    introParagraph: 'AI models should not be isolated from your engineering ecosystem. Through the open Model Context Protocol (MCP), FLOAT connects seamlessly with local and remote MCP servers—giving agents secure, direct access to PostgreSQL databases, GitHub issues, Jira backlogs, Sentry logs, and custom internal APIs.',
    primaryAction: {
      label: 'Explore Integrations',
      href: '/integrations',
      description: 'Configure MCP servers and data sources in FLOAT'
    },
    secondaryAction: {
      label: 'Explore all features',
      href: '/features'
    },
    mockupType: 'mcp',
    whatItDoes: {
      overview: 'MCP is an open standard that allows FLOAT to communicate with external data sources and execution servers through standardized JSON-RPC protocols.',
      problemSolved: 'Eliminates proprietary, brittle API wrappers by providing a single, secure protocol to expose tools, resources, and prompt templates to AI agents.',
      targetAudience: 'Enterprise developers, DevOps engineers, and full-stack builders integrating proprietary databases, APIs, and microservices.',
      whenToUse: 'When your agent needs to inspect live database schemas, query documentation servers, trigger CI pipelines, or fetch Linear tickets.',
      workflowFit: 'Configured in float.mcp.json or user settings. Servers appear as live tools and context resources in the composer.'
    },
    howItWorks: [
      {
        stepNumber: 1,
        title: 'MCP Server Registration',
        developerAction: 'Add server configuration in float.mcp.json or via settings UI.',
        floatAction: 'Initiates JSON-RPC handshake over STDIO or SSE, discovers available tools, resources, and prompts.',
        involvedArtifacts: 'float.mcp.json, server command/arguments.',
        outputProduced: 'List of verified capabilities and available external tools.',
        inspectionAndApproval: 'Developer reviews server capabilities and authorizes permissions.'
      },
      {
        stepNumber: 2,
        title: 'Resource Inspection & Tool Calling',
        developerAction: 'Ask FLOAT a question involving external data (e.g. "query recent user signups from Postgres").',
        floatAction: 'Formulates a structured tool call adhering to the MCP server\'s schema and presents execution details.',
        involvedArtifacts: 'MCP JSON-RPC request payload, input arguments.',
        outputProduced: 'Interactive approval prompt showing query parameters.',
        inspectionAndApproval: 'Developer approves the tool invocation.'
      },
      {
        stepNumber: 3,
        title: 'Structured Result Ingestion',
        developerAction: 'Observe the data returned by the server and how the agent uses it.',
        floatAction: 'Parses server response, injects content into active context, and generates the final code or answer.',
        involvedArtifacts: 'MCP response buffer, source code.',
        outputProduced: 'Accurate, data-grounded code implementation.',
        inspectionAndApproval: 'Developer reviews the resulting file edits.'
      }
    ],
    practicalExample: {
      scenarioTitle: 'Connecting a local PostgreSQL database MCP server to scaffold type-safe Drizzle ORM schemas',
      problem: 'Need to write TypeScript ORM models that match existing production database tables without manual transcription.',
      developerPrompt: 'Connect to @mcp:postgres-local and generate Drizzle schema definitions for the users and subscriptions tables',
      executionProcess: [
        'Dispatches list_tables and describe_table tool calls to local Postgres MCP server.',
        'Receives column types, foreign keys, and nullability constraints.',
        'Generates src/db/schema.ts with exact matching types and relations.'
      ],
      codeOrDiffType: 'code',
      codeOrDiffSnippet: `// float.mcp.json configuration:
{
  "mcpServers": {
    "postgres-local": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost:5432/float_dev"],
      "env": { "PGPASSWORD": "dev_password" }
    },
    "github-server": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_vault_token" }
    }
  }
}`,
      verificationStep: 'Developer checks that the generated Drizzle schema matches the live database columns exactly.'
    },
    keyCapabilities: [
      {
        name: 'Standardized Open Protocol',
        description: 'Works with any MCP-compliant server created by Anthropic, OpenAI, GitHub, or the open-source community.',
        practicalBenefit: 'No vendor lock-in; reuse the same MCP servers across all your development tools.'
      },
      {
        name: 'Local STDIO & Remote SSE Transports',
        description: 'Run lightweight local CLI tools via standard input/output or connect to remote enterprise servers via Server-Sent Events.',
        practicalBenefit: 'Flexible architecture supporting both offline local dev and secure corporate clouds.'
      },
      {
        name: 'Granular Execution Consent',
        description: 'Every write or mutation tool call requires explicit developer consent before execution.',
        practicalBenefit: 'Protects external production databases and services from unauthorized modification.'
      }
    ],
    whenToUseScenarios: [
      {
        title: 'Live Database Schema Introspection',
        description: 'Inspecting MySQL, Postgres, SQLite, or MongoDB schemas to generate migrations and types.'
      },
      {
        title: 'Issue & Ticket Synchronization',
        description: 'Fetching issue specifications and acceptance criteria directly from GitHub or Linear.'
      },
      {
        title: 'Internal Enterprise Knowledge Base',
        description: 'Connecting internal documentation wikis and Confluence servers to ground agent reasoning.'
      }
    ],
    workflowAndIntegrations: {
      leadText: 'MCP integrates with Context, Agents, and Plugins in FLOAT:',
      connectedTools: [
        { name: 'Add Context', role: 'Allows @-mentioning MCP resources like @mcp:postgres', slug: 'add-context' },
        { name: 'Agents', role: 'Autonomous agents invoke MCP tools during execution loops', slug: 'agents' },
        { name: 'Plugins', role: 'Package pre-configured MCP servers into one-click installable plugins', slug: 'plugins' }
      ]
    },
    requirementsAndLimitations: {
      availabilityStatus: 'Available',
      authRequired: true,
      providerKeyRequired: false,
      environmentNotes: 'Local STDIO transport supported in FLOAT Desktop and local Node runners; remote SSE transport supported across all surfaces.',
      knownLimitations: [
        'Web browser environments require an SSE proxy or local companion daemon to bridge local socket/STDIO processes.',
        'High-volume database queries must be paginated to avoid overwhelming the model token context.'
      ]
    },
    faq: [
      {
        question: 'What is the Model Context Protocol (MCP)?',
        answer: 'MCP is an open standard developed to connect AI assistants with external data sources, repositories, and development tools via standardized JSON-RPC.'
      },
      {
        question: 'Are my database credentials safe when using MCP?',
        answer: 'Yes. MCP runs server processes locally on your machine or within your secure VPC. Your database passwords are never transmitted to external AI providers.'
      },
      {
        question: 'Can MCP servers modify my database?',
        answer: 'Only if the server exposes mutation tools and you explicitly approve the transaction. You can configure read-only connection strings for extra security.'
      },
      {
        question: 'Where can I find pre-built MCP servers?',
        answer: 'There are dozens of official and community MCP servers for GitHub, Slack, Postgres, Brave Search, Puppeteer, and more on GitHub and npm.'
      }
    ],
    relatedFeatures: [
      { slug: 'plugins', title: 'Plugins', category: 'Extension', description: 'Curated extensions for developer services.' },
      { slug: 'add-context', title: 'Add Context', category: 'Tools', description: 'Pin MCP resources directly into your prompt.' },
      { slug: 'agents', title: 'Autonomous Agents', category: 'Execution', description: 'Equip agents with external MCP tools.' }
    ]
  }
];
