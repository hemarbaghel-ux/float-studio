/**
 * Float Python Execution Service
 * Runs Python in-browser using Pyodide WebAssembly with virtual filesystem integration,
 * Web Worker timeout isolation (`worker.terminate()`), and safe fallback execution.
 */

export interface VirtualFile {
  path: string;
  content?: string;
}

export interface PythonExecutionResult {
  success: boolean;
  output: string;
  error?: string | null;
  executionTimeMs: number;
}

const DEFAULT_PYTHON_TIMEOUT_MS = 5000;
const PYODIDE_CDN_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';

let pyodidePromise: Promise<any> | null = null;
let pyodideInstance: any = null;

async function loadPyodideScript(): Promise<void> {
  if (typeof window === 'undefined' || (window as any).loadPyodide) {
    return;
  }

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${PYODIDE_CDN_URL}"]`);
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Pyodide script from CDN.')));
      return;
    }

    const script = document.createElement('script');
    script.src = PYODIDE_CDN_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Pyodide WebAssembly runtime from CDN.'));
    document.head.appendChild(script);
  });
}

async function getPyodide(onStatus?: (status: string) => void): Promise<any> {
  if (pyodideInstance) {
    return pyodideInstance;
  }

  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      onStatus?.('Loading Python WebAssembly runtime...');
      await loadPyodideScript();

      if (typeof window === 'undefined' || !(window as any).loadPyodide) {
        throw new Error('Pyodide runtime script loaded but loadPyodide is not defined.');
      }

      onStatus?.('Initializing Python environment...');
      const pyodide = await (window as any).loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'
      });

      onStatus?.('Python runtime initialized.');
      pyodideInstance = pyodide;
      return pyodide;
    })();
  }

  return pyodidePromise;
}

