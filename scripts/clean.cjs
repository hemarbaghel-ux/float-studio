#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const dirsToClean = [
  path.join(repoRoot, 'dist'),
  path.join(repoRoot, '.desktop-build-cache')
];

for (const dir of dirsToClean) {
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[clean] Successfully removed: ${path.relative(repoRoot, dir)}`);
    } catch (err) {
      console.warn(`[clean] Warning: Failed to fully remove ${dir}: ${err.message}`);
    }
  }
}

console.log('[clean] Cleanup complete.');
