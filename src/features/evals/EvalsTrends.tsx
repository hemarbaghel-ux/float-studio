import React, { useMemo } from 'react';
import { useEvalStore } from '../../store/evalStore';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { TrendingUp, Clock, Coins, ShieldAlert } from 'lucide-react';
import { INITIAL_MODELS } from '../ai/registry';

export function EvalsTrends() {
  const { runs } = useEvalStore();

  const completedRuns = useMemo(() => {
    return runs
      .filter(r => (r.status === 'completed' || r.status === 'Completed') && typeof (r.finalScore ?? r.score) === 'number')
      .sort((a, b) => a.startedAt - b.startedAt);
  }, [runs]);

  const hasEnoughData = completedRuns.length >= 2;

  const chartData = useMemo(() => {
    if (!hasEnoughData) return [];

    return completedRuns.map((r, idx) => {
      const model = INITIAL_MODELS.find(m => m.id === r.modelId);
      return {
        name: `#${idx + 1} (${model?.displayName || r.modelId})`,
        score: r.finalScore ?? r.score ?? 0,
        latency: r.duration ?? (r.durationMs ? Number((r.durationMs / 1000).toFixed(1)) : 0),
        cost: r.actualCost ?? r.estimatedCost ?? 0,
        tokens: r.totalTokens ?? 0,
        time: new Date(r.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
    });
  }, [completedRuns, hasEnoughData]);

  return (
    <div className="space-y-6">
      {!hasEnoughData ? (
        <div className="p-12 text-center border border-[#30363D] rounded-xl bg-[#161B22] flex flex-col items-center justify-center">
          <div className="w-12 h-12 bg-[#0D1117] rounded-full flex items-center justify-center mb-3 border border-[#30363D]">
            <TrendingUp className="text-[#8B949E]" size={22} />
          </div>
          <h4 className="text-sm font-semibold text-white mb-1">
            Historical trends will appear after multiple completed evaluations.
          </h4>
          <p className="text-xs text-[#8B949E] max-w-sm">
            Execute at least 2 evaluation runs to begin tracking score progressions, latency changes, and cost variations across iterations.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Score Trend Chart */}
          <div className="p-6 border border-[#30363D] rounded-xl bg-[#161B22]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Evaluation Score Trend (0 - 100)</h3>
                <p className="text-xs text-[#8B949E] mt-0.5">Track automated and calibrated scores across successive runs</p>
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
                  <XAxis dataKey="name" stroke="#8B949E" fontSize={11} />
                  <YAxis stroke="#8B949E" fontSize={11} domain={[0, 100]} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0D1117', borderColor: '#30363D', color: '#C9D1D9', fontSize: '12px' }} 
                  />
                  <Line type="monotone" dataKey="score" stroke="#A855F7" strokeWidth={2} dot={{ fill: '#A855F7', r: 4 }} name="Score" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Latency & Cost Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 border border-[#30363D] rounded-xl bg-[#161B22]">
              <h3 className="text-sm font-semibold text-white mb-1">Execution Latency (Seconds)</h3>
              <p className="text-xs text-[#8B949E] mb-4">Time from task dispatch to validation completion</p>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
                    <XAxis dataKey="name" stroke="#8B949E" fontSize={10} />
                    <YAxis stroke="#8B949E" fontSize={10} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0D1117', borderColor: '#30363D', color: '#C9D1D9', fontSize: '12px' }} 
                    />
                    <Line type="monotone" dataKey="latency" stroke="#38BDF8" strokeWidth={2} dot={{ fill: '#38BDF8', r: 4 }} name="Latency (s)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-6 border border-[#30363D] rounded-xl bg-[#161B22]">
              <h3 className="text-sm font-semibold text-white mb-1">Estimated Cost Trend (USD)</h3>
              <p className="text-xs text-[#8B949E] mb-4">Calculated from actual token input and output volume</p>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
                    <XAxis dataKey="name" stroke="#8B949E" fontSize={10} />
                    <YAxis stroke="#8B949E" fontSize={10} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0D1117', borderColor: '#30363D', color: '#C9D1D9', fontSize: '12px' }} 
                    />
                    <Line type="monotone" dataKey="cost" stroke="#34D399" strokeWidth={2} dot={{ fill: '#34D399', r: 4 }} name="Cost ($)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
