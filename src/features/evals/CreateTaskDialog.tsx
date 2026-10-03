import React, { useState } from 'react';
import { X, Plus, Trash2, CheckSquare, Code2, AlertCircle } from 'lucide-react';
import { useEvalStore } from '../../store/evalStore';
import { EvalCategory, Difficulty, ValidationType } from '../../types/evals';

interface CreateTaskDialogProps {
  onClose: () => void;
}

const CATEGORIES: EvalCategory[] = [
  'Coding',
  'Debugging',
  'Refactoring',
  'Code Generation',
  'Code Completion',
  'Testing',
  'Security',
  'Performance',
  'Architecture',
  'Multi-file Editing',
  'Repository Understanding',
  'Instruction Following',
  'Reasoning',
  'Tool Use',
  'Agentic',
  'Planning',
  'Terminal Tasks',
  'Git Operations',
  'Deployment'
];

export function CreateTaskDialog({ onClose }: CreateTaskDialogProps) {
  const { createTask } = useEvalStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<EvalCategory>('Coding');
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium');
  const [prompt, setPrompt] = useState('');
  const [expectedBehavior, setExpectedBehavior] = useState('');
  const [validationType, setValidationType] = useState<ValidationType>('Tests');
  
  // Workspace files
  const [files, setFiles] = useState<{ path: string; content: string }[]>([
    { path: 'main.py', content: '# Initial code setup\n' }
  ]);
  const [testCommands, setTestCommands] = useState('pytest test_main.py');
  const [expectedFiles, setExpectedFiles] = useState('main.py');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddFile = () => {
    setFiles([...files, { path: `file_${files.length + 1}.py`, content: '' }]);
  };

  const handleRemoveFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleFileChange = (index: number, field: 'path' | 'content', value: string) => {
    const updated = [...files];
    updated[index][field] = value;
    setFiles(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !prompt.trim()) {
      setError('Task name and prompt instructions are required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await createTask({
        name,
        description,
        category,
        difficulty,
        prompt,
        expectedBehavior,
        validationMethod: validationType,
        validationType,
        files,
        testCommands: testCommands.split('\n').map(c => c.trim()).filter(Boolean),
        expectedFiles: expectedFiles.split(',').map(f => f.trim()).filter(Boolean),
        forbiddenFiles: ['node_modules', '.env']
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create task');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[#0D1117] border border-[#30363D] rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden text-[#C9D1D9] max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#30363D] bg-[#161B22] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <CheckSquare className="text-purple-400" size={18} />
            <h2 className="text-base font-semibold text-white">Create Evaluation Task</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#8B949E] hover:text-white hover:bg-[#21262D] rounded-md transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 rounded bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        {/* Scrollable Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-white font-medium mb-1">Task Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Implement LRU Cache with TTL"
                className="w-full p-2.5 bg-[#161B22] border border-[#30363D] rounded text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-white font-medium mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as EvalCategory)}
                  className="w-full p-2.5 bg-[#161B22] border border-[#30363D] rounded text-white focus:outline-none focus:border-purple-500"
                >
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-white font-medium mb-1">Difficulty</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                  className="w-full p-2.5 bg-[#161B22] border border-[#30363D] rounded text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-white font-medium mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of the engineering objective"
              className="w-full p-2.5 bg-[#161B22] border border-[#30363D] rounded text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-white font-medium mb-1">Prompt / Instructions Given to Model</label>
            <textarea
              required
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the exact requirements, edge cases, and expected functions/classes..."
              className="w-full p-2.5 bg-[#161B22] border border-[#30363D] rounded text-white font-mono focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-white font-medium mb-1">Expected Behavior</label>
            <textarea
              rows={2}
              value={expectedBehavior}
              onChange={(e) => setExpectedBehavior(e.target.value)}
              placeholder="Criteria used to verify output correctness and test invariants..."
              className="w-full p-2.5 bg-[#161B22] border border-[#30363D] rounded text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Files Workspace */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-white font-medium">Repository Snapshot Files ({files.length})</label>
              <button
                type="button"
                onClick={handleAddFile}
                className="flex items-center gap-1 px-2 py-1 text-[11px] bg-[#21262D] hover:bg-[#30363D] text-white rounded transition-colors"
              >
                <Plus size={12} />
                Add File
              </button>
            </div>

            <div className="space-y-3">
              {files.map((file, idx) => (
                <div key={idx} className="border border-[#30363D] rounded-lg p-3 bg-[#161B22] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={file.path}
                      onChange={(e) => handleFileChange(idx, 'path', e.target.value)}
                      placeholder="File path (e.g. src/auth.py)"
                      className="flex-1 p-1.5 bg-[#090D13] border border-[#30363D] rounded font-mono text-white text-xs"
                    />
                    {files.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(idx)}
                        className="p-1.5 text-[#8B949E] hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={4}
                    value={file.content}
                    onChange={(e) => handleFileChange(idx, 'content', e.target.value)}
                    placeholder="File contents..."
                    className="w-full p-2 bg-[#090D13] border border-[#30363D] rounded font-mono text-[#C9D1D9] text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-white font-medium mb-1">Expected Output Files (comma separated)</label>
              <input
                type="text"
                value={expectedFiles}
                onChange={(e) => setExpectedFiles(e.target.value)}
                className="w-full p-2.5 bg-[#161B22] border border-[#30363D] rounded text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-white font-medium mb-1">Test Command</label>
              <input
                type="text"
                value={testCommands}
                onChange={(e) => setTestCommands(e.target.value)}
                className="w-full p-2.5 bg-[#161B22] border border-[#30363D] rounded text-white font-mono"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-[#30363D]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[#8B949E] hover:text-white rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-md transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Creating Task...' : 'Save Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
