import React, { useState, useEffect } from 'react';
import { ThumbsUp, ThumbsDown, Check, X, AlertCircle } from 'lucide-react';
import { ChatFeedbackService, FeedbackRating } from '../../services/chatFeedbackService';

interface ChatFeedbackButtonsProps {
  chatId: string;
  messageId: string;
  modelId?: string;
  content: string;
  initialRating?: FeedbackRating | null;
  onRatingChange?: (rating: FeedbackRating | null) => void;
}

const DOWNVOTE_REASONS = [
  'Inaccurate or buggy code',
  'Did not follow instructions',
  'Incomplete explanation',
  'Hallucinated file or API',
  'Formatting or syntax issue',
  'Other'
];

export function ChatFeedbackButtons({
  chatId,
  messageId,
  modelId,
  content,
  initialRating = null,
  onRatingChange
}: ChatFeedbackButtonsProps) {
  const [rating, setRating] = useState<FeedbackRating | null>(initialRating);
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [comment, setComment] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Check local storage for existing feedback
    const cached = ChatFeedbackService.getLocalFeedback(chatId, messageId);
    if (cached) {
      setRating(cached.rating);
      if (cached.reason) setSelectedReason(cached.reason);
      if (cached.comment) setComment(cached.comment);
    } else if (initialRating) {
      setRating(initialRating);
    }
  }, [chatId, messageId, initialRating]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  };

  const handleRatingClick = async (clickedRating: FeedbackRating) => {
    // If clicking same rating again, toggle off
    if (rating === clickedRating) {
      setRating(null);
      setShowReasonDialog(false);
      onRatingChange?.(null);
      await ChatFeedbackService.removeFeedback(chatId, messageId);
      showToast('Feedback removed');
      return;
    }

    setRating(clickedRating);
    onRatingChange?.(clickedRating);

    if (clickedRating === 'thumbs_up') {
      setShowReasonDialog(false);
      setIsSaving(true);
      await ChatFeedbackService.saveFeedback({
        chatId,
        messageId,
        rating: 'thumbs_up',
        modelId,
        messageSnippet: (content || '').slice(0, 300)
      });
      setIsSaving(false);
      showToast('Thanks for your feedback!');
    } else {
      // Show reason dialog for thumbs down to gather helpful diagnostics
      setShowReasonDialog(true);
      setIsSaving(true);
      await ChatFeedbackService.saveFeedback({
        chatId,
        messageId,
        rating: 'thumbs_down',
        modelId,
        messageSnippet: (content || '').slice(0, 300)
      });
      setIsSaving(false);
    }
  };

  const handleReasonSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    await ChatFeedbackService.saveFeedback({
      chatId,
      messageId,
      rating: 'thumbs_down',
      modelId,
      messageSnippet: (content || '').slice(0, 300),
      reason: selectedReason || undefined,
      comment: comment.trim() || undefined
    });
    setIsSaving(false);
    setShowReasonDialog(false);
    showToast('Feedback recorded in Firestore');
  };

  return (
    <div className="relative inline-flex items-center gap-1.5 pt-1.5">
      {/* Thumbs Up Button */}
      <button
        onClick={() => void handleRatingClick('thumbs_up')}
        title="Helpful response"
        aria-label="Thumbs up"
        aria-pressed={rating === 'thumbs_up'}
        className={`inline-flex items-center justify-center p-1.5 rounded-md text-xs transition-colors cursor-pointer border ${
          rating === 'thumbs_up'
            ? 'text-emerald-400 bg-emerald-950/40 border-emerald-500/40 shadow-xs'
            : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-200/50 dark:hover:bg-white/5'
        }`}
      >
        <ThumbsUp size={13} className={rating === 'thumbs_up' ? 'fill-emerald-400/20' : ''} />
      </button>

      {/* Thumbs Down Button */}
      <button
        onClick={() => void handleRatingClick('thumbs_down')}
        title="Poor response"
        aria-label="Thumbs down"
        aria-pressed={rating === 'thumbs_down'}
        className={`inline-flex items-center justify-center p-1.5 rounded-md text-xs transition-colors cursor-pointer border ${
          rating === 'thumbs_down'
            ? 'text-rose-400 bg-rose-950/40 border-rose-500/40 shadow-xs'
            : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-200/50 dark:hover:bg-white/5'
        }`}
      >
        <ThumbsDown size={13} className={rating === 'thumbs_down' ? 'fill-rose-400/20' : ''} />
      </button>

      {/* Micro Toast Feedback */}
      {toastMessage && (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-950/70 border border-emerald-500/30 px-2 py-0.5 rounded-full animate-fade-in">
          <Check size={11} /> {toastMessage}
        </span>
      )}

      {/* Downvote Reason Popup */}
      {showReasonDialog && (
        <div className="absolute left-0 bottom-full mb-2 z-50 w-72 sm:w-80 rounded-xl border border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#161B22] p-3.5 shadow-2xl animate-fade-in text-xs text-slate-900 dark:text-[#C9D1D9]">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[#21262D] mb-2.5">
            <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <AlertCircle size={13} className="text-rose-400" /> What went wrong?
            </span>
            <button
              onClick={() => setShowReasonDialog(false)}
              aria-label="Close dialog"
              className="text-slate-400 hover:text-white p-0.5 rounded hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
            >
              <X size={13} />
            </button>
          </div>

          <div className="space-y-1.5 mb-2.5">
            {DOWNVOTE_REASONS.map((r) => (
              <label
                key={r}
                className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition-colors text-[11px] ${
                  selectedReason === r
                    ? 'bg-purple-950/40 border border-purple-500/40 text-purple-200 font-medium'
                    : 'hover:bg-slate-50 dark:hover:bg-[#1C2128] text-slate-600 dark:text-[#8B949E]'
                }`}
              >
                <input
                  type="radio"
                  name={`reason-${messageId}`}
                  checked={selectedReason === r}
                  onChange={() => setSelectedReason(r)}
                  className="accent-purple-500"
                />
                <span>{r}</span>
              </label>
            ))}
          </div>

          <div className="mb-3">
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional notes or expected answer..."
              maxLength={1000}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0D1117] border border-slate-200 dark:border-[#30363D] text-[11px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#6E7681] focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowReasonDialog(false)}
              className="px-2.5 py-1 rounded text-[11px] text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => void handleReasonSubmit()}
              disabled={isSaving}
              className="px-3 py-1 bg-slate-900 dark:bg-white text-white dark:text-black font-semibold rounded text-[11px] hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
            >
              Submit Feedback
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
