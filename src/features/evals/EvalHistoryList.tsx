import React from 'react';
import { useEvalStore } from '../../store/evalStore';

export function EvalHistoryList() {
  const { runs } = useEvalStore();

  return (
    <div className="bg-[#0D1117] border border-[#30363D] rounded-xl overflow-hidden">
      <div className="bg-[#161B22] border-b border-[#30363D] p-4">
        <h2 className="text-lg font-medium text-white">Recent Evaluation Results</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#0D1117] text-[#8B949E] border-b border-[#30363D]">
            <tr>
              <th className="px-4 py-3 font-medium">Task ID</th>
              <th className="px-4 py-3 font-medium">Model</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#30363D]">
            {runs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[#8B949E]">
                  No evaluation history found.
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id} className="hover:bg-[#161B22] transition-colors">
                  <td className="px-4 py-3 text-[#C9D1D9] font-medium truncate max-w-[150px]" title={run.taskId}>{run.taskId}</td>
                  <td className="px-4 py-3 text-[#8B949E]">{run.modelId}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs border ${
                      run.status === 'Completed' ? 'text-green-400 bg-green-400/10 border-green-400/20' :
                      run.status === 'Failed' ? 'text-red-400 bg-red-400/10 border-red-400/20' :
                      'text-blue-400 bg-blue-400/10 border-blue-400/20'
                    }`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#C9D1D9] font-medium">{run.score !== undefined ? `${run.score}%` : '-'}</td>
                  <td className="px-4 py-3 text-[#8B949E]">{new Date(run.startedAt).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
