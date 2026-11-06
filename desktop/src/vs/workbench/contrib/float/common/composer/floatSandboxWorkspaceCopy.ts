/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import path from 'node:path';

const EXCLUDED_DIRECTORIES = new Set([
  '.git', '.svn', '.hg',
  'node_modules', 'dist', 'build', 'out', '.build',
  '.gemini', '.vscode', '.idea',
  '.ssh', '.aws', '.azure', '.config', '.gnupg', '.kube', '.docker',
  '.npm', 'secrets', 'secret', 'credentials'
]);

const SENSITIVE_FILE_PATTERNS = [
  /(^|\/)\.env(?:\.[^/]*)?$/i,
  /(^|\/)(?:\.npmrc|\.pypirc|\.netrc|\.git-credentials|\.gitconfig|\.yarnrc\.yml)$/i,
  /(^|\/)(?:id_(?:rsa|ed25519|ecdsa|dsa)[^/]*|[^/]+\.(?:pem|key|p12|pfx|jks|keystore|ppk|tfstate))$/i,
  /(^|\/)(?:credentials?|client[_-]?secret[^/]*|service[-_]account[^/]*|serviceAccount[^/]*|token|auth)\.json$/i
];

export interface IComposerWorkspaceCopyStats {
  directoriesCopied: number;
  filesCopied: number;
  filesSkipped: number;
}

/**
 * Copies only ordinary project files into a disposable Composer workspace.
 * Symlinks, special files, VCS directories, dependency folders and common
 * credential/configuration files are deliberately excluded.
 */
export function copyComposerWorkspace(
  sourceRoot: string,
  destinationRoot: string,
  extraExcludedPaths: ReadonlySet<string> = new Set()
): IComposerWorkspaceCopyStats {
  const source = fs.realpathSync(sourceRoot);
  const destination = path.resolve(destinationRoot);
  const sourceToDestination = path.relative(source, destination);
  const destinationToSource = path.relative(destination, source);

  if (sourceToDestination === '' || (!sourceToDestination.startsWith('..' + path.sep) && sourceToDestination !== '..' && !path.isAbsolute(sourceToDestination))) {
    throw new Error('Composer workspace copy destination must not be inside the source workspace.');
  }
  if (destinationToSource === '' || (!destinationToSource.startsWith('..' + path.sep) && destinationToSource !== '..' && !path.isAbsolute(destinationToSource))) {
    throw new Error('Composer workspace copy destination must not contain the source workspace.');
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
      const segments = normalized.split('/');
      const excludedByDirectory = segments.some(segment => EXCLUDED_DIRECTORIES.has(segment.toLowerCase()));
      const excludedByFile = SENSITIVE_FILE_PATTERNS.some(pattern => pattern.test(normalized));
      if (excludedByDirectory || excludedByFile || extraExcludedPaths.has(normalized)) {
        stats.filesSkipped++;
        continue;
      }

      const sourcePath = path.join(currentSource, entry.name);
      const destinationPath = path.join(currentDestination, entry.name);

      // Dirent checks avoid following symlinks and exclude sockets/devices/FIFOs.
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