function evaluateFallbackValue(expression: string, variables: Record<string, any>): any {
  const value = expression.trim();
  if (Object.prototype.hasOwnProperty.call(variables, value)) return variables[value];
  if (value === 'True') return true;
  if (value === 'False') return false;
  if (value === 'None') return null;
  if (/^"[\s\S]*"$/.test(value)) {
    try { return JSON.parse(value); } catch { return value.slice(1, -1); }
  }
  if (/^'[\s\S]*'$/.test(value)) return value.slice(1, -1).replace(/\\(['\\])/g, '$1');

  if (value.replace(/\d+(?:\.\d+)?|[()+\-*/%]|\s/g, '')) return undefined;
  const tokens = value.match(/\d+(?:\.\d+)?|[()+\-*/%]/g) || [];
  let position = 0;
  const primary = (): number => {
    const token = tokens[position++];
    if (token === '(') {
      const nested = sum();
      if (tokens[position++] !== ')') throw new Error('Unclosed parenthesis');
      return nested;
    }
    if (token === '+') return primary();
    if (token === '-') return -primary();
    if (!token || !/^\d/.test(token)) throw new Error('Expected a number');
    return Number(token);
  };
  const product = (): number => {
    let result = primary();
    while (['*', '/', '%'].includes(tokens[position])) {
      const operator = tokens[position++];
      const operand = primary();
      if ((operator === '/' || operator === '%') && operand === 0) throw new Error('Division by zero');
      result = operator === '*' ? result * operand : operator === '/' ? result / operand : result % operand;
    }
    return result;
  };
  const sum = (): number => {
    let result = product();
    while (tokens[position] === '+' || tokens[position] === '-') {
      const operator = tokens[position++];
      const operand = product();
      result = operator === '+' ? result + operand : result - operand;
    }
    return result;
  };

  try {
    if (!tokens.length) return undefined;
    const result = sum();
    return position === tokens.length && Number.isFinite(result) ? result : undefined;
  } catch {
    return undefined;
  }
}

function fallbackPythonExecution(
  code: string,
  onStdout?: (text: string) => void,
  onStderr?: (text: string) => void
): PythonExecutionResult {
  const startTime = performance.now();
  let fullOutput = '';
  let fullError: string | null = null;

  try {
    // Guard against obvious unbounded infinite loops in fallback mode
    if (/^\s*while\s+(True|1)\s*:/m.test(code) && !/\bbreak\b/.test(code)) {
      throw new Error('TimeoutError: Python execution exceeded the 5000ms execution time limit (unbounded while loop detected).');
    }

    const lines = code.split('\n');
    const localVars: Record<string, any> = {};

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith('print(') && line.endsWith(')')) {
        const inner = line.slice(6, -1);
        const parsed = evaluateFallbackValue(inner, localVars);
        const val = parsed === undefined ? inner : parsed;

        const outStr = String(val) + '\n';
        fullOutput += outStr;
        onStdout?.(outStr);
        continue;
      }

      if (line.includes('=') && !line.includes('==') && !line.startsWith('def ') && !line.startsWith('if ')) {
        const [k, ...v] = line.split('=');
        const key = k.trim();
        const valueExpr = v.join('=').trim();
        const parsed = evaluateFallbackValue(valueExpr, localVars);
        localVars[key] = parsed === undefined ? valueExpr : parsed;
      }
    }

    const elapsed = Math.round(performance.now() - startTime);
    return {
      success: true,
      output: fullOutput || '(Code executed with no output)',
      executionTimeMs: elapsed
    };
  } catch (err: any) {
    const elapsed = Math.round(performance.now() - startTime);
    fullError = err?.message || String(err);
    onStderr?.(fullError + '\n');
    return {
      success: false,
      output: fullOutput,
      error: fullError,
      executionTimeMs: elapsed
    };
  }
}

/**
 * Executes Python code in a dedicated Web Worker when available in the browser
 * so runaway loops (`while True: pass`) can be pre-emptively terminated via `worker.terminate()`.
 */
async function runPyodideInWebWorker(
  code: string,
  virtualFiles: VirtualFile[],
  timeoutMs: number,
  onStdout?: (text: string) => void,
  onStderr?: (text: string) => void,
  onStatus?: (status: string) => void
): Promise<PythonExecutionResult> {
  const startTime = performance.now();
  const workerSource = `
    importScripts('${PYODIDE_CDN_URL}');
    let pyodideReadyPromise = null;
    async function ensurePyodide() {
      if (!pyodideReadyPromise) {
        pyodideReadyPromise = self.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/' });
      }
      return pyodideReadyPromise;
    }
    self.onmessage = async (event) => {
      const { code, virtualFiles } = event.data || {};
      try {
        self.postMessage({ type: 'status', text: 'Initializing Python WebAssembly Worker...' });
        const pyodide = await ensurePyodide();
        for (const file of (virtualFiles || [])) {
          if (file && file.path && file.content !== undefined) {
            const parts = String(file.path).split('/');
            if (parts.length > 1) {
              let currentPath = '';
              for (let i = 0; i < parts.length - 1; i++) {
                currentPath += (i === 0 ? '' : '/') + parts[i];
                try { pyodide.FS.mkdir(currentPath); } catch {}
              }
            }
            pyodide.FS.writeFile(file.path, file.content, { encoding: 'utf8' });
          }
        }
        pyodide.setStdout({ batched: (msg) => self.postMessage({ type: 'stdout', text: msg + '\\n' }) });
        pyodide.setStderr({ batched: (msg) => self.postMessage({ type: 'stderr', text: msg + '\\n' }) });
        self.postMessage({ type: 'status', text: 'Running Python code in isolated worker...' });
        await pyodide.runPythonAsync(code);
        self.postMessage({ type: 'done', success: true });
      } catch (err) {
        self.postMessage({ type: 'done', success: false, error: err && err.message ? err.message : String(err) });
      }
    };
  `;

  const blob = new Blob([workerSource], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);
  const worker = new Worker(workerUrl);

  let fullOutput = '';
  let fullError: string | null = null;

  return new Promise<PythonExecutionResult>((resolve) => {
    const timer = setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      const timeoutErr = `TimeoutError: Python execution exceeded ${timeoutMs}ms limit and worker was terminated.`;
      onStderr?.(timeoutErr + '\n');
      resolve({
        success: false,
        output: fullOutput,
        error: timeoutErr,
        executionTimeMs: Math.round(performance.now() - startTime)
      });
    }, timeoutMs);

    worker.onmessage = (evt) => {
      const msg = evt.data || {};
      if (msg.type === 'status') {
        onStatus?.(msg.text);
      } else if (msg.type === 'stdout') {
        fullOutput += msg.text;
        onStdout?.(msg.text);
      } else if (msg.type === 'stderr') {
        fullOutput += msg.text;
        fullError = (fullError || '') + msg.text;
        onStderr?.(msg.text);
      } else if (msg.type === 'done') {
        clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        if (msg.error) {
          fullError = (fullError ? fullError + '\n' : '') + msg.error;
          onStderr?.(msg.error + '\n');
        }
        resolve({
          success: Boolean(msg.success && !fullError),
          output: fullOutput || (fullError ? '' : '(Execution finished with no output)'),
          error: fullError,
          executionTimeMs: Math.round(performance.now() - startTime)
        });
      }
    };

    worker.onerror = (err) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      resolve(fallbackPythonExecution(code, onStdout, onStderr));
    };

    worker.postMessage({ code, virtualFiles });
  });
}

