// Patterns to exclude from indexing and retrieval
const SENSITIVE_SEGMENTS = /^(?:\.env(?:$|\.)|\.git$|node_modules$|vendor$|dist$|build$|coverage$|\.next$|\.cache$|\.venv$|venv$|\.ssh$|\.aws$|\.npmrc$|\.pypirc$|\.netrc$|\.ds_store$|id_rsa(?:$|\.)|id_ed25519(?:$|\.)|credentials\.json$|__pycache__$)/i;

const SENSITIVE_EXTENSIONS = /\.(?:pem|key|p12|pfx|keystore|crt|cer)$/i;

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'svgz',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'zip', 'tar', 'gz', 'tgz', '7z', 'rar', 'bz2',
  'exe', 'dll', 'so', 'dylib', 'bin', 'wasm',
  'mp3', 'wav', 'ogg', 'mp4', 'mov', 'avi', 'mkv',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'pyc', 'pyo', 'pyd', 'class', 'o', 'obj'
]);

export function normalizeWorkspacePath(rawPath: string): string {
  if (!rawPath || typeof rawPath !== 'string') return '';
  return rawPath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

export function isPathTraversal(rawPath: string): boolean {
  if (!rawPath) return true;
  const normalized = rawPath.replace(/\\/g, '/').trim();
  if (normalized.includes('\0') || /^[a-z]:/i.test(normalized)) return true;
  const parts = normalized.split('/');
  return parts.some(p => p === '..');
}

export function isSensitivePath(filePath: string): boolean {
  const norm = normalizeWorkspacePath(filePath);
  if (!norm) return true;
  const segments = norm.split('/');
  return segments.some(seg => SENSITIVE_SEGMENTS.test(seg)) || SENSITIVE_EXTENSIONS.test(norm);
}

export function isBinaryFile(filePath: string, content?: string): boolean {
  const norm = normalizeWorkspacePath(filePath);
  const ext = norm.split('.').pop()?.toLowerCase();
  if (ext && BINARY_EXTENSIONS.has(ext)) {
    return true;
  }

  if (content && typeof content === 'string') {
    // Check for null characters
    if (content.includes('\0')) return true;

    // Check ratio of non-printable ASCII in first 1024 characters
    const sample = content.slice(0, 1024);
    if (sample.length > 0) {
      let nonPrintable = 0;
      for (let i = 0; i < sample.length; i++) {
        const code = sample.charCodeAt(i);
        // Allow common whitespace: \t (9), \n (10), \r (13)
        if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
          nonPrintable++;
        }
      }
      if (nonPrintable / sample.length > 0.2) {
        return true;
      }
    }
  }

  return false;
}

export function sanitizePath(rawPath: string): { safePath: string; error?: string } {
  if (!rawPath || typeof rawPath !== 'string') {
    return { safePath: '', error: 'Path is required.' };
  }
  const norm = normalizeWorkspacePath(rawPath);
  if (isPathTraversal(rawPath)) {
    return { safePath: '', error: 'Path traversal (../) is strictly forbidden.' };
  }
  if (isSensitivePath(norm)) {
    return { safePath: '', error: `Access to sensitive path "${norm}" is forbidden.` };
  }
  if (isBinaryFile(norm)) {
    return { safePath: '', error: `Binary file "${norm}" is excluded from text operations.` };
  }
  return { safePath: norm };
}

export function shouldIndexFile(filePath: string, content?: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;
  if (isPathTraversal(filePath)) return false;
  const norm = normalizeWorkspacePath(filePath);
  if (isSensitivePath(norm)) return false;
  if (isBinaryFile(norm, content)) return false;
  return true;
}
