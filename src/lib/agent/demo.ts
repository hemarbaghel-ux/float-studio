/**
 * Offline demo agent. Speaks the same tool-calling protocol as real providers so every UI path
 * (streaming, thinking, tool cards, diffs, checkpoints, terminal) works without an API key.
 */
import type { HistItem, Provider, ProviderToolCall } from './providers';

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      rej(new DOMException('Aborted', 'AbortError'));
    });
  });

async function streamOut(text: string, emit: (d: string) => void, signal: AbortSignal, speed = 12) {
  const tokens = text.match(/\s+|[^\s]+/g) ?? [];
  for (const t of tokens) {
    emit(t);
    if (t.trim()) await sleep(speed, signal);
  }
}

const call = (name: string, args: Record<string, unknown>): ProviderToolCall => ({
  id: `demo_${name}_${Math.random().toString(36).slice(2, 8)}`,
  name,
  args,
});

function calculatorApp() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Calculator</title>
<style>
  :root { --bg:#0f1115; --key:#1b1e25; --key2:#272b34; --accent:#f59e0b; --fg:#f4f5f7; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); font-family: Inter, system-ui, sans-serif; color:var(--fg); }
  .calc { width: 320px; padding: 20px; border-radius: 24px; background:#15171c; box-shadow: 0 30px 80px rgba(0,0,0,.45); }
  .screen { text-align:right; padding: 12px 8px 20px; }
  .expr { min-height: 20px; color:#8b909c; font-size: 14px; overflow-wrap:anywhere; }
  .out { font-size: 44px; font-weight: 600; overflow-wrap:anywhere; }
  .keys { display:grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  button { height: 60px; border: 0; border-radius: 16px; background: var(--key); color: var(--fg); font-size: 20px; cursor: pointer; transition: transform .06s, background .15s; }
  button:hover { background: var(--key2); }
  button:active { transform: scale(.96); }
  .op { background:#2a2417; color: var(--accent); }
  .eq { background: var(--accent); color:#111; grid-column: span 2; }
  .fn { color:#b7bcc8; }
</style>
</head>
<body>
<div class="calc" role="application" aria-label="Calculator">
  <div class="screen"><div class="expr" id="expr"></div><div class="out" id="out">0</div></div>
  <div class="keys" id="keys"></div>
</div>
<script>
const layout = ['C','±','%','÷','7','8','9','×','4','5','6','−','1','2','3','+','0','.','='];
const keys = document.getElementById('keys'), out = document.getElementById('out'), exprEl = document.getElementById('expr');
let expr = '';
const isOp = (k) => '+−×÷'.includes(k);
layout.forEach((k) => {
  const b = document.createElement('button');
  b.textContent = k;
  b.className = k === '=' ? 'eq' : isOp(k) ? 'op' : 'CE±%'.includes(k) ? 'fn' : '';
  b.onclick = () => press(k);
  keys.appendChild(b);
});
// Safe shunting-yard evaluator (no eval)
function evaluate(s) {
  const toks = s.match(/\\d*\\.?\\d+|[+\\-*/()]/g) || [];
  const prec = { '+':1, '-':1, '*':2, '/':2 }, outQ = [], ops = [];
  toks.forEach((t) => {
    if (!isNaN(t)) outQ.push(parseFloat(t));
    else { while (ops.length && prec[ops[ops.length-1]] >= prec[t]) outQ.push(ops.pop()); ops.push(t); }
  });
  while (ops.length) outQ.push(ops.pop());
  const st = [];
  outQ.forEach((t) => {
    if (typeof t === 'number') return st.push(t);
    const b = st.pop(), a = st.pop();
    st.push(t === '+' ? a + b : t === '-' ? a - b : t === '*' ? a * b : a / b);
  });
  const r = st[0];
  return Number.isFinite(r) ? +r.toPrecision(12) : 'Error';
}
const norm = (e) => e.replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-');
function press(k) {
  if (k === 'C') expr = '';
  else if (k === '=') { exprEl.textContent = expr; expr = String(evaluate(norm(expr))); }
  else if (k === '±') expr = expr.startsWith('-') ? expr.slice(1) : '-' + expr;
  else if (k === '%') expr = String(evaluate(norm(expr)) / 100);
  else if (isOp(k) && isOp(expr.slice(-1))) expr = expr.slice(0, -1) + k;
  else expr += k;
  out.textContent = expr || '0';
}
window.addEventListener('keydown', (e) => {
  const map = { '*':'×', '/':'÷', '-':'−', Enter:'=', '=':'=', Escape:'C', Backspace:'⌫' };
  const k = map[e.key] || e.key;
  if (k === '⌫') { expr = expr.slice(0,-1); out.textContent = expr || '0'; return; }
  if (layout.includes(k)) press(k);
});
</script>
</body>
</html>
`;
}

function todoApp() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Todo</title>
<style>
  body { font-family: Inter, system-ui, sans-serif; background:#f6f7f9; margin:0; display:grid; place-items:start center; padding-top:10vh; }
  .app { width:min(440px, 92vw); background:#fff; border-radius:16px; padding:24px; box-shadow:0 10px 40px rgba(0,0,0,.06); }
  form { display:flex; gap:8px; } input { flex:1; padding:10px 12px; border:1px solid #e3e5ea; border-radius:10px; }
  button { padding:10px 14px; border:0; border-radius:10px; background:#111; color:#fff; cursor:pointer; }
  li { display:flex; align-items:center; gap:10px; padding:10px 4px; border-bottom:1px solid #f0f1f4; }
  li.done span { text-decoration: line-through; color:#9aa0ab; } li button { margin-left:auto; background:none; color:#9aa0ab; }
  ul { list-style:none; padding:0; }
</style>
</head>
<body>
<div class="app"><h2>Tasks</h2>
<form id="f"><input id="i" placeholder="Add a task…" autofocus /><button>Add</button></form>
<ul id="l"></ul><small id="c"></small></div>
<script>
const KEY = 'float-todos';
let todos = JSON.parse(localStorage.getItem(KEY) || '[]');
const save = () => { localStorage.setItem(KEY, JSON.stringify(todos)); render(); };
function render() {
  l.innerHTML = '';
  todos.forEach((t, idx) => {
    const li = document.createElement('li'); li.className = t.done ? 'done' : '';
    li.innerHTML = '<input type="checkbox" ' + (t.done ? 'checked' : '') + '><span></span><button aria-label="Delete">✕</button>';
    li.querySelector('span').textContent = t.text;
    li.querySelector('input').onchange = () => { t.done = !t.done; save(); };
    li.querySelector('button').onclick = () => { todos.splice(idx, 1); save(); };
    l.appendChild(li);
  });
  c.textContent = todos.filter(t => !t.done).length + ' remaining';
}
f.onsubmit = (e) => { e.preventDefault(); if (!i.value.trim()) return; todos.push({ text: i.value.trim(), done: false }); i.value = ''; save(); };
render();
</script>
</body>
</html>
`;
}

function dashboardApp() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Dashboard</title>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<style>
  * { box-sizing:border-box; } body { margin:0; font-family: Inter, system-ui, sans-serif; background:#f6f7f9; color:#111; }
  .wrap { max-width:1100px; margin:0 auto; padding:24px; }
  .grid { display:grid; gap:16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .card { background:#fff; border:1px solid #eceef2; border-radius:14px; padding:18px; }
  .kpi { font-size:28px; font-weight:700; margin-top:6px; } .lbl { color:#6b7280; font-size:13px; }
  .up { color:#16a34a; font-size:12px; } .down { color:#dc2626; font-size:12px; }
  .bars { display:flex; align-items:flex-end; gap:6px; height:160px; margin-top:12px; }
  .bar { flex:1; background:#111; border-radius:6px 6px 0 0; opacity:.85; transition: height .4s; }
  header { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:12px; }
  select { padding:8px 10px; border-radius:8px; border:1px solid #e3e5ea; }
</style>
</head>
<body>
<div id="root"></div>
<script>
const h = React.createElement;
function App() {
  const [range, setRange] = React.useState('7d');
  const n = range === '7d' ? 7 : range === '30d' ? 30 : 12;
  const data = React.useMemo(() => Array.from({ length: n }, () => 20 + Math.round(Math.random() * 80)), [range]);
  const kpis = [['Revenue', '$48.2k', '+12.4%', true], ['Active users', '8,904', '+4.1%', true], ['Churn', '2.3%', '-0.4%', true], ['Latency p95', '182 ms', '+9 ms', false]];
  return h('div', { className: 'wrap' },
    h('header', null, h('h1', { style: { margin: 0, fontSize: 22 } }, 'Overview'),
      h('select', { value: range, onChange: (e) => setRange(e.target.value) }, ['7d', '30d', '12m'].map((r) => h('option', { key: r, value: r }, 'Last ' + r)))),
    h('div', { className: 'grid' }, kpis.map(([l, v, d, good]) => h('div', { className: 'card', key: l },
      h('div', { className: 'lbl' }, l), h('div', { className: 'kpi' }, v), h('div', { className: good ? 'up' : 'down' }, d)))),
    h('div', { className: 'card', style: { marginTop: 16 } }, h('div', { className: 'lbl' }, 'Sessions'),
      h('div', { className: 'bars' }, data.map((v, i) => h('div', { key: i, className: 'bar', style: { height: v + '%' }, title: v })))));
}
ReactDOM.createRoot(document.getElementById('root')).render(h(App));
</script>
</body>
</html>
`;
}

function genericApp(prompt: string) {
  const title = prompt.replace(/^(please\s+)?(build|create|make|scaffold|generate)\s+(me\s+)?(an?\s+)?/i, '').slice(0, 60) || 'New app';
  const safe = title.replace(/[<>&"]/g, '');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safe}</title>
<style>
  body { margin:0; font-family: Inter, system-ui, sans-serif; background:#0f1115; color:#f4f5f7; min-height:100vh; display:grid; place-items:center; }
  .hero { text-align:center; padding:40px; max-width:640px; }
  h1 { font-size: clamp(28px, 5vw, 48px); margin: 0 0 12px; letter-spacing:-.02em; text-transform: capitalize; }
  p { color:#a6abb8; line-height:1.6; }
  button { margin-top:16px; padding:12px 18px; border-radius:12px; border:0; background:#f59e0b; color:#111; font-weight:600; cursor:pointer; }
</style>
</head>
<body>
<section class="hero">
  <h1>${safe}</h1>
  <p>Scaffolded by FLOAT. Ask the agent to add sections, data, or interactivity.</p>
  <button onclick="this.textContent='It works ✓'">Get started</button>
</section>
</body>
</html>
`;
}

function guessTestTarget(listing: string) {
  const files = listing.split('\n').filter((f) => /\.(m?js|ts)$/.test(f) && !/\.(test|spec)\./.test(f) && !/app\.js$/.test(f));
  return files.find((f) => f.includes('math')) ?? files[0] ?? 'src/math.js';
}

function makeTests(target: string, source: string) {
  const fns = [...source.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]);
  const exported = fns.length ? fns : ['add'];
  const rel = './' + target.split('/').pop()!.replace(/\.(m?js|ts)$/, '');
  const cases = exported
    .map((fn) => {
      if (/add|sum/i.test(fn)) return `  it('${fn} adds two numbers', () => {\n    expect(${fn}(2, 3)).toBe(5);\n    expect(${fn}(-1, 1)).toBe(0);\n  });`;
      if (/div/i.test(fn))
        return `  it('${fn} divides numbers', () => {\n    expect(${fn}(10, 4)).toBeCloseTo(2.5);\n  });\n\n  it('${fn} throws on zero divisor', () => {\n    expect(() => ${fn}(1, 0)).toThrow();\n  });`;
      if (/sub/i.test(fn)) return `  it('${fn} subtracts', () => {\n    expect(${fn}(5, 3)).toBe(2);\n  });`;
      if (/mul/i.test(fn)) return `  it('${fn} multiplies', () => {\n    expect(${fn}(4, 3)).toBe(12);\n  });`;
      return `  it('${fn} is defined', () => {\n    expect(typeof ${fn}).toBe('function');\n  });`;
    })
    .join('\n\n');
  return `const { ${exported.join(', ')} } = require('${rel}');\n\ndescribe('${target}', () => {\n${cases}\n});\n`;
}

const EXPLAIN_ASYNCIO = `## How the asyncio event loop works

The **event loop** is a single-threaded scheduler that runs coroutines cooperatively:

1. **Coroutines** (\`async def\`) are paused functions. Calling one returns a coroutine object — nothing runs yet.
2. **Tasks** wrap coroutines and register them with the loop (\`asyncio.create_task\`).
3. The loop repeatedly:
   - runs every *ready* callback/task until it hits an \`await\` on something not finished,
   - asks the OS selector (\`epoll\`/\`kqueue\`) which sockets/timers are ready,
   - moves the corresponding futures to *done* and schedules their waiters.
4. \`await\` = "yield control back to the loop until this future resolves".

\`\`\`python
import asyncio

async def fetch(i):
    await asyncio.sleep(1)   # yields to the loop, doesn't block
    return i * 2

async def main():
    results = await asyncio.gather(*(fetch(i) for i in range(3)))
    print(results)  # [0, 2, 4] after ~1s, not 3s

asyncio.run(main())
\`\`\`

**Pitfalls:** blocking calls (\`time.sleep\`, heavy CPU) freeze the whole loop — use \`await asyncio.to_thread(fn)\` or a process pool.`;

function lastUserIndex(h: HistItem[]) {
  for (let i = h.length - 1; i >= 0; i--) if (h[i].role === 'user') return i;
  return -1;
}

export const demoProvider: Provider = async ({ history, tools, signal, onText, onThinking }) => {
  const ui = lastUserIndex(history);
  const prompt = ui >= 0 ? (history[ui] as { text: string }).text : '';
  const after = history.slice(ui + 1);
  const toolResults = after.filter((h) => h.role === 'tool') as Extract<HistItem, { role: 'tool' }>[];
  const step = after.filter((h) => h.role === 'assistant').length;
  const canUseTools = tools.length > 0;
  const has = (n: string) => tools.some((t) => t.name === n);
  const p = prompt.toLowerCase();

  const think = async (t: string) => {
    for (const w of t.match(/\s+|[^\s]+/g) ?? []) {
      onThinking(w);
      if (w.trim()) await sleep(6, signal);
    }
  };
  const say = async (t: string) => {
    await streamOut(t, onText, signal);
    return t;
  };
  const done = async (t: string) => ({ text: await say(t), toolCalls: [] });

  // ----- Explanations / ask-mode
  if (/asyncio|event loop/.test(p)) {
    if (step === 0) await think('The user wants a conceptual explanation; no workspace changes needed.');
    return done(EXPLAIN_ASYNCIO);
  }

  // ----- Unit tests
  if (canUseTools && /\b(unit )?tests?\b|spec/.test(p) && !/build|calculator|dashboard/.test(p)) {
    if (step === 0) {
      await think('I should inspect the workspace, find a module to test, then write tests and run them.');
      const t = await say("I'll look at the project structure first.\n\n");
      return { text: t, toolCalls: [call('list_files', {})] };
    }
    if (step === 1) {
      const target = guessTestTarget(toolResults[0]?.output ?? '');
      const t = await say(`\`${target}\` looks like the best candidate. Reading it.\n\n`);
      return { text: t, toolCalls: [call('read_file', { path: target })] };
    }
    if (step === 2) {
      const target = guessTestTarget(toolResults[0]?.output ?? '');
      const src = (toolResults[1]?.output ?? '').replace(/^\s*\d+\| /gm, '');
      const testPath = target.replace(/\.(m?js|ts)$/, '.test.js');
      const t = await say(`Writing tests for every exported function in \`${target}\`, including edge cases.\n\n`);
      return { text: t, toolCalls: [call('write_file', { path: testPath, content: makeTests(target, src) })] };
    }
    if (step === 3 && has('run_command')) {
      const t = await say('Running the test suite.\n\n');
      return { text: t, toolCalls: [call('run_command', { command: 'npm test' })] };
    }
    const run = toolResults[3]?.output ?? '';
    if (run.includes('active session'))
      return done('Tests are written. **Start a cloud session** from the banner above the composer, then ask me to run `npm test` to execute them.');
    const passed = /\[exit code 0\]/.test(run);
    return done(passed ? 'All tests pass ✅. The suite covers happy paths and the error case.' : 'Some tests failed — see the terminal output above. Want me to fix the implementation?');
  }

  // ----- Debug / fix
  if (canUseTools && /\b(debug|fix|bug|error|race condition|broken)\b/.test(p)) {
    if (step === 0) {
      await think('Search the codebase for likely problem areas before proposing a fix.');
      const t = await say('Let me search the codebase for related code.\n\n');
      const q = /auth/.test(p) ? 'auth|token|session|login' : 'TODO|FIXME|throw|catch|error';
      return { text: t, toolCalls: [call('search_files', { query: q })] };
    }
    const hits = toolResults[0]?.output ?? '';
    if (/race condition|auth/.test(p))
      return done(
        `${hits === 'No matches.' ? "I couldn't find auth code in this workspace, so here's the general fix.\n\n" : ''}## Debugging an auth race condition\n\n**Typical cause:** two requests refresh an expired token at the same time; the second refresh invalidates the first, so one request retries with a revoked token.\n\n**Fix — single-flight refresh:**\n\n\`\`\`ts\nlet refreshing: Promise<string> | null = null;\n\nexport async function getToken() {\n  if (!isExpired(current)) return current.access;\n  refreshing ??= refresh().finally(() => (refreshing = null));\n  return refreshing; // every caller awaits the same promise\n}\n\`\`\`\n\nAlso: guard UI state updates with a request id so stale responses can't overwrite newer ones, and make logout cancel in-flight requests with an \`AbortController\`.`,
      );
    return done(`Here's what I found:\n\n\`\`\`\n${hits.slice(0, 1200)}\n\`\`\`\n\nTell me which behaviour is wrong and I'll patch it with a targeted \`edit_file\`.`);
  }

  // ----- Build something
  if (canUseTools && /\b(build|create|make|scaffold|generate|add)\b/.test(p)) {
    const kind = /calc/.test(p) ? 'calculator' : /todo|task/.test(p) ? 'todo' : /dashboard|analytics|admin/.test(p) ? 'dashboard' : 'app';
    const path = kind === 'app' ? 'app.html' : `${kind}.html`;
    if (step === 0) {
      await think(`Plan: inspect workspace → create ${path} as a self-contained page → verify → summarize.`);
      const t = await say(`I'll build a ${kind === 'app' ? 'new page' : kind}. First, checking what's already in the workspace.\n\n`);
      return { text: t, toolCalls: [call('list_files', {})] };
    }
    if (step === 1) {
      const content = kind === 'calculator' ? calculatorApp() : kind === 'todo' ? todoApp() : kind === 'dashboard' ? dashboardApp() : genericApp(prompt);
      const t = await say(`Creating \`${path}\` with markup, styles and logic in one file so it previews instantly.\n\n`);
      return { text: t, toolCalls: [call('write_file', { path, content })] };
    }
    return done(
      `Done. I created **\`${path}\`**:\n\n${
        kind === 'calculator'
          ? '- 4-function calculator with a safe shunting-yard evaluator (no `eval`)\n- Keyboard support (digits, operators, Enter, Esc, Backspace)\n- Responsive dark UI'
          : kind === 'dashboard'
            ? '- React KPI cards with deltas\n- Range selector (7d / 30d / 12m) driving a bar chart\n- Responsive auto-fit grid'
            : kind === 'todo'
              ? '- Add / complete / delete tasks\n- Persists to localStorage\n- Remaining counter'
              : '- Responsive hero section\n- Ready to extend with more sections'
      }\n\nOpen **Codebase → Preview** and select \`${path}\` to try it. Review the change with **Accept / Reject** in the chat header.`,
    );
  }

  // ----- Fallback conversation
  if (step === 0) await think('General question; answer directly and point to configuration if relevant.');
  return done(
    `You're using the **Float Demo** agent, which runs fully offline. It can build pages (try *"Build a calculator"*), write and run unit tests, and debug code in your workspace.\n\nFor open-ended answers, add a **Gemini** or **OpenAI-compatible** key in **Integrations** — the model picker's **Auto** mode will then route each request to the best model.\n\n> You asked: "${prompt.slice(0, 200)}"`,
  );
};
