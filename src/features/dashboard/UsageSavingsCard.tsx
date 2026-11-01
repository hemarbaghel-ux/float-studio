import React, { useMemo, useState } from 'react';
import { Activity, ArrowRight, Clock3, Coins, Layers } from 'lucide-react';
import { useUsageStore } from '../../store/usageStore';

interface UsageSavingsCardProps {
  onViewFullAnalytics?: () => void;
  className?: string;
  compact?: boolean;
}

/** Shows only telemetry recorded from completed provider responses. */
export function UsageSavingsCard({
  onViewFullAnalytics,
  className = '',
  compact = false,
}: UsageSavingsCardProps) {
  const records = useUsageStore((state) => state.records);
  const [timeRange, setTimeRange] = useState<'today' | '7d' | 'all'>('7d');

  const stats = useMemo(() => {
    const now = Date.now();
    const cutoff = timeRange === 'today'
      ? new Date().setHours(0, 0, 0, 0)
      : timeRange === '7d'
        ? now - 7 * 24 * 60 * 60 * 1000
        : 0;
    const windowRecords = records.filter((record) => record.timestamp >= cutoff);
    const successfulRecords = windowRecords.filter((record) => record.status === 'success');

    return {
      requestCount: windowRecords.length,
      inputTokens: successfulRecords.reduce((sum, record) => sum + record.inputTokens, 0),
      outputTokens: successfulRecords.reduce((sum, record) => sum + record.outputTokens, 0),
      estimatedCost: successfulRecords.reduce((sum, record) => sum + record.estimatedCost, 0),
      averageLatency: successfulRecords.length
        ? successfulRecords.reduce((sum, record) => sum + record.latency, 0) / successfulRecords.length
        : 0,
    };
  }, [records, timeRange]);

  const totalTokens = stats.inputTokens + stats.outputTokens;
  const number = new Intl.NumberFormat();
  const metricClass = compact ? 'p-3' : 'p-4 sm:p-5';

  return (
    <section className={`w-full bg-white dark:bg-[#121212] border border-slate-200/90 dark:border-[#222222] rounded-xl shadow-xs transition-colors overflow-hidden ${className}`} aria-label="Recorded AI usage">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-white/5">
        <div>
          <h3 className="text-xs font-semibold text-slate-900 dark:text-white">Recorded AI Usage</h3>
          <p className="text-[11px] text-slate-500 dark:text-[#8B949E] mt-0.5">
            Counts come from usage metadata returned by completed provider responses.
          </p>
        </div>
        <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-white/5 rounded-lg">
          {(['today', '7d', 'all'] as const).map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setTimeRange(range)}
              aria-pressed={timeRange === range}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${timeRange === range
                ? 'bg-white dark:bg-[#222] text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white'}`}
            >
              {range === 'today' ? 'Today' : range === '7d' ? '7 Days' : 'All Time'}
            </button>
          ))}
        </div>
      </header>

      {stats.requestCount === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500 dark:text-[#8B949E]">
          No provider usage has been recorded for this period.
        </p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 dark:divide-white/5">
          <Metric className={metricClass} icon={<Layers size={13} />} label="Tokens returned"
            value={number.format(totalTokens)}
            detail={`In ${number.format(stats.inputTokens)} · Out ${number.format(stats.outputTokens)}`} />
          <Metric className={metricClass} icon={<Activity size={13} />} label="Requests recorded"
            value={number.format(stats.requestCount)} />
          <Metric className={metricClass} icon={<Coins size={13} />} label="Estimated provider cost"
            value={`$${stats.estimatedCost.toFixed(4)}`} detail="Rate-based estimate" />
          <Metric className={metricClass} icon={<Clock3 size={13} />} label="Average response time"
            value={stats.averageLatency ? `${(stats.averageLatency / 1000).toFixed(2)}s` : '—'}
            detail="Completed responses" />
        </div>
      )}

      {onViewFullAnalytics && (
        <footer className="px-5 py-3 border-t border-slate-100 dark:border-white/5 flex justify-end">
          <button
            type="button"
            onClick={onViewFullAnalytics}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-[#C9D1D9] hover:text-purple-600 dark:hover:text-purple-400 transition-colors cursor-pointer"
          >
            View Full Analytics <ArrowRight size={13} />
          </button>
        </footer>
      )}
    </section>
  );
}

function Metric({
  className,
  icon,
  label,
  value,
  detail,
}: {
  className: string;
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div className={`${className} flex flex-col justify-between min-w-0`}>
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#8B949E] mb-1">
        {icon}<span>{label}</span>
      </div>
      <div className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-mono tabular-nums">
        {value}
      </div>
      {detail && <small className="mt-2 text-[10px] font-normal text-slate-500 dark:text-[#8B949E]">{detail}</small>}
    </div>
  );
}
