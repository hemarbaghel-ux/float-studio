export interface DiffHunkLine {
  type: 'context' | 'add' | 'del';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  id: string;
  index: number;
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  additions: number;
  deletions: number;
  originalLines: string[];
  proposedLines: string[];
  lines: DiffHunkLine[];
}

interface DiffSegment {
  type: 'equal' | 'hunk';
  lines?: string[];
  hunk?: DiffHunk;
}

function splitIntoLines(text: string = ''): string[] {
  const normalized = text.replace(/\r\n/g, '\n');
  if (normalized === '') return [];
  return normalized.split('\n');
}

/**
 * Computes an exact line-level LCS edit script between origLines and propLines.
 * Uses prefix/suffix trimming and windowed DP fallback for large files.
 */
function buildDiffSegments(original: string = '', proposed: string = ''): DiffSegment[] {
  const origLines = splitIntoLines(original);
  const propLines = splitIntoLines(proposed);

  if (origLines.length === 0 && propLines.length === 0) {
    return [];
  }

  let start = 0;
  while (
    start < origLines.length &&
    start < propLines.length &&
    origLines[start] === propLines[start]
  ) {
    start++;
  }

  let endOrig = origLines.length - 1;
  let endProp = propLines.length - 1;
  while (
    endOrig >= start &&
    endProp >= start &&
    origLines[endOrig] === propLines[endProp]
  ) {
    endOrig--;
    endProp--;
  }

  const prefixLines = origLines.slice(0, start);
  const suffixLines = origLines.slice(endOrig + 1);
  const midOrig = origLines.slice(start, endOrig + 1);
  const midProp = propLines.slice(start, endProp + 1);

  type RawOp = { type: 'equal'; line: string } | { type: 'del'; line: string } | { type: 'add'; line: string };
  const rawOps: RawOp[] = [];

  for (const line of prefixLines) {
    rawOps.push({ type: 'equal', line });
  }

  const N = midOrig.length;
  const M = midProp.length;

  if (N === 0 && M > 0) {
    for (const line of midProp) rawOps.push({ type: 'add', line });
  } else if (M === 0 && N > 0) {
    for (const line of midOrig) rawOps.push({ type: 'del', line });
  } else if (N > 0 && M > 0) {
    // Use full LCS matrix when N * M <= 400,000; otherwise line-anchor matching
    if (N * M <= 400_000) {
      const dp = new Uint32Array((N + 1) * (M + 1));
      const width = M + 1;
      for (let i = N - 1; i >= 0; i--) {
        const origLine = midOrig[i];
        const rowOffset = i * width;
        const nextRowOffset = (i + 1) * width;
        for (let j = M - 1; j >= 0; j--) {
          if (origLine === midProp[j]) {
            dp[rowOffset + j] = dp[nextRowOffset + j + 1] + 1;
          } else {
            const down = dp[nextRowOffset + j];
            const right = dp[rowOffset + j + 1];
            dp[rowOffset + j] = down >= right ? down : right;
          }
        }
      }

      let i = 0;
      let j = 0;
      while (i < N && j < M) {
        if (midOrig[i] === midProp[j]) {
          rawOps.push({ type: 'equal', line: midOrig[i] });
          i++;
          j++;
        } else if (dp[(i + 1) * width + j] >= dp[i * width + (j + 1)]) {
          rawOps.push({ type: 'del', line: midOrig[i] });
          i++;
        } else {
          rawOps.push({ type: 'add', line: midProp[j] });
          j++;
        }
      }
      while (i < N) {
        rawOps.push({ type: 'del', line: midOrig[i++] });
      }
      while (j < M) {
        rawOps.push({ type: 'add', line: midProp[j++] });
      }
    } else {
      // Fallback for huge files: single-hunk replacement of the middle slice
      for (const line of midOrig) rawOps.push({ type: 'del', line });
      for (const line of midProp) rawOps.push({ type: 'add', line });
    }
  }

  for (const line of suffixLines) {
    rawOps.push({ type: 'equal', line });
  }

  // Group rawOps into alternating 'equal' and 'hunk' segments
  const segments: DiffSegment[] = [];
  let idx = 0;
  let oldLineNum = 1;
  let newLineNum = 1;
  let hunkCounter = 0;

  while (idx < rawOps.length) {
    if (rawOps[idx].type === 'equal') {
      const eqLines: string[] = [];
      while (idx < rawOps.length && rawOps[idx].type === 'equal') {
        eqLines.push(rawOps[idx].line);
        oldLineNum++;
        newLineNum++;
        idx++;
      }
      segments.push({ type: 'equal', lines: eqLines });
    } else {
      const hunkOldStart = oldLineNum;
      const hunkNewStart = newLineNum;
      const originalLines: string[] = [];
      const proposedLines: string[] = [];

      while (idx < rawOps.length && rawOps[idx].type !== 'equal') {
        const op = rawOps[idx];
        if (op.type === 'del') {
          originalLines.push(op.line);
          oldLineNum++;
        } else if (op.type === 'add') {
          proposedLines.push(op.line);
          newLineNum++;
        }
        idx++;
      }

      hunkCounter++;
      const hunkId = `hunk-${hunkCounter}`;

      // Build display lines with up to 2 lines of surrounding context
      const displayLines: DiffHunkLine[] = [];
      const prevSeg = segments[segments.length - 1];
      if (prevSeg && prevSeg.type === 'equal' && prevSeg.lines && prevSeg.lines.length > 0) {
        const ctxCount = Math.min(2, prevSeg.lines.length);
        const startCtxIdx = prevSeg.lines.length - ctxCount;
        for (let c = 0; c < ctxCount; c++) {
          displayLines.push({
            type: 'context',
            content: prevSeg.lines[startCtxIdx + c],
            oldLineNumber: hunkOldStart - ctxCount + c,
            newLineNumber: hunkNewStart - ctxCount + c
          });
        }
      }

      for (let d = 0; d < originalLines.length; d++) {
        displayLines.push({
          type: 'del',
          content: originalLines[d],
          oldLineNumber: hunkOldStart + d
        });
      }

      for (let a = 0; a < proposedLines.length; a++) {
        displayLines.push({
          type: 'add',
          content: proposedLines[a],
          newLineNumber: hunkNewStart + a
        });
      }

      // Peek up to 2 equal lines after this hunk for trailing context
      let lookahead = idx;
      let afterCount = 0;
      while (lookahead < rawOps.length && rawOps[lookahead].type === 'equal' && afterCount < 2) {
        displayLines.push({
          type: 'context',
          content: rawOps[lookahead].line,
          oldLineNumber: oldLineNum + afterCount,
          newLineNumber: newLineNum + afterCount
        });
        lookahead++;
        afterCount++;
      }

      const oldLen = originalLines.length;
      const newLen = proposedLines.length;
      const header = `@@ -${oldLen === 0 ? Math.max(0, hunkOldStart - 1) : hunkOldStart},${oldLen} +${newLen === 0 ? Math.max(0, hunkNewStart - 1) : hunkNewStart},${newLen} @@`;

      const hunk: DiffHunk = {
        id: hunkId,
        index: hunkCounter,
        header,
        oldStart: hunkOldStart,
        oldLines: oldLen,
        newStart: hunkNewStart,
        newLines: newLen,
        additions: newLen,
        deletions: oldLen,
        originalLines,
        proposedLines,
        lines: displayLines
      };

      segments.push({ type: 'hunk', hunk });
    }
  }

  return segments;
}

