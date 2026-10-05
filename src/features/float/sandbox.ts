/**
 * Float browser worker: executes JavaScript from the virtual codebase inside an isolated
 * Web Worker with a CommonJS loader, a Jest-compatible test runner, and a small POSIX-ish shell.
 */
import { normalizePath } from './projectIO';

const WORKER_SRC = String.raw`
const out = [];
const log = (...a) => out.push(a.map(fmt).join(' '));
function fmt(v){ if(typeof v==='string') return v; try{ return JSON.stringify(v,null,0);}catch(e){ return String(v);} }
const fakeConsole = { log, info: log, warn: (...a)=>log('[warn]',...a), error: (...a)=>log('[error]',...a), debug: log, table: (d)=>log(JSON.stringify(d,null,2)) };

function esmToCjs(src){
  return src
    .replace(/^\s*import\s+([\w$]+)\s*,\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/gm, (m,d,n,p)=>'const '+d+' = require("'+p+'").default ?? require("'+p+'"); const {'+n.replace(/\sas\s/g,': ')+'} = require("'+p+'");')
    .replace(/^\s*import\s+\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/gm, (m,n,p)=>'const {'+n.replace(/\sas\s/g,': ')+'} = require("'+p+'");')
    .replace(/^\s*import\s+\*\s+as\s+([\w$]+)\s+from\s*['"]([^'"]+)['"];?/gm, 'const $1 = require("$2");')
    .replace(/^\s*import\s+([\w$]+)\s+from\s*['"]([^'"]+)['"];?/gm, (m,d,p)=>'const '+d+' = (r=>r && r.__esModule ? r.default : (r.default ?? r))(require("'+p+'"));')
    .replace(/^\s*import\s+['"]([^'"]+)['"];?/gm, 'require("$1");')
    .replace(/^\s*export\s+default\s+/gm, 'module.exports.__esModule = true; module.exports.default = ')
    .replace(/^\s*export\s+(async\s+function|function|class)\s+([\w$]+)/gm, (m,k,n)=>{ pendingExports.push(n); return k+' '+n; })
    .replace(/^\s*export\s+(const|let|var)\s+([\w$]+)/gm, (m,k,n)=>{ pendingExports.push(n); return k+' '+n; })
    .replace(/^\s*export\s+\{([^}]+)\};?/gm, (m,n)=> n.split(',').map(s=>s.trim()).filter(Boolean).map(s=>{ const [a,b]=s.split(/\s+as\s+/); return 'module.exports["'+(b||a)+'"] = '+a+';'; }).join('\n'));
}
let pendingExports = [];

function makeRequire(files, fromDir, cache){
  return function require(spec){
    if(!spec.startsWith('.') && !spec.startsWith('/')){
      if(spec==='assert'||spec==='node:assert') return assertMod;
      if(spec==='util'||spec==='node:util') return { inspect: fmt, format: (...a)=>a.map(fmt).join(' ') };
      if(spec==='path'||spec==='node:path') return pathMod;
      throw new Error("Cannot find module '"+spec+"' (npm packages are not installed in the Float sandbox)");
    }
    const base = norm((spec.startsWith('/')?'':fromDir) + spec);
    const cands = [base, base+'.js', base+'.mjs', base+'.cjs', base+'.ts', base+'.json', base+'/index.js'];
    const path = cands.find(c => c in files);
    if(!path) throw new Error("Cannot find module '"+spec+"' from '"+(fromDir||'./')+"'");
    return load(files, path, cache);
  };
}
function norm(p){ const a=[]; for(const s of p.split('/')){ if(!s||s==='.') continue; if(s==='..') a.pop(); else a.push(s);} return a.join('/'); }
const pathMod = { join:(...a)=>norm(a.join('/')), resolve:(...a)=>'/'+norm(a.join('/')), basename:(p)=>p.split('/').pop(), dirname:(p)=>p.split('/').slice(0,-1).join('/')||'.', extname:(p)=>{const m=p.match(/\.[^./]+$/); return m?m[0]:'';} };
function load(files, path, cache){
  if(cache[path]) return cache[path].exports;
  const module = { exports: {} };
  cache[path] = module;
  if(path.endsWith('.json')){ module.exports = JSON.parse(files[path]); return module.exports; }
  pendingExports = [];
  let src = esmToCjs(files[path]);
  if(path.endsWith('.ts')) src = src.replace(/:\s*[A-Za-z_$][\w$<>\[\]|, ]*(?=[,)=;{])/g,'').replace(/^\s*(export\s+)?(interface|type)\s+[\s\S]*?^}/gm,'');
  if(pendingExports.length) src += '\n' + pendingExports.map(n=>'module.exports["'+n+'"] = '+n+';').join('\n');
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')+1) : '';
  const fn = new Function('require','module','exports','console','__filename','__dirname','process', src);
  fn(makeRequire(files, dir, cache), module, module.exports, fakeConsole, path, dir, { env: {}, argv: ['node', path], exit(){}, cwd:()=>'/workspace' });
  return module.exports;
}

// ---------- assert & expect ----------
function deepEqual(a,b){ if(Object.is(a,b)) return true; if(typeof a!=='object'||typeof b!=='object'||!a||!b) return false; if(Array.isArray(a)!==Array.isArray(b)) return false; const ka=Object.keys(a), kb=Object.keys(b); if(ka.length!==kb.length) return false; return ka.every(k=>deepEqual(a[k],b[k])); }
const assertMod = Object.assign((v,m)=>{ if(!v) throw new Error(m||'Assertion failed'); }, {
  ok:(v,m)=>{ if(!v) throw new Error(m||'Assertion failed'); },
  equal:(a,b,m)=>{ if(a!=b) throw new Error(m||fmt(a)+' == '+fmt(b)); },
  strictEqual:(a,b,m)=>{ if(a!==b) throw new Error(m||'Expected '+fmt(b)+' but got '+fmt(a)); },
  deepStrictEqual:(a,b,m)=>{ if(!deepEqual(a,b)) throw new Error(m||'Expected '+fmt(b)+' but got '+fmt(a)); },
  deepEqual:(a,b,m)=>{ if(!deepEqual(a,b)) throw new Error(m||'Expected '+fmt(b)+' but got '+fmt(a)); },
  throws:(fn,m)=>{ let t=false; try{fn();}catch(e){t=true;} if(!t) throw new Error(m||'Expected function to throw'); },
});
function expect(actual){
  const make = (neg) => {
    const check = (pass, msg) => { if(neg ? pass : !pass) throw new Error((neg?'[not] ':'')+msg); };
    const m = {
      toBe:(e)=>check(Object.is(actual,e),'Expected '+fmt(actual)+' to be '+fmt(e)),
      toEqual:(e)=>check(deepEqual(actual,e),'Expected '+fmt(actual)+' to equal '+fmt(e)),
      toStrictEqual:(e)=>check(deepEqual(actual,e),'Expected '+fmt(actual)+' to strictly equal '+fmt(e)),
      toBeTruthy:()=>check(!!actual,'Expected '+fmt(actual)+' to be truthy'),
      toBeFalsy:()=>check(!actual,'Expected '+fmt(actual)+' to be falsy'),
      toBeNull:()=>check(actual===null,'Expected '+fmt(actual)+' to be null'),
      toBeUndefined:()=>check(actual===undefined,'Expected value to be undefined'),
      toBeDefined:()=>check(actual!==undefined,'Expected value to be defined'),
      toBeNaN:()=>check(Number.isNaN(actual),'Expected NaN'),
      toBeGreaterThan:(e)=>check(actual>e,'Expected '+fmt(actual)+' > '+fmt(e)),
      toBeGreaterThanOrEqual:(e)=>check(actual>=e,'Expected '+fmt(actual)+' >= '+fmt(e)),
      toBeLessThan:(e)=>check(actual<e,'Expected '+fmt(actual)+' < '+fmt(e)),
      toBeLessThanOrEqual:(e)=>check(actual<=e,'Expected '+fmt(actual)+' <= '+fmt(e)),
      toBeCloseTo:(e,d=2)=>check(Math.abs(actual-e)<Math.pow(10,-d)/2,'Expected '+fmt(actual)+' to be close to '+fmt(e)),
      toContain:(e)=>check(actual!=null && actual.includes(e),'Expected '+fmt(actual)+' to contain '+fmt(e)),
      toHaveLength:(n)=>check(actual!=null && actual.length===n,'Expected length '+n+' but got '+(actual&&actual.length)),
      toHaveProperty:(k)=>check(actual!=null && k in Object(actual),'Expected property '+k),
      toMatch:(r)=>check(new RegExp(r).test(actual),'Expected '+fmt(actual)+' to match '+r),
      toBeInstanceOf:(c)=>check(actual instanceof c,'Expected instance of '+(c&&c.name)),
      toThrow:(e)=>{ let thrown=null; try{ actual(); }catch(err){ thrown=err; } const ok = !!thrown && (e===undefined || (typeof e==='string' ? String(thrown.message).includes(e) : e instanceof RegExp ? e.test(thrown.message) : thrown instanceof e)); check(ok, 'Expected function to throw'+(e?' '+fmt(String(e)):'')+(thrown?' but got: '+thrown.message:'')); },
    };
    m.toThrowError = m.toThrow;
    return m;
  };
  const api = make(false);
  api.not = make(true);
  api.resolves = new Proxy({}, { get:(_,k)=>async(...a)=>expect(await actual)[k](...a) });
  api.rejects = new Proxy({}, { get:(_,k)=>async(...a)=>{ let err; try{ await actual; }catch(e){ err=e; } return expect(()=>{ if(err) throw err; })[k](...a); } });
  return api;
}

async function runTests(files, testFiles){
  const lines = []; let pass=0, fail=0; const t0 = Date.now();
  for(const tf of testFiles){
    const suites = []; let stack = [{ name: '', tests: [], before: [], after: [], beforeAll: [], afterAll: [] }];
    const cur = () => stack[stack.length-1];
    const g = self;
    g.describe = (name, fn) => { const s = { name, tests: [], before: [...cur().before], after: [...cur().after], beforeAll: [], afterAll: [] }; cur().tests.push({ suite: s }); stack.push(s); fn(); stack.pop(); };
    g.it = g.test = (name, fn) => cur().tests.push({ name, fn });
    g.it.skip = g.test.skip = (name) => cur().tests.push({ name, skip: true });
    g.beforeEach = (fn) => cur().before.push(fn); g.afterEach = (fn) => cur().after.push(fn);
    g.beforeAll = (fn) => cur().beforeAll.push(fn); g.afterAll = (fn) => cur().afterAll.push(fn);
    g.expect = expect;
    g.jest = { fn: (impl=()=>{}) => { const f = (...a)=>{ f.mock.calls.push(a); return impl(...a); }; f.mock = { calls: [] }; return f; } };
    const fileLines = []; let fileFail = 0;
    try { load(files, tf, {}); } catch(e){ fileLines.push('  ● Test suite failed to run: '+e.message); fileFail++; fail++; }
    async function runSuite(s, depth){
      for(const f of s.beforeAll) await f();
      for(const t of s.tests){
        const pad = '  '.repeat(depth+1);
        if(t.suite){ fileLines.push(pad+t.suite.name); await runSuite(t.suite, depth+1); continue; }
        if(t.skip){ fileLines.push(pad+'○ '+t.name+' (skipped)'); continue; }
        const st = Date.now();
        try{ for(const b of s.before) await b(); await t.fn(); for(const a of s.after) await a(); pass++; fileLines.push(pad+'✓ '+t.name+' ('+(Date.now()-st)+' ms)'); }
        catch(e){ fail++; fileFail++; fileLines.push(pad+'✕ '+t.name); fileLines.push(pad+'    '+(e && e.message || e)); }
      }
      for(const f of s.afterAll) await f();
    }
    await runSuite(stack[0], 0);
    lines.push((fileFail? 'FAIL ' : 'PASS ') + tf, ...fileLines, '');
  }
  lines.push('Tests:       ' + (fail? fail+' failed, ' : '') + pass + ' passed, ' + (pass+fail) + ' total');
  lines.push('Test Suites: ' + testFiles.length + ' total');
  lines.push('Time:        ' + ((Date.now()-t0)/1000).toFixed(2) + ' s');
  return { text: lines.join('\n'), code: fail ? 1 : 0 };
}

self.onmessage = async (ev) => {
  const { files, mode, entry, tests } = ev.data;
  try {
    if (mode === 'test') {
      const r = await runTests(files, tests);
      self.postMessage({ output: (out.length ? out.join('\n') + '\n' : '') + r.text, code: r.code });
    } else {
      const res = load(files, entry, {});
      if (res && typeof res.then === 'function') await res;
      await new Promise(r => setTimeout(r, 30));
      self.postMessage({ output: out.join('\n'), code: 0 });
    }
  } catch (e) {
    self.postMessage({ output: (out.length ? out.join('\n') + '\n' : '') + (e && e.stack ? String(e.stack).split('\n').slice(0,3).join('\n') : String(e)), code: 1 });
  }
};
`;

