/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface ICursorJumpPrediction {
	targetFilePath: string;
	targetLine: number;
	targetColumn: number;
	symbolName: string;
	currentSnippet: string;
	suggestedPatch: string;
	confidence: number;
}

export class FloatCursorJumpPredictor {
	public predictRemoteJumps(
		symbolName: string,
		oldSignature: string,
		newSignature: string,
		workspaceFiles: Record<string, string>
	): ICursorJumpPrediction[] {
		const predictions: ICursorJumpPrediction[] = [];
		const callRegex = new RegExp(`\\b${symbolName}\\s*\\(([^)]*)\\)`, 'g');

		for (const [filePath, content] of Object.entries(workspaceFiles)) {
			const lines = content.split('\n');

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				callRegex.lastIndex = 0;
				let match: RegExpExecArray | null;

				while ((match = callRegex.exec(line)) !== null) {
					// Found call site
					const col = match.index + 1;
					const currentSnippet = match[0];

					// Check if parameter count or names changed
					let suggestedPatch = currentSnippet;
					if (newSignature.includes(',') && !oldSignature.includes(',')) {
						// Added parameter: e.g. foo(a) -> foo(a, b)
						const innerArgs = match[1].trim();
						suggestedPatch = `${symbolName}(${innerArgs ? `${innerArgs}, /* added arg */` : '/* added arg */'})`;
					}

					predictions.push({
						targetFilePath: filePath.replace(/\\/g, '/'),
						targetLine: i + 1,
						targetColumn: col,
						symbolName,
						currentSnippet,
						suggestedPatch,
						confidence: 0.95
					});
				}
			}
		}

		return predictions;
	}
}
