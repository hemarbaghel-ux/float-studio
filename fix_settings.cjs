const fs = require('fs');
let code = fs.readFileSync('src/features/settings/SettingsModal.tsx', 'utf8');

code = code.replace(
  `import { useIDEStore } from '../../store';`,
  `import { useIDEStore } from '../../store';\nimport { useAuthStore } from '../../store/authStore';\nimport { LogOut } from 'lucide-react';`
);

code = code.replace(
  `export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings } = useIDEStore();`,
  `export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings } = useIDEStore();
  const { user, logout } = useAuthStore();`
);

code = code.replace(
  `<button onClick={onClose} className="p-1 text-[#8B949E] hover:text-white rounded-md">
            <X size={20} />
          </button>
        </div>`,
  `<button onClick={onClose} className="p-1 text-[#8B949E] hover:text-white rounded-md">
            <X size={20} />
          </button>
        </div>
        
        {user && (
          <div className="px-6 pt-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-full bg-[#7C3AED] text-white flex items-center justify-center font-bold uppercase">
                 {user.email?.charAt(0) || 'U'}
               </div>
               <div>
                 <div className="text-sm font-medium text-white">{user.email}</div>
                 <div className="text-xs text-[#8B949E]">Free Plan</div>
               </div>
            </div>
            <button 
              onClick={() => { logout(); onClose(); }}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-md transition-colors"
            >
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        )}`
);

fs.writeFileSync('src/features/settings/SettingsModal.tsx', code);
