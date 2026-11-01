import type { AIContextItem, FileNode } from '../../types';
import { flattenFileTree } from '../../lib/utils';
import { searchCodebase } from '../../services/codebaseSearch';
import { sanitizePath } from '../../services/indexing/fileFilter';

const MAX_AUTO_RESULTS = 6;
const MAX_EXPLICIT_FILE_CHARS = 8_000;
const CODE_INTENT = /\b(build|create|implement|add|fix|debug|refactor|change|update|remove|delete|review|test|explain|trace|find|locate|search|code|file|function|class|component|hook|api|route|compiler|error|bug|crash|stack|import|export|type|interface|src|npm|python|react|typescript|javascript|auth|login|database|schema)\b/i;
const utf8Bytes = (text: string) => new TextEncoder().encode(text).byteLength;

/**
 * Keep project-wide file contents in the browser. Send only explicitly mentioned
 * files and a small set of local retrieval excerpts to the chat API.
 */
export function buildChatContextItems(
  prompt: string,
  workspace: FileNode[],
  projectId: string,
  activeFilePath?: string,
): AIContextItem[] {
  const files = flattenFileTree(workspace)
    .filter((file) => file.type === 'file' && typeof file.content === 'string')
    .flatMap((file) => {
      const rawPath = file.path || file.name;
      const { safePath, error } = sanitizePath(rawPath);
      if (error || !safePath) return [];
      return [{ ...file, path: safePath }];
    });
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const context: AIContextItem[] = [];
  const includedPaths = new Set<string>();

  for (const match of prompt.matchAll(/@([\w./-]+)/g)) {
    const { safePath, error } = sanitizePath(match[1].replace(/[.,;!?]+$/, ''));
    if (error || !safePath || includedPaths.has(safePath)) continue;
    const file = filesByPath.get(safePath);
    if (!file) continue;
    const content = file.content || '';
    context.push({
      id: `explicit-${safePath}`,
      type: 'attachment',
      name: safePath,
      path: safePath,
      content: content.length > MAX_EXPLICIT_FILE_CHARS
        ? `${content.slice(0, MAX_EXPLICIT_FILE_CHARS)}\n... [Selected file excerpt limited to ${MAX_EXPLICIT_FILE_CHARS} characters]`
        : content,
      sizeBytes: utf8Bytes(content),
    });
    includedPaths.add(safePath);
  }

  const shouldRetrieve = CODE_INTENT.test(prompt) || /\b[A-Z][a-z0-9]+[A-Z][\w$]*\b/.test(prompt);
  if (!shouldRetrieve || !files.length) return context;

  const matches = searchCodebase(files, prompt, {
    projectId,
    activeFilePath,
    maxResults: MAX_AUTO_RESULTS,
    contextLines: 3,
  });
  for (const match of matches) {
    const { safePath, error } = sanitizePath(match.filePath);
    if (error || !safePath || includedPaths.has(safePath) || !match.contentExcerpt) continue;
    context.push({
      id: `retrieval-${safePath}-${match.startLine}`,
      type: 'search_match',
      name: safePath,
      path: safePath,
      content: match.contentExcerpt,
      startLine: match.startLine,
      endLine: match.endLine,
      sizeBytes: utf8Bytes(match.contentExcerpt),
    });
    includedPaths.add(safePath);
  }

  return context;
}
