import React from 'react';

export function EvalsSettings() {
  return (
    <div className="p-8 max-w-4xl mx-auto flex flex-col gap-8">
      <h1 className="text-2xl font-semibold text-white">Evaluation Settings</h1>
      
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h3 className="text-white font-medium">Scoring Weights</h3>
          <p className="text-sm text-[#8B949E] mb-2">Configure how final evaluation scores are calculated.</p>
          
          <div className="bg-[#0D1117] border border-[#30363D] rounded-lg p-4 flex flex-col gap-4">
            <WeightSlider label="Task Completion" value={40} />
            <WeightSlider label="Tests Passed" value={30} />
            <WeightSlider label="Build/Type Validation" value={20} />
            <WeightSlider label="Patch Validity" value={10} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-white font-medium">Execution</h3>
          
          <div className="bg-[#0D1117] border border-[#30363D] rounded-lg p-4 flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-[#C9D1D9] mb-1">Default Timeout (seconds)</label>
              <input type="number" defaultValue={60} className="w-48 bg-[#010409] border border-[#30363D] rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#58A6FF]" />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-[#C9D1D9] mb-1">Concurrency Limit</label>
              <input type="number" defaultValue={2} className="w-48 bg-[#010409] border border-[#30363D] rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#58A6FF]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WeightSlider({ label, value }: { label: string, value: number }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-48 text-sm text-[#C9D1D9]">{label}</div>
      <input type="range" min="0" max="100" defaultValue={value} className="flex-1 accent-[#238636]" />
      <div className="w-12 text-sm text-[#8B949E] text-right">{value}%</div>
    </div>
  );
}
