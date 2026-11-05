/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';

export interface IFloatRuleDefinition {
	id: string;
	sourceFileName: '.floatrules' | '.cursorrules' | '.windsurfrules' | '.clinerules';
	directoryScope: string;
	globPatterns?: string[];
	content: string;
	priority: number;
}

export interface IFloatRuleValidationResult {
	valid: boolean;
	violations: string[];
}

export class FloatRulesGovernanceService implements IDisposable {
	private readonly _rules: IFloatRuleDefinition[] = [];

	public registerRule(rule: IFloatRuleDefinition): void {
		this._rules.push(rule);
		this._rules.sort((a, b) => b.priority - a.priority);
	}

	public loadFromText(sourceFileName: IFloatRuleDefinition['sourceFileName'], directoryScope: string, rawContent: string): IFloatRuleDefinition {
		const rule: IFloatRuleDefinition = {
			id: `rule-${sourceFileName}-${directoryScope}-${Date.now()}`,
			sourceFileName,
			directoryScope,
			content: rawContent.trim(),
			priority: sourceFileName === '.floatrules' ? 100 : (sourceFileName === '.cursorrules' ? 80 : 50)
		};

		this.registerRule(rule);
		return rule;
	}

	public getPromptGuidelinesForFile(filePath: string): string[] {
		const matchedRules: string[] = [];

		for (const rule of this._rules) {
			const normFile = filePath.replace(/\\/g, '/');
			const normScope = rule.directoryScope.replace(/\\/g, '/');

			if (normFile.startsWith(normScope)) {
				// Matched directory scope
				matchedRules.push(`[Rule from ${rule.sourceFileName} (${normScope})]:\n${rule.content}`);
			}
		}

		return matchedRules;
	}

	public validateProposedEdits(filePath: string, proposedContent: string): IFloatRuleValidationResult {
		const violations: string[] = [];
		const activeGuidelines = this.getPromptGuidelinesForFile(filePath).join('\n');

		// Check for forbidden anti-patterns specified in common rules
		if (activeGuidelines.includes('no-any') && /:\s*any\b/.test(proposedContent)) {
			violations.push('TypeScript "any" type detected in violation of project guidelines');
		}

		if (activeGuidelines.includes('no-console-log') && /console\.log\(/.test(proposedContent)) {
			violations.push('console.log statement detected in violation of strict production rules');
		}

		return {
			valid: violations.length === 0,
			violations
		};
	}

	public getLoadedRules(): IFloatRuleDefinition[] {
		return [...this._rules];
	}

	public dispose(): void {
		this._rules.length = 0;
	}
}
