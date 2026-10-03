const fs = require('fs');
let code = fs.readFileSync('src/features/dashboard/Dashboard.tsx', 'utf8');

code = code.replace(
  `import { useIDEStore } from '../../store';\nimport { useAuthStore } from '../../store/authStore';`,
  `import { useIDEStore } from '../../store';\nimport { useAuthStore } from '../../store/authStore';\nimport { useEffect } from 'react';\nimport { collection, query, where, getDocs, orderBy } from 'firebase/firestore';\nimport { db } from '../../lib/firebase';`
);

code = code.replace(
  `  const { user, logout } = useAuthStore();`,
  `  const { user, logout } = useAuthStore();
  const [projects, setProjects] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      if (!user) return;
      try {
        const q = query(collection(db, 'projects'), where('ownerId', '==', user.uid));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Note: orderBy requires composite index, so we sort in memory for now
        data.sort((a: any, b: any) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
        setProjects(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingProjects(false);
      }
    };
    fetchProjects();
  }, [user]);

  const handleResumeProject = (project: any) => {
    setProject(project.name, JSON.parse(project.files), project.id);
  };`
);

code = code.replace(
  `          <SidebarItem 
            icon={Code} 
            label="Codebase" 
            badge="Early Beta"
            isActive={activeTab === 'codebase'} 
            onClick={() => setActiveTab('codebase')} 
          />
          <SidebarItem 
            icon={LayoutDashboard} 
            label="Dashboard" 
            isActive={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />`,
  `          <SidebarItem 
            icon={Code} 
            label="Projects" 
            isActive={activeTab === 'projects'} 
            onClick={() => setActiveTab('projects')} 
          />`
);

code = code.replace(
  `{/* Chat Input */}
        <div className="w-full max-w-3xl flex flex-col gap-4">`,
  `{activeTab === 'projects' ? (
          <div className="w-full max-w-4xl flex flex-col gap-4">
            <h2 className="text-2xl font-semibold mb-4">Your Projects</h2>
            {loadingProjects ? (
               <div className="text-[#A1A1AA]">Loading projects...</div>
            ) : projects.length === 0 ? (
               <div className="text-[#A1A1AA]">No projects found. Create one from the New Chat tab.</div>
            ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {projects.map(p => (
                   <div key={p.id} onClick={() => handleResumeProject(p)} className="bg-[#111111] border border-white/10 rounded-xl p-5 hover:border-white/20 transition-colors cursor-pointer flex flex-col gap-2">
                     <h3 className="text-lg font-medium text-white">{p.name}</h3>
                     <p className="text-xs text-[#A1A1AA]">Last updated: {p.updatedAt?.toDate().toLocaleString() || 'Unknown'}</p>
                   </div>
                 ))}
               </div>
            )}
          </div>
        ) : (
          <div className="w-full max-w-3xl flex flex-col gap-4">`
);

code = code.replace(
  `            <button className="px-4 py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-white/90 transition-colors">
              Start Learning
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}`,
  `            <button className="px-4 py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-white/90 transition-colors">
              Start Learning
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}`
);

fs.writeFileSync('src/features/dashboard/Dashboard.tsx', code);
