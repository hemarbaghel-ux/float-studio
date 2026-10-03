import React, { useState } from 'react';
import { useIDEStore } from '../../store';
import { FloatLogo } from '../../components/FloatLogo';
import { ModelsDropdown } from '../../components/ModelsDropdown';
import { ProductsDropdown } from '../../components/ProductsDropdown';
import { PricingDropdown } from '../../components/PricingDropdown';
import { ResourcesDropdown } from '../../components/ResourcesDropdown';
import { LanguageDropdown } from '../../components/LanguageDropdown';
import { useTranslation } from '../../components/LanguageProvider';
import { Sun, Moon, Check, Minus, ChevronDown, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function PricingPage() {
  const { settings, toggleTheme } = useIDEStore();
  const { t } = useTranslation();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleStart = () => {
    window.history.pushState({}, '', '/login');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const plans = [
    {
      id: 'free',
      name: t('pricing.plan_free', 'FREE'),
      subtitle: t('pricing.sub_free', 'For developers exploring FLOAT.'),
      priceMonthly: 0,
      priceYearly: 0,
      unit: '',
      features: [
        t('pricing.feat.free.1', 'FLOAT AI coding workspace'),
        t('pricing.feat.free.2', 'Limited AI Agent usage'),
        t('pricing.feat.free.3', 'ASK mode'),
        t('pricing.feat.free.4', 'PLAN mode'),
        t('pricing.feat.free.5', 'EDIT mode'),
        t('pricing.feat.free.6', 'Limited AGENT mode'),
        t('pricing.feat.free.7', 'Basic codebase understanding'),
        t('pricing.feat.free.8', 'Basic file editing'),
        t('pricing.feat.free.9', 'Monaco-powered editor'),
        t('pricing.feat.free.10', 'Terminal'),
        t('pricing.feat.free.11', 'Problems'),
        t('pricing.feat.free.12', 'Basic testing'),
        t('pricing.feat.free.13', 'Git integration'),
        t('pricing.feat.free.14', 'GitHub integration'),
        t('pricing.feat.free.15', 'Basic model access'),
        t('pricing.feat.free.16', 'Basic usage dashboard'),
        t('pricing.feat.free.17', 'Community/self-service support')
      ],
      buttonText: t('pricing.btn_free', 'Get Started'),
      popular: false,
      badge: null
    },
    {
      id: 'pro',
      name: t('pricing.plan_pro', 'PRO'),
      subtitle: t('pricing.sub_pro', 'For individual developers building seriously with AI agents.'),
      priceMonthly: 20,
      priceYearly: 16,
      yearlyBilled: 192,
      unit: '',
      features: [
        t('pricing.feat.pro.1', 'Everything in Free, plus:'),
        t('pricing.feat.pro.2', 'Full ASK / PLAN / EDIT / AGENT workflows'),
        t('pricing.feat.pro.3', 'Advanced AI coding agents'),
        t('pricing.feat.pro.4', 'Multi-file editing'),
        t('pricing.feat.pro.5', 'Advanced ChangeSets'),
        t('pricing.feat.pro.6', 'Diff review'),
        t('pricing.feat.pro.7', 'Safe Apply'),
        t('pricing.feat.pro.8', 'Rollback'),
        t('pricing.feat.pro.9', 'Advanced codebase context'),
        t('pricing.feat.pro.10', 'Advanced models'),
        t('pricing.feat.pro.11', 'Model Router'),
        t('pricing.feat.pro.12', 'Multi-model support'),
        t('pricing.feat.pro.13', 'Agent Manager'),
        t('pricing.feat.pro.14', 'Specialized agents'),
        t('pricing.feat.pro.15', 'Custom agents'),
        t('pricing.feat.pro.16', 'Agent orchestration'),
        t('pricing.feat.pro.17', 'Agent activity'),
        t('pricing.feat.pro.18', 'Checkpoints'),
        t('pricing.feat.pro.19', 'Advanced terminal workflows'),
        t('pricing.feat.pro.20', 'Testing workflows'),
        t('pricing.feat.pro.21', 'Debugging workflows'),
        t('pricing.feat.pro.22', 'Git workflows'),
        t('pricing.feat.pro.23', 'GitHub repository workflows'),
        t('pricing.feat.pro.24', 'GitLab integration'),
        t('pricing.feat.pro.25', 'Bitbucket integration'),
        t('pricing.feat.pro.26', 'MCP support'),
        t('pricing.feat.pro.27', 'Skills'),
        t('pricing.feat.pro.28', 'Plugins'),
        t('pricing.feat.pro.29', 'Advanced Evals'),
        t('pricing.feat.pro.30', 'Model comparison'),
        t('pricing.feat.pro.31', 'Usage analytics'),
        t('pricing.feat.pro.32', 'Cloud Agents with included allowance'),
        t('pricing.feat.pro.33', 'Automations with included allowance'),
        t('pricing.feat.pro.34', 'Bug Agent/Bugbot access with usage-based billing')
      ],
      buttonText: t('pricing.btn_pro', 'Start Pro'),
      popular: true,
      badge: t('pricing.badge_popular', 'Most popular')
    },
    {
      id: 'business',
      name: t('pricing.plan_business', 'BUSINESS'),
      subtitle: t('pricing.sub_business', 'For teams building and shipping software together.'),
      priceMonthly: 40,
      priceYearly: 32,
      yearlyBilled: 384,
      unit: 'user',
      features: [
        t('pricing.feat.business.1', 'Everything in Pro, plus:'),
        t('pricing.feat.business.2', 'Team workspaces'),
        t('pricing.feat.business.3', 'Shared projects'),
        t('pricing.feat.business.4', 'Shared agents'),
        t('pricing.feat.business.5', 'Team agent configurations'),
        t('pricing.feat.business.6', 'Team model controls'),
        t('pricing.feat.business.7', 'Team usage analytics'),
        t('pricing.feat.business.8', 'Centralized billing'),
        t('pricing.feat.business.9', 'Seat management'),
        t('pricing.feat.business.10', 'Team permissions'),
        t('pricing.feat.business.11', 'Shared skills'),
        t('pricing.feat.business.12', 'Shared plugins'),
        t('pricing.feat.business.13', 'Shared MCP configurations'),
        t('pricing.feat.business.14', 'Shared automations'),
        t('pricing.feat.business.15', 'Cloud Agents with higher included usage'),
        t('pricing.feat.business.16', 'Bug Agent/Bugbot workflows'),
        t('pricing.feat.business.17', 'Code review automation'),
        t('pricing.feat.business.18', 'GitHub organization workflows'),
        t('pricing.feat.business.19', 'GitLab organization workflows'),
        t('pricing.feat.business.20', 'Bitbucket workflows'),
        t('pricing.feat.business.21', 'Slack integration'),
        t('pricing.feat.business.22', 'Microsoft Teams integration'),
        t('pricing.feat.business.23', 'Linear integration'),
        t('pricing.feat.business.24', 'Jira integration'),
        t('pricing.feat.business.25', 'Sentry integration'),
        t('pricing.feat.business.26', 'Audit activity'),
        t('pricing.feat.business.27', 'Team privacy controls'),
        t('pricing.feat.business.28', 'Advanced access controls')
      ],
      buttonText: t('pricing.btn_business', 'Start Business'),
      popular: false,
      badge: t('pricing.badge_teams', 'Teams')
    },
    {
      id: 'ultimate',
      name: t('pricing.plan_ultimate', 'ULTIMATE'),
      subtitle: t('pricing.sub_ultimate', 'For power users and teams running advanced agentic workflows.'),
      priceMonthly: 100,
      priceYearly: 80,
      yearlyBilled: 960,
      unit: 'user',
      features: [
        t('pricing.feat.ultimate.1', 'Everything in Business, plus:'),
        t('pricing.feat.ultimate.2', 'Highest included usage allowance'),
        t('pricing.feat.ultimate.3', 'Advanced agent orchestration'),
        t('pricing.feat.ultimate.4', 'Parallel agent execution'),
        t('pricing.feat.ultimate.5', 'Advanced task graphs'),
        t('pricing.feat.ultimate.6', 'Long-running agent workflows'),
        t('pricing.feat.ultimate.7', 'Advanced Cloud Agents'),
        t('pricing.feat.ultimate.8', 'Advanced Automations'),
        t('pricing.feat.ultimate.9', 'Advanced Evals'),
        t('pricing.feat.ultimate.10', 'Large benchmark runs'),
        t('pricing.feat.ultimate.11', 'Advanced model routing'),
        t('pricing.feat.ultimate.12', 'Advanced usage analytics'),
        t('pricing.feat.ultimate.13', 'Advanced agent observability'),
        t('pricing.feat.ultimate.14', 'Advanced checkpoints'),
        t('pricing.feat.ultimate.15', 'Advanced rollback'),
        t('pricing.feat.ultimate.16', 'Advanced security controls'),
        t('pricing.feat.ultimate.17', 'Advanced workspace controls'),
        t('pricing.feat.ultimate.18', 'Priority support'),
        t('pricing.feat.ultimate.19', 'Early access to new FLOAT capabilities')
      ],
      buttonText: t('pricing.btn_ultimate', 'Start Ultimate'),
      popular: false,
      badge: t('pricing.badge_power', 'Power users')
    }
  ];

  const enterprisePlan = {
      id: 'enterprise',
      name: t('pricing.plan_enterprise', 'ENTERPRISE'),
      subtitle: t('pricing.sub_enterprise', 'For organizations requiring advanced security, governance, support, and custom commercial terms.'),
      priceMonthly: t('pricing.custom', 'Custom pricing'),
      priceYearly: t('pricing.custom', 'Custom pricing'),
      features: [
        t('pricing.feat.enterprise.1', 'Everything in Ultimate'),
        t('pricing.feat.enterprise.2', 'Custom usage limits'),
        t('pricing.feat.enterprise.3', 'Custom model policies'),
        t('pricing.feat.enterprise.4', 'Advanced security'),
        t('pricing.feat.enterprise.5', 'SSO'),
        t('pricing.feat.enterprise.6', 'SAML/OIDC where implemented'),
        t('pricing.feat.enterprise.7', 'SCIM where implemented'),
        t('pricing.feat.enterprise.8', 'Organization administration'),
        t('pricing.feat.enterprise.9', 'Advanced audit logs'),
        t('pricing.feat.enterprise.10', 'Repository access controls'),
        t('pricing.feat.enterprise.11', 'Model access controls'),
        t('pricing.feat.enterprise.12', 'MCP access controls'),
        t('pricing.feat.enterprise.13', 'Network controls'),
        t('pricing.feat.enterprise.14', 'Compliance-oriented controls'),
        t('pricing.feat.enterprise.15', 'Dedicated support'),
        t('pricing.feat.enterprise.16', 'Custom onboarding'),
        t('pricing.feat.enterprise.17', 'Custom contracts'),
        t('pricing.feat.enterprise.18', 'Invoice / purchase-order billing'),
        t('pricing.feat.enterprise.19', 'Custom deployment options where supported')
      ],
      buttonText: t('pricing.btn_enterprise', 'Contact Sales'),
      popular: false,
      badge: t('pricing.badge_custom', 'Custom')
  };

  const comparisonCategories = [
    {
      name: t('pricing.comp.cat_ai_dev', 'AI DEVELOPMENT'),
      features: [
        { name: t('pricing.comp.ai_coding_agent', 'AI Coding Agent'), free: 'Limited', pro: true, business: true, ultimate: true },
        { name: t('pricing.comp.ask', 'ASK'), free: true, pro: true, business: true, ultimate: true },
        { name: t('pricing.comp.plan', 'PLAN'), free: true, pro: true, business: true, ultimate: true },
        { name: t('pricing.comp.edit', 'EDIT'), free: true, pro: true, business: true, ultimate: true },
        { name: t('pricing.comp.agent', 'AGENT'), free: 'Limited', pro: true, business: true, ultimate: true },
        { name: t('pricing.comp.codebase_context', 'Codebase Context'), free: 'Basic', pro: 'Advanced', business: 'Advanced', ultimate: 'Advanced' },
        { name: t('pricing.comp.multi_file', 'Multi-file Editing'), free: false, pro: true, business: true, ultimate: true },
        { name: t('pricing.comp.changesets', 'ChangeSets'), free: false, pro: true, business: true, ultimate: true },
        { name: t('pricing.comp.diff_review', 'Diff Review'), free: false, pro: true, business: true, ultimate: true },
        { name: t('pricing.comp.rollback', 'Rollback'), free: false, pro: true, business: true, ultimate: 'Advanced' },
      ]
    },
    {
      name: t('pricing.comp.cat_agents', 'AGENTS'),
      features: [
        { name: t('pricing.comp.agent_manager', 'Agent Manager'), free: false, pro: true, business: true, ultimate: true },
        { name: t('pricing.comp.spec_agents', 'Specialized Agents'), free: false, pro: true, business: true, ultimate: true },
        { name: t('pricing.comp.custom_agents', 'Custom Agents'), free: false, pro: true, business: true, ultimate: true },
        { name: t('pricing.comp.agent_orch', 'Agent Orchestration'), free: false, pro: true, business: true, ultimate: 'Advanced' },
        { name: t('pricing.comp.parallel_agents', 'Parallel Agents'), free: false, pro: false, business: false, ultimate: true },
        { name: t('pricing.comp.task_graphs', 'Task Graphs'), free: false, pro: false, business: false, ultimate: true },
        { name: t('pricing.comp.checkpoints', 'Checkpoints'), free: false, pro: true, business: true, ultimate: 'Advanced' },
      ]
    },
    {
      name: t('pricing.comp.cat_models', 'MODELS'),
      features: [
        { name: t('pricing.comp.model_registry', 'Model Registry'), free: 'Basic', pro: true, business: true, ultimate: true },
        { name: t('pricing.comp.multi_model', 'Multi-model support'), free: false, pro: true, business: true, ultimate: true },
        { name: t('pricing.comp.model_router', 'Model Router'), free: false, pro: true, business: true, ultimate: 'Advanced' },
        { name: t('pricing.comp.adv_models', 'Advanced models'), free: false, pro: true, business: true, ultimate: true },
        { name: t('pricing.comp.model_comp', 'Model comparison'), free: false, pro: true, business: true, ultimate: true },
      ]
    },
    {
      name: t('pricing.comp.cat_evals', 'EVALS'),
      features: [
        { name: t('pricing.comp.evals', 'Evals'), free: false, pro: true, business: true, ultimate: 'Advanced' },
        { name: t('pricing.comp.benchmarks', 'Benchmarks'), free: false, pro: false, business: false, ultimate: true },
        { name: t('pricing.comp.agent_eval', 'Agent evaluation'), free: false, pro: false, business: false, ultimate: true },
        { name: t('pricing.comp.usage_metrics', 'Usage metrics'), free: 'Basic', pro: true, business: true, ultimate: 'Advanced' },
      ]
    },
    {
      name: t('pricing.comp.cat_dev_flow', 'DEVELOPER WORKFLOW'),
      features: [
        { name: t('pricing.comp.terminal', 'Terminal'), free: true, pro: true, business: true, ultimate: true },
        { name: t('pricing.comp.testing', 'Testing'), free: 'Basic', pro: true, business: true, ultimate: true },
        { name: t('pricing.comp.debugging', 'Debugging'), free: false, pro: true, business: true, ultimate: true },
        { name: t('pricing.comp.git', 'Git'), free: true, pro: true, business: true, ultimate: true },
        { name: t('pricing.comp.github', 'GitHub'), free: true, pro: true, business: true, ultimate: true },
        { name: t('pricing.comp.gitlab', 'GitLab'), free: false, pro: true, business: true, ultimate: true },
        { name: t('pricing.comp.bitbucket', 'Bitbucket'), free: false, pro: true, business: true, ultimate: true },
      ]
    },
    {
      name: t('pricing.comp.cat_auto', 'AUTOMATION'),
      features: [
        { name: t('pricing.comp.cloud_agents', 'Cloud Agents'), free: false, pro: 'Included + Usage', business: 'Included + Usage', ultimate: 'Advanced' },
        { name: t('pricing.comp.automations', 'Automations'), free: false, pro: 'Included + Usage', business: 'Included + Usage', ultimate: 'Advanced' },
        { name: t('pricing.comp.bug_agent', 'Bug Agent'), free: false, pro: 'Usage-based', business: 'Usage-based', ultimate: 'Usage-based' },
      ]
    },
    {
      name: t('pricing.comp.cat_integrations', 'INTEGRATIONS'),
      features: [
        { name: t('pricing.comp.slack', 'Slack'), free: false, pro: false, business: true, ultimate: true },
        { name: t('pricing.comp.teams', 'Teams'), free: false, pro: false, business: true, ultimate: true },
        { name: t('pricing.comp.linear', 'Linear'), free: false, pro: false, business: true, ultimate: true },
        { name: t('pricing.comp.jira', 'Jira'), free: false, pro: false, business: true, ultimate: true },
        { name: t('pricing.comp.sentry', 'Sentry'), free: false, pro: false, business: true, ultimate: true },
        { name: t('pricing.comp.mcp', 'MCP'), free: false, pro: true, business: true, ultimate: true },
      ]
    },
    {
      name: t('pricing.comp.cat_team', 'TEAM'),
      features: [
        { name: t('pricing.comp.shared_projects', 'Shared projects'), free: false, pro: false, business: true, ultimate: true },
        { name: t('pricing.comp.team_agents', 'Team agents'), free: false, pro: false, business: true, ultimate: true },
        { name: t('pricing.comp.team_billing', 'Team billing'), free: false, pro: false, business: true, ultimate: true },
        { name: t('pricing.comp.usage_analytics', 'Usage analytics'), free: false, pro: true, business: true, ultimate: 'Advanced' },
        { name: t('pricing.comp.permissions', 'Permissions'), free: false, pro: false, business: true, ultimate: true },
      ]
    },
    {
      name: t('pricing.comp.cat_security', 'SECURITY'),
      features: [
        { name: t('pricing.comp.privacy_controls', 'Privacy controls'), free: false, pro: false, business: true, ultimate: 'Advanced' },
        { name: t('pricing.comp.sso', 'SSO'), free: false, pro: false, business: false, ultimate: t('pricing.coming_soon', 'Coming soon') },
        { name: t('pricing.comp.scim', 'SCIM'), free: false, pro: false, business: false, ultimate: t('pricing.coming_soon', 'Coming soon') },
        { name: t('pricing.comp.audit_logs', 'Audit logs'), free: false, pro: false, business: true, ultimate: 'Advanced' },
        { name: t('pricing.comp.repo_controls', 'Repository controls'), free: false, pro: false, business: false, ultimate: true },
        { name: t('pricing.comp.model_controls', 'Model controls'), free: false, pro: false, business: true, ultimate: true },
      ]
    }
  ];

  const faqs = [
    { question: t('faq.q1', 'What is included in Free?'), answer: t('faq.a1', 'Free includes the core FLOAT AI coding workspace, ASK, PLAN, EDIT, and limited AGENT modes, plus basic codebase understanding and editing.') },
    { question: t('faq.q2', 'How does FLOAT usage work?'), answer: t('faq.a2', 'FLOAT includes generous usage allowances on paid plans. Usage applies to third-party AI models, Cloud Agents, Automations, and specialized agents.') },
    { question: t('faq.q3', 'What happens when I reach my included usage?'), answer: t('faq.a3', 'You can continue using FLOAT by switching to usage-based billing, where you only pay for what you consume.') },
    { question: t('faq.q4', 'How does model usage affect my plan?'), answer: t('faq.a4', 'Different models consume usage at different rates. Advanced models (like GPT-4, Claude 3.5 Sonnet, or Gemini 1.5 Pro) consume more included usage than smaller, faster models.') },
    { question: t('faq.q5', 'Are Cloud Agents included?'), answer: t('faq.a5', 'Pro, Business, and Ultimate plans include an allowance for Cloud Agents. Additional Cloud Agent time is billed as a usage-based product.') },
    { question: t('faq.q6', 'How does Bug Agent billing work?'), answer: t('faq.a6', 'The Bug Agent (Bugbot) operates as a usage-based product that reviews your codebase or pull requests. Usage allowances vary by plan.') },
    { question: t('faq.q7', 'What are Automations?'), answer: t('faq.a7', 'Automations let you run agentic workflows on schedules or event triggers (like GitHub webhooks). They consume compute resources and are billed through included usage or usage-based pricing.') },
    { question: t('faq.q8', 'Can I upgrade or downgrade?'), answer: t('faq.a8', 'Yes, you can manage your plan at any time. Plan changes take effect at the start of the next billing cycle.') },
    { question: t('faq.q9', 'Can I use FLOAT for a team?'), answer: t('faq.a9', 'Yes, the Business and Ultimate plans are designed for teams, featuring shared projects, team agents, shared skills, and team-level administration.') },
    { question: t('faq.q10', 'Does Business support centralized billing?'), answer: t('faq.a10', 'Yes, Business and Ultimate plans provide centralized invoice management and usage analytics for the entire team.') },
    { question: t('faq.q11', 'Does Ultimate include all models?'), answer: t('faq.a11', 'Yes, Ultimate users get access to the most advanced model capabilities available through our model routing layer, plus priority execution.') },
    { question: t('faq.q12', 'Is Enterprise available?'), answer: t('faq.a12', 'Yes, we offer custom enterprise agreements for organizations needing SSO, custom model policies, advanced security, and dedicated support.') },
  ];

  const renderComparisonValue = (value: boolean | string) => {
    if (typeof value === 'boolean') {
      return value ? <Check size={16} className="text-slate-900 dark:text-white mx-auto" /> : <Minus size={16} className="text-slate-300 dark:text-slate-700 mx-auto" />;
    }
    return <span className="text-xs font-medium text-slate-700 dark:text-slate-300 px-2 py-1 bg-slate-100 dark:bg-white/10 rounded-md whitespace-nowrap">{value}</span>;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0F0F0B] text-slate-900 dark:text-[#EDEDED] font-sans overflow-x-hidden selection:bg-[#7C3AED]/20 dark:selection:bg-[#EDEDED] dark:selection:text-[#0F0F0B] transition-colors">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-[#0F0F0B]/80 backdrop-blur-md border-b border-slate-200/80 dark:border-white/5 transition-colors">
        <div className="flex items-center gap-8">
          <a href="/" className="flex items-center gap-2.5 cursor-pointer">
            <FloatLogo className="w-6 h-6" />
            <span className="font-bold text-lg tracking-tight uppercase text-slate-900 dark:text-white">FLOAT</span>
          </a>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-[#A1A1AA]">
            <ModelsDropdown currentPath="/pricing" />
            <ProductsDropdown currentPath="/pricing" />
            <PricingDropdown currentPath="/pricing" />
            <ResourcesDropdown currentPath="/pricing" />
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm font-medium">
          <LanguageDropdown />
          <button
            onClick={toggleTheme}
            aria-label={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} mode`}
            title={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} mode`}
            className="p-2 rounded-full border border-slate-200 dark:border-white/15 text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            {settings.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button 
            onClick={handleStart}
            className="text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors hidden sm:block cursor-pointer px-2 py-1"
          >
            {t('nav.signin', 'Sign in')}
          </button>
          <button 
            onClick={handleStart}
            className="px-4 py-1.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-full hover:opacity-90 transition-opacity font-semibold cursor-pointer"
          >
            {t('nav.download', 'Download')}
          </button>
        </div>
      </nav>

      <main className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-medium tracking-tight mb-6 text-slate-900 dark:text-white">{t('pricing.hero_heading', 'Pricing that scales with your development.')}</h1>
          <p className="text-lg text-slate-600 dark:text-[#A1A1AA] max-w-2xl mx-auto">{t('pricing.hero_subheading', 'Start free, build with powerful AI agents, and scale FLOAT as your projects and team grow.')}</p>
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center mb-16">
          <div className="bg-slate-200/50 dark:bg-white/5 p-1 rounded-full inline-flex items-center relative">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`relative z-10 px-6 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer ${billingPeriod === 'monthly' ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'}`}
            >
              {t('pricing.monthly', 'Monthly')}
            </button>
            <button
              onClick={() => setBillingPeriod('yearly')}
              className={`relative z-10 px-6 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer ${billingPeriod === 'yearly' ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'}`}
            >
              {t('pricing.yearly', 'Yearly')}
              {billingPeriod === 'yearly' && (
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400">{t('pricing.save20', 'Save 20%')}</span>
              )}
            </button>
            {/* Animated background pill */}
            <div 
              className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white dark:bg-[#1E1C18] rounded-full shadow-sm transition-transform duration-300 ease-in-out ${billingPeriod === 'yearly' ? 'translate-x-full left-0' : 'translate-x-0 left-1'}`}
              style={{ width: billingPeriod === 'monthly' ? '100px' : '135px', transform: billingPeriod === 'yearly' ? 'translateX(100px)' : 'translateX(0)' }}
            />
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8 items-stretch">
          {plans.map((plan, index) => (
            <motion.div 
              key={plan.id}
              id={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative flex flex-col bg-white dark:bg-[#161410] rounded-2xl border ${plan.popular ? 'border-purple-500 dark:border-purple-500/50 shadow-xl dark:shadow-purple-900/10 scale-[1.02]' : 'border-slate-200 dark:border-white/10 shadow-sm'} p-8 transition-transform`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-[10px] font-bold uppercase tracking-wider py-1 px-3 rounded-full whitespace-nowrap">
                  {plan.badge}
                </div>
              )}
              {plan.badge && !plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-800 text-white dark:bg-white dark:text-black text-[10px] font-bold uppercase tracking-wider py-1 px-3 rounded-full whitespace-nowrap">
                  {plan.badge}
                </div>
              )}
              
              <div className="mb-8 text-left">
                <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">{plan.name}</h3>
                <p className="text-sm text-slate-500 dark:text-[#A1A1AA] h-10 leading-snug">{plan.subtitle}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-slate-900 dark:text-white">
                    ${billingPeriod === 'yearly' ? plan.priceYearly : plan.priceMonthly}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-[#A1A1AA]">
                    {plan.unit ? t('pricing.per_user_month', '/ user / month') : t('pricing.per_month', '/ month')}
                  </span>
                </div>
                {billingPeriod === 'yearly' && plan.priceYearly > 0 && (
                  <div className="text-xs text-green-600 dark:text-green-500 font-medium mt-2">
                    {t('pricing.billed_yearly', 'Billed ${amount} yearly').replace('${amount}', String(plan.yearlyBilled))}
                  </div>
                )}
                {billingPeriod === 'yearly' && plan.priceYearly === 0 && (
                  <div className="text-xs text-slate-500 dark:text-[#A1A1AA] font-medium mt-2 invisible">Placeholder</div>
                )}
                {billingPeriod === 'monthly' && (
                  <div className="text-xs text-slate-500 dark:text-[#A1A1AA] font-medium mt-2 invisible">Placeholder</div>
                )}
              </div>

              <button 
                onClick={handleStart}
                className={`w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-colors mb-8 cursor-pointer ${
                  plan.popular 
                    ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                    : plan.id === 'ultimate' 
                      ? 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-200 dark:text-black'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-900 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white'
                }`}
              >
                {plan.buttonText}
              </button>

              <div className="flex-1 flex flex-col gap-3.5 text-left">
                {plan.features.map((feature, idx) => {
                  const isPlus = feature.includes('plus:');
                  return (
                    <div key={idx} className="flex items-start gap-3">
                      {!isPlus && <Check size={16} className={`shrink-0 mt-0.5 ${plan.id === 'free' ? 'text-slate-400 dark:text-[#A1A1AA]' : 'text-purple-500 dark:text-purple-400'}`} />}
                      <span className={`text-sm leading-tight ${isPlus ? 'font-medium text-slate-900 dark:text-white mb-1' : 'text-slate-600 dark:text-[#A1A1AA]'}`}>
                        {feature}
                      </span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Enterprise Card */}
        <motion.div 
          id="enterprise" 
          className="max-w-7xl mx-auto mb-24"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className="bg-white dark:bg-[#161410] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm p-8 flex flex-col xl:flex-row gap-8 items-start relative">
            <div className="absolute -top-3 left-6 bg-slate-800 text-white dark:bg-white dark:text-black text-[10px] font-bold uppercase tracking-wider py-1 px-3 rounded-full whitespace-nowrap">
              {enterprisePlan.badge}
            </div>
            
            <div className="xl:w-1/3 text-left">
              <h3 className="text-xl font-medium text-slate-900 dark:text-white mb-2">{enterprisePlan.name}</h3>
              <p className="text-sm text-slate-500 dark:text-[#A1A1AA] mb-4">{enterprisePlan.subtitle}</p>
              <div className="text-3xl font-bold text-slate-900 dark:text-white mb-6">{enterprisePlan.priceMonthly}</div>
              <button 
                onClick={handleStart}
                className="w-full xl:w-auto px-6 py-2.5 rounded-lg font-medium text-sm transition-colors bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-200 dark:text-black cursor-pointer"
              >
                {enterprisePlan.buttonText}
              </button>
            </div>
            
            <div className="xl:w-2/3 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
              {enterprisePlan.features.map((feature, idx) => {
                const isPlus = feature.includes('Everything');
                return (
                  <div key={idx} className="flex items-start gap-3">
                    {!isPlus && <Check size={16} className="shrink-0 mt-0.5 text-slate-700 dark:text-slate-300" />}
                    <span className={`text-sm leading-tight ${isPlus ? 'font-medium text-slate-900 dark:text-white w-full' : 'text-slate-600 dark:text-[#A1A1AA]'}`}>
                      {feature}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Usage Based Products */}
        <div className="mb-32">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-medium tracking-tight text-slate-900 dark:text-white">{t('pricing.usage_based.heading', 'Usage-based products')}</h2>
            <p className="text-lg text-slate-600 dark:text-[#A1A1AA] max-w-2xl mx-auto mt-4">{t('pricing.usage_based.subheading', 'Some advanced FLOAT capabilities consume compute or model resources based on actual usage.')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/10 rounded-2xl p-6 flex flex-col text-left">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{t('pricing.usage.model', 'MODEL USAGE')}</h3>
              <div className="text-[10px] font-bold text-purple-600 dark:text-purple-400 mb-4 uppercase tracking-wider">{t('pricing.usage.based', 'Usage-based')}</div>
              <p className="text-sm text-slate-600 dark:text-[#A1A1AA] mb-4 flex-grow">{t('pricing.usage.model_desc', 'Use advanced third-party and FLOAT models according to actual model usage.')}</p>
              <div className="text-xs text-slate-500 dark:text-[#A1A1AA] border-t border-slate-100 dark:border-white/5 pt-4">
                {t('pricing.usage.model_note', 'Different models may consume different amounts of included usage. Pricing varies by model.')}
              </div>
            </div>
            
            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/10 rounded-2xl p-6 flex flex-col text-left">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{t('pricing.usage.cloud', 'CLOUD AGENTS')}</h3>
              <div className="text-[10px] font-bold text-purple-600 dark:text-purple-400 mb-4 uppercase tracking-wider">{t('pricing.usage.based', 'Usage-based')}</div>
              <p className="text-sm text-slate-600 dark:text-[#A1A1AA] mb-4 flex-grow">{t('pricing.usage.cloud_desc', 'Run FLOAT agents in isolated cloud development environments.')}</p>
              <div className="text-xs text-slate-500 dark:text-[#A1A1AA] border-t border-slate-100 dark:border-white/5 pt-4">
                {t('pricing.usage.cloud_note', 'Compute/model usage can vary by agent task.')}
              </div>
            </div>

            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/10 rounded-2xl p-6 flex flex-col text-left">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{t('pricing.usage.bug', 'BUG AGENT / BUGBOT')}</h3>
              <div className="text-[10px] font-bold text-purple-600 dark:text-purple-400 mb-4 uppercase tracking-wider">{t('pricing.usage.based', 'Usage-based')}</div>
              <p className="text-sm text-slate-600 dark:text-[#A1A1AA] mb-4 flex-grow">{t('pricing.usage.bug_desc', 'Automated code review, bug detection, and optional automated fixes.')}</p>
              <div className="text-xs text-slate-500 dark:text-[#A1A1AA] border-t border-slate-100 dark:border-white/5 pt-4">
                {t('pricing.usage.bug_note', 'Included allowance varies by plan. Additional usage may apply.')}
              </div>
            </div>

            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/10 rounded-2xl p-6 flex flex-col text-left">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{t('pricing.usage.auto', 'AUTOMATIONS')}</h3>
              <div className="text-[10px] font-bold text-purple-600 dark:text-purple-400 mb-4 uppercase tracking-wider">{t('pricing.usage.included_based', 'Included + usage-based')}</div>
              <p className="text-sm text-slate-600 dark:text-[#A1A1AA] mb-4 flex-grow">{t('pricing.usage.auto_desc', 'Run agents automatically from schedules, repository events, integrations, and other triggers.')}</p>
              <div className="text-xs text-slate-500 dark:text-[#A1A1AA] border-t border-slate-100 dark:border-white/5 pt-4">
                {t('pricing.usage.auto_note', 'Usage varies by task.')}
              </div>
            </div>

            <div className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/10 rounded-2xl p-6 flex flex-col text-left">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{t('pricing.usage.eval', 'LARGE EVALUATION RUNS')}</h3>
              <div className="text-[10px] font-bold text-purple-600 dark:text-purple-400 mb-4 uppercase tracking-wider">{t('pricing.usage.based', 'Usage-based')}</div>
              <p className="text-sm text-slate-600 dark:text-[#A1A1AA] mb-4 flex-grow">{t('pricing.usage.eval_desc', 'Run large model and agent benchmark suites.')}</p>
              <div className="text-xs text-slate-500 dark:text-[#A1A1AA] border-t border-slate-100 dark:border-white/5 pt-4">
                {t('pricing.usage.eval_note', 'Billed when EvalEngine supports usage accounting.')}
              </div>
            </div>
          </div>
        </div>

        {/* Plan Comparison Table */}
        <div className="mb-32">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-medium tracking-tight text-slate-900 dark:text-white">{t('pricing.compare', 'Compare all plans')}</h2>
          </div>
          
          <div className="w-full overflow-x-auto pb-4">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-5 gap-4 px-6 py-4 border-b border-slate-200 dark:border-white/10 sticky top-[72px] bg-slate-50 dark:bg-[#0F0F0B] z-30">
                <div className="col-span-1 font-medium text-slate-900 dark:text-white text-left"></div>
                <div className="text-center font-medium text-slate-900 dark:text-white">{t('pricing.plan_free', 'Free')}</div>
                <div className="text-center font-medium text-purple-600 dark:text-purple-400">{t('pricing.plan_pro', 'Pro')}</div>
                <div className="text-center font-medium text-slate-900 dark:text-white">{t('pricing.plan_business', 'Business')}</div>
                <div className="text-center font-medium text-slate-900 dark:text-white">{t('pricing.plan_ultimate', 'Ultimate')}</div>
              </div>

              {comparisonCategories.map((category, idx) => (
                <div key={idx} className="mb-8 relative z-10">
                  <div className="px-6 py-3 bg-slate-100 dark:bg-white/5 font-semibold text-xs tracking-wider text-slate-900 dark:text-white rounded-lg mt-4 mb-2 text-left uppercase">
                    {category.name}
                  </div>
                  <div className="flex flex-col">
                    {category.features.map((feature, fIdx) => (
                      <div key={fIdx} className="grid grid-cols-5 gap-4 px-6 py-4 border-b border-slate-100 dark:border-white/5 hover:bg-white dark:hover:bg-[#161410] transition-colors">
                        <div className="col-span-1 text-sm text-slate-700 dark:text-slate-300 font-medium text-left">{feature.name}</div>
                        <div className="text-center flex items-center justify-center">{renderComparisonValue(feature.free)}</div>
                        <div className="text-center flex items-center justify-center">{renderComparisonValue(feature.pro)}</div>
                        <div className="text-center flex items-center justify-center">{renderComparisonValue(feature.business)}</div>
                        <div className="text-center flex items-center justify-center">{renderComparisonValue(feature.ultimate)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-medium tracking-tight text-slate-900 dark:text-white">{t('pricing.faq_heading', 'Frequently asked questions')}</h2>
          </div>
          
          <div className="flex flex-col gap-4">
            {faqs.map((faq, idx) => (
              <div 
                key={idx} 
                className="bg-white dark:bg-[#161410] border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden transition-colors"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-inset cursor-pointer"
                  aria-expanded={openFaq === idx}
                >
                  <span className="font-medium text-slate-900 dark:text-white">{faq.question}</span>
                  <ChevronDown 
                    size={20} 
                    className={`text-slate-400 transition-transform duration-200 shrink-0 ${openFaq === idx ? 'rotate-180' : ''}`} 
                  />
                </button>
                <AnimatePresence>
                  {openFaq === idx && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                    >
                      <div className="px-6 pb-4 pt-0 text-slate-600 dark:text-[#A1A1AA] leading-relaxed text-sm">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
