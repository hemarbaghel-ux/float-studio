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
    description: 'Planning, visual interface design, and intelligent debugging workflows.',
    slugs: ['plan', 'design', 'debug'],
  },
  {
    title: 'Real Engineering Tools',
    description: 'Sandboxed terminal execution, rich context injection, and checkpoint rollback.',
    slugs: ['terminal', 'add-context', 'git-checkpoints'],
  },
  {
    title: 'Extend with Tools & Knowledge',
    description: 'Modular plugins, repository skills, and Model Context Protocol connections.',
    slugs: ['plugins', 'skills', 'mcp'],
  },
  {
    title: 'Everywhere You Work',
    description: 'One cohesive coding agent across Desktop, CLI, Slack/GitHub, and Web & Mobile.',
    slugs: ['desktop', 'cli', 'other-surfaces', 'web-mobile'],
  },
  {
    title: 'Understands Your Codebase',
    description: 'Multi-model parallel subagents, team conventions, and sub-50ms instant codebase search.',
    slugs: ['multiple-models', 'team-rules', 'codebase-search'],
  },
  {
    title: 'Autonomous & Enterprise Platform',
    description: 'Autonomous multi-file agents, intelligent model routing, and SOC 2 enterprise compliance.',
    slugs: ['agents', 'model-routing', 'enterprise'],
  },
];

export function getFeatureBySlug(slug: string): FeatureDetail | undefined {
  const normalized = slug.trim().toLowerCase().replace(/^\/features\/?/, '');
  return ALL_FEATURES.find((f) => f.slug === normalized);
}
