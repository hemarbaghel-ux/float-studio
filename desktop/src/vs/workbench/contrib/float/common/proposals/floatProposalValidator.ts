/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IFloatProposal, IFloatProposalFileChange } from '../protocols/floatProtocol.js';

const SENSITIVE_PATTERN = /(^|[\\/])(\.env|\.git|id_rsa|id_ed25519|.*\.pem|credentials\.json)($|[\\/])/i;

export function sanitizeProposalPath(rawPath: string): string {
	if (!rawPath || typeof rawPath !== 'string') {
		throw new Error('Invalid empty path in proposal');
	}

	let normalized = rawPath.trim().replace(/\\/g, '/');

	// Strip leading ./
	while (normalized.startsWith('./')) {
		normalized = normalized.substring(2);
	}

	// Reject path traversal
	if (normalized.includes('..')) {
		throw new Error(`Path traversal rejected: ${rawPath}`);
	}

	// Reject absolute paths
	if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
		throw new Error(`Absolute path rejected: ${rawPath}`);
	}

	// Reject null bytes
	if (normalized.includes('\0')) {
		throw new Error(`Null byte in path rejected: ${rawPath}`);
	}

	// Reject sensitive files
	if (SENSITIVE_PATTERN.test(normalized)) {
		throw new Error(`Access to sensitive file denied: ${rawPath}`);
	}

	return normalized;
}

export function parseModelProposals(modelText: string, defaultFilePath?: string): IFloatProposal[] {
	const proposals: IFloatProposal[] = [];
	const codeBlockRegex = /```(?:([a-zA-Z0-9_\-]+))?(?:\s+([^\n\r]+))?\r?\n([\s\S]*?)```/g;

	let match: RegExpExecArray | null;
	const changes: IFloatProposalFileChange[] = [];

	while ((match = codeBlockRegex.exec(modelText)) !== null) {
		const lang = (match[1] || '').trim();
		const headerExtra = (match[2] || '').trim();
		const codeContent = match[3] || '';

		let resolvedPath = '';

		// 1. Check header extra: path="...", file="...", filepath="..."
		const pathMatch = headerExtra.match(/(?:path|filepath|file|filename)=["']?([^"'\s]+)["']?/i);
		if (pathMatch) {
			resolvedPath = pathMatch[1];
		}

		// 2. Colon syntax in lang: tsx:src/app.tsx
		if (!resolvedPath && lang.includes(':')) {
			const parts = lang.split(':');
			if (parts.length >= 2 && parts[1].trim()) {
				resolvedPath = parts.slice(1).join(':').trim();
			}
		}

		// 3. Header extra as bare path
		if (!resolvedPath && headerExtra && !headerExtra.startsWith('//') && headerExtra.includes('.')) {
			resolvedPath = headerExtra;
		}

		// 4. First line comment: // filepath: src/app.tsx
		if (!resolvedPath) {
			const firstLine = codeContent.trim().split('\n')[0] || '';
			const commentPathMatch = firstLine.match(/^(?:\/\/|#|\/\*)\s*(?:filepath|file|path):\s*([^\s*]+)/i);
			if (commentPathMatch) {
				resolvedPath = commentPathMatch[1];
			}
		}

		if (!resolvedPath && defaultFilePath) {
			resolvedPath = defaultFilePath;
		}

		if (resolvedPath) {
			try {
				const safePath = sanitizeProposalPath(resolvedPath);
				changes.push({
					path: safePath,
					originalContent: '',
					proposedContent: codeContent,
					isNew: false,
					isDeletion: false,
					status: 'pending'
				});
			} catch {
				// Skip invalid paths safely
			}
		}
	}

	if (changes.length > 0) {
		proposals.push({
			id: `prop-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
			title: changes.length === 1 ? `Update ${changes[0].path}` : `Multi-file update (${changes.length} files)`,
			explanation: 'AI-generated code change proposal',
			files: changes,
			timestamp: Date.now(),
			status: 'pending'
		});
	}

	return proposals;
}
