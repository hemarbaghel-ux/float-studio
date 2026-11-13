/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';

export interface IFloatDiffHunk {
	id: string;
	oldStartLine: number;
	oldLineCount: number;
	newStartLine: number;
	newLineCount: number;
	oldLines: string[];
	newLines: string[];
	status: 'pending' | 'accepted' | 'rejected';
}

export interface IFloatFileDiffEntry {
	filePath: string;
	fileUri: URI;
	originalContent: string;
	proposedContent: string;
	hunks: IFloatDiffHunk[];
	isFullyResolved: boolean;
}

export class FloatMultiFileDiffEditor implements IDisposable {
	private readonly _entries = new Map<string, IFloatFileDiffEntry>();
	private _activeFileIndex: number = 0;
	private _activeHunkIndex: number = 0;
	public get activeFileIndex(): number { return this._activeFileIndex; }
	public get activeHunkIndex(): number { return this._activeHunkIndex; }

	public loadDiff(filePath: string, originalContent: string, proposedContent: string): IFloatFileDiffEntry {
		const hunks = this._calculateHunks(originalContent, proposedContent);
		const entry: IFloatFileDiffEntry = {
			filePath,
			fileUri: URI.file(filePath),
			originalContent,
			proposedContent,
			hunks,
			isFullyResolved: hunks.length === 0
		};

		this._entries.set(filePath, entry);
		return entry;
	}

	public getEntry(filePath: string): IFloatFileDiffEntry | undefined {
		return this._entries.get(filePath);
	}

	public getAllEntries(): IFloatFileDiffEntry[] {
		return Array.from(this._entries.values());
	}

	public acceptHunk(filePath: string, hunkId: string): boolean {
		const entry = this._entries.get(filePath);
		if (!entry) return false;

		const hunk = entry.hunks.find(h => h.id === hunkId);
		if (!hunk) return false;

		hunk.status = 'accepted';
		entry.isFullyResolved = entry.hunks.every(h => h.status !== 'pending');
		return true;
	}

	public rejectHunk(filePath: string, hunkId: string): boolean {
		const entry = this._entries.get(filePath);
		if (!entry) return false;

		const hunk = entry.hunks.find(h => h.id === hunkId);
		if (!hunk) return false;

		hunk.status = 'rejected';
		entry.isFullyResolved = entry.hunks.every(h => h.status !== 'pending');
		return true;
	}

	public acceptAll(filePath: string): void {
		const entry = this._entries.get(filePath);
		if (!entry) return;
		for (const h of entry.hunks) {
			h.status = 'accepted';
		}
		entry.isFullyResolved = true;
	}

	public rejectAll(filePath: string): void {
		const entry = this._entries.get(filePath);
		if (!entry) return;
		for (const h of entry.hunks) {
			h.status = 'rejected';
		}
		entry.isFullyResolved = true;
	}

	public generateResolvedContent(filePath: string): string {
		const entry = this._entries.get(filePath);
		if (!entry) return '';

		// Reconstruct file with accepted/rejected hunks applied
		const origLines = entry.originalContent.split('\n');
		const resultLines: string[] = [];
		let currentOrigIdx = 0;

		for (const hunk of entry.hunks) {
			// Lines before this hunk
			const hunkStartIdx = hunk.oldStartLine - 1;
			while (currentOrigIdx < hunkStartIdx && currentOrigIdx < origLines.length) {
				resultLines.push(origLines[currentOrigIdx]);
				currentOrigIdx++;
			}

			if (hunk.status === 'accepted') {
				resultLines.push(...hunk.newLines);
			} else {
				// Rejected or pending -> keep original
				resultLines.push(...hunk.oldLines);
			}

			currentOrigIdx += hunk.oldLineCount;
		}

		// Remaining lines after last hunk
		while (currentOrigIdx < origLines.length) {
			resultLines.push(origLines[currentOrigIdx]);
			currentOrigIdx++;
		}

		return resultLines.join('\n');
	}

	private _calculateHunks(original: string, proposed: string): IFloatDiffHunk[] {
		const origLines = original.split('\n');
		const propLines = proposed.split('\n');
		const hunks: IFloatDiffHunk[] = [];

		let i = 0;
		let j = 0;
		let hunkCounter = 1;

		while (i < origLines.length || j < propLines.length) {
			if (i < origLines.length && j < propLines.length && origLines[i] === propLines[j]) {
				i++;
				j++;
				continue;
			}

			const oldStart = i + 1;
			const newStart = j + 1;

			// Lookahead for next matching anchor line
			let matchI = -1;
			let matchJ = -1;
			let found = false;

			for (let di = 0; di < 20 && (i + di) < origLines.length; di++) {
				for (let dj = 0; dj < 20 && (j + dj) < propLines.length; dj++) {
					if (di === 0 && dj === 0) continue;
					if (origLines[i + di] === propLines[j + dj]) {
						matchI = i + di;
						matchJ = j + dj;
						found = true;
						break;
					}
				}
				if (found) break;
			}

			if (!found) {
				matchI = origLines.length;
				matchJ = propLines.length;
			}

			const oldLinesChunk = origLines.slice(i, matchI);
			const newLinesChunk = propLines.slice(j, matchJ);

			hunks.push({
				id: `hunk-${hunkCounter++}`,
				oldStartLine: oldStart,
				oldLineCount: oldLinesChunk.length,
				newStartLine: newStart,
				newLineCount: newLinesChunk.length,
				oldLines: oldLinesChunk,
				newLines: newLinesChunk,
				status: 'pending'
			});

			i = matchI;
			j = matchJ;
		}

		return hunks;
	}

	public dispose(): void {
		this._entries.clear();
	}
}
