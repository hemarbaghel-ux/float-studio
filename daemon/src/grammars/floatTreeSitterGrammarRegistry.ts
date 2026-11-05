/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IFloatLanguageGrammarProfile {
	languageId: string;
	extensions: string[];
	symbolPatterns: {
		kind: 'function' | 'class' | 'interface' | 'method' | 'struct' | 'enum' | 'type';
		regex: RegExp;
		captureGroupIndex: number;
		signatureRegex?: RegExp;
	}[];
	importPatterns: RegExp[];
	callPatterns: RegExp[];
	commentPrefix: string;
}

export class FloatTreeSitterGrammarRegistry {
	private readonly _profiles = new Map<string, IFloatLanguageGrammarProfile>();
	private readonly _extToLang = new Map<string, string>();

	constructor() {
		this._registerStandardProfiles();
	}

	private _registerStandardProfiles(): void {
		// 1. TypeScript & JavaScript
		this.registerProfile({
			languageId: 'typescript',
			extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
			symbolPatterns: [
				{ kind: 'function', regex: /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/g, captureGroupIndex: 1 },
				{ kind: 'class', regex: /(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z0-9_$]+)/g, captureGroupIndex: 1 },
				{ kind: 'interface', regex: /(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)/g, captureGroupIndex: 1 },
				{ kind: 'type', regex: /(?:export\s+)?type\s+([a-zA-Z0-9_$]+)\s*=/g, captureGroupIndex: 1 },
				{ kind: 'enum', regex: /(?:export\s+)?enum\s+([a-zA-Z0-9_$]+)/g, captureGroupIndex: 1 },
				{ kind: 'method', regex: /^\s*(?:(?:public|private|protected|async|static|\*)\s+)*([a-zA-Z0-9_$]+)\s*\([^\)]*\)\s*[:{]/g, captureGroupIndex: 1 }
			],
			importPatterns: [
				/import\s+(?:\{[^}]*\}|\*\s+as\s+[a-zA-Z0-9_$]+|[a-zA-Z0-9_$]+)\s+from\s+['"]([^'"]+)['"]/g,
				/require\(['"]([^'"]+)['"]\)/g
			],
			callPatterns: [/\b([a-zA-Z0-9_$]+)\s*\(/g],
			commentPrefix: '//'
		});

