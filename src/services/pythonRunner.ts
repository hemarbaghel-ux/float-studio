/**
 * Float Python Execution Service
 * Runs Python in-browser using Pyodide WebAssembly with virtual filesystem integration.
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

// Global Pyodide singleton promise to ensure single initialization
let pyodidePromise: Promise<any> | null = null;
let pyodideInstance: any = null;

const PYODIDE_CDN_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';

/**
 * Loads Pyodide script dynamically from CDN into the browser runtime
 */
async function loadPyodideScript(): Promise<void> {
  if ((window as any).loadPyodide) {
    return;
  }

  return new Promise((resolve, reject) => {
    // Check if script tag already exists
    const existingScript = document.querySelector(`script[src="${PYODIDE_CDN_URL}"]`);
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', (e) => reject(new Error('Failed to load Pyodide script from CDN.')));
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

/**
 * Initializes and caches the Pyodide instance
 */
async function getPyodide(onStatus?: (status: string) => void): Promise<any> {
  if (pyodideInstance) {
    return pyodideInstance;
  }

  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      onStatus?.('Loading Python WebAssembly runtime...');
      await loadPyodideScript();

      if (!(window as any).loadPyodide) {
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

/**
 * Fallback lightweight Python execution engine in case CDN / WebAssembly is blocked
 */
function fallbackPythonExecution(
  code: string,
  onStdout?: (text: string) => void,
  onStderr?: (text: string) => void
): PythonExecutionResult {
  const startTime = performance.now();
  let fullOutput = '';
  let fullError: string | null = null;

  try {
    const lines = code.split('\n');
    const localVars: Record<string, any> = {};

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      // Handle simple print(...)
      if (line.startsWith('print(') && line.endsWith(')')) {
        const inner = line.slice(6, -1);
        let val = inner;

        // Try evaluating simple strings or arithmetic
        try {
          if ((inner.startsWith('"') && inner.endsWith('"')) || (inner.startsWith("'") && inner.endsWith("'"))) {
            val = inner.slice(1, -1);
          } else if (localVars[inner] !== undefined) {
            val = String(localVars[inner]);
          } else {
            // Check for f-string or simple math
            val = eval(inner);
          }
        } catch {
          val = inner;
        }

        const outStr = String(val) + '\n';
        fullOutput += outStr;
        onStdout?.(outStr);
        continue;
      }

      // Simple assignment: var = val
      if (line.includes('=') && !line.includes('==') && !line.startsWith('def ') && !line.startsWith('if ')) {
        const [k, ...v] = line.split('=');
        const key = k.trim();
        const valueExpr = v.join('=').trim();
        try {
          localVars[key] = eval(valueExpr);
        } catch {
          localVars[key] = valueExpr;
        }
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
 * Executes Python code with real Pyodide WebAssembly runtime,
 * synchronizing the virtual filesystem and streaming output.
 */
export async function runPythonCode(
  code: string,
  virtualFiles: VirtualFile[] = [],
  onStdout?: (text: string) => void,
  onStderr?: (text: string) => void,
  onStatus?: (status: string) => void
): Promise<PythonExecutionResult> {
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

    // Set up standard output and error hooks in JavaScript
    (window as any).__float_stdout_hook = (text: string) => {
      fullOutput += text;
      onStdout?.(text);
    };

    (window as any).__float_stderr_hook = (text: string) => {
      fullOutput += text;
      fullError = (fullError || '') + text;
      onStderr?.(text);
    };

    // Synchronize virtual files into Pyodide's virtual filesystem
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
              } catch {
                // directory may already exist
              }
            }
          }
          pyodide.FS.writeFile(file.path, file.content, { encoding: 'utf8' });
        } catch (fsErr) {
          console.warn(`Failed to write file ${file.path} to Pyodide FS:`, fsErr);
        }
      }
    }

    // Configure sys.stdout and sys.stderr redirection in Python
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
    delete (window as any).__float_stdout_hook;
    delete (window as any).__float_stderr_hook;
  }
}
