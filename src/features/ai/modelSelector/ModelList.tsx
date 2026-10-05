import React from 'react';
import { AIModel } from '../../../types/ai';
import { ModelRow } from './ModelRow';

export interface ModelListProps {
  models: AIModel[];
  selectedId?: string;
  highlightedIndex: number;
  onSelectModel: (modelId: string) => void;
  onHoverModel: (model: AIModel, index: number) => void;
  onLeaveItem?: () => void;
  listRef?: React.RefObject<HTMLDivElement | null>;
  onInfoClick?: (model: AIModel) => void;
  getSpeedLabel: (model: AIModel) => string;
}

export const ModelList: React.FC<ModelListProps> = ({
  models,
  selectedId,
  highlightedIndex,
  onSelectModel,
  onHoverModel,
  onLeaveItem,
  listRef,
  onInfoClick,
  getSpeedLabel
}) => {
  if (models.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-slate-400 dark:text-[#7D8590]">
        <span>No models found</span>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Available Models"
      className="overflow-y-auto flex-1 p-1.5 flex flex-col gap-0.5 scrollbar-thin"
    >
      {models.map((model, idx) => {
        const isSelected = model.id === selectedId;
        const isHighlighted = idx === highlightedIndex;

        return (
          <ModelRow
            key={model.id}
            model={model}
            isSelected={isSelected}
            isHighlighted={isHighlighted}
            speedLabel={getSpeedLabel(model)}
            onMouseEnter={() => onHoverModel(model, idx)}
            onMouseLeave={onLeaveItem}
            onSelect={() => onSelectModel(model.id)}
            onInfoClick={onInfoClick ? () => onInfoClick(model) : undefined}
          />
        );
      })}
    </div>
  );
};
