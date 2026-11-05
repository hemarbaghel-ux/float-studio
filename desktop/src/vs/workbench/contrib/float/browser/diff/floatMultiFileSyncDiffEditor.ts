/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IFloatDiffHunk {
	hunkId: string;
	filePath: string;
	originalStart: number;
	originalEnd: number;
	proposedStart: number;
	proposedEnd: number;
	originalText: string;
	proposedText: string;
	status: 'pending' | 'accepted' | 'rejected';
}

export interface IFloatFileDiffSession {
	filePath: string;
	originalContent: string;
	proposedContent: string;
	hunks: IFloatDiffHunk[];
	isFullyReviewed: boolean;
}

export class FloatMultiFileSyncDiffEditor {
	private readonly _sessions = new Map<string, IFloatFileDiffSession>();

	public loadDiff(filePath: string, originalContent: string, proposedContent: string): IFloatFileDiffSession {
		const normPath = filePath.replace(/\\/g, '/');
		const hunks = this._calculateHunks(normPath, originalContent, proposedContent);

		const session: IFloatFileDiffSession = {
			filePath: normPath,
			originalContent,
			proposedContent,
			hunks,
			isFullyReviewed: hunks.length === 0
		};

		this._sessions.set(normPath, session);
		return session;
	}

	public getSession(filePath: string): IFloatFileDiffSession | undefined {
		return this._sessions.get(filePath.replace(/\\/g, '/'));
	}

	public acceptHunk(filePath: string, hunkId: string): void {
		const session = this.getSession(filePath);
		if (!session) return;

		const hunk = session.hunks.find(h => h.hunkId === hunkId);
		if (hunk) {
			hunk.status = 'accepted';
		}
		this._checkReviewStatus(session);
	}

	public rejectHunk(filePath: string, hunkId: string): void {
		const session = this.getSession(filePath);
		if (!session) return;

		const hunk = session.hunks.find(h => h.hunkId === hunkId);
		if (hunk) {
			hunk.status = 'rejected';
		}
		this._checkReviewStatus(session);
	}

	public acceptAll(filePath?: string): void {
		const targets = filePath ? [this.getSession(filePath)!].filter(Boolean) : Array.from(this._sessions.values());
		for (const session of targets) {
			for (const hunk of session.hunks) {
				hunk.status = 'accepted';
			}
			session.isFullyReviewed = true;
		}
	}

	public rejectAll(filePath?: string): void {
		const targets = filePath ? [this.getSession(filePath)!].filter(Boolean) : Array.from(this._sessions.values());
		for (const session of targets) {
			for (const hunk of session.hunks) {
				hunk.status = 'rejected';
			}
			session.isFullyReviewed = true;
		}
	}

	public computeFinalBuffer(filePath: string): string {
		const session = this.getSession(filePath);
		if (!session) return '';

		// If all hunks rejected, return original
		if (session.hunks.every(h => h.status === 'rejected')) {
			return session.originalContent;
		}

		// If all accepted, return proposed
		if (session.hunks.every(h => h.status === 'accepted')) {
			return session.proposedContent;
		}

		// Mixed hunks: apply accepted hunks over original lines
		let lines = session.originalContent.split('\n');
		// Apply hunks from bottom to top so line indices remain stable
		const sortedHunks = [...session.hunks].sort((a, b) => b.originalStart - a.originalStart);

		for (const hunk of sortedHunks) {
			if (hunk.status === 'accepted') {
				const before = lines.slice(0, Math.max(0, hunk.originalStart - 1));
				const after = lines.slice(hunk.originalEnd);
				const proposedLines = hunk.proposedText ? hunk.proposedText.split('\n') : [];
				lines = [...before, ...proposedLines, ...after];
			}
		}

		return lines.join('\n');
	}

	public getAggregatedStats(): {
		totalFiles: number;
		totalHunks: number;
		acceptedHunks: number;
		rejectedHunks: number;
		pendingHunks: number;
		additions: number;
		deletions: number;
	} {
		let totalHunks = 0;
		let acceptedHunks = 0;
		let rejectedHunks = 0;
		let pendingHunks = 0;
		let additions = 0;
		let deletions = 0;

		for (const session of this._sessions.values()) {
			totalHunks += session.hunks.length;
			for (const h of session.hunks) {
				if (h.status === 'accepted') acceptedHunks++;
				else if (h.status === 'rejected') rejectedHunks++;
				else pendingHunks++;

				const origLines = h.originalText ? h.originalText.split('\n').length : 0;
				const propLines = h.proposedText ? h.proposedText.split('\n').length : 0;
				deletions += origLines;
				additions += propLines;
			}
		}

		return {
			totalFiles: this._sessions.size,
			totalHunks,
			acceptedHunks,
			rejectedHunks,
			pendingHunks,
			additions,
			deletions
		};
	}

	private _checkReviewStatus(session: IFloatFileDiffSession): void {
		session.isFullyReviewed = session.hunks.every(h => h.status !== 'pending');
	}

	private _calculateHunks(filePath: string, original: string, proposed: string): IFloatDiffHunk[] {
		if (original === proposed) return [];

		const origLines = original.split('\n');
		const propLines = proposed.split('\n');
		const hunks: IFloatDiffHunk[] = [];

		let i = 0;
		let j = 0;
		let hunkIndex = 1;

		while (i < origLines.length || j < propLines.length) {
			if (i < origLines.length && j < propLines.length && origLines[i] === propLines[j]) {
				i++;
				j++;
				continue;
			}

			// Discrepancy starts
			const origStart = i + 1;
			const propStart = j + 1;
			const origHunkLines: string[] = [];
			const propHunkLines: string[] = [];

			// Look ahead for next matching line anchor
			let matchFound = false;
			let anchorI = i;
			let anchorJ = j;

			for (let di = 0; di < 20 && (i + di) < origLines.length && !matchFound; di++) {
				for (let dj = 0; dj < 20 && (j + dj) < propLines.length; dj++) {
					if (origLines[i + di] === propLines[j + dj] && (origLines[i + di].trim().length > 0 || (di > 0 && dj > 0))) {
						anchorI = i + di;
						anchorJ = j + dj;
						matchFound = true;
						break;
					}
				}
			}

			if (matchFound) {
				while (i < anchorI) {
					origHunkLines.push(origLines[i++]);
				}
				while (j < anchorJ) {
					propHunkLines.push(propLines[j++]);
				}
			} else {
				while (i < origLines.length) {
					origHunkLines.push(origLines[i++]);
				}
				while (j < propLines.length) {
					propHunkLines.push(propLines[j++]);
				}
			}

			hunks.push({
				hunkId: `hunk-${hunkIndex++}`,
				filePath,
				originalStart: origStart,
				originalEnd: Math.max(origStart, i),
				proposedStart: propStart,
				proposedEnd: Math.max(propStart, j),
				originalText: origHunkLines.join('\n'),
				proposedText: propHunkLines.join('\n'),
				status: 'pending'
			});
		}

		return hunks;
	}
}
