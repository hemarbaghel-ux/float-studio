/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';

export interface TerminalDoctorCheck {
  readonly id: string;
  readonly envVar?: string;
  readonly passed: boolean;
  readonly severity: 'blocker' | 'warning';
  readonly message: string;
  readonly remediation: string;
}

export interface TerminalDoctorReport {
  readonly ready: boolean;
  readonly mode: 'isolated_docker_pty' | 'unconfigured';
  readonly browserPreviewDisclaimer: string;
  readonly checks: readonly TerminalDoctorCheck[];
  readonly timestamp: string;
}

export function runTerminalSetupDoctor(env: NodeJS.ProcessEnv = process.env): TerminalDoctorReport {
  const checks: TerminalDoctorCheck[] = [];

  const dockerBin = (env.FLOAT_DOCKER_BIN || '').trim();
  const dockerBinValid = Boolean(dockerBin && dockerBin.startsWith('/') && fs.existsSync(dockerBin));
  checks.push({
    id: 'docker_binary',
    envVar: 'FLOAT_DOCKER_BIN',
    passed: dockerBinValid,
    severity: 'blocker',
    message: dockerBinValid
      ? `Verified absolute Docker binary at ${dockerBin}.`
      : 'FLOAT_DOCKER_BIN must be an existing absolute path to the pinned Docker CLI binary.',
    remediation: 'Set FLOAT_DOCKER_BIN=/usr/bin/docker (or host absolute path) and verify permissions.',
  });

  const execImage = (env.FLOAT_EXECUTION_IMAGE || '').trim();
  const imageDigestValid = /^[^\s]+@sha256:[a-f0-9]{64}$/i.test(execImage);
  checks.push({
    id: 'execution_image_digest',
    envVar: 'FLOAT_EXECUTION_IMAGE',
    passed: imageDigestValid,
    severity: 'blocker',
    message: imageDigestValid
      ? `Execution image pinned to immutable digest: ${execImage}.`
      : 'FLOAT_EXECUTION_IMAGE must be pinned to an immutable @sha256:<64-hex> digest.',
    remediation: 'Pull your sandbox image and set FLOAT_EXECUTION_IMAGE=ubuntu@sha256:<digest>.',
  });

  const dockerHost = (env.DOCKER_HOST || '').trim();
  const dockerTls = (env.DOCKER_TLS_VERIFY || '').trim();
  const dockerCertPath = (env.DOCKER_CERT_PATH || '').trim();
  const daemonProxyValid =
    dockerHost.startsWith('tcp://') &&
    dockerTls === '1' &&
    Boolean(dockerCertPath && dockerCertPath.startsWith('/'));
  checks.push({
    id: 'docker_tls_proxy',
    envVar: 'DOCKER_HOST',
    passed: daemonProxyValid,
    severity: 'blocker',
    message: daemonProxyValid
      ? `Isolated TLS Docker proxy configured at ${dockerHost}.`
      : 'DOCKER_HOST (tcp://...), DOCKER_TLS_VERIFY=1, and absolute DOCKER_CERT_PATH are required; raw /var/run/docker.sock is forbidden.',
    remediation: 'Configure a TLS-verified Docker socket proxy and set DOCKER_HOST, DOCKER_TLS_VERIFY=1, and DOCKER_CERT_PATH.',
  });

  const sharedDir = (env.FLOAT_EXECUTION_SHARED_DIR || '').trim();
  let sharedDirValid = false;
  if (sharedDir && sharedDir.startsWith('/') && fs.existsSync(sharedDir)) {
    try {
      const st = fs.statSync(sharedDir);
      sharedDirValid = st.isDirectory() && (st.mode & 0o077) === 0;
    } catch {
      sharedDirValid = false;
    }
  }
  checks.push({
    id: 'shared_scratch_dir',
    envVar: 'FLOAT_EXECUTION_SHARED_DIR',
    passed: sharedDirValid,
    severity: 'blocker',
    message: sharedDirValid
      ? `Isolated workspace scratch directory verified at ${sharedDir} (mode 0700).`
      : 'FLOAT_EXECUTION_SHARED_DIR must exist as an absolute directory with mode 0700 (no group/other access).',
    remediation: 'Run: mkdir -p /var/lib/float-exec && chmod 0700 /var/lib/float-exec && export FLOAT_EXECUTION_SHARED_DIR=/var/lib/float-exec',
  });

  const ready = checks.every(c => c.passed);
  return {
    ready,
    mode: ready ? 'isolated_docker_pty' : 'unconfigured',
    browserPreviewDisclaimer:
      'Browser Web Worker preview (src/features/float/sandbox.ts) is an in-memory UI preview only and never substitutes for OS/container terminal execution.',
    checks,
    timestamp: new Date().toISOString(),
  };
}