let workerUrl: string | null = null;

function runInWorker(payload: Record<string, unknown>, timeoutMs = 8000): Promise<{ output: string; code: number }> {
  if (!workerUrl) workerUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
  return new Promise((resolve) => {
    const w = new Worker(workerUrl!);
    const timer = setTimeout(() => {
      w.terminate();
      resolve({ output: `Process killed: exceeded ${timeoutMs / 1000}s time limit`, code: 124 });
    }, timeoutMs);
    w.onmessage = (e) => {
      clearTimeout(timer);
      w.terminate();
      resolve(e.data);
    };
    w.onerror = (e) => {
      clearTimeout(timer);
      w.terminate();
      resolve({ output: String(e.message || e), code: 1 });
    };
    w.postMessage(payload);
  });
}

export interface ShellFs {
  files: () => Record<string, string>;
  write: (p: string, c: string) => void;
  remove: (p: string) => void;
}

const HELP = `FLOAT browser worker — supported commands:
  ls [dir]  tree  cat <file>  head/tail <file>  wc -l <file>  grep <pattern> [path]
  echo <text> [> file]  touch <file>  rm <file>  mkdir <dir>  pwd  clear
  node <file.js>  npm test | npm run test | npx jest | npx vitest run  npm run <script>`;

export async function runShell(command: string, fs: ShellFs): Promise<{ output: string; code: number }> {
  const segments = command.split(/\s*&&\s*/).filter(Boolean);
  const outputs: string[] = [];
  for (const seg of segments) {
    const r = await runOne(seg.trim(), fs);
    if (r.output) outputs.push(r.output);
    if (r.code !== 0) return { output: outputs.join('\n'), code: r.code };
  }
  return { output: outputs.join('\n'), code: 0 };
}

