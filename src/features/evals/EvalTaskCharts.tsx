import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { evalTaskService } from '../../services/evalTaskService';
import { auth } from '../../lib/firebase';
import { EvalTask } from '../../types';
import { Loader2 } from 'lucide-react';

const COLORS = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
const DIFFICULTY_COLORS = {
  easy: '#10B981', // Green
  medium: '#F59E0B', // Yellow
  hard: '#EF4444' // Red
};

export function EvalTaskCharts() {
  const [tasks, setTasks] = useState<EvalTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTasks = async () => {
      if (!auth.currentUser) return;
      try {
        const fetchedTasks = await evalTaskService.getEvalTasksByOwner(auth.currentUser.uid);
        setTasks(fetchedTasks);
      } catch (err) {
        console.error('Error fetching tasks for charts', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTasks();
  }, []);

  if (loading) {
    return (
      <div className="bg-[#0D1117] border border-[#30363D] rounded-xl p-8 flex items-center justify-center min-h-[300px]">
        <Loader2 className="animate-spin text-[#8B949E]" size={32} />
      </div>
    );
  }

  if (tasks.length === 0) {
    return null; // Don't show charts if there's no data
  }

  // Aggregate by Category
  const categoryCount: Record<string, number> = {};
  tasks.forEach(t => {
    const cat = t.category || 'Uncategorized';
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  });
  const categoryData = Object.entries(categoryCount).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // Aggregate by Difficulty
  const difficultyCount: Record<string, number> = { easy: 0, medium: 0, hard: 0 };
  tasks.forEach(t => {
    const diff = t.difficulty || 'medium';
    if (difficultyCount[diff] !== undefined) {
      difficultyCount[diff]++;
    }
  });
  const difficultyData = [
    { name: 'Easy', value: difficultyCount.easy, fill: DIFFICULTY_COLORS.easy },
    { name: 'Medium', value: difficultyCount.medium, fill: DIFFICULTY_COLORS.medium },
    { name: 'Hard', value: difficultyCount.hard, fill: DIFFICULTY_COLORS.hard },
  ].filter(d => d.value > 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      {/* Category Distribution Chart */}
      <div className="bg-[#0D1117] border border-[#30363D] rounded-xl p-4 flex flex-col">
        <h3 className="text-sm font-medium text-white mb-4">Tasks by Category</h3>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363D" vertical={false} />
              <XAxis 
                dataKey="name" 
                tick={{ fill: '#8B949E', fontSize: 12 }} 
                axisLine={{ stroke: '#30363D' }}
                tickLine={false}
                angle={-45}
                textAnchor="end"
              />
              <YAxis 
                tick={{ fill: '#8B949E', fontSize: 12 }} 
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip 
                cursor={{ fill: '#161B22' }}
                contentStyle={{ backgroundColor: '#161B22', borderColor: '#30363D', color: '#fff', borderRadius: '8px' }}
                itemStyle={{ color: '#C9D1D9' }}
              />
              <Bar dataKey="value" fill="#7C3AED" radius={[4, 4, 0, 0]} maxBarSize={50}>
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Difficulty Distribution Chart */}
      <div className="bg-[#0D1117] border border-[#30363D] rounded-xl p-4 flex flex-col">
        <h3 className="text-sm font-medium text-white mb-4">Tasks by Difficulty</h3>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={difficultyData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {difficultyData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: '#161B22', borderColor: '#30363D', color: '#fff', borderRadius: '8px' }}
                itemStyle={{ color: '#C9D1D9' }}
              />
              <Legend 
                verticalAlign="bottom" 
                height={36} 
                wrapperStyle={{ fontSize: '12px', color: '#8B949E' }} 
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
