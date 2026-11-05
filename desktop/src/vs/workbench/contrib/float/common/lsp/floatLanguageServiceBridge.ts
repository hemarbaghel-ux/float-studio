/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { IMarkerService, IMarker, MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';

export interface IFloatSemanticDiagnostic {
	filePath: string;
	message: string;
	startLine: number;
	startColumn: number;
	endLine: number;
	endColumn: number;
	severity: 'error' | 'warning' | 'info';
	source?: string;
	code?: string;
}

export interface IFloatSymbolDefinition {
	name: string;
	filePath: string;
	range: {
		startLine: number;
		startColumn: number;
		endLine: number;
		endColumn: number;
	};
	previewText?: string;
}

export interface IFloatSymbolReference {
	filePath: string;
	lineNumber: number;
	lineContent: string;
	isCallSite: boolean;
}

export class FloatLanguageServiceBridge extends Disposable {
	private readonly _onDidChangeDiagnostics = this._register(new Emitter<URI[]>());
	public readonly onDidChangeDiagnostics: Event<URI[]> = this._onDidChangeDiagnostics.event;

	constructor(
		@IMarkerService private readonly _markerService?: IMarkerService,
		@ILanguageFeaturesService private readonly _languageFeaturesService?: ILanguageFeaturesService
	) {
		super();

		if (this._markerService) {
			this._register(
				this._markerService.onMarkerChanged(changedResources => {
					this._onDidChangeDiagnostics.fire(changedResources);
				})
			);
		}
	}

	/**
	 * Extracts all active compiler errors and warnings from the Code-OSS Marker Service.
	 */
	public getDiagnostics(resourceUri?: URI): IFloatSemanticDiagnostic[] {
		if (!this._markerService) {
			return [];
		}

		const markers = resourceUri
			? this._markerService.read({ resource: resourceUri })
			: this._markerService.read();

		return markers.map((m: IMarker) => {
			let severity: 'error' | 'warning' | 'info' = 'info';
			if (m.severity === MarkerSeverity.Error) {
				severity = 'error';
			} else if (m.severity === MarkerSeverity.Warning) {
				severity = 'warning';
			}

			return {
				filePath: m.resource.fsPath || m.resource.path,
				message: m.message,
				startLine: m.startLineNumber,
				startColumn: m.startColumn,
				endLine: m.endLineNumber,
				endColumn: m.endColumn,
				severity,
				source: m.source,
				code: typeof m.code === 'string' ? m.code : m.code ? String(m.code) : undefined
			};
		});
	}

	/**
	 * Formats diagnostics into concise prompt-ready string for AI self-repair loops.
	 */
	public formatDiagnosticsForPrompt(resourceUri?: URI, maxItems: number = 10): string {
		const diagnostics = this.getDiagnostics(resourceUri)
			.filter(d => d.severity === 'error')
			.slice(0, maxItems);

		if (diagnostics.length === 0) {
			return '✓ No compiler or language server errors detected.';
		}

		const lines: string[] = [
			`[Compiler & Language Server Diagnostics - ${diagnostics.length} error(s)]:`
		];

		for (const d of diagnostics) {
			const codeStr = d.code ? ` [${d.code}]` : '';
			const sourceStr = d.source ? ` (${d.source})` : '';
			lines.push(`- ${d.filePath}:${d.startLine}:${d.startColumn}${codeStr}${sourceStr}: ${d.message}`);
		}

		return lines.join('\n');
	}

	/**
	 * Cross-references symbol definitions across the workspace without guessing.
	 */
	public findCallSites(symbolName: string, fileContents: Map<string, string>): IFloatSymbolReference[] {
		const references: IFloatSymbolReference[] = [];
		const regex = new RegExp(`\\b${symbolName}\\s*\\(`, 'g');

		for (const [filePath, content] of fileContents.entries()) {
			const lines = content.split(/\r?\n/);
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (regex.test(line)) {
					// Exclude declaration lines
					const isDeclaration = line.includes(`function ${symbolName}`) ||
						line.includes(`${symbolName} = (`) ||
						line.includes(`def ${symbolName}`);

					references.push({
						filePath,
						lineNumber: i + 1,
						lineContent: line.trim(),
						isCallSite: !isDeclaration
					});
				}
				regex.lastIndex = 0;
			}
		}

		return references;
	}

	/**
	 * Returns whether the workspace currently compiles with 0 errors.
	 */
	public isWorkspaceClean(resourceUri?: URI): boolean {
		const diagnostics = this.getDiagnostics(resourceUri);
		return !diagnostics.some(d => d.severity === 'error');
	}
}