export function computeDiffHunks(original: string = '', proposed: string = '', _contextLines: number = 3): DiffHunk[] {
  const segments = buildDiffSegments(original, proposed);
  const hunks: DiffHunk[] = [];
  for (const seg of segments) {
    if (seg.type === 'hunk' && seg.hunk) {
      hunks.push(seg.hunk);
    }
  }
  return hunks;
}

/**
 * Reconstructs file content by applying only the hunks whose IDs are in `selectedHunkIds`.
 * Unselected hunks retain their original lines.
 */
export function applySelectedHunks(
  original: string = '',
  proposed: string = '',
  selectedHunkIds: Iterable<string>,
  _precomputedHunks?: DiffHunk[]
): string {
  const selectedSet = new Set(selectedHunkIds);
  const segments = buildDiffSegments(original, proposed);
  if (segments.length === 0) {
    return '';
  }

  const outputLines: string[] = [];
  for (const seg of segments) {
    if (seg.type === 'equal' && seg.lines) {
      outputLines.push(...seg.lines);
    } else if (seg.type === 'hunk' && seg.hunk) {
      if (selectedSet.has(seg.hunk.id)) {
        outputLines.push(...seg.hunk.proposedLines);
      } else {
        outputLines.push(...seg.hunk.originalLines);
      }
    }
  }

  return outputLines.join('\n');
}
