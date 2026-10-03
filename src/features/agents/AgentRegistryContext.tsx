import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Agent, AgentModelAssignment } from '../../types/ai';
import { useAIStore } from '../../store/aiStore';
import { useAuthStore } from '../../store/authStore';
import { agentAssignmentService } from '../../services/agentAssignmentService';
import { INITIAL_MODELS, INITIAL_AGENTS } from '../ai/registry';

export interface ModelAssignmentConfig {
  primaryModel: string;
  fallbackModel: string;
  isCustom?: boolean;
  updatedAt?: Date | string;
}

export interface AgentRegistryContextType {
  agents: Agent[];
  models: typeof INITIAL_MODELS;
  assignments: Record<string, ModelAssignmentConfig>;
  getAssignment: (agentId: string) => ModelAssignmentConfig;
  setAssignment: (agentId: string, primaryModel: string, fallbackModel: string) => Promise<boolean>;
  batchSaveAssignments: (configs: Array<{ agentId: string; primaryModel: string; fallbackModel: string }>) => Promise<boolean>;
  resetToDefaults: (agentId?: string) => Promise<void>;
  loading: boolean;
  saving: boolean;
  error: string | null;
  syncStatus: 'synced' | 'local_only' | 'syncing' | 'error';
  refresh: () => Promise<void>;
  selectedAgentId: string | null;
  setSelectedAgentId: (id: string | null) => void;
}

const AgentRegistryContext = createContext<AgentRegistryContextType | null>(null);

// Default fallback model recommendations based on agent type
const DEFAULT_FALLBACKS: Record<string, string> = {
  'general-assistant': 'gemini-3.1-flash-lite',
  'planner-agent': 'gemini-3.1-pro-preview',
  'coder-agent': 'gpt-4o-mini',
  'reviewer-agent': 'gemini-3.8-flash',
  'explorer-agent': 'gemini-3.1-flash-lite',
  'debugger-agent': 'o3-mini',
  'ui-agent': 'gemini-3.8-flash'
};

