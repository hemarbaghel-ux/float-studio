import React, { useState } from 'react';
import { auth } from '../../lib/firebase';
import { EvalTask } from '../../types';
import { Save, Loader2, AlertCircle, CheckCircle2, Upload, FileJson } from 'lucide-react';
import { evalTaskService } from '../../services/evalTaskService';

export function EvalTaskForm({ onSuccess, onCancel }: { onSuccess?: () => void, onCancel?: () => void }) {
  const [formData, setFormData] = useState<Partial<EvalTask>>({
    name: '',
    description: '',
    category: 'Coding',
    difficulty: 'Medium',
    prompt: '',
    validationType: 'llm_eval'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkJson, setBulkJson] = useState('');

  const handleSingleSubmit = async () => {
    try {
      const evalTaskData: Omit<EvalTask, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'> = {
        name: formData.name as string,
        description: formData.description as string,
        category: (formData.category || 'Coding') as any,
        difficulty: (formData.difficulty || 'Medium') as any,
        prompt: formData.prompt as string,
        validationType: formData.validationType as any
      };
      
      await evalTaskService.createEvalTask(evalTaskData);
      
      setSuccess('Evaluation task created successfully!');
      setFormData({
        name: '',
        description: '',
        category: 'Coding',
        difficulty: 'Medium',
        prompt: '',
        validationType: 'llm_eval'
      });
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Error saving eval task:', err);
      setError(err.message || 'Failed to save eval task.');
    }
  };

  const handleBulkSubmit = async () => {
    try {
      const parsedTasks = JSON.parse(bulkJson);
      
      if (!Array.isArray(parsedTasks)) {
        throw new Error('JSON must be an array of task objects.');
      }

      if (parsedTasks.length === 0) {
        throw new Error('The array is empty.');
      }

      let successCount = 0;
      for (const task of parsedTasks) {
        // Basic validation
        if (!task.name || !task.description || !task.prompt || !task.validationType) {
          throw new Error('One or more tasks are missing required fields (name, description, prompt, validationType).');
        }
        
        await evalTaskService.createEvalTask({
          name: task.name,
          description: task.description,
          category: (task.category || 'Coding') as any,
          difficulty: (task.difficulty || 'Medium') as any,
          prompt: task.prompt,
          validationType: task.validationType
        });
        successCount++;
      }
      
      setSuccess(`Successfully imported ${successCount} tasks!`);
      setBulkJson('');
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Error in bulk import:', err);
      setError(err.message || 'Failed to parse or save bulk tasks.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      setError('You must be logged in to create an eval task.');
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (isBulkMode) {
      await handleBulkSubmit();
    } else {
      await handleSingleSubmit();
    }
    
    setLoading(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="bg-[#0D1117] border border-[#30363D] rounded-xl overflow-hidden flex flex-col max-w-3xl">
      <div className="bg-[#161B22] border-b border-[#30363D] p-4 flex items-center justify-between">
        <h2 className="text-lg font-medium text-white flex items-center gap-2">
          {isBulkMode ? <FileJson size={20} /> : <Save size={20} />}
          {isBulkMode ? 'Bulk Import Tasks' : 'Create Evaluation Task'}
        </h2>
        <div className="flex bg-[#0D1117] rounded-lg p-1 border border-[#30363D]">
          <button
            type="button"
            onClick={() => { setIsBulkMode(false); setError(null); setSuccess(null); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${!isBulkMode ? 'bg-[#21262D] text-white shadow-sm' : 'text-[#8B949E] hover:text-[#C9D1D9]'}`}
          >
            Single Form
          </button>
          <button
            type="button"
            onClick={() => { setIsBulkMode(true); setError(null); setSuccess(null); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${isBulkMode ? 'bg-[#21262D] text-white shadow-sm' : 'text-[#8B949E] hover:text-[#C9D1D9]'}`}
          >
            Bulk JSON
          </button>
        </div>
      </div>
      
      <div className="p-6 flex flex-col gap-6 text-sm">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-md flex items-center gap-2">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
        
        {success && (
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-3 rounded-md flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>{success}</span>
          </div>
        )}

        {!isBulkMode ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-[#C9D1D9] font-medium" htmlFor="name">Task Name</label>
                <input 
                  id="name"
                  name="name"
                  type="text" 
                  required
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g., Python Reverse String"
                  className="bg-[#010409] border border-[#30363D] rounded-md p-2.5 text-white focus:outline-none focus:border-[#7C3AED]"
                />
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-[#C9D1D9] font-medium" htmlFor="category">Category</label>
                <input 
                  id="category"
                  name="category"
                  type="text" 
                  required
                  value={formData.category}
                  onChange={handleChange}
                  placeholder="e.g., Algorithms, Frontend, Data Science"
                  className="bg-[#010409] border border-[#30363D] rounded-md p-2.5 text-white focus:outline-none focus:border-[#7C3AED]"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[#C9D1D9] font-medium" htmlFor="description">Description</label>
              <textarea 
                id="description"
                name="description"
                required
                value={formData.description}
                onChange={handleChange}
                placeholder="Briefly describe what the model is supposed to accomplish."
                className="bg-[#010409] border border-[#30363D] rounded-md p-2.5 text-white focus:outline-none focus:border-[#7C3AED] min-h-[80px]"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-[#C9D1D9] font-medium" htmlFor="difficulty">Difficulty</label>
                <select
                  id="difficulty"
                  name="difficulty"
                  value={formData.difficulty}
                  onChange={handleChange}
                  className="bg-[#010409] border border-[#30363D] rounded-md p-2.5 text-white focus:outline-none focus:border-[#7C3AED]"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[#C9D1D9] font-medium" htmlFor="validationType">Validation Type</label>
                <select
                  id="validationType"
                  name="validationType"
                  value={formData.validationType}
                  onChange={handleChange}
                  className="bg-[#010409] border border-[#30363D] rounded-md p-2.5 text-white focus:outline-none focus:border-[#7C3AED]"
                >
                  <option value="exact_match">Exact Match</option>
                  <option value="contains">Contains</option>
                  <option value="regex">Regex Match</option>
                  <option value="llm_eval">LLM as a Judge</option>
                  <option value="code_execution">Code Execution</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[#C9D1D9] font-medium" htmlFor="prompt">Eval Prompt (System / User Instruction)</label>
              <textarea 
                id="prompt"
                name="prompt"
                required
                value={formData.prompt}
                onChange={handleChange}
                placeholder="The actual prompt you want to evaluate against. e.g., 'Write a function that reverses a string in Python.'"
                className="bg-[#010409] border border-[#30363D] rounded-md p-2.5 text-white focus:outline-none focus:border-[#7C3AED] font-mono min-h-[150px]"
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-end mb-1">
              <label className="text-[#C9D1D9] font-medium" htmlFor="bulkJson">JSON Payload</label>
              <span className="text-xs text-[#8B949E]">Expects an array of EvalTask objects</span>
            </div>
            <textarea 
              id="bulkJson"
              name="bulkJson"
              required
              value={bulkJson}
              onChange={(e) => setBulkJson(e.target.value)}
              placeholder="[\n  {\n    &quot;name&quot;: &quot;Task 1&quot;,\n    &quot;description&quot;: &quot;...&quot;,\n    &quot;category&quot;: &quot;Algorithm&quot;,\n    &quot;difficulty&quot;: &quot;medium&quot;,\n    &quot;prompt&quot;: &quot;...&quot;,\n    &quot;validationType&quot;: &quot;exact_match&quot;\n  }\n]"
              className="bg-[#010409] border border-[#30363D] rounded-md p-3 text-[#E6EDF3] focus:outline-none focus:border-[#7C3AED] font-mono text-xs min-h-[300px] whitespace-pre"
            />
          </div>
        )}
      </div>
      
      <div className="bg-[#161B22] border-t border-[#30363D] p-4 flex justify-end gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 bg-transparent text-[#8B949E] hover:text-white rounded-md transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-md font-medium transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : isBulkMode ? <Upload size={16} /> : <Save size={16} />}
          {isBulkMode ? 'Upload Tasks' : 'Save Eval Task'}
        </button>
      </div>
    </form>
  );
}
