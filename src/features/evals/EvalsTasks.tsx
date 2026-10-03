import React, { useState, useMemo } from 'react';
import { useEvalStore } from '../../store/evalStore';
import { 
  Search, Filter, Plus, Play, CheckSquare, 
  Trash2, FileCode, Terminal, AlertCircle, Code2, Layers
} from 'lucide-react';
import { EvalTask, EvalCategory, Difficulty } from '../../types/evals';

interface EvalsTasksProps {
  onNewTask?: () => void;
  onRunTask?: (taskId: string) => void;
}

export function EvalsTasks({ onNewTask, onRunTask }: EvalsTasksProps) {
  const { tasks, deleteTask } = useEvalStore();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState('all');

  const categories = useMemo(() => {
    const set = new Set(tasks.map(t => t.category));
    return Array.from(set);
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchSearch = 
        task.name.toLowerCase().includes(search.toLowerCase()) ||
        task.description.toLowerCase().includes(search.toLowerCase()) ||
        task.prompt.toLowerCase().includes(search.toLowerCase());

      const matchCategory = selectedCategory === 'all' || task.category === selectedCategory;
      const matchDifficulty = selectedDifficulty === 'all' || task.difficulty === selectedDifficulty;

      return matchSearch && matchCategory && matchDifficulty;
    });
  }, [tasks, search, selectedCategory, selectedDifficulty]);

  return (
    <div className="space-y-6">
      {/* Top Header & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#161B22] p-4 rounded-xl border border-[#30363D]">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 text-[#8B949E]" size={15} />
            <input
              type="text"
              placeholder="Search evaluation tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded-lg text-xs text-white placeholder-[#8B949E] focus:outline-none focus:border-purple-500"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="p-1.5 bg-[#0D1117] border border-[#30363D] rounded-lg text-xs text-[#C9D1D9] focus:outline-none focus:border-purple-500"
          >
            <option value="all">All Categories</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value)}
            className="p-1.5 bg-[#0D1117] border border-[#30363D] rounded-lg text-xs text-[#C9D1D9] focus:outline-none focus:border-purple-500"
          >
            <option value="all">All Difficulties</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
        </div>

        <button
          onClick={() => onNewTask?.()}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0"
        >
          <Plus size={14} />
          New Task
        </button>
      </div>

      {/* Task Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredTasks.map(task => {
          const filesCount = task.files?.length || 0;
          return (
            <div
              key={task.id}
              className="border border-[#30363D] rounded-xl bg-[#161B22] p-5 flex flex-col justify-between hover:border-[#484F58] transition-colors"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#21262D] border border-[#30363D] text-purple-300">
                      {task.category}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                      task.difficulty === 'Easy' ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800' :
                      task.difficulty === 'Medium' ? 'bg-amber-950/60 text-amber-300 border border-amber-800' :
                      'bg-red-950/60 text-red-300 border border-red-800'
                    }`}>
                      {task.difficulty}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteTask(task.id)}
                    title="Delete Task"
                    className="p-1 text-[#8B949E] hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <h3 className="text-sm font-semibold text-white mb-1.5">{task.name}</h3>
                <p className="text-xs text-[#8B949E] line-clamp-2 mb-3">
                  {task.description || task.prompt}
                </p>

                <div className="p-2.5 rounded bg-[#090D13] border border-[#30363D] text-[11px] font-mono text-[#8B949E] line-clamp-2 mb-3">
                  {task.prompt}
                </div>
              </div>

              <div className="pt-3 border-t border-[#30363D] flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 text-[#8B949E] text-[11px]">
                  <span className="flex items-center gap-1">
                    <FileCode size={13} /> {filesCount} files
                  </span>
                  <span className="flex items-center gap-1">
                    <Terminal size={13} /> {task.validationMethod || 'Tests'}
                  </span>
                </div>

                <button
                  onClick={() => onRunTask?.(task.id)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-[#21262D] hover:bg-[#30363D] text-white rounded font-medium transition-colors cursor-pointer"
                >
                  <Play size={12} className="fill-current text-emerald-400" />
                  Evaluate
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredTasks.length === 0 && (
        <div className="p-12 text-center border border-[#30363D] rounded-xl bg-[#161B22]">
          <Code2 className="mx-auto text-[#8B949E] mb-2" size={24} />
          <h4 className="text-sm font-semibold text-white mb-1">No tasks match filter</h4>
          <p className="text-xs text-[#8B949E] mb-4">Try clearing your filters or create a new evaluation task.</p>
          <button
            onClick={() => onNewTask?.()}
            className="px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-lg text-xs font-medium transition-colors"
          >
            Create Task
          </button>
        </div>
      )}
    </div>
  );
}
