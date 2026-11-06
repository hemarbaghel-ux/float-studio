import assert from 'node:assert/strict';
import { FloatVectorIndex, IRankedCodeChunk } from '../desktop/src/vs/workbench/contrib/float/common/workspace/floatVectorIndex.ts';
import { ISemanticCodeChunk } from '../desktop/src/vs/workbench/contrib/float/common/workspace/floatSemanticChunker.ts';

function chunk(
  id: string,
  filePath: string,
  symbolName: string,
  tokens: string[]
): ISemanticCodeChunk {
  return {
    id,
    filePath,
    symbolName,
    symbolKind: 'function',
    startLine: 1,
    endLine: 3,
    content: 'export function ' + symbolName + '() { return true; }',
    tokens
  };
}

function main(): void {
  const index = new FloatVectorIndex();

  // Replacing a stable chunk id must remove the old BM25 postings and document length.
  index.addChunk(chunk('stable-id', 'src/old.ts', 'legacyCredentialLookup', ['legacycredential', 'lookup', 'credential', 'credential']));
  index.addChunk(chunk('stable-id', 'src/new.ts', 'freshWorkspaceResolver', ['freshworkspace', 'resolver', 'workspace']));
  assert.equal(index.chunkCount, 1);
  assert.equal(index.search('legacycredential', 10).length, 0, 'old terms must not return the replacement chunk');
  const freshResults = index.search('freshworkspace', 10);
  assert.equal(freshResults.length, 1);
  assert.equal(freshResults[0].chunk.filePath, 'src/new.ts');

  // Removing the old file must not remove the chunk after it was moved to a new file.
  index.removeChunksForFile('src/old.ts');
  assert.equal(index.chunkCount, 1);
  index.removeChunksForFile('src/new.ts');
  assert.equal(index.chunkCount, 0);
  assert.equal(index.search('freshworkspace', 10).length, 0);

  // MMR uses relevance normalized to the top candidate rather than score / 100.
  // With raw scores above 100, the old formula largely swallowed diversity penalties.
  const mmrIndex = new FloatVectorIndex();
  const duplicateA = chunk('dup-a', 'src/cache.ts', 'cachePrimary', ['cache', 'refresh', 'solar', 'token']);
  const duplicateB = chunk('dup-b', 'src/cache.ts', 'cacheSecondary', ['cache', 'refresh', 'solar', 'token']);
  const independent = chunk('independent', 'src/scheduler.ts', 'solarScheduler', ['schedule', 'planet', 'orbit', 'worker']);
  mmrIndex.addChunk(duplicateA);
  mmrIndex.addChunk(duplicateB);
  mmrIndex.addChunk(independent);

  const ranked: IRankedCodeChunk[] = [
    { chunk: duplicateA, score: 200, cosineSimilarity: 0.99, bm25Score: 4, signals: [] },
    { chunk: duplicateB, score: 195, cosineSimilarity: 0.95, bm25Score: 4, signals: [] },
    { chunk: independent, score: 150, cosineSimilarity: 0.8, bm25Score: 3, signals: [] }
  ];
  const indexWithMmr = mmrIndex as unknown as {
    _applyMMR: (items: IRankedCodeChunk[], queryVector: Float64Array, limit: number, lambda?: number) => IRankedCodeChunk[];
  };
  const diversified = indexWithMmr._applyMMR(ranked, new Float64Array(256), 2, 0.7);
  assert.equal(diversified.length, 2);
  assert.equal(diversified[0].chunk.id, 'dup-a');
  assert.equal(diversified[1].chunk.id, 'independent', 'MMR should choose a less-redundant result when normalized relevance is close');

  // Serialization must rebuild searchable BM25 postings from the saved chunks.
  index.addChunk(chunk('persist-id', 'src/persist.ts', 'postRestoreHandler', ['postrestore', 'handler']));
  const restored = new FloatVectorIndex();
  restored.deserialize(index.serialize());
  assert.equal(restored.chunkCount, 1);
  assert.equal(restored.search('postrestore', 5)[0]?.chunk.symbolName, 'postRestoreHandler');
  assert.equal(restored.search('afterrestore', 5)[0]?.chunk.symbolName, 'afterRestoreHandler');
  restored.addChunk(chunk('after-restore', 'src/after.ts', 'afterRestoreHandler', ['afterrestore', 'handler']));
  assert.equal(restored.search('postrestore', 5)[0]?.chunk.symbolName, 'postRestoreHandler');

  console.log('Vector index maintenance: stable-id replacement, stale BM25 cleanup, file removal and normalized MMR passed.');
}

main();