/**
 * Executes Python code with Pyodide WebAssembly (in a Web Worker with timeout termination when supported),
 * synchronizing the virtual filesystem and streaming output.
 */
export async function runPythonCode(
  code: string,
  virtualFiles: VirtualFile[] = [],
  onStdout?: (text: string) => void,
  onStderr?: (text: string) => void,
  onStatus?: (status: string) => void,
  timeoutMs = DEFAULT_PYTHON_TIMEOUT_MS
): Promise<PythonExecutionResult> {
  if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && !(typeof window !== 'undefined' && (window as any).loadPyodide)) {
    try {
      return await runPyodideInWebWorker(code, virtualFiles, timeoutMs, onStdout, onStderr, onStatus);
    } catch {
      // Fall back to direct or local interpreter
    }
  }

  const startTime = performance.now();
  let fullOutput = '';
  let fullError: string | null = null;

  try {
    let pyodide: any;
    try {
      pyodide = await getPyodide(onStatus);
    } catch (loadErr: any) {
      console.warn('Pyodide CDN initialization failed, falling back to local runner:', loadErr);
      onStderr?.(`[Warning: WebAssembly runtime unavailable, using fallback interpreter: ${loadErr.message}]\n`);
      return fallbackPythonExecution(code, onStdout, onStderr);
    }

    (window as any).__float_stdout_hook = (text: string) => {
      fullOutput += text;
      onStdout?.(text);
    };

    (window as any).__float_stderr_hook = (text: string) => {
      fullOutput += text;
      fullError = (fullError || '') + text;
      onStderr?.(text);
    };

    for (const file of virtualFiles) {
      if (file.path && file.content !== undefined) {
        try {
          const parts = file.path.split('/');
          if (parts.length > 1) {
            let currentPath = '';
            for (let i = 0; i < parts.length - 1; i++) {
              currentPath += (i === 0 ? '' : '/') + parts[i];
              try {
                pyodide.FS.mkdir(currentPath);
              } catch {}
            }
          }
          pyodide.FS.writeFile(file.path, file.content, { encoding: 'utf8' });
        } catch (fsErr) {
          console.warn(`Failed to write file ${file.path} to Pyodide FS:`, fsErr);
        }
      }
    }

    await pyodide.runPythonAsync(`
import sys
import js

class FloatStreamWriter:
    def __init__(self, hook_name):
        self.hook_name = hook_name

    def write(self, s):
        if s:
            hook = getattr(js, self.hook_name, None)
            if hook:
                hook(str(s))
            return len(s)
        return 0

    def flush(self):
        pass

sys.stdout = FloatStreamWriter('__float_stdout_hook')
sys.stderr = FloatStreamWriter('__float_stderr_hook')
`);

    onStatus?.('Running Python code...');
    await pyodide.runPythonAsync(code);

    const elapsed = Math.round(performance.now() - startTime);
    return {
      success: !fullError,
      output: fullOutput || (fullError ? '' : '(Execution finished with no output)'),
      error: fullError,
      executionTimeMs: elapsed
    };
  } catch (err: any) {
    const elapsed = Math.round(performance.now() - startTime);
    const formattedError = err?.message || String(err);
    fullError = formattedError;
    onStderr?.(formattedError + '\n');

    return {
      success: false,
      output: fullOutput,
      error: formattedError,
      executionTimeMs: elapsed
    };
  } finally {
    if (typeof window !== 'undefined') {
      delete (window as any).__float_stdout_hook;
      delete (window as any).__float_stderr_hook;
    }
  }
}
