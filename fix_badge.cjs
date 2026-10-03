const fs = require('fs');
let code = fs.readFileSync('src/features/evals/EvalsTasks.tsx', 'utf8');

code = code.replace(
  `function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {`,
  `function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const norm = (difficulty || '').toLowerCase();`
);

code = code.replace(
  `  const colors = {
    Easy: 'text-green-400 bg-green-400/10 border-green-400/20',
    Medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    Hard: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
    Expert: 'text-red-400 bg-red-400/10 border-red-400/20'
  };
  return (
    <span className={\`px-2 py-0.5 rounded text-xs border \${colors[difficulty]}\`}>
      {difficulty}
    </span>
  );`,
  `  const colors: Record<string, string> = {
    easy: 'text-green-400 bg-green-400/10 border-green-400/20',
    medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    hard: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
    expert: 'text-red-400 bg-red-400/10 border-red-400/20'
  };
  return (
    <span className={\`px-2 py-0.5 rounded text-xs border \${colors[norm] || colors.medium} capitalize\`}>
      {difficulty}
    </span>
  );`
);

fs.writeFileSync('src/features/evals/EvalsTasks.tsx', code);
