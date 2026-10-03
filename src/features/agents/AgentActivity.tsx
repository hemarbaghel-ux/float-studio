import React from 'react';
import { useAgentOrchestratorStore } from '../../store/agentOrchestratorStore';
import { useAIStore } from '../../store/aiStore';
import { useEffect, useState } from 'react';

export function AgentActivity() {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await fetch('/api/agents/events');
        const data = await res.json();
        setEvents(data);
      } catch (err) {}
    };
    fetchEvents();
    const interval = setInterval(fetchEvents, 2000);
    return () => clearInterval(interval);
  }, []);
  const { agents } = useAIStore();

  return (
    <div className="p-8 max-w-6xl mx-auto flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-white">Activity Log</h1>
      
      <div className="flex flex-col gap-2">
        {events.length === 0 ? (
          <div className="border border-[#30363D] rounded-md p-8 text-center text-[#8B949E] bg-[#0D1117]">
            No recent activity.
          </div>
        ) : (
          events.slice().reverse().map(event => (
            <div key={event.id} className="bg-[#0D1117] border border-[#30363D] rounded-lg p-4 flex items-center gap-4">
              <div className="text-xs text-[#8B949E] w-20 shrink-0">
                {new Date(event.timestamp).toLocaleTimeString()}
              </div>
              <div className="px-2 py-0.5 rounded text-xs bg-[#161B22] border border-[#30363D] text-[#C9D1D9]">
                {agents.find(a => a.id === event.agentId)?.name || event.agentId}
              </div>
              <div className="text-sm text-white flex-1">{event.message}</div>
              <div className="text-xs text-[#8B949E] uppercase">{event.type.replace(/_/g, ' ')}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
