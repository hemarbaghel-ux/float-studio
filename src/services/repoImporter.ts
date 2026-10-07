import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';
import { FileNode } from '../types';
import { apiFetch } from './api';

const PRIVATE_PATH = /(^|\/)(\.env(?:$|[./])|\.git(?:$|\/)|id_rsa(?:$|\.)|id_ed25519(?:$|\.))|\.(pem|key|p12|pfx|keystore)$/i;
const OMIT_DIR = /(^|\/)(node_modules|vendor|dist|build|coverage|\.next|\.cache|\.venv|venv)(\/|$)/i;
const BINARY_EXTENSION = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|eot|mp[34]|mov|wasm|exe|dll|so|dylib|bin|lockb)$/i;
const MAX_IMPORT_FILES = 500;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10 MB

export function isImportablePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.includes('\0')) return false;
  if (normalized.split('/').some(p => !p || p === '.' || p === '..')) return false;
  if (PRIVATE_PATH.test(normalized) || OMIT_DIR.test(normalized) || BINARY_EXTENSION.test(normalized)) return false;
  return true;
}

export function buildFileTreeFromMap(files: Map<string, string>): FileNode[] {
  const root: FileNode[] = [];
  const sortedPaths = [...files.keys()].sort((a, b) => a.localeCompare(b));

  for (const filePath of sortedPaths) {
    const content = files.get(filePath) || '';
    const segments = filePath.split('/');
    let currentLevel = root;

    for (let i = 0; i < segments.length; i++) {
      const name = segments[i];
      const isFile = i === segments.length - 1;

      let existing = currentLevel.find(node => node.name === name && node.type === (isFile ? 'file' : 'folder'));

      if (!existing) {
        existing = isFile
          ? { id: `file-${uuidv4()}`, name, type: 'file', content }
          : { id: `folder-${uuidv4()}`, name, type: 'folder', children: [], isOpen: true };
        currentLevel.push(existing);
      } else if (isFile) {
        existing.content = content;
      }

      if (!isFile) {
        existing.children = existing.children || [];
        currentLevel = existing.children;
      }
    }
  }

  return root;
}

export interface ImportRepoResult {
  success: boolean;
  projectId?: string;
  projectName?: string;
  files?: FileNode[];
  error?: string;
}

/**
 * Downloads the repository archive from the server via authorized GitHub OAuth connection,
 * unpacks the text files in the browser using JSZip, and returns a reconstructed FileNode hierarchy.
 */
export async function importGitHubRepository(
  owner: string,
  repo: string,
  ref?: string
): Promise<ImportRepoResult> {
  try {
    const url = `/api/integrations/github/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/archive${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`;
    const response = await apiFetch(url);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errData.error || `Failed to download repository archive (HTTP ${response.status}).`
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const entries = Object.values(zip.files).filter(entry => !entry.dir);

    // GitHub zipballs contain a root directory wrapper (e.g. `owner-repo-commit/`)
    const stripTop = entries.length > 0 && entries.every(e => e.name.includes('/')) && new Set(entries.map(e => e.name.split('/')[0])).size === 1;

    const fileMap = new Map<string, string>();
    let totalBytes = 0;

    for (const entry of entries) {
      const rawPath = stripTop ? entry.name.split('/').slice(1).join('/') : entry.name;
      if (!isImportablePath(rawPath)) continue;

      if (fileMap.size >= MAX_IMPORT_FILES) {
        break; // Guard against excessively large repos
      }

      const content = await entry.async('string');
      if (content.includes('\0')) continue; // Skip binary

      const size = new TextEncoder().encode(content).length;
      if (totalBytes + size > MAX_TOTAL_BYTES) break;

      totalBytes += size;
      fileMap.set(rawPath, content);
    }

    if (fileMap.size === 0) {
      return {
        success: false,
        error: 'No valid text files found to import in this repository.'
      };
    }

    const files = buildFileTreeFromMap(fileMap);
    const newProjectId = uuidv4();
    const projectName = repo;

    return {
      success: true,
      projectId: newProjectId,
      projectName,
      files
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to import repository.'
    };
  }
}
