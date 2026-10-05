import React from 'react';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api';
import { streamAgentTaskEvents } from '../../services/agentEventStream';

export function AgentActivity() {
  const [events, setEvents] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const streams = new Map<string, AbortController>();
    const startStream = (taskId: string) => {
      if (streams.has(taskId) || streams.size >= 20) return;
      const streamController = new AbortController();
      streams.set(taskId, streamController);
      void streamAgentTaskEvents(taskId, event => {
        setEvents(previous => previous.some(item => item.id === event.id) ? previous : [...previous, event]);
      }, streamController.signal);
    };
    const loadAndSubscribe = async () => {
      try {
        const [eventsResponse, tasksResponse] = await Promise.all([apiFetch('/api/agents/events'), apiFetch('/api/agents/tasks')]);
        if (!eventsResponse.ok || !tasksResponse.ok) throw new Error(`Could not load agent activity (HTTP ${!eventsResponse.ok ? eventsResponse.status : tasksResponse.status}).`);
        const [eventData, taskData] = await Promise.all([eventsResponse.json(), tasksResponse.json()]);
        setEvents(eventData);
        for (const task of (Array.isArray(taskData) ? taskData : []).slice(0, 20)) startStream(task.id);
        setError('');
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load agent activity.'); }
      finally { setLoading(false); }
    };
    void loadAndSubscribe();
    // Refresh task IDs occasionally to discover new tasks; task progress itself arrives over SSE.
    const interval = setInterval(async () => {
      try {
        const response = await apiFetch('/api/agents/tasks');
        if (!response.ok) return;
        const taskData = await response.json();
        for (const task of (Array.isArray(taskData) ? taskData : []).slice(0, 20)) startStream(task.id);
      } catch { /* Active streams reconnect independently; discovery retries on the next interval. */ }
    }, 30_000);
    return () => {
      controller.abort();
      clearInterval(interval);
      for (const stream of streams.values()) stream.abort();
    };
  }, []);
  return (
    <div className="p-8 max-w-6xl mx-auto flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-white">Activity Log</h1>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      
      <div className="flex flex-col gap-2">
        {loading ? <div className="border border-[#30363D] rounded-md p-8 text-center text-[#8B949E] bg-[#0D1117]">Loading persisted agent activity…</div> : events.length === 0 ? (
          <div className="border border-[#30363D] rounded-md p-8 text-center text-[#8B949E] bg-[#0D1117]">
            No recent activity.
          </div>
        ) : (
          events.slice().reverse().map(event => (
            <div key={event.id} className="bg-[#0D1117] border border-[#30363D] rounded-lg p-4 flex items-center gap-4">
              <div className="text-xs text-[#8B949E] w-20 shrink-0">
                {new Date(event.timestamp).toLocaleTimeString()}
              </div>
              <div className="px-2 py-0.5 rounded text-xs bg-[#161B22] border border-[#30363D] text-[#C9D1D9]">{event.agentId}</div>
              <div className="text-sm text-white flex-1">{event.message}{event.payload?.output ? <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-[#8B949E]">{event.payload.output}</pre> : null}</div>
              <div className="text-xs text-[#8B949E] uppercase">{event.type.replace(/_/g, ' ')}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
