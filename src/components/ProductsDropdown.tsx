import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ArrowRight, Code, Terminal, Bot, Workflow, Layers, Puzzle } from 'lucide-react';
import { useTranslation } from './LanguageProvider';

interface ProductsDropdownProps {
  currentPath?: string;
}

export function ProductsDropdown({ currentPath }: ProductsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = currentPath?.startsWith('/products');

  const categories = [
    {
      title: t('products.ai_coding', 'AI Coding'),
      icon: <Code size={16} />,
      items: [
        { name: 'AI Coding Agent', desc: 'Build, modify, and understand software with FLOAT.', status: 'AVAILABLE', href: '/features/agents' },
        { name: 'ASK', desc: 'Ask questions and understand your codebase without modifying files.', status: 'AVAILABLE', href: '/' },
        { name: 'PLAN', desc: 'Create structured implementation plans before coding.', status: 'AVAILABLE', href: '/features/plan' },
        { name: 'EDIT', desc: 'Safely make focused code changes with review.', status: 'AVAILABLE', href: '/' },
        { name: 'AGENT', desc: 'Run multi-step coding tasks with controlled autonomy.', status: 'AVAILABLE', href: '/features/agents' },
        { name: 'Codebase Understanding', desc: 'Understand projects, files, dependencies, and relationships.', status: 'AVAILABLE', href: '/features/codebase-search' },
        { name: 'Multi-file Editing', desc: 'Work across multiple files while maintaining project context.', status: 'AVAILABLE', href: '/features/desktop' },
      ]
    },
    {
      title: t('products.dev_tools', 'Developer Tools'),
      icon: <Terminal size={16} />,
      items: [
        { name: 'Terminal', desc: 'Run development commands directly from FLOAT.', status: 'AVAILABLE', href: '/features/terminal' },
        { name: 'Problems', desc: 'View errors, warnings, and diagnostics.', status: 'AVAILABLE', href: '/' },
        { name: 'Testing', desc: 'Run and analyze project tests.', status: 'AVAILABLE', href: '/features/debug' },
        { name: 'Debugging', desc: 'Investigate and resolve application problems.', status: 'AVAILABLE', href: '/features/debug' },
        { name: 'Git', desc: 'Inspect changes, branches, commits, and repository state.', status: 'AVAILABLE', href: '/features/git-checkpoints' },
        { name: 'GitHub', desc: 'Connect repositories and developer workflows.', status: 'AVAILABLE', href: '/features/other-surfaces' },
        { name: 'GitLab', desc: 'Connect GitLab repositories.', status: 'COMING SOON' },
        { name: 'Bitbucket', desc: 'Connect Bitbucket Cloud repositories.', status: 'COMING SOON' },
      ]
    },
    {
      title: t('products.agents', 'Agents'),
      icon: <Bot size={16} />,
      items: [
        { name: 'Agent Manager', desc: 'Manage and configure FLOAT agents.', status: 'COMING SOON' },
        { name: 'Planner Agent', desc: 'Break complex tasks into structured plans.', status: 'COMING SOON' },
        { name: 'Explorer Agent', desc: 'Explore and understand large codebases.', status: 'COMING SOON' },
        { name: 'Coder Agent', desc: 'Implement coding changes.', status: 'COMING SOON' },
        { name: 'Debugger Agent', desc: 'Investigate and fix bugs.', status: 'COMING SOON' },
        { name: 'Reviewer Agent', desc: 'Review code and proposed changes.', status: 'COMING SOON' },
        { name: 'UI Agent', desc: 'Build and improve user interfaces.', status: 'COMING SOON' },
        { name: 'Test Agent', desc: 'Create and run tests.', status: 'COMING SOON' },
        { name: 'Terminal Agent', desc: 'Handle terminal workflows.', status: 'COMING SOON' },
        { name: 'Documentation Agent', desc: 'Create and maintain documentation.', status: 'COMING SOON' },
        { name: 'Security Agent', desc: 'Analyze security issues.', status: 'COMING SOON' },
        { name: 'Performance Agent', desc: 'Analyze performance problems.', status: 'COMING SOON' },
        { name: 'Research Agent', desc: 'Research technical implementation approaches.', status: 'COMING SOON' },
        { name: 'Custom Agents', desc: 'Create specialized agents for your workflow.', status: 'COMING SOON' },
      ]
    },
    {
      title: t('products.platform', 'Agent Platform'),
      icon: <Workflow size={16} />,
      items: [
        { name: 'Agent Orchestration', desc: 'Coordinate multiple specialized agents.', status: 'COMING SOON' },
        { name: 'Task Graphs', desc: 'Break complex work into dependent tasks.', status: 'COMING SOON' },
        { name: 'Parallel Agents', desc: 'Run independent agent tasks safely in parallel.', status: 'COMING SOON' },
        { name: 'Agent Communication', desc: 'Allow structured communication between agents.', status: 'COMING SOON' },
        { name: 'Approvals', desc: 'Control when agents can make changes.', status: 'COMING SOON' },
        { name: 'Checkpoints', desc: 'Create recoverable project states.', status: 'COMING SOON' },
        { name: 'Rollback', desc: 'Safely restore changes.', status: 'COMING SOON' },
        { name: 'Agent Activity', desc: 'Monitor agent actions and progress.', status: 'COMING SOON' },
        { name: 'Automations', desc: 'Run repeatable developer workflows.', status: 'COMING SOON' },
        { name: 'Cloud Agents', desc: 'Run longer-running development tasks.', status: 'COMING SOON' },
        { name: 'Bug Agent', desc: 'Automated bug investigation and code review workflows.', status: 'COMING SOON' },
      ]
    },
    {
      title: t('products.models', 'Models & Evals'),
      icon: <Layers size={16} />,
      items: [
        { name: 'Models', desc: 'Explore supported AI models.', status: 'AVAILABLE', href: '/models' },
        { name: 'Model Router', desc: 'Automatically select appropriate models.', status: 'AVAILABLE', href: '/features/model-routing' },
        { name: 'Multi-Model Support', desc: 'Use models from multiple providers.', status: 'AVAILABLE', href: '/features/multiple-models' },
        { name: 'Model Comparison', desc: 'Compare model capabilities and performance.', status: 'AVAILABLE', href: '/models' },
        { name: 'Evals', desc: 'Evaluate models on real coding tasks.', status: 'AVAILABLE', href: '/evals' },
        { name: 'Benchmarks', desc: 'Compare model performance using standardized tasks.', status: 'AVAILABLE', href: '/evals' },
        { name: 'Agent Evaluations', desc: 'Evaluate complete agent workflows.', status: 'COMING SOON' },
        { name: 'Usage & Cost', desc: 'Track model usage, tokens, latency, and cost.', status: 'AVAILABLE', href: '/models/usage' },
      ]
    },
    {
      title: t('products.integrations', 'Integrations'),
      icon: <Puzzle size={16} />,
      items: [
        { name: 'GitHub', desc: 'Repositories, codebase context, Cloud Agents and developer workflows.', status: 'AVAILABLE', href: '/features/other-surfaces' },
        { name: 'GitLab', desc: 'GitLab repositories and workflows.', status: 'COMING SOON' },
        { name: 'Bitbucket', desc: 'Bitbucket Cloud repositories.', status: 'COMING SOON' },
        { name: 'Slack', desc: 'Team notifications and developer workflows.', status: 'AVAILABLE', href: '/features/other-surfaces' },
        { name: 'Microsoft Teams', desc: 'Teams integration for notifications.', status: 'COMING SOON' },
        { name: 'Linear', desc: 'Issue tracking and agent workflows.', status: 'COMING SOON' },
        { name: 'Jira', desc: 'Jira issues and project management.', status: 'COMING SOON' },
        { name: 'Sentry', desc: 'Error tracking and automated bug fixes.', status: 'COMING SOON' },
      ]
    }
  ];

  return (
    <div 
      className="relative" 
      ref={dropdownRef}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-white/30 rounded-sm ${
          isActive || isOpen
            ? 'text-slate-900 dark:text-white pb-1' 
            : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white pb-1'
        }`}
        aria-expanded={isOpen}
      >
        {t('nav.product', 'Products')}
        <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute top-full left-1/2 -translate-x-1/2 md:left-0 md:-translate-x-[15%] lg:-translate-x-1/4 mt-2 w-[90vw] md:w-[700px] lg:w-[900px] bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 p-6 gap-x-8 gap-y-10 max-h-[80vh] overflow-y-auto">
              {categories.map((category, idx) => (
                <div key={idx} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold mb-2">
                    <span className="text-purple-600 dark:text-purple-400">{category.icon}</span>
                    <span className="tracking-tight">{category.title}</span>
                  </div>
                  <div className="flex flex-col gap-4">
                    {category.items.map((item, itemIdx) => (
                      <div key={itemIdx} className="flex flex-col group relative">
                        {item.status === 'AVAILABLE' && item.href ? (
                          <a 
                            href={item.href}
                            onClick={() => setIsOpen(false)}
                            className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 -mx-2 px-2 py-1 transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                          >
                            <div className="text-sm font-medium text-slate-900 dark:text-white mb-0.5 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                              {t(`products.item.${item.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_name`, item.name)}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-[#A1A1AA] leading-snug">
                              {t(`products.item.${item.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_desc`, item.desc)}
                            </div>
                          </a>
                        ) : (
                          <div className="block -mx-2 px-2 py-1 opacity-70">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                {t(`products.item.${item.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_name`, item.name)}
                              </span>
                              <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400">
                                {t('products.coming_soon', 'Coming soon')}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-[#A1A1AA] leading-snug">
                              {t(`products.item.${item.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_desc`, item.desc)}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="bg-slate-50 dark:bg-[#111] p-6 border-t border-slate-200 dark:border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="font-medium text-slate-900 dark:text-white text-sm mb-1">
                  Explore full documentation for every FLOAT feature
                </div>
                <div className="text-xs text-slate-500 dark:text-[#A1A1AA]">
                  Plan, Design, Debug, Terminal, Context, Checkpoints, MCP, and Autonomous Agents.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <a 
                  href="/features"
                  onClick={() => setIsOpen(false)}
                  className="shrink-0 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-black dark:hover:text-white border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 px-4 py-2 rounded-full transition-colors"
                >
                  All Features
                </a>
                <a 
                  href="/"
                  className="shrink-0 flex items-center gap-1.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200 px-4 py-2 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900"
                >
                  {t('products.explore_link', 'Explore FLOAT')} <ArrowRight size={14} />
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
