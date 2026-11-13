/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as path from '../../../../../base/common/path.js';

function getNodeFs(): any | null {
  try {
    if (typeof process !== 'undefined' && (process as any).versions?.node) {
      const req = (globalThis as any).require;
      if (typeof req === 'function') {
        return req('fs');
      }
    }
  } catch {
    // In sandboxed browser environment
  }
  return null;
}

const EXCLUDED_DIRECTORIES = new Set([
  '.git', '.svn', '.hg',
  'node_modules', 'dist', 'build', 'out', '.build',
  '.gemini', '.vscode', '.idea',
  '.ssh', '.aws', '.azure', '.config', '.gnupg', '.kube', '.docker',
  '.npm', '.local', 'secrets', '.secrets', 'secret', 'credentials', 'private'
]);

const SENSITIVE_FILE_PATTERNS = [
  /(^|\/)\.env(?:\.[^/]*)?$/i,
  /(^|\/)(?:\.npmrc|\.pnpmrc|\.pypirc|\.netrc|\.git-credentials|\.gitconfig|\.yarnrc\.yml)$/i,
  /(^|\/)\.cargo\/credentials(?:\.[^/]*)?$/i,
  /(^|\/)(?:id_(?:rsa|ed25519|ecdsa|dsa)[^/]*|[^/]+\.(?:pem|key|crt|cer|der|p12|pfx|jks|keystore|ppk|tfstate))$/i,
  /(^|\/)[^/]*(?:credential|client[_-]?secret|service[-_]?account|adminsdk|private[_-]?key|access[_-]?token|refresh[_-]?token)[^/]*\.(?:json|ya?ml|txt)$/i,
  /(^|\/)(?:credentials?|secrets?|token|auth)\.(?:json|ya?ml|txt)$/i
];

export function isComposerSandboxExcludedDirectory(directoryName: string): boolean {
  return EXCLUDED_DIRECTORIES.has(directoryName.toLowerCase());
}

export function isComposerSandboxSensitivePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.split('/').some(segment => isComposerSandboxExcludedDirectory(segment))) {
    return true;
  }
  return SENSITIVE_FILE_PATTERNS.some(pattern => pattern.test(normalized));
}

export interface IComposerWorkspaceCopyStats {
  directoriesCopied: number;
  filesCopied: number;
  filesSkipped: number;
}

/**
 * Copies ordinary project files into a disposable Composer workspace.
 * Symlinks, special files, VCS/dependency directories, common credential
 * stores, dotenv files and private-key material are deliberately excluded.
 */
export function copyComposerWorkspace(
  sourceRoot: string,
  destinationRoot: string,
  extraExcludedPaths: ReadonlySet<string> = new Set()
): IComposerWorkspaceCopyStats {
  const fs = getNodeFs();
  if (!fs) {
    return { directoriesCopied: 0, filesCopied: 0, filesSkipped: 0 };
  }
  const source = fs.realpathSync(sourceRoot);
  const destination = path.resolve(destinationRoot);
  const sourceToDestination = path.relative(source, destination);
  const destinationToSource = path.relative(destination, source);

  const isWithin = (relative: string): boolean =>
    relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));

  if (isWithin(sourceToDestination) || isWithin(destinationToSource)) {
    throw new Error('Composer workspace copy source and destination must be disjoint directories.');
  }
  if (!fs.statSync(source).isDirectory()) {
    throw new Error('Composer workspace source must be a directory.');
  }

  fs.mkdirSync(destination, { recursive: true });
  const stats: IComposerWorkspaceCopyStats = { directoriesCopied: 0, filesCopied: 0, filesSkipped: 0 };

  const visit = (currentSource: string, currentDestination: string, prefix: string): void => {
    for (const entry of fs.readdirSync(currentSource, { withFileTypes: true })) {
      const relativePath = prefix ? prefix + '/' + entry.name : entry.name;
      const normalized = relativePath.replace(/\\/g, '/');
      if (isComposerSandboxSensitivePath(normalized) || extraExcludedPaths.has(normalized)) {
        stats.filesSkipped++;
        continue;
      }

      const sourcePath = path.join(currentSource, entry.name);
      const destinationPath = path.join(currentDestination, entry.name);

      // Dirent checks deliberately avoid following symlinks and special files.
      if (entry.isDirectory()) {
        fs.mkdirSync(destinationPath, { recursive: true });
        stats.directoriesCopied++;
        visit(sourcePath, destinationPath, normalized);
      } else if (entry.isFile()) {
        const sourceStat = fs.lstatSync(sourcePath);
        if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
          stats.filesSkipped++;
          continue;
        }
        fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
        stats.filesCopied++;
      } else {
        stats.filesSkipped++;
      }
    }
  };

  visit(source, destination, '');
  return stats;
}
