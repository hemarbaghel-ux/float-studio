import { create } from 'zustand';
import { auth } from '../lib/firebase';

export type IntegrationProvider = 
  | 'github' | 'gitlab' | 'bitbucket'
  | 'slack' | 'teams'
  | 'linear' | 'jira'
  | 'sentry';

export type IntegrationCategory = 'Code Hosting' | 'Communication' | 'Project Management' | 'Monitoring';

export interface IntegrationDefinition {
  id: IntegrationProvider;
  name: string;
  category: IntegrationCategory;
  description: string;
  requiredScopes?: string[];
}

export const INTEGRATION_REGISTRY: IntegrationDefinition[] = [
  { 
    id: 'github', 
    name: 'GitHub', 
    category: 'Code Hosting', 
    description: 'Connect a GitHub account for authenticated repository access. Features depend on the integration settings enabled by your deployment.',
    requiredScopes: ['read:user', 'repo']
  },
  { 
    id: 'gitlab', 
    name: 'GitLab', 
    category: 'Code Hosting', 
    description: 'Connect a GitLab account when GitLab OAuth is configured for your deployment.',
    requiredScopes: ['read_user', 'read_repository']
  },
];

export interface IntegrationConnection {
  id: string;
  provider: IntegrationProvider;
  accountId?: string;
  accountName?: string;
  avatarUrl?: string;
  profileUrl?: string;
  scopes?: string[];
  status: 'connected' | 'connecting' | 'expired' | 'error' | 'reauthorization_required' | 'disabled';
  createdAt: number;
  lastVerifiedAt?: number;
}

export interface ProviderSetupInfo {
  id: IntegrationProvider;
  name: string;
  configured: boolean;
  callbackUrl: string;
  scopes: string[];
  envVars: string[];
  helpUrl: string;
}

export interface RepositoryItem {
  id: string;
  name: string;
  fullName: string;
  private: boolean;
  description: string;
  htmlUrl: string;
  defaultBranch: string;
  updatedAt: string;
  language: string;
}

export interface GitCommitItem {
  sha: string;
  shortSha: string;
  message: string;
  author: {
    name: string;
    email: string;
    avatarUrl?: string;
  };
  date: string;
  htmlUrl?: string;
}

export interface GitCommitDiffFile {
  filename: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  patch: string;
  previousFilename?: string;
}

interface IntegrationState {
  configuredProviders: IntegrationProvider[];
  providerDetails: Record<string, ProviderSetupInfo>;
  connections: IntegrationConnection[];
  loading: boolean;
  setupModalProvider: IntegrationProvider | null;
  setSetupModalProvider: (provider: IntegrationProvider | null) => void;
  fetchIntegrations: () => Promise<void>;
  getAuthUrl: (provider: IntegrationProvider) => Promise<{
    configured: boolean;
    authUrl?: string;
    callbackUrl: string;
    message?: string;
    requiredEnvVars?: string[];
    setupUrl?: string;
  }>;
  getRepositories: (provider: IntegrationProvider) => Promise<{
    success: boolean;
    repositories: RepositoryItem[];
    accountName?: string;
    error?: string;
  }>;
  getCommits: (provider: IntegrationProvider, owner: string, repo: string, branch?: string) => Promise<{
    success: boolean;
    commits: GitCommitItem[];
    error?: string;
  }>;
  getCommitDiff: (provider: IntegrationProvider, owner: string, repo: string, sha: string) => Promise<{
    success: boolean;
    commit?: any;
    files: GitCommitDiffFile[];
    error?: string;
  }>;
  disconnect: (connectionId: string) => Promise<boolean>;
}

export const useIntegrationStore = create<IntegrationState>((set, get) => ({
  configuredProviders: [],
  providerDetails: {},
  connections: [],
  loading: true,
  setupModalProvider: null,

  setSetupModalProvider: (provider) => set({ setupModalProvider: provider }),

  fetchIntegrations: async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const [configRes, connRes] = await Promise.all([
        fetch('/api/integrations/status'),
        token 
          ? fetch('/api/integrations/connections', { headers })
          : Promise.resolve({ ok: true, json: async () => ({ connections: [] }) } as any)
      ]);

      const config = configRes.ok ? await configRes.json() : { configuredProviders: [], providers: {} };
      const conns = connRes.ok ? await connRes.json() : { connections: [] };

      set({
        configuredProviders: config.configuredProviders || [],
        providerDetails: config.providers || {},
        connections: conns.connections || [],
        loading: false
      });
    } catch (e) {
      console.error('Failed to fetch integrations', e);
      set({ loading: false });
    }
  },

  getAuthUrl: async (provider: IntegrationProvider) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const params = new URLSearchParams();
      if (origin) params.set('origin', origin);
      const res = await fetch(`/api/integrations/${provider}/auth-url?${params.toString()}`, { headers });
      return await res.json();
    } catch (err: any) {
      return {
        configured: false,
        callbackUrl: `/api/integrations/${provider}/callback`,
        message: err.message || 'Failed to request authorization URL'
      };
    }
  },

  getRepositories: async (provider: IntegrationProvider) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        return { success: false, repositories: [], error: 'Authentication required. Please sign in.' };
      }
      const res = await fetch(`/api/integrations/${provider}/repositories`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, repositories: [], error: data.error || 'Failed to fetch repositories' };
      }
      return {
        success: true,
        repositories: data.repositories || [],
        accountName: data.accountName
      };
    } catch (err: any) {
      return { success: false, repositories: [], error: err.message || 'Network error' };
    }
  },

  getCommits: async (provider: IntegrationProvider, owner: string, repo: string, branch?: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        return { success: false, commits: [], error: 'Authentication required. Please sign in.' };
      }
      const query = branch ? `?branch=${encodeURIComponent(branch)}` : '';
      const res = await fetch(`/api/integrations/${provider}/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, commits: [], error: data.error || 'Failed to fetch commits' };
      }
      return {
        success: true,
        commits: data.commits || []
      };
    } catch (err: any) {
      return { success: false, commits: [], error: err.message || 'Network error' };
    }
  },

  getCommitDiff: async (provider: IntegrationProvider, owner: string, repo: string, sha: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        return { success: false, files: [], error: 'Authentication required. Please sign in.' };
      }
      const res = await fetch(`/api/integrations/${provider}/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(sha)}/diff`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, files: [], error: data.error || 'Failed to fetch commit diff' };
      }
      return {
        success: true,
        commit: data,
        files: data.files || []
      };
    } catch (err: any) {
      return { success: false, files: [], error: err.message || 'Network error' };
    }
  },

  disconnect: async (connectionId: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/integrations/disconnect/${connectionId}`, { method: 'POST', headers });
      if (res.ok) {
        const { connections } = get();
        set({ connections: connections.filter(c => c.id !== connectionId) });
        return true;
      }
      return false;
    } catch (e) {
      console.error('Failed to disconnect integration', e);
      return false;
    }
  }
}));
