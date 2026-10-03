import type { Chat, Codebase } from './types';

const now = Date.now();
const min = 60_000;

export const SEED_FILES: Record<string, string> = {
  'README.md': `# float-starter\n\nA tiny sandbox project. Ask FLOAT to build on it, write tests, or fix bugs.\n\n- \`index.html\` — entry page (open the Preview tab)\n- \`src/math.js\` — utility functions\n- \`src/math.test.js\` — unit tests (run \`npm test\` in a cloud session)\n`,
  'package.json': `{\n  "name": "float-starter",\n  "version": "0.1.0",\n  "scripts": {\n    "test": "float-test"\n  }\n}\n`,
  'index.html': `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>Float Starter</title>\n  <link rel="stylesheet" href="styles.css" />\n</head>\n<body>\n  <main class="card">\n    <h1>Hello from FLOAT</h1>\n    <p>Edit <code>index.html</code> or ask the agent to build something.</p>\n    <button id="btn">Clicked 0 times</button>\n  </main>\n  <script src="src/app.js"></script>\n</body>\n</html>\n`,
  'styles.css': `body {\n  font-family: system-ui, sans-serif;\n  display: grid;\n  place-items: center;\n  min-height: 100vh;\n  margin: 0;\n  background: #f5f6f8;\n}\n.card {\n  background: white;\n  padding: 32px;\n  border-radius: 16px;\n  box-shadow: 0 8px 30px rgba(0,0,0,.06);\n}\nbutton {\n  padding: 8px 14px;\n  border-radius: 8px;\n  border: 1px solid #ddd;\n  cursor: pointer;\n}\n`,
  'src/app.js': `let count = 0;\nconst btn = document.getElementById('btn');\nbtn.addEventListener('click', () => {\n  count += 1;\n  btn.textContent = \`Clicked \${count} time\${count === 1 ? '' : 's'}\`;\n});\n`,
  'src/math.js': `function add(a, b) {\n  return a + b;\n}\n\nfunction divide(a, b) {\n  if (b === 0) throw new Error('Division by zero');\n  return a / b;\n}\n\nmodule.exports = { add, divide };\n`,
  'src/math.test.js': `const { add, divide } = require('./math');\n\ndescribe('math', () => {\n  it('adds numbers', () => {\n    expect(add(2, 3)).toBe(5);\n  });\n  it('throws on divide by zero', () => {\n    expect(() => divide(1, 0)).toThrow('Division by zero');\n  });\n});\n`,
};

export function seedCodebase(): Codebase {
  const files: Codebase['files'] = {};
  for (const [p, c] of Object.entries(SEED_FILES)) files[p] = { content: c, updatedAt: now };
  return { name: 'float-starter', files, openTabs: ['index.html'], activePath: 'index.html' };
}

function simpleChat(id: string, title: string, agoMin: number, q: string, a: string): Chat {
  const t = now - agoMin * min;
  return {
    id,
    title,
    createdAt: t,
    updatedAt: t,
    changes: [],
    source: 'user',
    messages: [
      { id: id + '-u', role: 'user', createdAt: t, parts: [{ type: 'text', text: q }] },
      { id: id + '-a', role: 'assistant', createdAt: t + 4000, model: 'float-demo', parts: [{ type: 'text', text: a }] },
    ],
  };
}

export function seedChats(): Chat[] {
  return [
    simpleChat('seed-1', 'Build calculator', 29, 'Build calculator', 'I scaffolded a calculator in `calculator.html`. Open the **Codebase → Preview** tab to try it. Want keyboard support next?'),
    simpleChat('seed-2', 'Write a unit test', 32, 'Write a unit test for src/math.js', 'Added `src/math.test.js` covering `add` and `divide` (including the divide-by-zero error). Start a cloud session and run `npm test` to execute it.'),
    simpleChat('seed-3', 'build calc', 62, 'build calc', 'Sure — do you want a basic four-function calculator or a scientific one?'),
    simpleChat('seed-4', 'build calc', 75, 'build calc', 'Here is a minimal plan:\n\n1. `calculator.html` layout\n2. Button grid with CSS grid\n3. Expression evaluation with a safe parser'),
    simpleChat('seed-5', 'Agent Tools overview', 180, 'What tools can the agent use?', 'The FLOAT agent can `list_files`, `read_file`, `write_file`, `edit_file`, `delete_file`, `search_files`, and `run_command` (requires an active cloud session).'),
    simpleChat('seed-6', 'Fix navbar overflow', 60 * 26, 'The navbar overflows on mobile', 'Wrap the links in a flex container with `flex-wrap: wrap` and hide secondary links below 640px behind a menu button.'),
  ];
}