		// 2. Python
		this.registerProfile({
			languageId: 'python',
			extensions: ['.py', '.pyi'],
			symbolPatterns: [
				{ kind: 'function', regex: /^\s*(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(/gm, captureGroupIndex: 1 },
				{ kind: 'class', regex: /^\s*class\s+([a-zA-Z0-9_]+)(?:\([^\)]*\))?:/gm, captureGroupIndex: 1 }
			],
			importPatterns: [
				/^\s*(?:from\s+([a-zA-Z0-9_.]+)\s+import|import\s+([a-zA-Z0-9_.]+))/gm
			],
			callPatterns: [/\b([a-zA-Z0-9_]+)\s*\(/g],
			commentPrefix: '#'
		});

		// 3. Rust
		this.registerProfile({
			languageId: 'rust',
			extensions: ['.rs'],
			symbolPatterns: [
				{ kind: 'function', regex: /(?:pub(?:\([^\)]*\))?\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)/g, captureGroupIndex: 1 },
				{ kind: 'struct', regex: /(?:pub(?:\([^\)]*\))?\s+)?struct\s+([a-zA-Z0-9_]+)/g, captureGroupIndex: 1 },
				{ kind: 'enum', regex: /(?:pub(?:\([^\)]*\))?\s+)?enum\s+([a-zA-Z0-9_]+)/g, captureGroupIndex: 1 },
				{ kind: 'interface', regex: /(?:pub(?:\([^\)]*\))?\s+)?trait\s+([a-zA-Z0-9_]+)/g, captureGroupIndex: 1 }
			],
			importPatterns: [/use\s+([a-zA-Z0-9_:]+)(?:::\{[^}]*\})?;/g],
			callPatterns: [/\b([a-zA-Z0-9_]+)\s*(?:::<[^>]+>)?\s*\(/g],
			commentPrefix: '//'
		});

		// 4. Go
		this.registerProfile({
			languageId: 'go',
			extensions: ['.go'],
			symbolPatterns: [
				{ kind: 'function', regex: /func\s+(?:\([^\)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(/g, captureGroupIndex: 1 },
				{ kind: 'struct', regex: /type\s+([a-zA-Z0-9_]+)\s+struct\s*\{/g, captureGroupIndex: 1 },
				{ kind: 'interface', regex: /type\s+([a-zA-Z0-9_]+)\s+interface\s*\{/g, captureGroupIndex: 1 }
			],
			importPatterns: [/import\s+(?:\([^\)]*\)|"([^"]+)")/g],
			callPatterns: [/\b([a-zA-Z0-9_]+)\s*\(/g],
			commentPrefix: '//'
		});

		// 5. C / C++
		this.registerProfile({
			languageId: 'cpp',
			extensions: ['.cpp', '.cc', '.cxx', '.c', '.h', '.hpp'],
			symbolPatterns: [
				{ kind: 'class', regex: /(?:class|struct)\s+([a-zA-Z0-9_]+)\s*[{:]/g, captureGroupIndex: 1 },
				{ kind: 'function', regex: /(?:[a-zA-Z0-9_:<>]+\s+)+([a-zA-Z0-9_]+)\s*\([^\)]*\)\s*[{;]/g, captureGroupIndex: 1 }
			],
			importPatterns: [/#include\s+[<"]([^>"]+)[>"]/g],
			callPatterns: [/\b([a-zA-Z0-9_]+)\s*\(/g],
			commentPrefix: '//'
		});

		// 6. Java
		this.registerProfile({
			languageId: 'java',
			extensions: ['.java'],
			symbolPatterns: [
				{ kind: 'class', regex: /(?:public|protected|private)?\s*(?:static\s+)?(?:final\s+)?(?:class|enum)\s+([a-zA-Z0-9_]+)/g, captureGroupIndex: 1 },
				{ kind: 'interface', regex: /(?:public|protected|private)?\s*interface\s+([a-zA-Z0-9_]+)/g, captureGroupIndex: 1 },
				{ kind: 'function', regex: /(?:public|protected|private)?\s*(?:static\s+)?(?:final\s+)?[a-zA-Z0-9_<>[\]]+\s+([a-zA-Z0-9_]+)\s*\([^\)]*\)\s*(?:throws\s+[a-zA-Z0-9_, ]+)?\s*\{/g, captureGroupIndex: 1 }
			],
			importPatterns: [/import\s+(?:static\s+)?([a-zA-Z0-9_.]+);/g],
			callPatterns: [/\b([a-zA-Z0-9_]+)\s*\(/g],
			commentPrefix: '//'
		});

		// 7. Ruby
		this.registerProfile({
			languageId: 'ruby',
			extensions: ['.rb', '.rake'],
			symbolPatterns: [
				{ kind: 'function', regex: /^\s*def\s+([a-zA-Z0-9_!?]+)/gm, captureGroupIndex: 1 },
				{ kind: 'class', regex: /^\s*class\s+([a-zA-Z0-9_:]+)/gm, captureGroupIndex: 1 },
				{ kind: 'interface', regex: /^\s*module\s+([a-zA-Z0-9_:]+)/gm, captureGroupIndex: 1 }
			],
			importPatterns: [/require(?:_relative)?\s+['"]([^'"]+)['"]/g],
			callPatterns: [/\b([a-zA-Z0-9_]+)\s*(?:\(|$)/g],
			commentPrefix: '#'
		});

		// 8. PHP
		this.registerProfile({
			languageId: 'php',
			extensions: ['.php'],
			symbolPatterns: [
				{ kind: 'function', regex: /(?:public|protected|private)?\s*(?:static\s+)?function\s+([a-zA-Z0-9_]+)/g, captureGroupIndex: 1 },
				{ kind: 'class', regex: /(?:abstract\s+)?class\s+([a-zA-Z0-9_]+)/g, captureGroupIndex: 1 },
				{ kind: 'interface', regex: /interface\s+([a-zA-Z0-9_]+)/g, captureGroupIndex: 1 }
			],
			importPatterns: [/(?:use|require|include)(?:_once)?\s+['"]?([^'";]+)['"]?;/g],
			callPatterns: [/\b([a-zA-Z0-9_]+)\s*\(/g],
			commentPrefix: '//'
		});
	}

	public registerProfile(profile: IFloatLanguageGrammarProfile): void {
		this._profiles.set(profile.languageId, profile);
		for (const ext of profile.extensions) {
			this._extToLang.set(ext.toLowerCase(), profile.languageId);
		}
	}

	public getProfileByExtension(ext: string): IFloatLanguageGrammarProfile | undefined {
		const langId = this._extToLang.get(ext.toLowerCase());
		return langId ? this._profiles.get(langId) : undefined;
	}

	public getProfile(languageId: string): IFloatLanguageGrammarProfile | undefined {
		return this._profiles.get(languageId);
	}

	public getSupportedLanguages(): string[] {
		return Array.from(this._profiles.keys());
	}
}
