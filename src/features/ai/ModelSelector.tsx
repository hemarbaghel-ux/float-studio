import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAIStore } from '../../store/aiStore';
import { ChevronDown } from 'lucide-react';
import { INITIAL_MODELS } from './registry';
import { AIModel } from '../../types/ai';
import { Portal } from '../../components/Portal';
import { ModelSearch } from './modelSelector/ModelSearch';
import { ModelList } from './modelSelector/ModelList';
import { ModelInfoCard, CardPosition, getCleanModelName } from './modelSelector/ModelInfoCard';

export { ModelInfoCard } from './modelSelector/ModelInfoCard';

export interface ModelSelectorProps {
  activeModelId?: string;
  onModelChange: (modelId: string) => void;
  agentId?: string;
  placement?: 'top' | 'bottom' | 'auto';
  variant?: 'compact' | 'composer' | 'full';
  className?: string;
}

interface DropdownPosition {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
  openUpwards: boolean;
}

export function ModelSelector({
  activeModelId,
  onModelChange,
  agentId,
  placement = 'auto',
  variant = 'composer',
  className = ''
}: ModelSelectorProps) {
  const { models, setModels, syncProviderStatus, setSelectedModel } = useAIStore();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  // Hover card state
  const [hoveredModel, setHoveredModel] = useState<AIModel | null>(null);
  const [isCardPinned, setIsCardPinned] = useState(false);

  // Viewport-calculated coordinates
  const [dropdownCoords, setDropdownCoords] = useState<DropdownPosition | null>(null);
  const [cardCoords, setCardCoords] = useState<CardPosition | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const hoverDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPointerInCardRef = useRef<boolean>(false);
  const isPointerInDropdownRef = useRef<boolean>(false);

  // Sync server provider status on mount
  useEffect(() => {
    syncProviderStatus();
  }, [syncProviderStatus]);

  useEffect(() => {
    if (models.length === 0) {
      setModels(INITIAL_MODELS);
    }
  }, [models, setModels]);

  const activeModels = models.length > 0 ? models : INITIAL_MODELS;
  const currentSelectedId = activeModelId || useAIStore.getState().selectedModel;
  const currentModel = activeModels.find(m => m.id === currentSelectedId) || activeModels[0];

  // Helper to map model to display speed/effort label
  const getSpeedLabel = (model: AIModel): string => {
    if (model.reasoningLevel) {
      return model.reasoningLevel;
    }
    if (model.id === 'auto') return 'High Fast';
    if (model.id === 'gemini-2.0-flash') return 'High Fast';
    if (model.id === 'gemini-1.5-flash') return 'Fast';
    if (model.id === 'gemini-1.5-pro') return 'Medium';
    if (model.id === 'claude-3-7-sonnet-20250219') return 'High';
    if (model.id === 'claude-3-5-sonnet-20241022') return 'High';
    if (model.id === 'claude-3-5-haiku-20241022') return 'Fast';
    if (model.id === 'gpt-4o') return 'Medium';
    if (model.id === 'gpt-4o-mini') return 'Fast';
    if (model.id === 'o1') return 'High';
    if (model.id === 'o3-mini') return 'High Fast';
    if (model.id === 'grok-2-1212') return 'High Fast';

    switch (model.speed) {
      case 'fast': return 'Fast';
      case 'balanced': return 'Medium';
      case 'slow': return 'High';
      default: return 'Fast';
    }
  };

  // Filter models based on search term
  const filteredModels = useMemo(() => {
    if (!searchTerm.trim()) return activeModels;
    const s = searchTerm.toLowerCase();
    return activeModels.filter(m => {
      const name = (m.displayName || '').toLowerCase();
      const shortName = (m.shortName || '').toLowerCase();
      const provider = (m.provider || m.providerId || '').toLowerCase();
      const speed = getSpeedLabel(m).toLowerCase();
      const id = m.id.toLowerCase();
      return (
        name.includes(s) ||
        shortName.includes(s) ||
        provider.includes(s) ||
        speed.includes(s) ||
        id.includes(s)
      );
    });
  }, [activeModels, searchTerm]);

  // Compute dropdown positioning relative to trigger button
  const updateDropdownCoords = () => {
    if (!containerRef.current) return;
    const triggerRect = containerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const DROPDOWN_WIDTH = 250;
    const MARGIN = 12;
    const MIN_DROPDOWN_HEIGHT = 180;
    const IDEAL_MAX_DROPDOWN_HEIGHT = 380;

    const spaceBelow = viewportHeight - triggerRect.bottom - MARGIN;
    const spaceAbove = triggerRect.top - MARGIN;

    let openUpwards = false;
    if (placement === 'top') {
      openUpwards = true;
      if (spaceAbove < MIN_DROPDOWN_HEIGHT && spaceBelow > spaceAbove) {
        openUpwards = false;
      }
    } else if (placement === 'bottom') {
      openUpwards = false;
      if (spaceBelow < 260 && spaceAbove > spaceBelow + 40) {
        openUpwards = true;
      }
    } else {
      if (spaceBelow >= 280) {
        openUpwards = false;
      } else if (spaceAbove > spaceBelow) {
        openUpwards = true;
      } else {
        openUpwards = false;
      }
    }

    const maxHeight = openUpwards
      ? Math.min(IDEAL_MAX_DROPDOWN_HEIGHT, Math.max(MIN_DROPDOWN_HEIGHT, spaceAbove - 8))
      : Math.min(IDEAL_MAX_DROPDOWN_HEIGHT, Math.max(MIN_DROPDOWN_HEIGHT, spaceBelow - 8));

    let left = triggerRect.left;
    if (left + DROPDOWN_WIDTH > viewportWidth - MARGIN) {
      left = Math.max(MARGIN, viewportWidth - MARGIN - DROPDOWN_WIDTH);
    }
    left = Math.max(MARGIN, left);

    if (openUpwards) {
      setDropdownCoords({
        left,
        bottom: viewportHeight - triggerRect.top + 6,
        maxHeight,
        openUpwards: true
      });
    } else {
      setDropdownCoords({
        left,
        top: triggerRect.bottom + 6,
        maxHeight,
        openUpwards: false
      });
    }
  };

  // Compute hover information card positioning
  // Positioning order per Section 7: RIGHT -> LEFT -> BELOW, never clipped outside viewport
  const updateCardCoords = () => {
    if (!dropdownRef.current) return;
    const dropdownRect = dropdownRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const CARD_WIDTH = 320;
    const GAP = 8;
    const MARGIN = 12;

    const spaceOnRight = viewportWidth - (dropdownRect.right + GAP + MARGIN);
    const spaceOnLeft = dropdownRect.left - GAP - MARGIN;

    let cardPlacement: 'right' | 'left' | 'below' | 'stacked' = 'right';
    let cardLeft = dropdownRect.right + GAP;
    let cardTop: number | undefined = undefined;
    let cardBottom: number | undefined = undefined;

    // 1. Try RIGHT of dropdown
    if (spaceOnRight >= CARD_WIDTH) {
      cardPlacement = 'right';
      cardLeft = dropdownRect.right + GAP;
    } 
    // 2. Try LEFT of dropdown
    else if (spaceOnLeft >= CARD_WIDTH) {
      cardPlacement = 'left';
      cardLeft = dropdownRect.left - GAP - CARD_WIDTH;
    } 
    // 3. Fallback BELOW / STACKED
    else {
      cardPlacement = 'below';
      cardLeft = Math.max(MARGIN, Math.min(viewportWidth - MARGIN - CARD_WIDTH, dropdownRect.left));
    }

    if (cardPlacement === 'below') {
      const spaceBelow = viewportHeight - (dropdownRect.bottom + GAP + MARGIN);
      if (spaceBelow >= 200) {
        cardTop = dropdownRect.bottom + GAP;
      } else {
        // Stack or clamp near bottom
        cardBottom = MARGIN;
      }
      const maxHeight = Math.min(460, Math.max(180, viewportHeight - (cardTop || dropdownRect.bottom) - MARGIN));
      setCardCoords({
        left: cardLeft,
        top: cardTop,
        bottom: cardBottom,
        maxHeight,
        placement: 'below'
      });
    } else {
      // Horizontal placement (right or left)
      const isLowerHalf = dropdownRect.top >= viewportHeight / 2;
      if (isLowerHalf) {
        cardBottom = viewportHeight - dropdownRect.bottom;
        const maxHeight = Math.min(480, Math.max(200, dropdownRect.bottom - MARGIN));
        setCardCoords({
          left: cardLeft,
          bottom: cardBottom,
          maxHeight,
          placement: cardPlacement
        });
      } else {
        cardTop = dropdownRect.top;
        const maxHeight = Math.min(480, Math.max(200, viewportHeight - cardTop - MARGIN));
        setCardCoords({
          left: cardLeft,
          top: cardTop,
          maxHeight,
          placement: cardPlacement
        });
      }
    }
  };

  // Sync coords on open
  useEffect(() => {
    if (isOpen) {
      updateDropdownCoords();
      const handleReposition = () => {
        updateDropdownCoords();
        updateCardCoords();
      };

      window.addEventListener('resize', handleReposition);
      window.addEventListener('scroll', handleReposition, true);

      const idx = filteredModels.findIndex(m => m.id === currentModel.id);
      const targetIdx = idx >= 0 ? idx : 0;
      setHighlightedIndex(targetIdx);
      setHoveredModel(filteredModels[targetIdx] || currentModel);
      setIsCardPinned(false);

      setTimeout(() => {
        searchInputRef.current?.focus();
        updateCardCoords();
      }, 40);

      return () => {
        window.removeEventListener('resize', handleReposition);
        window.removeEventListener('scroll', handleReposition, true);
      };
    } else {
      setSearchTerm('');
      setHoveredModel(null);
      setIsCardPinned(false);
      setDropdownCoords(null);
      setCardCoords(null);
      if (hoverDelayTimerRef.current) {
        clearTimeout(hoverDelayTimerRef.current);
      }
    }
  }, [isOpen, placement]);

  // Re-calculate card coordinates when hovered model changes or dropdown coordinates update
  useEffect(() => {
    if (isOpen && hoveredModel) {
      requestAnimationFrame(() => {
        updateCardCoords();
      });
    }
  }, [hoveredModel, isOpen, dropdownCoords]);

  // Update hovered model when navigating via keyboard
  useEffect(() => {
    if (isOpen && filteredModels[highlightedIndex]) {
      setHoveredModel(filteredModels[highlightedIndex]);
    }
  }, [highlightedIndex, isOpen, filteredModels]);

  // Handle outside clicks
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target) ||
        cardRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const handleSelectModel = (modelId: string) => {
    onModelChange(modelId);
    setSelectedModel(modelId);
    setIsOpen(false);
  };

  // Hover transitions between list items and information card
  // Section 2: mouseenter -> small delay around 100-200ms -> show card
  const handleHoverModel = (model: AIModel, idx: number) => {
    setHighlightedIndex(idx);
    if (hoverDelayTimerRef.current) {
      clearTimeout(hoverDelayTimerRef.current);
    }
    hoverDelayTimerRef.current = setTimeout(() => {
      setHoveredModel(model);
    }, 120);
  };

  const handleLeaveItem = () => {
    if (isCardPinned || isPointerInCardRef.current) return;
    if (hoverDelayTimerRef.current) {
      clearTimeout(hoverDelayTimerRef.current);
    }
  };

  const handleMouseEnterCard = () => {
    isPointerInCardRef.current = true;
    if (hoverDelayTimerRef.current) {
      clearTimeout(hoverDelayTimerRef.current);
    }
  };

  const handleMouseLeaveCard = () => {
    isPointerInCardRef.current = false;
    if (isCardPinned) return;
    if (!isPointerInDropdownRef.current) {
      // Short delay before closing card if pointer leaves both
      hoverDelayTimerRef.current = setTimeout(() => {
        if (!isPointerInCardRef.current && !isPointerInDropdownRef.current && !isCardPinned) {
          if (filteredModels[highlightedIndex]) {
            setHoveredModel(filteredModels[highlightedIndex]);
          }
        }
      }, 150);
    }
  };

  // Keyboard navigation per Section 10
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => {
        const next = prev < filteredModels.length - 1 ? prev + 1 : 0;
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => {
        const next = prev > 0 ? prev - 1 : filteredModels.length - 1;
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const modelToSelect = filteredModels[highlightedIndex];
      if (modelToSelect) {
        handleSelectModel(modelToSelect.id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef} onKeyDown={handleKeyDown}>
      {/* TRIGGER BUTTON */}
      {variant === 'composer' ? (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          title={`Active Model: ${currentModel.displayName}`}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[13px] font-medium text-slate-700 hover:text-slate-900 dark:text-[#C9D1D9] dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-white/5 transition-colors cursor-pointer select-none group font-sans"
        >
          <span className="text-slate-800 dark:text-white font-medium">
            {getCleanModelName(currentModel.displayName, currentModel.shortName)}
          </span>

          <span className="text-[12px] text-slate-400 dark:text-[#7D8590] font-normal">
            {getSpeedLabel(currentModel)}
          </span>

          <ChevronDown
            size={13}
            className={`text-slate-400 dark:text-[#7D8590] ml-0.5 group-hover:text-slate-600 dark:group-hover:text-[#C9D1D9] transition-transform duration-150 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#2A2A2A] hover:border-slate-300 dark:hover:border-white/20 rounded-md text-xs text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-[#1C1C1C] transition-colors w-full cursor-pointer select-none font-sans"
        >
          <div className="flex items-center gap-1.5 truncate">
            <span className="truncate text-slate-900 dark:text-white font-medium">
              {getCleanModelName(currentModel.displayName, currentModel.shortName)}
            </span>
            <span className="text-[11px] text-slate-400 dark:text-[#7D8590]">
              {getSpeedLabel(currentModel)}
            </span>
          </div>
          <ChevronDown
            size={13}
            className={`text-slate-400 dark:text-[#7D8590] shrink-0 transition-transform duration-150 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
      )}

      {/* 1. PORTAL-RENDERED DROPDOWN (.model-selector-dropdown) */}
      {isOpen && dropdownCoords && (
        <Portal>
          <div
            ref={dropdownRef}
            className="model-selector-dropdown fixed z-[9999] w-[250px] bg-white dark:bg-[#181818] border border-slate-200/90 dark:border-[#2C2C2C] rounded-[14px] shadow-xl shadow-black/10 dark:shadow-2xl dark:shadow-black/75 overflow-hidden flex flex-col animate-in fade-in duration-100 select-none font-sans"
            style={{
              left: `${dropdownCoords.left}px`,
              top: dropdownCoords.top !== undefined ? `${dropdownCoords.top}px` : undefined,
              bottom: dropdownCoords.bottom !== undefined ? `${dropdownCoords.bottom}px` : undefined,
              maxHeight: `${dropdownCoords.maxHeight}px`
            }}
            onMouseEnter={() => {
              isPointerInDropdownRef.current = true;
            }}
            onMouseLeave={() => {
              isPointerInDropdownRef.current = false;
            }}
          >
            {/* Pinned Search Input Component */}
            <ModelSearch
              value={searchTerm}
              onChange={(val) => {
                setSearchTerm(val);
                setHighlightedIndex(0);
              }}
              inputRef={searchInputRef}
            />

            {/* Scrollable Model List Component */}
            <ModelList
              models={filteredModels}
              selectedId={currentSelectedId}
              highlightedIndex={highlightedIndex}
              onSelectModel={handleSelectModel}
              onHoverModel={handleHoverModel}
              onLeaveItem={handleLeaveItem}
              listRef={listRef}
              getSpeedLabel={getSpeedLabel}
              onInfoClick={(model) => {
                setHoveredModel(model);
                setIsCardPinned(true);
              }}
            />
          </div>
        </Portal>
      )}

      {/* 2. REUSABLE MODEL INFORMATION CARD (.model-information-card) */}
      {isOpen && hoveredModel && cardCoords && (
        <Portal>
          <ModelInfoCard
            model={hoveredModel}
            coords={cardCoords}
            onMouseEnter={handleMouseEnterCard}
            onMouseLeave={handleMouseLeaveCard}
            isPinned={isCardPinned}
            onClose={() => setIsCardPinned(false)}
            cardRef={cardRef}
          />
        </Portal>
      )}
    </div>
  );
}
