/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IFloatService } from '../../common/floatService.js';
import { IFloatDaemonRuntimeService } from '../../common/daemon/floatDaemonRuntimeService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { getFloatIndexedWorkspacePath } from '../../common/daemon/floatWorkspaceIndexPath.js';
import { parseFloatMentions, IFloatMention } from './floatMentionParser.js';
import { FloatContextProvider, IFloatResolvedContext } from './floatContextProvider.js';

interface IFloatDaemonSearchMatch {
  filePath?: unknown;
  startLine?: unknown;
  endLine?: unknown;
  snippet?: unknown;
}

interface IFloatDaemonSearchResult {
  matches?: unknown;
  totalChunksIndexed?: unknown;
}

/**
 * Resolves explicit @codebase/@symbol mentions through the daemon-backed
 * semantic index. Falls back to the existing workbench indexer if the daemon
 * is unavailable or returns no relevant matches.
 */
export class FloatDaemonContextResolver {
  private readonly _fallback: FloatContextProvider;
  private readonly _maxChars = 24_000;

  constructor(
    floatService: IFloatService,
    private readonly _runtimeService?: IFloatDaemonRuntimeService,
    private readonly _workspaceContextService?: IWorkspaceContextService
  ) {
    this._fallback = new FloatContextProvider(floatService);
  }

  public async resolveContext(prompt: string, activeFilePath?: string): Promise<IFloatResolvedContext> {
    const mentions = parseFloatMentions(prompt);
    const indexedMentions = mentions.filter(mention =>
      mention.type === 'codebase' || (mention.type === 'symbol' && mention.value.length > 0)
    );
    const client = this._runtimeService?.getClient();

    if (!client || indexedMentions.length === 0) {
      return this._fallback.resolveContext(prompt, activeFilePath);
    }

    const indexedActiveFilePath = activeFilePath
      ? getFloatIndexedWorkspacePath(
          activeFilePath,
          this._workspaceContextService?.getWorkspace().folders.map(folder => folder.uri) ?? []
        )?.toLowerCase()
      : undefined;
    const normalizedActiveFilePath = activeFilePath?.replace(/\\/g, '/').toLowerCase();
    const cleanPrompt = this._stripMentions(prompt, mentions);
    const files: Array<{ path: string; excerpt: string }> = [];
    const seen = new Set<string>();
    let totalChars = 0;

    for (const mention of indexedMentions) {
      const query = mention.type === 'symbol'
        ? mention.value
        : cleanPrompt || mention.value || 'workspace overview';
      try {
        const result = await client.searchSemantics(query, mention.type === 'symbol' ? 4 : 8) as IFloatDaemonSearchResult;
        if (!Array.isArray(result?.matches)) {
          continue;
        }

        for (const rawMatch of result.matches) {
          const match = rawMatch as IFloatDaemonSearchMatch;
          const filePath = typeof match.filePath === 'string' ? match.filePath : '';
          const snippet = typeof match.snippet === 'string' ? match.snippet.trim() : '';
          const normalizedMatchPath = filePath.replace(/\\/g, '/').toLowerCase();
          const isActiveFile = indexedActiveFilePath
            ? normalizedMatchPath === indexedActiveFilePath
            : !!normalizedActiveFilePath && (
                normalizedMatchPath === normalizedActiveFilePath ||
                normalizedActiveFilePath.endsWith('/' + normalizedMatchPath)
              );
          if (isActiveFile) {
            continue;
          }
          const startLine = typeof match.startLine === 'number' ? match.startLine : undefined;
          const endLine = typeof match.endLine === 'number' ? match.endLine : undefined;

          if (!filePath || !snippet) {
            continue;
          }

          const key = `${filePath}:${startLine ?? 0}:${endLine ?? 0}`;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);

          const location = startLine
            ? `${filePath}:L${startLine}${endLine && endLine !== startLine ? `-L${endLine}` : ''}`
            : filePath;
          const excerpt = `[FLOAT semantic context: ${location}]\n${snippet}`;
          if (totalChars + excerpt.length > this._maxChars) {
            break;
          }

          files.push({ path: filePath, excerpt });
          totalChars += excerpt.length;
        }
      } catch {
        // A daemon interruption should not prevent ordinary Chat/Composer use.
      }

      if (totalChars >= this._maxChars) {
        break;
      }
    }

    if (files.length === 0) {
      return this._fallback.resolveContext(prompt, activeFilePath);
    }

    if (activeFilePath && !files.some(file => file.path === activeFilePath)) {
      const activeContext = `[Active Editor File: ${activeFilePath}]`;
      if (totalChars + activeContext.length <= this._maxChars) {
        files.unshift({ path: activeFilePath, excerpt: activeContext });
        totalChars += activeContext.length;
      }
    }

    return { files, totalChars };
  }

  private _stripMentions(prompt: string, mentions: readonly IFloatMention[]): string {
    let result = prompt;
    for (const mention of mentions) {
      result = result.replace(mention.raw, ' ');
    }
    return result.replace(/\s+/g, ' ').trim();
  }
}
