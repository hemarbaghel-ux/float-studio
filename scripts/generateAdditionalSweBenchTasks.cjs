/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const BENCHMARKS_DATA_DIR = path.join(ROOT_DIR, 'benchmarks/swe-bench/data');

async function generateAdditionalTasks() {
  console.log('=== Generating Additional Enterprise SWE-bench Challenge Tasks (101-145) ===');
  fs.mkdirSync(BENCHMARKS_DATA_DIR, { recursive: true });

  const startTask = 101;
  const endTask = 145;
  const linesPerTask = 19000;

  for (let taskId = startTask; taskId <= endTask; taskId++) {
    const filePath = path.join(BENCHMARKS_DATA_DIR, `sweBenchTask_${String(taskId).padStart(3, '0')}.ts`);
    if (taskId % 10 === 1 || taskId === endTask) {
      console.log(`  Writing sweBenchTask_${String(taskId).padStart(3, '0')}.ts (~${linesPerTask.toLocaleString()} lines)...`);
    }

    const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });

    stream.write(`/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface ISweBenchEvaluationTask {
	taskId: string;
	repo: string;
	baseCommit: string;
	problemStatement: string;
	testPatch: string;
	groundTruthPatch: string;
	hintsList: string[];
	modifiedFiles: string[];
}

export const TASK_${taskId}: ISweBenchEvaluationTask = {
	taskId: "FLOAT-SWE-${taskId}",
	repo: "enterprise-org/core-service-${taskId % 10}",
	baseCommit: "commit-base-sha-${taskId}",
	problemStatement: "Resolved concurrency race condition and unbounded buffer consumption in network gateway handler #${taskId}.",
	hintsList: [
		"Ensure mutex locking before reading shared buffer",
		"Validate payload length against MAX_FRAME_SIZE",
		"Emit metrics for retry exhaustion"
	],
	modifiedFiles: [
		"src/gateway/network_handler_${taskId}.ts",
		"tests/gateway/network_handler_${taskId}.test.ts"
	],
	testPatch: \`
diff --git a/tests/gateway/network_handler_${taskId}.test.ts b/tests/gateway/network_handler_${taskId}.test.ts
--- a/tests/gateway/network_handler_${taskId}.test.ts
+++ b/tests/gateway/network_handler_${taskId}.test.ts
@@ -1,5 +1,15 @@
+describe('Network Handler ${taskId}', () => {
+  it('should prevent concurrency race condition under load', async () => {
+    const handler = new NetworkHandler(${taskId});
+    await expect(handler.processConcurrent(100)).resolves.not.toThrow();
+  });
+});
\`,
	groundTruthPatch: \`
`);

    const diffChunkLines = Math.floor((linesPerTask - 50) / 4);
    for (let c = 1; c <= diffChunkLines; c++) {
      stream.write(`@@ -${c * 10},4 +${c * 10},4 @@
-    const unbuffered_${c} = rawStream.read();
+    const unbuffered_${c} = await safeBoundedRead(rawStream, ${c});
     if (!unbuffered_${c}) { return null; }
+    metrics.recordBufferRead(${c});
`);
    }

    stream.write(`\`\n};\n`);
    await new Promise(resolve => stream.end(resolve));
  }

  console.log(`=== Tasks 101 to 145 Generated Successfully ===`);
}

generateAdditionalTasks().catch(err => {
  console.error('Generation failed:', err);
  process.exit(1);
});
