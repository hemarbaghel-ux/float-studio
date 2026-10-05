import { create } from 'zustand';
import { 
  ValidationRun, 
  ValidationDiagnostic, 
  ErrorExplanationResponse, 
  ProjectValidationType, 
  ValidationStatus 
} from '../types/validation';
import { auth } from '../lib/firebase';
import { useIDEStore } from './index';

interface ValidationState {
  currentRun: ValidationRun | null;
  isRunning: boolean;
  activeProjectId: string | null;
  selectedTarget: 'current_project' | 'proposal';
  selectedProposalId: string | null;
  filterSeverity: 'all' | 'error' | 'warning';
  selectedDiagnostic: ValidationDiagnostic | null;
  explanation: ErrorExplanationResponse | null;
  isExplaining: boolean;
  explanationError: string | null;
  errorMessage: string | null;

  setSelectedTarget: (target: 'current_project' | 'proposal', proposalId?: string | null) => void;
  setFilterSeverity: (filter: 'all' | 'error' | 'warning') => void;
  setSelectedDiagnostic: (diagnostic: ValidationDiagnostic | null) => void;
  clearExplanation: () => void;
  clearRun: () => void;

  runValidation: (params: {
    projectId: string;
    target?: 'current_project' | 'proposal';
    proposalId?: string | null;
    files: Array<{ path: string; content?: string }>;
    requestedChecks?: ProjectValidationType[];
  }) => Promise<void>;

  cancelValidation: (projectId: string) => Promise<void>;

  explainError: (params: {
    projectId: string;
    diagnostic: ValidationDiagnostic;
    targetFileContent?: string;
  }) => Promise<void>;
}

export const useValidationStore = create<ValidationState>((set, get) => ({
  currentRun: null,
  isRunning: false,
  activeProjectId: null,
  selectedTarget: 'current_project',
  selectedProposalId: null,
  filterSeverity: 'all',
  selectedDiagnostic: null,
  explanation: null,
  isExplaining: false,
  explanationError: null,
  errorMessage: null,

  setSelectedTarget: (target, proposalId = null) => {
    set({ selectedTarget: target, selectedProposalId: proposalId });
  },

  setFilterSeverity: (filter) => {
    set({ filterSeverity: filter });
  },

  setSelectedDiagnostic: (diagnostic) => {
    set({ selectedDiagnostic: diagnostic, explanation: null, explanationError: null });
  },

  clearExplanation: () => {
    set({ explanation: null, explanationError: null, selectedDiagnostic: null });
  },

  clearRun: () => {
    set({ currentRun: null, errorMessage: null, selectedDiagnostic: null, explanation: null });
  },

  runValidation: async ({ projectId, target = 'current_project', proposalId = null, files, requestedChecks }) => {
    if (get().isRunning) return;

    set({ 
      isRunning: true, 
      errorMessage: null, 
      activeProjectId: projectId,
      selectedTarget: target,
      selectedProposalId: proposalId,
      explanation: null,
      selectedDiagnostic: null
    });

    try {
      await useIDEStore.getState().saveProject();
      const savedProjectId = useIDEStore.getState().projectId;
      if (!savedProjectId) throw new Error('Save this workspace before running validation.');
      const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : '';

      const response = await fetch(`/api/projects/${encodeURIComponent(savedProjectId)}/validation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          target,
          proposalId,
          files,
          requestedChecks
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: Validation request failed`);
      }

      const data = await response.json();
      set({ currentRun: data.run, isRunning: false });
      const checkOutput = data.run.checks.map((check: any) => `> ${check.name} — ${check.status}${check.exitCode !== undefined ? ` (exit ${check.exitCode ?? 'unavailable'})` : ''}\n${check.output || check.unsupportedReason || check.message || ''}`).join('\n\n');
      const incomplete = data.run.checks.some((check: any) => check.status === 'failed' || check.status === 'unsupported');
      useIDEStore.getState().setExecutionResult(checkOutput, incomplete ? data.run.summary : null, data.run.durationMs ?? null);
    } catch (err: any) {
      set({ 
        isRunning: false, 
        errorMessage: err.message || 'Validation pipeline encountered an error' 
      });
    }
  },

  cancelValidation: async (projectId: string) => {
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : '';
      await fetch(`/api/projects/${projectId}/validation/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      set({ isRunning: false });
    } catch (e) {
      set({ isRunning: false });
    }
  },

  explainError: async ({ projectId, diagnostic, targetFileContent }) => {
    set({ isExplaining: true, explanationError: null, explanation: null, selectedDiagnostic: diagnostic });

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : '';

      const response = await fetch(`/api/projects/${projectId}/validation/explain`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          diagnostic,
          targetFileContent
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}: Failed to explain diagnostic`);
      }

      const data = await response.json();
      set({ explanation: data, isExplaining: false });
    } catch (err: any) {
      set({ isExplaining: false, explanationError: err.message || 'Could not explain error' });
    }
  }
}));
