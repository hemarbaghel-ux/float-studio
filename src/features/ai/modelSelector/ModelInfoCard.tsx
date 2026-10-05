import React from 'react';
import { AIModel } from '../../../types/ai';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';

export interface CardPosition {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
  placement: 'right' | 'left' | 'below' | 'stacked';
}

export interface ModelInfoCardProps {
  model: AIModel | null;
  coords: CardPosition | null;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  isPinned?: boolean;
  onClose?: () => void;
  cardRef?: React.RefObject<HTMLDivElement | null>;
}

export function formatContextWindow(tokens?: number | string): string {
  if (!tokens) return 'Information unavailable';
  if (typeof tokens === 'string') {
    if (tokens.toLowerCase().includes('context')) return tokens;
    return `${tokens} context window`;
  }
  if (tokens >= 1000000) {
    const isBinaryMega = tokens >= 1048576 && tokens % 1048576 === 0;
    const m = Math.round(tokens / (isBinaryMega ? 1048576 : 1000000));
    return `${m}M context window`;
  }
  if (tokens >= 1000) {
    const isBinaryKilo = tokens % 1024 === 0 && (tokens === 131072 || tokens === 262144 || tokens === 65536 || tokens === 32768);
    const k = isBinaryKilo ? Math.round(tokens / 1024) : Math.round(tokens / 1000);
    return `${k}k context window`;
  }
  return `${tokens} tokens context window`;
}

export function getModelCapabilitiesList(model: AIModel): string[] {
  if (model.capabilitiesList && Array.isArray(model.capabilitiesList) && model.capabilitiesList.length > 0) {
    return model.capabilitiesList;
  }
  if (Array.isArray(model.capabilities)) {
    return model.capabilities;
  }
  const list: string[] = [];
  if (model.capabilities?.coding) list.push('Coding');
  if (model.capabilities?.reasoning || model.supportsReasoning) list.push('Reasoning');
  if (model.capabilities?.tools || model.supportsTools) list.push('Tool use');
  if (model.capabilities?.vision || model.supportsVision) list.push('Vision');
  if (model.capabilities?.longContext) list.push('Long context');
  if (model.capabilities?.structuredOutput) list.push('Structured output');
  return list;
}

export function getCleanModelName(displayName: string, shortName?: string): string {
  if (shortName) return shortName;
  return displayName
    .replace(' (FLOAT Dynamic Router)', '')
    .replace('OpenAI ', '')
    .replace('Google ', '')
    .replace('Anthropic ', '')
    .trim();
}

export function getModelProviderName(model: AIModel): string {
  if (model.id === 'float-basic') return 'FLOAT';
  if (model.provider) return model.provider;
  switch (model.providerId?.toLowerCase()) {
    case 'google': return 'Google';
    case 'openai': return 'OpenAI';
    case 'anthropic': return 'Anthropic';
    case 'xai': return 'xAI';
    case 'auto': return 'FLOAT';
    default: return model.providerId || 'FLOAT';
  }
}

export function getVersionOrEffort(model: AIModel): string {
  if (model.id === 'float-basic') {
    return 'Free · Basic coding assistance';
  }
  if (model.version) {
    return `Version: ${model.version}`;
  }
  if (model.reasoningLevel) {
    return `Version: ${model.reasoningLevel.toLowerCase()} effort`;
  }
  if (model.snapshotVersion) {
    return `Version: ${model.snapshotVersion}`;
  }
  return 'Information unavailable';
}

export function getAvailabilityDisplay(model: AIModel): { label: string; color: 'green' | 'amber' | 'slate' } {
  if (model.availability) {
    const a = model.availability.toLowerCase();
    if (a.includes('avail') || a === 'ready') {
      return { label: model.availability, color: 'green' };
    }
    if (a.includes('config') || a.includes('setup')) {
      return { label: model.availability, color: 'amber' };
    }
    return { label: model.availability, color: 'slate' };
  }

  if (model.status === 'AVAILABLE') {
    return { label: 'Available', color: 'green' };
  }
  if (model.status === 'CONFIG_REQUIRED' || model.status === 'PROVIDER_SUPPORTED_NOT_CONFIGURED') {
    return { label: 'Not configured', color: 'amber' };
  }
  if (model.status === 'UNAVAILABLE' || model.status === 'DISABLED') {
    return { label: 'Unavailable', color: 'slate' };
  }
  return { label: 'Available', color: 'green' };
}

