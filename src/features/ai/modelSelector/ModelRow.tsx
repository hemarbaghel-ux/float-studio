import React from 'react';
import { AIModel } from '../../../types/ai';
import { Check, Info } from 'lucide-react';
import { getCleanModelName } from './ModelInfoCard';

export interface ModelRowProps {
  model: AIModel;
  isSelected: boolean;
  isHighlighted: boolean;
  onMouseEnter: () => void;
  onMouseLeave?: () => void;
  onSelect: () => void;
  onInfoClick?: () => void;
  speedLabel: string;
}

export const ModelRow: React.FC<ModelRowProps> = ({
  model,
  isSelected,
  isHighlighted,
  onMouseEnter,
  onMouseLeave,
  onSelect,
  onInfoClick,
  speedLabel
}) => {
  const cleanName = getCleanModelName(model.displayName);
  const isNew = Boolean(model.isNew);

  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={isHighlighted ? 0 : -1}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onSelect}
      className={`group/item px-2.5 py-1.5 rounded-lg flex items-center justify-between cursor-pointer select-none transition-colors ${
        isSelected
          ? 'bg-slate-100/90 dark:bg-white/[0.08]'
          : isHighlighted
          ? 'bg-slate-50 dark:bg-white/[0.04]'
          : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'
      }`}
    >
      {/* Model Name & Reasoning/Speed/Effort label */}
      <div className="flex items-center truncate min-w-0 pr-1.5">
        <span className="text-[13px] font-normal text-slate-800 dark:text-[#E6EDF3] truncate">
          {cleanName}
        </span>
        {speedLabel && (
          <span className="text-[12px] text-slate-400 dark:text-[#7D8590] ml-1.5 font-normal shrink-0">
            {speedLabel}
          </span>
        )}
      </div>

      {/* Right controls: Optional FREE badge, Optional NEW badge, Setup badge, Touch/Info trigger, Checkmark */}
      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
        {/* Free tier badge */}
        {(model.tier === 'Free' || model.id === 'float-basic') && (
          <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded leading-none">
            FREE
          </span>
        )}

        {/* Availability / Config warning */}
        {model.status === 'CONFIG_REQUIRED' && (
          <span className="text-[9px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded leading-none">
            Setup
          </span>
        )}

        {/* NEW badge */}
        {isNew && (
          <span className="text-[9px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1 py-0.5 rounded leading-none">
            NEW
          </span>
        )}

        {/* Optional touch-accessible Information button */}
        {onInfoClick && (
          <button
            type="button"
            aria-label={`View details for ${cleanName}`}
            title="Model details"
            onClick={(e) => {
              e.stopPropagation();
              onInfoClick();
            }}
            className="opacity-0 group-hover/item:opacity-100 focus:opacity-100 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-opacity cursor-pointer"
          >
            <Info size={12} />
          </button>
        )}

        {/* Selected Checkmark */}
        {isSelected ? (
          <Check size={13} className="text-slate-600 dark:text-[#8B949E] stroke-[2.2] ml-0.5" />
        ) : (
          <span className="w-3.5" aria-hidden="true" />
        )}
      </div>
    </div>
  );
};
