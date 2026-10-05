import { FeatureDetail } from './types';
import { lifecycleFeatures } from './data/lifecycleFeatures';
import { engineeringFeatures } from './data/engineeringFeatures';
import { extensionFeatures } from './data/extensionFeatures';
import { surfacesFeatures } from './data/surfacesFeatures';
import { codebaseFeatures } from './data/codebaseFeatures';
import { advancedFeatures } from './data/advancedFeatures';

export * from './types';

export const ALL_FEATURES: FeatureDetail[] = [
  ...lifecycleFeatures,
  ...engineeringFeatures,
  ...extensionFeatures,
  ...surfacesFeatures,
  ...codebaseFeatures,
  ...advancedFeatures,
];

export const FEATURE_CATEGORIES = [
  {
    title: 'Full Development Lifecycle',
    description: 'Model-assisted planning and problem investigation are available; visual design editing is a preview concept.',
    slugs: ['plan', 'design', 'debug'],
  },
  {
    title: 'Real Engineering Tools',
    description: 'The browser Python runtime and file context are available; Git snapshots and rollback are preview concepts.',
    slugs: ['terminal', 'add-context', 'git-checkpoints'],
  },
  {
    title: 'Extend with Tools & Knowledge',
    description: 'Plugin marketplace, reusable Skills, and MCP connections are not available in this release.',
    slugs: ['plugins', 'skills', 'mcp'],
  },
  {
    title: 'Everywhere You Work',
    description: 'FLOAT currently runs in a browser. Native desktop, CLI, mobile, and remote agent surfaces are not available.',
    slugs: ['desktop', 'cli', 'other-surfaces', 'web-mobile'],
  },
  {
    title: 'Understands Your Codebase',
    description: 'Choose configured models and search current workspace files. Parallel subagents and team-wide rules are preview concepts.',
    slugs: ['multiple-models', 'team-rules', 'codebase-search'],
  },
  {
    title: 'Autonomous & Enterprise Platform',
    description: 'The browser coding agent and model selection are available. Hosted cloud execution and enterprise controls are not.',
    slugs: ['agents', 'model-routing', 'enterprise'],
  },
];

export const CURRENT_RELEASE_FEATURES: Record<string, { summary: string; limits: string }> = {
  agents: {
    summary: 'Ask the coding agent to inspect project context and propose changes across files. Review the proposal before applying it.',
    limits: 'Tasks depend on a configured model provider. Code runs in the browser runtime; FLOAT does not provide a remote host shell or hosted cloud agents.',
  },
  plan: {
    summary: 'Use the PLAN chat mode to ask a model for an implementation plan before editing.',
    limits: 'Planning is a model response. It does not automatically run a background multi-phase workflow.',
  },
  terminal: {
    summary: 'Run supported Python code in the browser-based execution panel and view its output.',
    limits: 'This is an isolated browser runtime, not a local operating-system shell. Support depends on the runtime and installed packages.',
  },
  'add-context': {
    summary: 'Select project files and attach their contents as context to an AI request.',
    limits: 'Attached content is sent to the configured FLOAT server and selected model provider to answer the request.',
  },
  'multiple-models': {
    summary: 'Choose among the models exposed by configured providers in the model selector.',
    limits: 'Provider credentials and model availability are deployment-dependent. FLOAT does not run parallel subagents across models.',
  },
  'model-routing': {
    summary: 'Select a model explicitly or use Auto to select the configured default model.',
    limits: 'Auto currently maps to the configured default model; it does not dynamically route by task or benchmark.',
  },
  'codebase-search': {
    summary: 'Search the project files available in the current workspace and attach relevant files as context.',
    limits: 'Search covers workspace files available to FLOAT. It is not an indexed search service across remote repositories.',
  },
  debug: {
    summary: 'Use AI chat with selected files and execution output to investigate a problem and review proposed fixes.',
    limits: 'FLOAT does not instrument running applications or autonomously verify fixes against a production environment.',
  },
};

export function getFeatureBySlug(slug: string): FeatureDetail | undefined {
  const normalized = slug.trim().toLowerCase().replace(/^\/features\/?/, '');
  return ALL_FEATURES.find((f) => f.slug === normalized);
}

export function isFeatureInCurrentRelease(slug: string): boolean {
  return slug.trim().toLowerCase() in CURRENT_RELEASE_FEATURES;
}

export function getCurrentReleaseFeatureSummary(slug: string) {
  return CURRENT_RELEASE_FEATURES[slug.trim().toLowerCase()];
}
