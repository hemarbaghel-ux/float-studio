const fs = require('fs');

const p1 = 'src/features/models/ModelsPage.tsx';
let c1 = fs.readFileSync(p1, 'utf8');
c1 = c1.replace('<FloatLogo className="w-6 h-6" />\n            <span className="font-bold text-lg tracking-tight uppercase text-slate-900 dark:text-white">FLOAT</span>\n          </a>',
  `<FloatLogo className="w-6 h-6" />
            <span className="font-bold text-lg tracking-tight uppercase text-slate-900 dark:text-white">FLOAT</span>
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <a href="/models" className="text-slate-900 dark:text-white">Hub</a>
            <a href="/models/usage" className="text-slate-500 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-white transition-colors">Usage</a>
            <a href="/models/evals" className="text-slate-500 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-white transition-colors">Evals</a>
          </nav>`);
fs.writeFileSync(p1, c1);

const p2 = 'src/features/models/ModelsFilteredPage.tsx';
let c2 = fs.readFileSync(p2, 'utf8');
c2 = c2.replace('<FloatLogo className="w-6 h-6" />\n            <span className="font-bold text-lg tracking-tight uppercase text-slate-900 dark:text-white">FLOAT</span>\n          </a>',
  `<FloatLogo className="w-6 h-6" />
            <span className="font-bold text-lg tracking-tight uppercase text-slate-900 dark:text-white">FLOAT</span>
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <a href="/models" className="text-slate-900 dark:text-white">Hub</a>
            <a href="/models/usage" className="text-slate-500 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-white transition-colors">Usage</a>
            <a href="/models/evals" className="text-slate-500 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-white transition-colors">Evals</a>
          </nav>`);
fs.writeFileSync(p2, c2);

