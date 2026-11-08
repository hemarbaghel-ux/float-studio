/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { FloatTreeSitterIndexer, IFloatAstNode } from '../../../../../../../../daemon/src/indexer/floatTreeSitterIndexer.js';

export interface IFloatSyntaxContextSlice {
	filePath: string;
	cursorLine: number;
	cursorColumn: number;
	enclosingScopeName?: string;
	enclosingScopeKind?: string;
	enclosingClassName?: string;
	imports: string[];
	slicedCode: string;
	startLine: number;
	endLine: number;
}

export class FloatSyntaxContextSlicer {
	private readonly _indexer: FloatTreeSitterIndexer;

	constructor(indexer?: FloatTreeSitterIndexer) {
		this._indexer = indexer || new FloatTreeSitterIndexer();
	}

	public sliceContext(
		filePath: string,
		content: string,
		cursorLine: number,
		cursorColumn: number = 1,
		paddingLines: number = 10
	): IFloatSyntaxContextSlice {
		const lines = content.split('\n');
		const totalLines = lines.length;
		const fileNode = this._indexer.parseFileSymbols(filePath, content);
		const symbols = fileNode.symbols;

		// Extract imports from top of file
		const imports: string[] = [];
		for (let i = 0; i < Math.min(50, totalLines); i++) {
			const l = lines[i];
			if (/^\s*(import\s+|from\s+|require\(|use\s+|#include)/.test(l)) {
				imports.push(l.trim());
			}
		}

		// Select the smallest declaration scope that actually contains the cursor.
		// Variables and properties are symbols, but they are not enclosing scopes.
		let enclosingScope: IFloatAstNode | undefined;
		let enclosingClass: IFloatAstNode | undefined;
		const scopeKinds = new Set<IFloatAstNode['kind']>([
			'class', 'struct', 'interface', 'function', 'method', 'module', 'enum'
		]);
		const classKinds = new Set<IFloatAstNode['kind']>(['class', 'struct', 'interface']);
		const containsCursor = (symbol: IFloatAstNode): boolean =>
			cursorLine >= symbol.startLine && cursorLine <= symbol.endLine;
		const span = (symbol: IFloatAstNode): number => symbol.endLine - symbol.startLine;

		for (const symbol of symbols) {
			if (!containsCursor(symbol)) {
				continue;
			}
			if (
				classKinds.has(symbol.kind) &&
				(!enclosingClass || span(symbol) < span(enclosingClass) ||
					(span(symbol) === span(enclosingClass) && symbol.startLine > enclosingClass.startLine))
			) {
				enclosingClass = symbol;
			}
			if (
				scopeKinds.has(symbol.kind) &&
				(!enclosingScope || span(symbol) < span(enclosingScope) ||
					(span(symbol) === span(enclosingScope) && symbol.startLine > enclosingScope.startLine))
			) {
				enclosingScope = symbol;
			}
		}

		let startLine = 1;
		let endLine = totalLines;

		if (enclosingScope) {
			startLine = Math.max(1, enclosingScope.startLine - paddingLines);
			endLine = Math.min(totalLines, enclosingScope.endLine + paddingLines);
		} else {
			startLine = Math.max(1, cursorLine - paddingLines);
			endLine = Math.min(totalLines, cursorLine + paddingLines);
		}

		const slicedLines = lines.slice(startLine - 1, endLine);
		const slicedCode = slicedLines.join('\n');

		return {
			filePath,
			cursorLine,
			cursorColumn,
			enclosingScopeName: enclosingScope?.name,
			enclosingScopeKind: enclosingScope?.kind,
			enclosingClassName: enclosingClass?.name,
			imports,
			slicedCode,
			startLine,
			endLine
		};
	}
}
