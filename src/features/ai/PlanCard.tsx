import React, { useState } from 'react';
import { Plan, PlanStep } from '../../types/plan';
import {
  CheckCircle2, Circle, Clock, AlertCircle, Play, X,
  Edit2, Check, RotateCcw, ChevronDown, ChevronRight,
  Shield, FileCode, Wrench, Sparkles, Loader2
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface PlanCardProps {
  plan: Plan;
  onApprove: (planId: string) => void;
  onCancel: (planId: string) => void;
  onRegenerate: (plan: Plan) => void;
  onUpdatePlan: (planId: string, updates: Partial<Plan>) => void;
  isExecuting?: boolean;
}

export function PlanCard({
  plan,
  onApprove,
  onCancel,
  onRegenerate,
  onUpdatePlan,
  isExecuting = false
}: PlanCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(plan.title);
  const [editedSummary, setEditedSummary] = useState(plan.summary);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  const handleSaveEdit = () => {
    onUpdatePlan(plan.id, {
      title: editedTitle.trim() || plan.title,
      summary: editedSummary.trim() || plan.summary
    });
    setIsEditing(false);
  };

  const getStatusBadge = () => {
    switch (plan.status) {
      case 'awaiting_approval':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <Clock size={11} /> Awaiting Approval
          </span>
        );
      case 'approved':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 flex items-center gap-1">
            <Check size={11} /> Approved
          </span>
        );
      case 'executing':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 flex items-center gap-1 animate-pulse">
            <Loader2 size={11} className="animate-spin" /> Executing
          </span>
        );
      case 'completed':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-[#7EE787] border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 size={11} /> Completed
          </span>
        );
      case 'failed':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 flex items-center gap-1">
            <AlertCircle size={11} /> Failed
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-500/15 text-slate-500 dark:text-slate-400 border border-slate-500/30 flex items-center gap-1">
            <X size={11} /> Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  const getStepIcon = (step: PlanStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />;
      case 'executing':
        return <Loader2 size={14} className="text-purple-500 animate-spin shrink-0 mt-0.5" />;
      case 'failed':
        return <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />;
      case 'cancelled':
      case 'skipped':
        return <X size={14} className="text-slate-400 shrink-0 mt-0.5" />;
      case 'pending':
      default:
        return <Circle size={14} className="text-slate-300 dark:text-slate-600 shrink-0 mt-0.5" />;
    }
  };

  return (
    <div className="w-full bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#2A2A2A] rounded-xl shadow-xs overflow-hidden mt-3 text-xs">
      {/* Header */}
      <div className="px-3.5 py-2.5 bg-slate-50/70 dark:bg-[#161616] border-b border-slate-200 dark:border-[#222] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={14} className="text-purple-600 dark:text-purple-400 shrink-0" />
          {isEditing ? (
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              className="bg-white dark:bg-[#202020] border border-slate-300 dark:border-[#444] px-2 py-0.5 rounded text-xs text-slate-900 dark:text-white font-semibold outline-none w-full"
            />
          ) : (
            <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">{plan.title}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {getStatusBadge()}
          {plan.status === 'awaiting_approval' && !isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded transition-colors"
              title="Edit Plan"
            >
              <Edit2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Summary / Description */}
      <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-[#1E1E1E] text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
        {isEditing ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={editedSummary}
              onChange={(e) => setEditedSummary(e.target.value)}
              rows={2}
              className="w-full bg-white dark:bg-[#202020] border border-slate-300 dark:border-[#444] p-2 rounded text-xs text-slate-900 dark:text-white outline-none resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-2.5 py-1 text-[11px] rounded text-slate-500 hover:text-slate-800 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-2.5 py-1 text-[11px] rounded bg-purple-600 text-white hover:bg-purple-700 font-medium"
              >
                Save Edits
              </button>
            </div>
          </div>
        ) : (
          <p>{plan.summary}</p>
        )}
      </div>

      {/* Steps List */}
      <div className="divide-y divide-slate-100 dark:divide-[#1A1A1A]">
        {plan.steps.map((step) => {
          const isExpanded = expandedSteps[step.id];
          return (
            <div key={step.id} className="p-3 hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
              <div 
                className="flex items-start justify-between gap-2 cursor-pointer select-none"
                onClick={() => toggleStep(step.id)}
              >
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  {getStepIcon(step)}
                  <div className="flex flex-col min-w-0">
                    <span className={cn(
                      "font-medium",
                      step.status === 'completed' ? "text-slate-500 dark:text-slate-400 line-through" :
                      step.status === 'executing' ? "text-purple-600 dark:text-purple-400 font-semibold" :
                      "text-slate-800 dark:text-slate-200"
                    )}>
                      {step.order}. {step.objective}
                    </span>
                    {step.files && step.files.length > 0 && (
                      <span className="text-[11px] font-mono text-slate-400 dark:text-[#7D8590] truncate mt-0.5">
                        {step.files.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-slate-400 mt-1 shrink-0">
                  {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </div>
              </div>

              {/* Step Expanded Details */}
              {isExpanded && (
                <div className="mt-2.5 ml-6 pl-2.5 border-l-2 border-slate-200 dark:border-[#2A2A2A] flex flex-col gap-1.5 text-[11px] text-slate-500 dark:text-[#888]">
                  {step.tools && step.tools.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Wrench size={11} className="text-amber-500 shrink-0" />
                      <span>Tools: <strong className="font-mono text-slate-700 dark:text-slate-300">{step.tools.join(', ')}</strong></span>
                    </div>
                  )}
                  {step.validation && (
                    <div className="flex items-center gap-1.5">
                      <Shield size={11} className="text-blue-500 shrink-0" />
                      <span>Expected Validation: <span className="text-slate-700 dark:text-slate-300">{step.validation}</span></span>
                    </div>
                  )}
                  {step.result && (
                    <div className="mt-1 p-2 rounded bg-slate-100 dark:bg-[#1A1A1A] text-slate-700 dark:text-slate-300 font-mono text-[10px]">
                      {step.result}
                    </div>
                  )}
                  {step.error && (
                    <div className="mt-1 p-2 rounded bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-[10px]">
                      {step.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Plan Actions Toolbar */}
      {plan.status === 'awaiting_approval' && (
        <div className="p-3 bg-slate-50 dark:bg-[#141414] border-t border-slate-200 dark:border-[#202020] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onRegenerate(plan)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#333] hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 font-medium transition-colors flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw size={11} />
              <span>Regenerate</span>
            </button>
            <button
              type="button"
              onClick={() => onCancel(plan.id)}
              className="px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <X size={11} />
              <span>Cancel</span>
            </button>
          </div>
          <button
            type="button"
            disabled={isExecuting}
            onClick={() => onApprove(plan.id)}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isExecuting ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                <span>Starting...</span>
              </>
            ) : (
              <>
                <Play size={12} fill="currentColor" />
                <span>Approve & Execute</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* In-execution cancel button */}
      {plan.status === 'executing' && (
        <div className="p-2.5 bg-purple-50/50 dark:bg-purple-950/10 border-t border-purple-200 dark:border-purple-900/30 flex items-center justify-between text-[11px]">
          <span className="text-purple-700 dark:text-purple-300 font-medium">Executing approved plan steps sequentially...</span>
          <button
            type="button"
            onClick={() => onCancel(plan.id)}
            className="px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white font-medium flex items-center gap-1 cursor-pointer"
          >
            <X size={11} />
            <span>Stop Execution</span>
          </button>
        </div>
      )}
    </div>
  );
}