export const ModelInfoCard: React.FC<ModelInfoCardProps> = ({
  model,
  coords,
  onMouseEnter,
  onMouseLeave,
  isPinned = false,
  onClose,
  cardRef
}) => {
  if (!model || !coords) return null;

  const modelShortName = model.shortName || getCleanModelName(model.displayName);
  const providerName = getModelProviderName(model);
  const contextWindowText = formatContextWindow(model.contextWindow);
  const versionText = getVersionOrEffort(model);
  const capabilities = getModelCapabilitiesList(model);
  const availability = getAvailabilityDisplay(model);
  const apiId = model.apiModelId || model.exactModelId || model.id;

  return (
    <div
      ref={cardRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="model-information-card fixed z-[99999] w-[320px] bg-white dark:bg-[#181818] border border-slate-200/90 dark:border-[#2C2C2C] rounded-[14px] shadow-xl shadow-black/10 dark:shadow-2xl dark:shadow-black/75 p-4 flex flex-col shrink-0 animate-in fade-in duration-150 text-left select-text overflow-y-auto scrollbar-thin font-sans"
      style={{
        left: `${coords.left}px`,
        top: coords.top !== undefined ? `${coords.top}px` : undefined,
        bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
        maxHeight: `${coords.maxHeight}px`
      }}
      role="region"
      aria-label={`Model details for ${modelShortName}`}
    >
      {/* 1. Header: Short Model Name + optional Close Button */}
      <div className="flex items-start justify-between gap-2 shrink-0">
        <div>
          <h4 className="text-[14px] font-semibold text-slate-900 dark:text-white leading-tight tracking-tight">
            {modelShortName}
          </h4>
          <div className="flex items-center gap-1.5 mt-0.5">
            {(model.tier === 'Free' || model.id === 'float-basic') && (
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded leading-none">
                Free Tier
              </span>
            )}
            <span className="text-[11px] text-slate-500 dark:text-[#8B949E]">
              Provider: {providerName}
            </span>
          </div>
        </div>

        {isPinned && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* 2. Model Description */}
      <p className="text-[12px] text-slate-600 dark:text-[#A1A1AA] leading-relaxed mt-2.5 shrink-0">
        {model.description || 'Verified model integrated into FLOAT workspace.'}
      </p>

      {/* 3. Context Window */}
      <div className="text-[12px] font-medium text-slate-800 dark:text-[#E6EDF3] mt-3 shrink-0">
        {contextWindowText}
      </div>

      {/* 4. Version / Reasoning Effort (Italic matching design specification) */}
      <div className="italic text-[11px] text-slate-500 dark:text-[#8B949E] mt-1 shrink-0">
        {versionText}
      </div>

      {/* 5. Verified Supported Capabilities */}
      {capabilities.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/5 flex flex-wrap gap-1.5 shrink-0">
          {capabilities.map((cap) => (
            <span
              key={cap}
              className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-[#C9D1D9]"
            >
              {cap}
            </span>
          ))}
        </div>
      )}

      {/* 6. Footer: Status Badge and Verified API Model ID */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[11px] text-slate-400 dark:text-[#7D8590] shrink-0">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              availability.color === 'green'
                ? 'bg-emerald-500'
                : availability.color === 'amber'
                ? 'bg-amber-500'
                : 'bg-slate-400'
            }`}
          />
          <span className="text-[11px] font-medium text-slate-600 dark:text-[#8B949E]">
            {availability.label}
          </span>
        </div>

        <span
          className="font-mono text-[10px] text-slate-400 dark:text-[#6E7681] truncate max-w-[130px]"
          title={`API Model ID: ${apiId}`}
        >
          {apiId}
        </span>
      </div>

      {availability.color === 'amber' && (
        <div className="mt-2.5 px-2 py-1.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/40 text-[11px] text-amber-700 dark:text-amber-300 shrink-0">
          Requires server-side {providerName.toUpperCase()}_API_KEY configuration to use.
        </div>
      )}
    </div>
  );
};
