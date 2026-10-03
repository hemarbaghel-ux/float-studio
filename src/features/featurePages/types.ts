export interface FeatureStep {
  stepNumber: number;
  title: string;
  developerAction: string;
  floatAction: string;
  involvedArtifacts: string;
  outputProduced: string;
  inspectionAndApproval: string;
}

export interface FeatureCapability {
  name: string;
  description: string;
  practicalBenefit: string;
  requirementOrRestriction?: string;
}

export interface FeatureExample {
  scenarioTitle: string;
  problem: string;
  developerPrompt: string;
  executionProcess: string[];
  codeOrDiffType: 'diff' | 'code' | 'terminal' | 'interactive';
  codeOrDiffSnippet: string;
  verificationStep: string;
}

export interface FeatureFaqItem {
  question: string;
  answer: string;
}

export interface RelatedFeatureItem {
  slug: string;
  title: string;
  category: string;
  description: string;
}

export interface FeatureDetail {
  slug: string;
  title: string;
  badgeCategory: string;
  headline: string;
  introParagraph: string;
  primaryAction: {
    label: string;
    href: string;
    description?: string;
  };
  secondaryAction: {
    label: string;
    href: string;
  };
  mockupType: 'plan' | 'design' | 'debug' | 'terminal' | 'context' | 'git' | 'plugins' | 'skills' | 'mcp' | 'desktop' | 'cli' | 'other' | 'web-mobile' | 'models' | 'rules' | 'search' | 'agents' | 'routing' | 'enterprise';
  whatItDoes: {
    overview: string;
    problemSolved: string;
    targetAudience: string;
    whenToUse: string;
    workflowFit: string;
  };
  howItWorks: FeatureStep[];
  practicalExample: FeatureExample;
  keyCapabilities: FeatureCapability[];
  whenToUseScenarios: {
    title: string;
    description: string;
  }[];
  workflowAndIntegrations: {
    leadText: string;
    connectedTools: {
      name: string;
      role: string;
      slug: string;
    }[];
  };
  requirementsAndLimitations: {
    availabilityStatus: 'Available' | 'Configured / Beta' | 'Planned / Preview';
    authRequired: boolean;
    providerKeyRequired: boolean;
    environmentNotes: string;
    knownLimitations: string[];
  };
  faq: FeatureFaqItem[];
  relatedFeatures: RelatedFeatureItem[];
}
