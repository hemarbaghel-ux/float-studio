import React, { useState } from 'react';
import {
  Check, Minus, AlertCircle, ChevronDown, ChevronRight,
  HelpCircle, Sparkles, Shield, Zap, Info
} from 'lucide-react';
import { cn } from '../../lib/utils';

export type FeatureStatus =
  | 'included'
  | 'limited'
  | 'config_required'
  | 'infra_required'
  | 'coming_soon'
  | 'not_included';

export interface MatrixFeature {
  name: string;
  description: string;
  hobby: FeatureStatus;
  hobbyNote?: string;
  pro: FeatureStatus;
  proNote?: string;
  business: FeatureStatus;
  businessNote?: string;
  enterprise: FeatureStatus;
  enterpriseNote?: string;
}

export interface MatrixCategory {
  id: string;
  title: string;
  description: string;
  features: MatrixFeature[];
}

export const MATRIX_CATEGORIES: MatrixCategory[] = [
  {
    id: 'workspace',
    title: 'Core Workspace & Editor',
    description: 'Foundational development environment and editing infrastructure',
    features: [
      {
        name: 'Monaco Code Editor',
        description: 'Multi-tab editor with language syntax, themes, and minimap',
        hobby: 'included',
        pro: 'included',
        business: 'included',
        enterprise: 'included'
      },
      {
        name: 'Virtual File Explorer',
        description: 'Project tree hierarchy, file upload, search and management',
        hobby: 'included',
        pro: 'included',
        business: 'included',
        enterprise: 'included'
      },
      {
        name: 'Fast Codebase Search',
        description: 'Trigram symbol indexing and fast multi-file text search',
        hobby: 'included',
        pro: 'included',
        business: 'included',
        enterprise: 'included'
      },
      {
        name: 'Integrated Web Terminal',
        description: 'Local workspace runner and in-browser developer console',
        hobby: 'included',
        pro: 'included',
        business: 'included',
        enterprise: 'included'
      }
    ]
  },
  {
    id: 'ai_modes',
    title: 'AI Coding Capabilities',
    description: 'Frontier AI models, composer modes, and inline assistance',
    features: [
      {
        name: 'Everyday Model Access (Flash)',
        description: 'Unlimited Gemini 3.1 Flash Lite and everyday fast models',
        hobby: 'included',
        pro: 'included',
        business: 'included',
        enterprise: 'included'
      },
      {
        name: 'Frontier Models (Claude, GPT-4o)',
        description: 'Claude 3.5 Sonnet, GPT-4o, and Gemini 2.5 Pro reasoning',
        hobby: 'limited',
        hobbyNote: '50 req/mo',
        pro: 'included',
        proNote: '500 fast req/mo',
        business: 'included',
        businessNote: 'Unlimited pooled',
        enterprise: 'included',
        enterpriseNote: 'Dedicated throughput'
      },
      {
        name: 'Inline AI (Cmd+K / Ctrl+K)',
        description: 'In-editor inline prompt editing and instant diff previews',
        hobby: 'included',
        pro: 'included',
        business: 'included',
        enterprise: 'included'
      },
      {
        name: 'Ghost-Text Tab Autocomplete',
        description: 'Multi-line code completion as you type in Monaco',
        hobby: 'included',
        pro: 'included',
        business: 'included',
        enterprise: 'included'
      },
      {
        name: 'Plan Mode (Structured DAGs)',
        description: 'Step-by-step implementation plan with human approval gates',
        hobby: 'limited',
        hobbyNote: 'Single-file plans',
        pro: 'included',
        business: 'included',
        enterprise: 'included'
      },
      {
        name: 'Autonomous Agent Mode',
        description: 'Multi-file coding agent with tool execution and loop detection',
        hobby: 'limited',
        hobbyNote: 'Single file buffer',
        pro: 'included',
        business: 'included',
        enterprise: 'included'
      }
    ]
  },
  {
    id: 'context',
    title: 'Context Orchestration',
    description: 'How FLOAT indexes, budgets, and injects your codebase',
    features: [
      {
        name: '@file, @folder, and @symbol',
        description: 'Direct symbol and path referencing in chat composer',
        hobby: 'included',
        pro: 'included',
        business: 'included',
        enterprise: 'included'
      },
      {
        name: '# Pull Request Mentions',
        description: 'Reference active GitHub pull requests directly into prompts',
        hobby: 'included',
        pro: 'included',
        business: 'included',
        enterprise: 'included'
      },
      {
        name: 'Team Rules (.float/rules & .cursorrules)',
        description: 'File-pattern glob scoped prompt engineering rules',
        hobby: 'included',
        hobbyNote: 'Local rules',
        pro: 'included',
        business: 'included',
        enterprise: 'included'
      },
      {
        name: 'Custom Agent Skills',
        description: 'Domain-specific instructions, scripts, and workflows',
        hobby: 'included',
        pro: 'included',
        business: 'included',
        enterprise: 'included'
      }
    ]
  },
  {
    id: 'agent_platform',
    title: 'Agent Platform & Tools',
    description: 'Execution control, policy evaluation, and extension ecosystems',
    features: [
      {
        name: 'Staged Proposal Diff Reviews',
        description: 'Zero direct unapproved file modifications; immutable staging',
        hobby: 'included',
        pro: 'included',
        business: 'included',
        enterprise: 'included'
      },
      {
        name: 'Parallel Subagent Orchestration',
        description: 'Hierarchical subagent delegation with recursive cancellation',
        hobby: 'limited',
        hobbyNote: '1 subagent',
        pro: 'included',
        proNote: 'Up to 5 concurrent',
        business: 'included',
        businessNote: 'Up to 20 concurrent',
        enterprise: 'included',
        enterpriseNote: 'Custom scaling'
      },
      {
        name: 'Model Context Protocol (MCP)',
        description: 'Connect standard MCP tools and lazy-loaded schema tools',
        hobby: 'config_required',
        hobbyNote: 'Local MCP servers',
        pro: 'config_required',
        proNote: 'Configurable MCP',
        business: 'included',
        enterprise: 'included'
      },
      {
        name: 'Lifecycle Hooks',
        description: 'Pre-edit and post-apply command scripts with Windows support',
        hobby: 'included',
        pro: 'included',
        business: 'included',
        enterprise: 'included'
      },
      {
        name: 'Browser Agent Automations',
        description: 'Playwright headless browser execution for web tasks',
        hobby: 'infra_required',
        hobbyNote: 'Needs browser runner',
        pro: 'infra_required',
        proNote: 'Needs browser runner',
        business: 'infra_required',
        enterprise: 'infra_required'
      }
    ]
  },
  {
    id: 'git_github',
    title: 'Source Control & GitHub',
    description: 'Version control workflows and repository synchronization',
    features: [
      {
        name: 'Git Worktree Isolation',
        description: 'Isolated disk worktrees for background agent modifications',
        hobby: 'included',
        pro: 'included',
        business: 'included',
        enterprise: 'included'
      },
      {
        name: 'GitHub OAuth & PR Workflow',
        description: 'Clone, branch, commit, push, and open PRs from the workspace',
        hobby: 'config_required',
        hobbyNote: 'Requires GitHub App keys',
        pro: 'config_required',
        proNote: 'Requires GitHub App keys',
        business: 'config_required',
        enterprise: 'included'
      }
    ]
  },
  {
    id: 'automation_cloud',
    title: 'Background Tasks & Cloud',
    description: 'Long-running persistent execution and task recovery',
    features: [
      {
        name: 'Local Persistent Agent Tasks',
        description: 'Heartbeat-backed background agent jobs with refresh recovery',
        hobby: 'included',
        pro: 'included',
        business: 'included',
        enterprise: 'included'
      },
      {
        name: 'Cloud Worker Agent Cluster',
        description: 'Remote worker pool for decoupled long-running task execution',
        hobby: 'infra_required',
        hobbyNote: 'Requires Cloud Worker',
        pro: 'infra_required',
        proNote: 'Requires Cloud Worker',
        business: 'infra_required',
        enterprise: 'infra_required'
      }
    ]
  },
  {
    id: 'collaboration',
    title: 'Collaboration & Governance',
    description: 'Enterprise permissions, audit logs, and security policies',
    features: [
      {
        name: 'Execution Safety Policies',
        description: 'Enforce read-only, review, or sandboxed execution modes',
        hobby: 'included',
        pro: 'included',
        business: 'included',
        enterprise: 'included'
      },
      {
        name: 'Centralized Team Billing',
        description: 'Single invoice and seat management via Stripe integration',
        hobby: 'not_included',
        pro: 'not_included',
        business: 'config_required',
        businessNote: 'Requires Stripe keys',
        enterprise: 'included'
      },
      {
        name: 'SSO & Audit Logs',
        description: 'SAML / Okta integration and tenant audit logging',
        hobby: 'not_included',
        pro: 'not_included',
        business: 'coming_soon',
        enterprise: 'included'
      }
    ]
  }
];

