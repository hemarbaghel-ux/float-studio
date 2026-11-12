#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Release Artifact Quality and Binary Format Validator
 *
 * Enforces:
 * 1. Minimum File Size Gate: >= 20 MB (20,971,520 bytes) to reject dummy/empty files
 * 2. Binary Magic Header Validation:
 *    - Windows (.exe): MZ signature (0x4D, 0x5A)
 *    - Portable (.zip): PK signature (0x50, 0x4B, 0x03, 0x04)
 *    - Linux (.deb): Debian ar archive signature (!<arch>\n)
 *    - Linux (.tar.gz): Gzip magic bytes (0x1F, 0x8B)
 *    - macOS (.dmg): DMG compressed disk container format
 *
 * NOTE: Envelope validation (file size and magic-byte signatures) validates binary
 * container integrity only. It does NOT prove functional installation, code signing,
 * notarization, or Code-OSS workbench runtime health. Authentic installer verification
 * requires OS installer execution smoke tests (Prompt 2).
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const distReleaseDir = path.resolve(repoRoot, 'dist/release');

const MIN_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB strictly enforced

const args = process.argv.slice(2);
let targetPlatform = 'windows-x64';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--platform' && args[i + 1]) {
    targetPlatform = args[i + 1];
    i++;
  }
}

console.log('================================================================');
console.log(`🛡️  VALIDATING RELEASE ARTIFACTS: ${targetPlatform}`);
console.log(`   Minimum Size Gate: >= 20.00 MB`);
console.log('================================================================\n');

const expectedArtifacts = {
  'windows-x64': [
    { name: 'FLOAT-Setup-x64.exe', type: 'pe' },
    { name: 'FLOAT-win32-x64.zip', type: 'zip' }
  ],
  'macos-arm64': [
    { name: 'FLOAT-arm64.dmg', type: 'dmg' },
    { name: 'FLOAT-darwin-arm64.zip', type: 'zip' }
  ],
  'macos-x64': [
    { name: 'FLOAT-x64.dmg', type: 'dmg' },
    { name: 'FLOAT-darwin-x64.zip', type: 'zip' }
  ],
  'linux-x64': [
    { name: 'float-studio_amd64.deb', type: 'deb' },
    { name: 'FLOAT-linux-x64.tar.gz', type: 'targz' }
  ]
};

const artifacts = expectedArtifacts[targetPlatform];
if (!artifacts) {
  console.error(`❌ Unknown platform: ${targetPlatform}`);
  process.exit(1);
}

let allValid = true;

for (const artifact of artifacts) {
  const filePath = path.join(distReleaseDir, artifact.name);
  console.log(`Checking ${artifact.name}...`);

  if (!fs.existsSync(filePath)) {
    console.error(`  ❌ MISSING: File does not exist at ${filePath}`);
    allValid = false;
    continue;
  }

  const stat = fs.statSync(filePath);
  const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);

  // 1. Minimum Size Check
  if (stat.size < MIN_SIZE_BYTES) {
    console.error(`  ❌ SIZE FAILURE: ${artifact.name} is only ${stat.size} bytes (${sizeMB} MB). Must be >= 20 MB.`);
    console.error(`     Placeholder or incomplete files are strictly forbidden.`);
    allValid = false;
    continue;
  }
  console.log(`  ✓ Size check passed: ${sizeMB} MB (>= 20.00 MB threshold)`);

  // 2. Binary Header Magic Check
  const fd = fs.openSync(filePath, 'r');
  const headerBuf = Buffer.alloc(16);
  fs.readSync(fd, headerBuf, 0, 16, 0);
  fs.closeSync(fd);

  let headerValid = false;
  let detectedType = 'Unknown';

  if (artifact.type === 'pe') {
    // Windows PE starts with 'MZ' (0x4D, 0x5A)
    if (headerBuf[0] === 0x4D && headerBuf[1] === 0x5A) {
      headerValid = true;
      detectedType = 'Windows PE Executable (MZ)';
    }
  } else if (artifact.type === 'zip') {
    // ZIP starts with 'PK\x03\x04'
    if (headerBuf[0] === 0x50 && headerBuf[1] === 0x4B && headerBuf[2] === 0x03 && headerBuf[3] === 0x04) {
      headerValid = true;
      detectedType = 'ZIP Archive (PK)';
    }
  } else if (artifact.type === 'deb') {
    // Debian package is an ar archive starting with '!<arch>\n'
    const arSig = headerBuf.subarray(0, 8).toString('ascii');
    if (arSig === '!<arch>\n') {
      headerValid = true;
      detectedType = 'Debian Binary Package (ar format)';
    }
  } else if (artifact.type === 'targz') {
    // Gzip starts with 0x1F, 0x8B
    if (headerBuf[0] === 0x1F && headerBuf[1] === 0x8B) {
      headerValid = true;
      detectedType = 'GZIP Compressed Archive (tar.gz)';
    }
  } else if (artifact.type === 'dmg') {
    // DMG either gzip compressed, Apple UDIF or DMG signature
    if ((headerBuf[0] === 0x1F && headerBuf[1] === 0x8B) || headerBuf.includes(Buffer.from('koly', 'ascii')) || headerBuf.subarray(0, 4).toString('ascii') === 'dmg!') {
      headerValid = true;
      detectedType = 'Apple Disk Image (DMG container)';
    }
  }

  if (!headerValid) {
    console.error(`  ❌ HEADER FAILURE: ${artifact.name} has invalid binary format. Detected: ${detectedType}`);
    allValid = false;
  } else {
    console.log(`  ✓ Binary header passed: ${detectedType}`);
  }
}

if (!allValid) {
  console.error('\n❌ Release validation failed. Artifacts do not meet production quality standards.');
  process.exit(1);
}

console.log('\n================================================================');
console.log(`✅ ALL RELEASE ARTIFACTS VALIDATED FOR ${targetPlatform}`);
console.log('================================================================\n');
