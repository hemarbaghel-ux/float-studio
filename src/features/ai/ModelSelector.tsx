import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAIStore, ReasoningEffortLevel } from '../../store/aiStore';
import { 
  ChevronDown, 
  Check, 
  Info, 
  X, 
  Search, 
  Star, 
  Sparkles, 
  Zap, 
  Brain, 
  Code2, 
  Clock, 
  ShieldCheck, 
  Key, 
  AlertTriangle 
} from 'lucide-react';
import { INITIAL_MODELS } from './registry';
import { AIModel, ModelCategory } from '../../types/ai';
import { Portal } from '../../components/Portal';

interface ModelSelectorProps {
  activeModelId?: string;
  onModelChange: (modelId: string) => void;
  agentId?: string;
  placement?: 'top' | 'bottom' | 'auto';
  variant?: 'compact' | 'composer' | 'full';
  className?: string;
}

interface DropdownCoords {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
  openUpwards: boolean;
}

interface CardCoords {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
  placement: 'right' | 'left' | 'stacked';
  bridgeLeft: number;
  bridgeTop?: number;
  bridgeBottom?: number;
  bridgeHeight: number;
}

export function ModelSelector({ 
  activeModelId, 
  onModelChange, 
  agentId,
  placement = 'auto',
  variant = 'composer',
  className = ''
}: ModelSelectorProps) {
  const { 
    models, 
    setModels, 
    syncProviderStatus, 
    selectedEffort, 
    setSelectedEffort,
    favoriteModels,
    toggleFavoriteModel,
    recentModels
  } = useAIStore();

  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  // Hover details card state
  const [hoveredModel, setHoveredModel] = useState<AIModel | null>(null);
  const [isCardPinned, setIsCardPinned] = useState(false);

  // Calculated coordinates relative to viewport and dropdown
  const [dropdownCoords, setDropdownCoords] = useState<DropdownCoords | null>(null);
  const [cardCoords, setCardCoords] = useState<CardCoords | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringCardRef = useRef<boolean>(false);

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

  // Helper to format clean display name without noisy parentheticals
  const getCleanModelName = (displayName: string) => {
    return displayName
      .replace(' (FLOAT Dynamic Router)', '')
      .replace('OpenAI ', '')
      .replace(' (Retired)', '')
      .replace(' (Preview)', '')
      .trim();
  };

  // Helper to map verified models to standard speed / reasoning effort labels
  const getSpeedLabel = (model: AIModel) => {
    if (model.id === 'auto') return 'High Fast';
    if (model.id === 'gemini-3.1-flash-lite') return 'Ultra Fast';
    if (model.id === 'gemini-3.8-flash') return 'High Fast';
    if (model.id === 'gemini-flash-latest') return 'High Fast';
    if (model.id === 'gemini-3.1-pro-preview') return 'Reasoning';
    if (model.status === 'UNAVAILABLE') return 'Retired';
    if (model.id === 'claude-3-7-sonnet-20250219') return 'Hybrid';
    if (model.id === 'claude-3-5-sonnet-20241022') return 'High';
    if (model.id === 'claude-3-5-haiku-20241022') return 'Fast';
    if (model.id === 'claude-3-opus-20240229') return 'Deep';
    if (model.id === 'gpt-4o') return 'Medium';
    if (model.id === 'gpt-4o-mini') return 'Fast';
    if (model.id === 'o1') return 'Reasoning';
    if (model.id === 'o3-mini') return 'High Fast';
    if (model.id === 'o1-mini') return 'Fast';
    if (model.id === 'gpt-4.5-preview') return 'Frontier';
    if (model.id === 'grok-2-1212') return 'High Fast';
    if (model.id === 'grok-2-vision-1212') return 'Vision';
    if (model.id === 'grok-beta') return 'Fast';
    if (model.id === 'deepseek-chat') return 'Fast';
    if (model.id === 'deepseek-reasoner') return 'Reasoning';
    
    switch (model.speed) {
      case 'fast': return 'Fast';
      case 'balanced': return 'Medium';
      case 'slow': return 'High';
      default: return 'Fast';
    }
  };

  const getProviderBadge = (providerId: string) => {
    switch (providerId.toLowerCase()) {
      case 'anthropic':
        return { label: 'Anthropic', color: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20' };
      case 'openai':
        return { label: 'OpenAI', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20' };
      case 'google':
        return { label: 'Google', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20' };
      case 'xai':
        return { label: 'xAI', color: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20' };
      case 'deepseek':
        return { label: 'DeepSeek', color: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20' };
      default:
        return { label: 'FLOAT', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20' };
    }
  };

  const formatContextWindow = (tokens?: number) => {
    if (!tokens) return 'Not available';
    if (tokens >= 1000000) {
      const m = Math.round(tokens / 1000000);
      return `${m}M context window`;
    }
    if (tokens >= 1000) {
      const k = Math.round(tokens / 1000);
      return `${k}k context window`;
    }
    return `${tokens} tokens context window`;
  };

  // Filter models based on search term, category, and provider
  const filteredModels = useMemo(() => {
    return activeModels.filter(m => {
      // 1. Search filter
      if (searchTerm.trim()) {
        const s = searchTerm.toLowerCase();
        const name = getCleanModelName(m.displayName).toLowerCase();
        const provider = m.providerId.toLowerCase();
        const speed = getSpeedLabel(m).toLowerCase();
        const id = m.id.toLowerCase();
        const match = name.includes(s) || provider.includes(s) || speed.includes(s) || id.includes(s);
        if (!match) return false;
      }

      // 2. Provider filter
      if (selectedProvider !== 'all' && m.providerId.toLowerCase() !== selectedProvider.toLowerCase()) {
        return false;
      }

      // 3. Category filter
      if (selectedCategory !== 'all') {
        if (selectedCategory === 'flagship' && m.category !== 'flagship_coding') return false;
        if (selectedCategory === 'reasoning' && m.category !== 'advanced_reasoning') return false;
        if (selectedCategory === 'fast' && m.category !== 'fast_coding') return false;
        if (selectedCategory === 'efficient' && m.category !== 'efficient') return false;
      }

      return true;
    });
  }, [activeModels, searchTerm, selectedCategory, selectedProvider]);

  // Compute dropdown positioning relative to trigger button
  const updateDropdownCoords = () => {
    if (!containerRef.current) return;
    const triggerRect = containerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const DROPDOWN_WIDTH = 300;
    const MARGIN = 12;
    const MIN_DROPDOWN_HEIGHT = 200;
    const IDEAL_MAX_DROPDOWN_HEIGHT = 440;

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
      if (spaceBelow < 280 && spaceAbove > spaceBelow + 40) {
        openUpwards = true;
      }
    } else {
      if (spaceBelow >= 300) {
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

  // Compute hover information card positioning relative to dropdown
  const updateCardCoords = () => {
    if (!dropdownRef.current) return;
    const dropdownRect = dropdownRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const CARD_WIDTH = 290;
    const GAP = 8;
    const MARGIN = 12;

    const spaceOnRight = viewportWidth - (dropdownRect.right + GAP + MARGIN);
    const spaceOnLeft = dropdownRect.left - GAP - MARGIN;

    let cardPlacement: 'right' | 'left' | 'stacked' = 'right';
    let cardLeft = dropdownRect.right + GAP;

    if (spaceOnRight >= CARD_WIDTH) {
      cardPlacement = 'right';
      cardLeft = dropdownRect.right + GAP;
    } else if (spaceOnLeft >= CARD_WIDTH) {
      cardPlacement = 'left';
      cardLeft = dropdownRect.left - GAP - CARD_WIDTH;
    } else {
      cardPlacement = 'stacked';
      cardLeft = Math.max(MARGIN, Math.min(viewportWidth - MARGIN - CARD_WIDTH, dropdownRect.left));
    }

    const isLowerHalf = dropdownRect.top >= viewportHeight / 2;
    if (isLowerHalf) {
      const bottom = viewportHeight - dropdownRect.bottom;
      const maxHeight = Math.min(480, Math.max(220, dropdownRect.bottom - MARGIN));
      setCardCoords({
        left: cardLeft,
        bottom,
        maxHeight,
        placement: cardPlacement,
        bridgeLeft: cardPlacement === 'right' ? dropdownRect.right : cardLeft + CARD_WIDTH,
        bridgeBottom: bottom,
        bridgeHeight: Math.min(dropdownRect.height, 260)
      });
    } else {
      const top = dropdownRect.top;
      const maxHeight = Math.min(480, Math.max(220, viewportHeight - top - MARGIN));
      setCardCoords({
        left: cardLeft,
        top,
        maxHeight,
        placement: cardPlacement,
        bridgeLeft: cardPlacement === 'right' ? dropdownRect.right : cardLeft + CARD_WIDTH,
        bridgeTop: top,
        bridgeHeight: Math.min(dropdownRect.height, 260)
      });
    }
  };

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
      }, 30);

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
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    }
  }, [isOpen, placement]);

  useEffect(() => {
    if (isOpen && hoveredModel) {
      requestAnimationFrame(() => {
        updateCardCoords();
      });
    }
  }, [hoveredModel, isOpen, dropdownCoords]);

  useEffect(() => {
    if (isOpen && filteredModels[highlightedIndex]) {
      setHoveredModel(filteredModels[highlightedIndex]);
    }
  }, [highlightedIndex, isOpen, filteredModels]);

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

  const handleSelectModel = (modelOrId: AIModel | string) => {
    const modelObj = typeof modelOrId === 'string'
      ? activeModels.find(m => m.id === modelOrId)
      : modelOrId;
    if (modelObj && modelObj.status === 'UNAVAILABLE') {
      return;
    }
    const id = typeof modelOrId === 'string' ? modelOrId : modelOrId.id;
    onModelChange(id);
    setIsOpen(false);
  };

  const handleMouseEnterItem = (model: AIModel, idx: number) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHighlightedIndex(idx);
    setHoveredModel(model);
  };

  const handleMouseLeaveList = () => {
    if (isCardPinned || isHoveringCardRef.current) return;
    hoverTimeoutRef.current = setTimeout(() => {
      if (!isHoveringCardRef.current && !isCardPinned) {
        if (filteredModels[highlightedIndex]) {
          setHoveredModel(filteredModels[highlightedIndex]);
        }
      }
    }, 180);
  };

  const handleMouseEnterCard = () => {
    isHoveringCardRef.current = true;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const handleMouseLeaveCard = () => {
    isHoveringCardRef.current = false;
    if (isCardPinned) return;
    hoverTimeoutRef.current = setTimeout(() => {
      if (!isHoveringCardRef.current && !isCardPinned) {
        if (filteredModels[highlightedIndex]) {
          setHoveredModel(filteredModels[highlightedIndex]);
        }
      }
    }, 180);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < filteredModels.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filteredModels.length - 1));
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

  // Inspect if currently hovered/active model supports reasoning effort settings
  const targetModelForEffort = hoveredModel || currentModel;
  const supportsEffortConfig = targetModelForEffort?.supportedEfforts && targetModelForEffort.supportedEfforts.length > 0;

  return (
    <div className={`relative ${className}`} ref={containerRef} onKeyDown={handleKeyDown}>
      {/* TRIGGER BUTTON (COMPACT CURSOR-STYLE COMPOSER BUTTON) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        title={`Model: ${currentModel.displayName} • Provider: ${currentModel.providerId}`}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[13px] font-medium text-slate-700 hover:text-slate-900 dark:text-[#C9D1D9] dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer select-none group border border-transparent hover:border-slate-300 dark:hover:border-white/15"
      >
        <span className="text-slate-900 dark:text-white font-medium flex items-center gap-1.5">
          {currentModel.id === 'auto' ? (
            <Sparkles size={13} className="text-amber-500 shrink-0" />
          ) : (
            <span className={`w-1.5 h-1.5 rounded-full ${
              currentModel.status === 'AVAILABLE' ? 'bg-emerald-500' : 'bg-amber-400'
            }`} />
          )}
          <span className="truncate max-w-[130px] sm:max-w-[170px]">
            {getCleanModelName(currentModel.displayName)}
          </span>
        </span>

        {/* Speed / Variant / Effort badge */}
        <span className="text-[11px] text-slate-400 dark:text-[#8B949E] font-normal flex items-center gap-1 shrink-0">
          <span>{getSpeedLabel(currentModel)}</span>
          {supportsEffortConfig && selectedEffort && (
            <span className="px-1 py-0.2 rounded text-[10px] bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-[#E6EDF3] font-mono capitalize">
              {selectedEffort}
            </span>
          )}
        </span>

        <ChevronDown size={13} className="text-slate-400 dark:text-[#7D8590] ml-0.5 group-hover:text-slate-600 dark:group-hover:text-[#C9D1D9] transition-transform duration-150" />
      </button>

      {/* 1. PORTAL-RENDERED CURSOR-STYLE DROPDOWN */}
      {isOpen && dropdownCoords && (
        <Portal>
          <div 
            ref={dropdownRef}
            className="model-selector-dropdown fixed z-[9999] w-[300px] bg-white dark:bg-[#161616] border border-slate-200 dark:border-[#2C2C2C] rounded-[14px] shadow-2xl shadow-black/20 dark:shadow-black/80 overflow-hidden flex flex-col animate-in fade-in duration-100"
            style={{
              left: `${dropdownCoords.left}px`,
              top: dropdownCoords.top !== undefined ? `${dropdownCoords.top}px` : undefined,
              bottom: dropdownCoords.bottom !== undefined ? `${dropdownCoords.bottom}px` : undefined,
              maxHeight: `${dropdownCoords.maxHeight}px`
            }}
            onMouseLeave={handleMouseLeaveList}
          >
            {/* PINNED SEARCH FIELD */}
            <div className="px-3 pt-2.5 pb-2 border-b border-slate-100 dark:border-white/5 shrink-0 bg-inherit flex items-center gap-2">
              <Search size={14} className="text-slate-400 dark:text-[#6E7681] shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search models..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setHighlightedIndex(0);
                }}
                className="w-full bg-transparent text-[13px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#6E7681] focus:outline-none leading-normal"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* CATEGORY & PROVIDER FILTER PILLS */}
            <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-white/5 flex flex-col gap-1.5 shrink-0 bg-slate-50/50 dark:bg-white/[0.02]">
              {/* Category selector */}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'flagship', label: 'Flagship' },
                  { id: 'reasoning', label: 'Reasoning' },
                  { id: 'fast', label: 'Fast' },
                  { id: 'efficient', label: 'Efficient' },
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      setHighlightedIndex(0);
                    }}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      selectedCategory === cat.id
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-black font-semibold'
                        : 'text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/5'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Provider selector */}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
                {[
                  { id: 'all', label: 'All Providers' },
                  { id: 'google', label: 'Google' },
                  { id: 'openai', label: 'OpenAI' },
                  { id: 'anthropic', label: 'Anthropic' },
                  { id: 'xai', label: 'xAI' },
                  { id: 'deepseek', label: 'DeepSeek' },
                ].map(prov => (
                  <button
                    key={prov.id}
                    onClick={() => {
                      setSelectedProvider(prov.id);
                      setHighlightedIndex(0);
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap transition-colors cursor-pointer border ${
                      selectedProvider === prov.id
                        ? 'border-slate-400 bg-slate-200/70 text-slate-900 dark:border-white/30 dark:bg-white/10 dark:text-white'
                        : 'border-transparent text-slate-400 dark:text-[#6E7681] hover:text-slate-700 dark:hover:text-[#C9D1D9]'
                    }`}
                  >
                    {prov.label}
                  </button>
                ))}
              </div>
            </div>

            {/* REASONING EFFORT SEGMENTED BAR (Shown when target model supports thinking/effort) */}
            {supportsEffortConfig && (
              <div className="px-3 py-1.5 bg-purple-500/5 dark:bg-purple-500/10 border-b border-purple-500/15 flex items-center justify-between text-xs shrink-0">
                <div className="flex items-center gap-1.5 text-purple-700 dark:text-purple-300 font-medium text-[11px]">
                  <Brain size={12} className="shrink-0" />
                  <span>Reasoning Effort</span>
                </div>
                <div className="flex items-center gap-1 bg-white dark:bg-[#202020] p-0.5 rounded-md border border-purple-500/20">
                  {(['low', 'medium', 'high'] as ReasoningEffortLevel[]).map(eff => (
                    <button
                      key={eff}
                      type="button"
                      onClick={() => setSelectedEffort(eff)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize transition-all cursor-pointer ${
                        selectedEffort === eff
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-500 dark:text-[#8B949E] hover:text-purple-600 dark:hover:text-purple-300'
                      }`}
                    >
                      {eff}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* SCROLLABLE MODEL LIST */}
            <div 
              ref={listRef}
              className="overflow-y-auto flex-1 p-1.5 flex flex-col gap-0.5 scrollbar-thin"
            >
              {filteredModels.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 dark:text-[#7D8590]">
                  <span>No models match current filters</span>
                </div>
              ) : (
                filteredModels.map((model, idx) => {
                  const isSelected = model.id === currentSelectedId;
                  const isHighlighted = idx === highlightedIndex;
                  const isUnavailable = model.status === 'UNAVAILABLE';
                  const cleanName = getCleanModelName(model.displayName);
                  const speedLabel = getSpeedLabel(model);
                  const provBadge = getProviderBadge(model.providerId);
                  const isFav = favoriteModels.includes(model.id);

                  return (
                    <div
                      key={model.id}
                      onMouseEnter={() => handleMouseEnterItem(model, idx)}
                      onClick={() => handleSelectModel(model)}
                      className={`group/item px-2.5 py-1.5 rounded-lg flex items-center justify-between select-none transition-colors ${
                        isUnavailable
                          ? 'opacity-50 cursor-not-allowed hover:bg-transparent'
                          : 'cursor-pointer hover:bg-slate-100/70 dark:hover:bg-white/[0.06]'
                      } ${
                        isSelected
                          ? 'bg-slate-200/60 dark:bg-white/[0.09]'
                          : isHighlighted && !isUnavailable
                          ? 'bg-slate-100/50 dark:bg-white/[0.04]'
                          : ''
                      }`}
                    >
                      {/* Left: Provider Tag + Model Name + Speed Tag */}
                      <div className="flex items-center gap-1.5 truncate min-w-0 pr-1">
                        {/* Provider Pill */}
                        <span className={`px-1 py-0.5 rounded text-[9px] font-semibold border ${provBadge.color} shrink-0`}>
                          {provBadge.label}
                        </span>

                        <span className="text-[13px] font-medium text-slate-900 dark:text-[#E6EDF3] truncate">
                          {cleanName}
                        </span>

                        <span className="text-[11px] text-slate-400 dark:text-[#7D8590] ml-1 shrink-0 font-normal">
                          {speedLabel}
                        </span>
                      </div>

                      {/* Right: Favorite star, info button, checkmark */}
                      <div className="flex items-center gap-1 shrink-0 ml-auto">
                        {isUnavailable ? (
                          <span className="text-[9px] font-semibold text-slate-400 dark:text-[#7D8590] bg-slate-200 dark:bg-white/10 px-1 py-0.5 rounded leading-none mr-0.5">
                            RETIRED
                          </span>
                        ) : model.status === 'AVAILABLE' ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" title="Configured & Ready" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1" title="API Key Required" />
                        )}

                        {/* Favorite Star Button */}
                        <button
                          type="button"
                          aria-label={isFav ? "Remove favorite" : "Pin as favorite"}
                          title={isFav ? "Unpin model" : "Pin model to favorites"}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavoriteModel(model.id);
                          }}
                          className={`p-0.5 rounded hover:text-amber-500 transition-colors cursor-pointer ${
                            isFav ? 'text-amber-400 opacity-100' : 'text-slate-300 dark:text-slate-600 opacity-0 group-hover/item:opacity-100'
                          }`}
                        >
                          <Star size={12} fill={isFav ? "currentColor" : "none"} />
                        </button>

                        {/* Touch-accessible Information Icon */}
                        <button
                          type="button"
                          aria-label={`View details for ${cleanName}`}
                          title="View model details"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHoveredModel(model);
                            setIsCardPinned(true);
                          }}
                          className="opacity-0 group-hover/item:opacity-100 focus:opacity-100 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-opacity cursor-pointer"
                        >
                          <Info size={12} />
                        </button>

                        {/* Selected Checkmark */}
                        {isSelected && (
                          <Check size={13} className="text-slate-900 dark:text-white stroke-[2.5] ml-0.5" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* FOOTER: TOTAL MODELS COUNT & HELPFUL HINT */}
            <div className="px-3 py-1.5 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between text-[11px] text-slate-400 dark:text-[#7D8590] shrink-0">
              <span>{filteredModels.length} models</span>
              <span className="font-mono text-[10px]">↑↓ navigate • ↵ select</span>
            </div>
          </div>
        </Portal>
      )}

      {/* 2. DEDICATED PORTAL WRAPPER FOR HOVER INFORMATION CARD */}
      {isOpen && hoveredModel && cardCoords && (
        <Portal>
          {/* BRIDGING HIT-ZONE */}
          <div
            className="fixed z-[99998]"
            style={{
              left: `${cardCoords.bridgeLeft}px`,
              width: '8px',
              top: cardCoords.bridgeTop !== undefined ? `${cardCoords.bridgeTop}px` : undefined,
              bottom: cardCoords.bridgeBottom !== undefined ? `${cardCoords.bridgeBottom}px` : undefined,
              height: `${cardCoords.bridgeHeight}px`
            }}
            onMouseEnter={handleMouseEnterCard}
            onMouseLeave={handleMouseLeaveCard}
          />

          {/* PROFESSIONAL HOVER INFORMATION CARD */}
          <div
            ref={cardRef}
            onMouseEnter={handleMouseEnterCard}
            onMouseLeave={handleMouseLeaveCard}
            className="model-information-card fixed z-[99999] w-[290px] bg-white dark:bg-[#161616] border border-slate-200 dark:border-[#2C2C2C] rounded-[14px] shadow-2xl shadow-black/20 dark:shadow-black/80 p-3.5 flex flex-col shrink-0 animate-in fade-in duration-100 text-left select-text overflow-y-auto scrollbar-thin"
            style={{
              left: `${cardCoords.left}px`,
              top: cardCoords.top !== undefined ? `${cardCoords.top}px` : undefined,
              bottom: cardCoords.bottom !== undefined ? `${cardCoords.bottom}px` : undefined,
              maxHeight: `${cardCoords.maxHeight}px`
            }}
          >
            {/* Header: Model Name, Speed/Mode, Provider */}
            <div className="flex items-start justify-between gap-2 shrink-0">
              <div>
                <h4 className="text-[13px] font-semibold text-slate-900 dark:text-white leading-tight flex items-center gap-1.5">
                  <span>{getCleanModelName(hoveredModel.displayName)}</span>
                  <span className="text-[11px] font-normal text-slate-400 dark:text-[#7D8590]">
                    ({getSpeedLabel(hoveredModel).toLowerCase()})
                  </span>
                </h4>
                <div className="text-[11px] text-slate-500 dark:text-[#8B949E] mt-0.5 flex items-center gap-1">
                  <span>{hoveredModel.providerId.toUpperCase()}</span>
                  <span>•</span>
                  <span>{hoveredModel.family}</span>
                </div>
              </div>

              {isCardPinned && (
                <button
                  type="button"
                  onClick={() => setIsCardPinned(false)}
                  aria-label="Close details"
                  className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Description */}
            <p className="text-[12px] text-slate-600 dark:text-[#A1A1AA] leading-relaxed mt-2.5 shrink-0">
              {hoveredModel.description || 'Verified coding model integrated into FLOAT workspace.'}
            </p>

            {/* Context Window & Token Limits */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[11px] shrink-0">
              <span className="font-medium text-slate-800 dark:text-[#E6EDF3]">
                {formatContextWindow(hoveredModel.contextWindow)}
              </span>
              {hoveredModel.limits?.maxOutputTokens && (
                <span className="text-slate-400 dark:text-[#7D8590]">
                  Max out: {hoveredModel.limits.maxOutputTokens.toLocaleString()}
                </span>
              )}
            </div>

            {/* Supported Effort Settings */}
            {hoveredModel.supportedEfforts && hoveredModel.supportedEfforts.length > 0 && (
              <div className="mt-2 text-[11px] text-purple-700 dark:text-purple-300 bg-purple-500/10 px-2 py-1 rounded-md shrink-0 flex items-center justify-between">
                <span>Reasoning Effort:</span>
                <span className="font-semibold uppercase tracking-wider text-[10px]">
                  {hoveredModel.supportedEfforts.join(' • ')}
                </span>
              </div>
            )}

            {/* Verified Capabilities Badges */}
            <div className="mt-2.5 flex flex-wrap gap-1 shrink-0">
              {hoveredModel.capabilities?.coding && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-[#C9D1D9]">
                  Coding
                </span>
              )}
              {hoveredModel.capabilities?.reasoning && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-700 dark:text-purple-300">
                  Reasoning
                </span>
              )}
              {hoveredModel.capabilities?.tools && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  Tools
                </span>
              )}
              {hoveredModel.capabilities?.vision && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-700 dark:text-blue-300">
                  Vision
                </span>
              )}
              {hoveredModel.capabilities?.streaming && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-[#C9D1D9]">
                  Streaming
                </span>
              )}
            </div>

            {/* Status and Exact API Model ID */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[10px] text-slate-400 dark:text-[#7D8590] shrink-0">
              <div className="flex items-center gap-1.5">
                <span 
                  className={`w-1.5 h-1.5 rounded-full ${
                    hoveredModel.status === 'AVAILABLE' ? 'bg-emerald-500' : 'bg-amber-400'
                  }`} 
                />
                <span>
                  {hoveredModel.status === 'AVAILABLE' ? 'Operational' : 'Configuration required'}
                </span>
              </div>
              <span className="font-mono text-[9px] text-slate-500 dark:text-[#8B949E]">
                {hoveredModel.exactModelId || hoveredModel.id}
              </span>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
