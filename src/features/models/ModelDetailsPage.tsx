import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { INITIAL_MODELS } from '../ai/registry';
import { ModelDetails } from './ModelDetails';
import { useAIStore } from '../../store/aiStore';

export function ModelDetailsPage({ providerId, modelId }: { providerId: string, modelId: string }) {
  const { setSelectedModel, models } = useAIStore();
  const activeModels = models.length > 0 ? models : INITIAL_MODELS;

  const model = activeModels.find(
    m => (m.id === modelId || m.exactModelId === modelId) && 
         (m.providerId.toLowerCase() === providerId.toLowerCase() || providerId === 'any')
  ) || activeModels.find(m => m.id === modelId);

  if (!model) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#090D13] text-[#C9D1D9]">
        <div className="text-center p-8 bg-[#12161F] border border-[#21262D] rounded-2xl max-w-md">
          <h2 className="text-xl font-bold mb-2 text-white">Model not found</h2>
          <p className="text-xs text-[#8B949E] mb-6">
            The requested model "{modelId}" is not part of the source-verified model catalog.
          </p>
          <a 
            href="/models" 
            className="px-4 py-2 bg-[#7C3AED] text-white rounded-lg text-xs font-semibold hover:bg-[#6D28D9] transition-colors"
          >
            Return to Model Intelligence
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090D13] text-[#C9D1D9] font-sans flex flex-col p-6 sm:p-10">
      <ModelDetails
        model={model}
        onBack={() => {
          window.history.pushState({}, '', '/models');
          window.dispatchEvent(new PopStateEvent('popstate'));
        }}
        onSelect={() => {
          setSelectedModel(model.id);
          window.history.pushState({}, '', '/');
          window.dispatchEvent(new PopStateEvent('popstate'));
        }}
      />
    </div>
  );
}
