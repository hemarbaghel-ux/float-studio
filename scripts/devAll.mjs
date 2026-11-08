#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const isWindows = process.platform === 'win32';

console.log('\n======================================================');
console.log('🚀 Starting FLOAT Studio Full Development Environment');
console.log('   - Express API Server (Port 3000)');
console.log('   - Vite React Frontend with HMR (Port 5173)');
console.log('======================================================\n');

let isExiting = false;
const childProcesses = [];

function killChildProcesses() {
  if (isExiting) return;
  isExiting = true;
  console.log('\n🛑 Shutting down development processes...');

  for (const child of childProcesses) {
    try {
      if (child.pid && !child.killed) {
        if (isWindows) {
          spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t'], { stdio: 'ignore' });
        } else {
          child.kill('SIGTERM');
        }
      }
    } catch {}
  }
}

process.on('SIGINT', () => {
  killChildProcesses();
  setTimeout(() => process.exit(0), 1000);
});

process.on('SIGTERM', () => {
  killChildProcesses();
  setTimeout(() => process.exit(0), 1000);
});

process.on('exit', () => {
  killChildProcesses();
});

// 1. Spawn Backend Express Server
const apiEnv = {
  ...process.env,
  PORT: process.env.PORT || '3000',
  NODE_ENV: 'development',
  SKIP_VITE: 'true', // Tell server.ts not to attach duplicate Vite middleware
};

console.log('➜ [API] Starting Express server on port 3000...');
const apiProcess = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
  cwd: rootDir,
  env: apiEnv,
  stdio: ['inherit', 'pipe', 'pipe'],
});
childProcesses.push(apiProcess);

apiProcess.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      console.log(`\x1b[36m[API]\x1b[0m ${line}`);
    }
  }
});

apiProcess.stderr.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      console.error(`\x1b[31m[API ERR]\x1b[0m ${line}`);
    }
  }
});

apiProcess.on('exit', (code) => {
  if (!isExiting) {
    console.error(`\x1b[31m[API]\x1b[0m Process exited with code ${code}`);
    killChildProcesses();
    process.exit(code || 1);
  }
});

// 2. Spawn Vite Frontend Dev Server
console.log('➜ [Vite] Starting frontend dev server on port 5173...');
const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
const viteProcess = spawn(process.execPath, [viteBin, '--port', '5173'], {
  cwd: rootDir,
  env: {
    ...process.env,
    NODE_ENV: 'development',
  },
  stdio: ['inherit', 'pipe', 'pipe'],
});
childProcesses.push(viteProcess);

viteProcess.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      console.log(`\x1b[32m[VITE]\x1b[0m ${line}`);
    }
  }
});

viteProcess.stderr.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      console.error(`\x1b[33m[VITE WARN]\x1b[0m ${line}`);
    }
  }
});

viteProcess.on('exit', (code) => {
  if (!isExiting) {
    console.error(`\x1b[31m[VITE]\x1b[0m Process exited with code ${code}`);
    killChildProcesses();
    process.exit(code || 1);
  }
});