function tokenize(s: string) {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

async function runOne(cmd: string, fs: ShellFs): Promise<{ output: string; code: number }> {
  const files = fs.files();
  const paths = Object.keys(files).sort();
  const [bin, ...args] = tokenize(cmd);
  const p = (x?: string) => normalizePath(x ?? '');
  switch (bin) {
    case undefined:
      return { output: '', code: 0 };
    case 'help':
      return { output: HELP, code: 0 };
    case 'pwd':
      return { output: '/workspace', code: 0 };
    case 'clear':
      return { output: '', code: 0 };
    case 'ls': {
      const dir = p(args.find((a) => !a.startsWith('-')));
      const prefix = dir ? dir + '/' : '';
      const set = new Set<string>();
      for (const f of paths) if (f.startsWith(prefix)) set.add(f.slice(prefix.length).split('/')[0] + (f.slice(prefix.length).includes('/') ? '/' : ''));
      if (!set.size && dir) return { output: `ls: cannot access '${dir}': No such file or directory`, code: 2 };
      return { output: [...set].join('\n'), code: 0 };
    }
    case 'tree':
      return { output: ['.', ...paths.map((f) => '├── ' + f)].join('\n'), code: 0 };
    case 'cat':
    case 'head':
    case 'tail': {
      const f = p(args.filter((a) => !a.startsWith('-')).pop());
      if (!(f in files)) return { output: `${bin}: ${f}: No such file or directory`, code: 1 };
      const lines = files[f].split('\n');
      return { output: bin === 'cat' ? files[f] : (bin === 'head' ? lines.slice(0, 10) : lines.slice(-10)).join('\n'), code: 0 };
    }
    case 'wc': {
      const f = p(args.filter((a) => !a.startsWith('-')).pop());
      if (!(f in files)) return { output: `wc: ${f}: No such file or directory`, code: 1 };
      return { output: `${files[f].split('\n').length} ${f}`, code: 0 };
    }
    case 'grep': {
      const flags = args.filter((a) => a.startsWith('-')).join('');
      const [pat, where] = args.filter((a) => !a.startsWith('-'));
      if (!pat) return { output: 'usage: grep <pattern> [path]', code: 2 };
      const re = new RegExp(pat, flags.includes('i') ? 'i' : '');
      const scope = where ? p(where) : '';
      const hits: string[] = [];
      for (const f of paths) {
        if (scope && !(f === scope || f.startsWith(scope + '/'))) continue;
        files[f].split('\n').forEach((l, i) => re.test(l) && hits.push(`${f}:${i + 1}:${l}`));
      }
      return { output: hits.slice(0, 200).join('\n'), code: hits.length ? 0 : 1 };
    }
    case 'echo': {
      const gt = args.indexOf('>');
      if (gt >= 0) {
        fs.write(p(args[gt + 1]), args.slice(0, gt).join(' ') + '\n');
        return { output: '', code: 0 };
      }
      return { output: args.join(' '), code: 0 };
    }
    case 'touch':
      for (const a of args) if (!(p(a) in files)) fs.write(p(a), '');
      return { output: '', code: 0 };
    case 'mkdir':
      return { output: '', code: 0 };
    case 'rm':
      for (const a of args.filter((x) => !x.startsWith('-'))) fs.remove(p(a));
      return { output: '', code: 0 };
    case 'node': {
      if (args[0] === '-e') {
        return runInWorker({ files: { ...files, '__eval.js': args.slice(1).join(' ') }, mode: 'run', entry: '__eval.js' });
      }
      const f = p(args[0]);
      if (!(f in files)) return { output: `node: cannot find module '${f}'`, code: 1 };
      return runInWorker({ files, mode: 'run', entry: f });
    }
    case 'npm':
    case 'npx':
    case 'yarn':
    case 'pnpm': {
      const sub = args.join(' ');
      if (/^(test|t|run test|jest.*|vitest.*|float-test)$/.test(sub)) {
        const tests = paths.filter((f) => /\.(test|spec)\.(m?js|ts)$/.test(f));
        if (!tests.length) return { output: 'No tests found. Create files matching *.test.js', code: 1 };
        const r = await runInWorker({ files, mode: 'test', tests }, 15000);
        return { output: `> ${bin} ${sub}\n\n${r.output}`, code: r.code };
      }
      const runScript = sub.match(/^run (\S+)/);
      if (runScript) {
        let pkg: { scripts?: Record<string, string> } = {};
        try {
          pkg = JSON.parse(files['package.json'] ?? '{}');
        } catch {
          /* ignore */
        }
        const script = pkg.scripts?.[runScript[1]];
        if (!script) return { output: `npm ERR! Missing script: "${runScript[1]}"`, code: 1 };
        if (script === 'float-test') return runOne('npm test', fs);
        return runOne(script, fs);
      }
      if (/^(i|install|ci|add)\b/.test(sub)) return { output: 'Package installation is unavailable in the browser worker. Run this command in the isolated project terminal.', code: 1 };
      return { output: `${bin}: '${sub}' is not supported in the Float sandbox`, code: 1 };
    }
    default:
      return { output: `${bin}: command not found\n\n${HELP}`, code: 127 };
  }
}

const SHELL_BINS = new Set(['ls', 'tree', 'cat', 'head', 'tail', 'wc', 'grep', 'echo', 'touch', 'mkdir', 'rm', 'pwd', 'node', 'npm', 'npx', 'yarn', 'pnpm']);

/** True when the command should be handled by the Float browser worker shell (not Pyodide). */
export function isShellCommand(cmd: string) {
  const first = cmd.trim().split(/\s+/)[0];
  return SHELL_BINS.has(first) || cmd.includes('&&');
}