export function AgentRegistryProvider({ children }: { children: React.ReactNode }) {
  const { agents, setAgents, models } = useAIStore();
  const { user } = useAuthStore();

  const [assignments, setAssignments] = useState<Record<string, ModelAssignmentConfig>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'local_only' | 'syncing' | 'error'>('local_only');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(agents[0]?.id || 'general-assistant');

  // Build default configuration for all agents
  const defaultAssignments = useMemo(() => {
    const defaults: Record<string, ModelAssignmentConfig> = {};
    const agentList = agents.length > 0 ? agents : INITIAL_AGENTS;
    for (const a of agentList) {
      defaults[a.id] = {
        primaryModel: a.defaultModel || 'gemini-3.1-flash-lite',
        fallbackModel: a.fallbackModel || DEFAULT_FALLBACKS[a.id] || 'gemini-3.1-flash-lite',
        isCustom: false
      };
    }
    return defaults;
  }, [agents]);

  // Load from Firebase when authenticated user changes
  const loadAssignmentsFromFirestore = useCallback(async () => {
    if (!user) {
      setAssignments(defaultAssignments);
      setSyncStatus('local_only');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSyncStatus('syncing');

      const userDocs = await agentAssignmentService.getUserAssignments(user.uid);

      const merged: Record<string, ModelAssignmentConfig> = { ...defaultAssignments };
      
      for (const doc of userDocs) {
        if (doc.agentId) {
          merged[doc.agentId] = {
            primaryModel: doc.primaryModel,
            fallbackModel: doc.fallbackModel || '',
            isCustom: true,
            updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : undefined
          };
        }
      }

      setAssignments(merged);
      setSyncStatus('synced');

      // Update AIStore agents with retrieved model assignments
      setAgents(
        agents.map(a => {
          const config = merged[a.id];
          if (config) {
            return {
              ...a,
              defaultModel: config.primaryModel,
              fallbackModel: config.fallbackModel
            };
          }
          return a;
        })
      );
    } catch (err: any) {
      console.error('Error loading agent assignments:', err);
      setError(err?.message || 'Failed to retrieve agent assignments from Firebase');
      setSyncStatus('error');
      // Fallback to local default assignments
      setAssignments(defaultAssignments);
    } finally {
      setLoading(false);
    }
  }, [user, defaultAssignments, agents, setAgents]);

  useEffect(() => {
    loadAssignmentsFromFirestore();
  }, [user?.uid]);

  const getAssignment = useCallback((agentId: string): ModelAssignmentConfig => {
    if (assignments[agentId]) {
      return assignments[agentId];
    }
    const agent = agents.find(a => a.id === agentId);
    return {
      primaryModel: agent?.defaultModel || 'gemini-3.1-flash-lite',
      fallbackModel: agent?.fallbackModel || DEFAULT_FALLBACKS[agentId] || 'gemini-3.1-flash-lite',
      isCustom: false
    };
  }, [assignments, agents]);

  const setAssignment = useCallback(async (
    agentId: string,
    primaryModel: string,
    fallbackModel: string
  ): Promise<boolean> => {
    try {
      setSaving(true);
      setError(null);

      // Local optimistic update
      const updatedConfig: ModelAssignmentConfig = {
        primaryModel,
        fallbackModel,
        isCustom: true,
        updatedAt: new Date()
      };

      setAssignments(prev => ({
        ...prev,
        [agentId]: updatedConfig
      }));

      // Update AIStore agents in real-time
      setAgents(
        agents.map(a => {
          if (a.id === agentId) {
            return {
              ...a,
              defaultModel: primaryModel,
              fallbackModel
            };
          }
          return a;
        })
      );

      // Persist to Firebase if authenticated
      if (user) {
        await agentAssignmentService.saveAssignment(agentId, primaryModel, fallbackModel);
        setSyncStatus('synced');
      } else {
        setSyncStatus('local_only');
      }

      return true;
    } catch (err: any) {
      console.error('Failed to save assignment:', err);
      setError(err?.message || 'Failed to persist assignment to Firebase');
      setSyncStatus('error');
      return false;
    } finally {
      setSaving(false);
    }
  }, [user, agents, setAgents]);

  const batchSaveAssignments = useCallback(async (
    configs: Array<{ agentId: string; primaryModel: string; fallbackModel: string }>
  ): Promise<boolean> => {
    try {
      setSaving(true);
      setError(null);

      const newAssignments = { ...assignments };
      for (const config of configs) {
        newAssignments[config.agentId] = {
          primaryModel: config.primaryModel,
          fallbackModel: config.fallbackModel,
          isCustom: true,
          updatedAt: new Date()
        };
      }
      setAssignments(newAssignments);

      // Update in AIStore
      setAgents(
        agents.map(a => {
          const matched = configs.find(c => c.agentId === a.id);
          if (matched) {
            return {
              ...a,
              defaultModel: matched.primaryModel,
              fallbackModel: matched.fallbackModel
            };
          }
          return a;
        })
      );

      // Persist to Firebase if authenticated
      if (user) {
        await agentAssignmentService.batchSaveAssignments(configs);
        setSyncStatus('synced');
      } else {
        setSyncStatus('local_only');
      }

      return true;
    } catch (err: any) {
      console.error('Failed to batch save assignments:', err);
      setError(err?.message || 'Failed to save batch to Firebase');
      setSyncStatus('error');
      return false;
    } finally {
      setSaving(false);
    }
  }, [user, assignments, agents, setAgents]);

  const resetToDefaults = useCallback(async (agentId?: string): Promise<void> => {
    if (agentId) {
      const def = defaultAssignments[agentId];
      if (def) {
        await setAssignment(agentId, def.primaryModel, def.fallbackModel);
      }
    } else {
      // Reset all
      const batch = Object.keys(defaultAssignments).map(id => ({
        agentId: id,
        primaryModel: defaultAssignments[id].primaryModel,
        fallbackModel: defaultAssignments[id].fallbackModel
      }));
      await batchSaveAssignments(batch);
    }
  }, [defaultAssignments, setAssignment, batchSaveAssignments]);

  const value: AgentRegistryContextType = {
    agents: agents.length > 0 ? agents : INITIAL_AGENTS,
    models: (models && models.length > 0) ? models : INITIAL_MODELS,
    assignments,
    getAssignment,
    setAssignment,
    batchSaveAssignments,
    resetToDefaults,
    loading,
    saving,
    error,
    syncStatus,
    refresh: loadAssignmentsFromFirestore,
    selectedAgentId,
    setSelectedAgentId
  };

  return (
    <AgentRegistryContext.Provider value={value}>
      {children}
    </AgentRegistryContext.Provider>
  );
}

export function useAgentRegistry(): AgentRegistryContextType {
  const context = useContext(AgentRegistryContext);
  if (!context) {
    throw new Error('useAgentRegistry must be used within an AgentRegistryProvider');
  }
  return context;
}