export function StatusPill({ status, note }: { status: FeatureStatus; note?: string }) {
  switch (status) {
    case 'included':
      return (
        <div className="flex flex-col items-center justify-center">
          <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-[#7EE787] flex items-center justify-center">
            <Check size={12} strokeWidth={2.5} />
          </span>
          {note && <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{note}</span>}
        </div>
      );
    case 'limited':
      return (
        <div className="flex flex-col items-center justify-center">
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300">
            Limited
          </span>
          {note && <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{note}</span>}
        </div>
      );
    case 'config_required':
      return (
        <div className="flex flex-col items-center justify-center text-center">
          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-500/15 text-blue-700 dark:text-blue-300">
            Key Config
          </span>
          {note && <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 max-w-[90px]">{note}</span>}
        </div>
      );
    case 'infra_required':
      return (
        <div className="flex flex-col items-center justify-center text-center">
          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-500/15 text-purple-700 dark:text-purple-300">
            Cluster Req
          </span>
          {note && <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 max-w-[90px]">{note}</span>}
        </div>
      );
    case 'coming_soon':
      return (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400">
          Coming Soon
        </span>
      );
    case 'not_included':
    default:
      return (
        <span className="text-slate-300 dark:text-slate-600">
          <Minus size={14} />
        </span>
      );
  }
}

interface PricingComparisonMatrixProps {
  onSelectPlan?: (planId: string) => void;
}

export function PricingComparisonMatrix({ onSelectPlan }: PricingComparisonMatrixProps) {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(() => {
    // Expand first two by default
    return { workspace: true, ai_modes: true, context: true };
  });

  const toggleCategory = (catId: string) => {
    setExpandedCategories(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  return (
    <div className="w-full max-w-5xl mx-auto rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#12110D] shadow-xl overflow-hidden text-left">
      {/* Matrix Header */}
      <div className="p-6 border-b border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-[#181612]">
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          Transparent Tier & Capability Matrix
        </h3>
        <p className="text-xs text-slate-600 dark:text-[#A1A1AA] max-w-3xl leading-relaxed">
          FLOAT maintains strict product honesty. Every capability below indicates its exact availability status: fully included, limited tier capacity, configuration-dependent, or requiring dedicated cloud worker infrastructure.
        </p>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 mt-4 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center">
              <Check size={9} strokeWidth={3} />
            </span>
            <span className="text-slate-600 dark:text-slate-300">Included</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold text-[9px]">Limited</span>
            <span className="text-slate-600 dark:text-slate-300">Budget Cap</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-700 dark:text-blue-300 font-medium text-[9px]">Key Config</span>
            <span className="text-slate-600 dark:text-slate-300">Requires API Token</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-700 dark:text-purple-300 font-medium text-[9px]">Cluster Req</span>
            <span className="text-slate-600 dark:text-slate-300">Requires Worker Node</span>
          </div>
        </div>
      </div>

      {/* Sticky Table Header */}
      <div className="grid grid-cols-12 px-4 py-3 bg-slate-100/90 dark:bg-[#1A1813] border-b border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-800 dark:text-slate-200 sticky top-0 z-10 backdrop-blur-sm">
        <div className="col-span-4 sm:col-span-5">Feature & Description</div>
        <div className="col-span-2 sm:col-span-2 text-center">Hobby ($0)</div>
        <div className="col-span-2 sm:col-span-2 text-center text-purple-600 dark:text-purple-400">Pro ($20)</div>
        <div className="col-span-2 sm:col-span-2 text-center">Business ($40)</div>
        <div className="col-span-2 sm:col-span-1 text-center hidden sm:block">Enterprise</div>
      </div>

      {/* Categories & Features */}
      <div className="divide-y divide-slate-200 dark:divide-white/5">
        {MATRIX_CATEGORIES.map(category => {
          const isExpanded = !!expandedCategories[category.id];
          return (
            <div key={category.id} className="group">
              {/* Category Section Header */}
              <button
                type="button"
                onClick={() => toggleCategory(category.id)}
                className="w-full px-4 py-3 bg-slate-50/50 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/[0.04] flex items-center justify-between text-left transition-colors cursor-pointer"
                aria-expanded={isExpanded}
              >
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span>{category.title}</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 pl-5">
                    {category.description}
                  </p>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {category.features.length} features
                </span>
              </button>

              {/* Expanded Features List */}
              {isExpanded && (
                <div className="divide-y divide-slate-100 dark:divide-white/[0.03] bg-white dark:bg-[#12110D]">
                  {category.features.map((feature, fIdx) => (
                    <div
                      key={fIdx}
                      className="grid grid-cols-12 px-4 py-2.5 items-center hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors text-xs"
                    >
                      <div className="col-span-4 sm:col-span-5 pr-2">
                        <div className="font-semibold text-slate-900 dark:text-[#EDEDED]">
                          {feature.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-[#8B949E] leading-tight">
                          {feature.description}
                        </div>
                      </div>

                      <div className="col-span-2 sm:col-span-2 flex justify-center">
                        <StatusPill status={feature.hobby} note={feature.hobbyNote} />
                      </div>

                      <div className="col-span-2 sm:col-span-2 flex justify-center bg-purple-500/[0.02] py-1 rounded">
                        <StatusPill status={feature.pro} note={feature.proNote} />
                      </div>

                      <div className="col-span-2 sm:col-span-2 flex justify-center">
                        <StatusPill status={feature.business} note={feature.businessNote} />
                      </div>

                      <div className="col-span-2 sm:col-span-1 justify-center hidden sm:flex">
                        <StatusPill status={feature.enterprise} note={feature.enterpriseNote} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Matrix Footer Callout */}
      <div className="p-4 bg-slate-50 dark:bg-[#161410] border-t border-slate-200 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <Info size={14} className="text-purple-600 dark:text-purple-400 shrink-0" />
          <span>
            Self-hosted preview deployments default to the <strong>Hobby tier ($0)</strong> with local in-process tools.
          </span>
        </div>
        {onSelectPlan && (
          <button
            type="button"
            onClick={() => onSelectPlan('pro')}
            className="px-4 py-1.5 rounded-full bg-slate-900 text-white dark:bg-white dark:text-black font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer shrink-0"
          >
            Upgrade to Pro ($20/mo)
          </button>
        )}
      </div>
    </div>
  );
}
