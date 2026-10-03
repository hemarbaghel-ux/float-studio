const fs = require('fs');

const path = 'src/features/ai/AIPanel.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add imports
if (!content.includes('ModelSelector')) {
  content = content.replace(
    "import { DiffReviewModal } from '../agent/DiffReviewModal';",
    "import { DiffReviewModal } from '../agent/DiffReviewModal';\nimport { AgentSelector } from './AgentSelector';\nimport { ModelSelector } from './ModelSelector';\nimport { AgentManagerModal } from './AgentManagerModal';\nimport { useAIStore } from '../../store/aiStore';"
  );
}

// Add state for agent manager
if (!content.includes('isAgentManagerOpen')) {
  content = content.replace(
    "const [reviewingChangeSet, setReviewingChangeSet] = useState<ChangeSet | null>(null);",
    "const [reviewingChangeSet, setReviewingChangeSet] = useState<ChangeSet | null>(null);\n  const [isAgentManagerOpen, setIsAgentManagerOpen] = useState(false);\n  const { selectedAgent, selectedModel, setSelectedModel, agents } = useAIStore();\n  const currentAgent = agents.find(a => a.id === selectedAgent) || agents[0];"
  );
}

// Update Header
const oldHeader = `<div className="flex items-center justify-between p-3 border-b border-[#30363D] bg-[#010409] shrink-0">
        <div className="flex items-center gap-2 text-[#C9D1D9] font-medium text-sm">
          <Code size={16} />
          PyPilot AI
        </div>
        <div className="flex items-center gap-2">
          <select 
            value={aiModel}
            onChange={(e) => setAiModel(e.target.value)}
            className="bg-[#0D1117] border border-[#30363D] rounded-md px-2 py-1 text-xs text-[#C9D1D9] focus:outline-none"
          >
            <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
            <option value="gemini-3.5-pro">Gemini 3.5 Pro</option>
          </select>
          <button 
            onClick={clearAiMessages}
            className="p-1.5 text-[#8B949E] hover:text-[#C9D1D9] rounded-md transition-colors"
            title="New Chat"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>`;

const newHeader = `<div className="flex flex-col border-b border-[#30363D] bg-[#010409] shrink-0">
        <div className="flex items-center justify-between p-2">
          <div className="flex items-center gap-2 text-[#C9D1D9] font-medium text-sm flex-1 mr-2">
             <AgentSelector onAgentManagerOpen={() => setIsAgentManagerOpen(true)} />
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={clearAiMessages}
              className="p-1.5 text-[#8B949E] hover:text-[#C9D1D9] rounded-md transition-colors bg-[#161B22] border border-[#30363D]"
              title="New Chat"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        <div className="px-2 pb-2">
           <ModelSelector 
              activeModelId={selectedModel === 'auto' ? currentAgent?.defaultModel : selectedModel} 
              onModelChange={(id) => setSelectedModel(id)} 
              agentId={selectedAgent} 
           />
        </div>
      </div>`;

content = content.replace(oldHeader, newHeader);

if (!content.includes('<AgentManagerModal onClose={() => setIsAgentManagerOpen(false)} />')) {
  content = content.replace(
    "    </div>\n  );\n}",
    "      {isAgentManagerOpen && <AgentManagerModal onClose={() => setIsAgentManagerOpen(false)} />}\n    </div>\n  );\n}"
  );
}

fs.writeFileSync(path, content);
