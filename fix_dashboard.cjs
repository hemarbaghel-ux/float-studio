const fs = require('fs');
let code = fs.readFileSync('src/features/dashboard/Dashboard.tsx', 'utf8');

code = code.replace(
  `import { useIDEStore } from '../../store';`,
  `import { useIDEStore } from '../../store';\nimport { useAuthStore } from '../../store/authStore';\nimport { LogOut } from 'lucide-react';`
);

code = code.replace(
  `export function Dashboard() {
  const [activeTab, setActiveTab] = useState('new-chat');
  const [prompt, setPrompt] = useState('');
  const { setProject } = useIDEStore();`,
  `export function Dashboard() {
  const [activeTab, setActiveTab] = useState('new-chat');
  const [prompt, setPrompt] = useState('');
  const { setProject, hasStarted } = useIDEStore();
  const { user, logout } = useAuthStore();`
);

code = code.replace(
  `          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#2A2A2A] flex items-center justify-center text-xs font-medium">
                N
              </div>
              <div className="flex flex-col">
                <span className="text-xs">user@example.com</span>
                <span className="text-[10px] text-[#A1A1AA]">Free</span>
              </div>
            </div>
            <button className="text-[#A1A1AA] hover:text-white">
              <MoreHorizontal size={16} />
            </button>
          </div>`,
  `          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 max-w-[150px]">
              <div className="w-6 h-6 rounded-full bg-[#2A2A2A] flex items-center justify-center text-xs font-medium shrink-0 uppercase text-white">
                {user?.email?.charAt(0) || 'U'}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-xs truncate" title={user?.email || 'User'}>{user?.email || 'User'}</span>
                <span className="text-[10px] text-[#A1A1AA]">Free</span>
              </div>
            </div>
            <button onClick={logout} title="Sign Out" className="text-[#A1A1AA] hover:text-white p-1">
              <LogOut size={16} />
            </button>
          </div>`
);

fs.writeFileSync('src/features/dashboard/Dashboard.tsx', code);
