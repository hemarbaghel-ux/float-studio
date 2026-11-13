/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as path from '../../../../../base/common/path.js';

function getNodeRuntime(): { fs: any; os: any } | null {
	try {
		if (typeof process !== 'undefined') {
			const getBuiltin = (process as any).getBuiltinModule;
			if (typeof getBuiltin === 'function') {
				return { fs: getBuiltin('fs'), os: getBuiltin('os') };
			}
			const req = (globalThis as any).require;
			if (typeof req === 'function') {
				return { fs: req('fs'), os: req('os') };
			}
		}
	} catch {}
	return null;
}

export type FloatMigrationSource = 'vscode' | 'cursor' | 'vscodium';

export interface IFloatDetectedEnvironment {
	source: FloatMigrationSource;
	name: string;
	userConfigPath: string;
	extensionsPath: string;
	hasSettings: boolean;
	hasKeybindings: boolean;
	hasSnippets: boolean;
	extensionCount: number;
}

export interface IFloatMigrationOptions {
	source: FloatMigrationSource;
	importSettings?: boolean;
	importKeybindings?: boolean;
	importSnippets?: boolean;
	importExtensions?: boolean;
	dryRun?: boolean;
}

export interface IFloatMigrationResult {
	source: FloatMigrationSource;
	success: boolean;
	settingsImported: number;
	keybindingsImported: number;
	snippetsImported: number;
	extensionsDiscovered: string[];
	backupCreatedPath?: string;
	errors: string[];
}

export class FloatEnvironmentMigrator {
	private readonly _homedir: string;
	private readonly _targetFloatConfigDir: string;

	constructor(homedir?: string, targetConfigDir?: string) {
		const os = getNodeRuntime()?.os;
		this._homedir = homedir || (os?.homedir ? os.homedir() : (typeof process !== 'undefined' && process.env?.USERPROFILE ? process.env.USERPROFILE : '/'));
		this._targetFloatConfigDir = targetConfigDir || this._resolveDefaultFloatConfigDir();
	}

	private _resolveDefaultFloatConfigDir(): string {
		const platform = process.platform;
		const os = getNodeRuntime()?.os;
		const defaultHome = os?.homedir ? os.homedir() : this._homedir;
		if (platform === 'win32') {
			const isDefaultHome = this._homedir === defaultHome;
			const appData = (isDefaultHome && process.env['APPDATA']) ? process.env['APPDATA'] : path.join(this._homedir, 'AppData', 'Roaming');
			return path.join(appData, 'FloatStudio', 'User');
		} else if (platform === 'darwin') {
			return path.join(this._homedir, 'Library', 'Application Support', 'FloatStudio', 'User');
		} else {
			const isDefaultHome = this._homedir === defaultHome;
			const configHome = (isDefaultHome && process.env['XDG_CONFIG_HOME']) ? process.env['XDG_CONFIG_HOME'] : path.join(this._homedir, '.config');
			return path.join(configHome, 'FloatStudio', 'User');
		}
	}

	public resolveSourcePaths(source: FloatMigrationSource): { userConfigPath: string; extensionsPath: string } {
		const platform = process.platform;
		const runtimeOs = getNodeRuntime()?.os;
		const defaultHome = runtimeOs?.homedir ? runtimeOs.homedir() : this._homedir;
		let configSubdir = 'Code';
		let extSubdir = '.vscode';

		if (source === 'cursor') {
			configSubdir = 'Cursor';
			extSubdir = '.cursor';
		} else if (source === 'vscodium') {
			configSubdir = 'VSCodium';
			extSubdir = '.vscode-oss';
		}

		let userConfigPath = '';
		if (platform === 'win32') {
			const isDefaultHome = this._homedir === defaultHome;
			const appData = (isDefaultHome && process.env['APPDATA']) ? process.env['APPDATA'] : path.join(this._homedir, 'AppData', 'Roaming');
			userConfigPath = path.join(appData, configSubdir, 'User');
		} else if (platform === 'darwin') {
			userConfigPath = path.join(this._homedir, 'Library', 'Application Support', configSubdir, 'User');
		} else {
			const isDefaultHome = this._homedir === defaultHome;
			const configHome = (isDefaultHome && process.env['XDG_CONFIG_HOME']) ? process.env['XDG_CONFIG_HOME'] : path.join(this._homedir, '.config');
			userConfigPath = path.join(configHome, configSubdir, 'User');
		}

		const extensionsPath = path.join(this._homedir, extSubdir, 'extensions');
		return { userConfigPath, extensionsPath };
	}

	public detectEnvironments(): IFloatDetectedEnvironment[] {
		const runtime = getNodeRuntime();
		if (!runtime) return [];
		const fs = runtime.fs;
		const sources: FloatMigrationSource[] = ['vscode', 'cursor', 'vscodium'];
		const results: IFloatDetectedEnvironment[] = [];

		for (const src of sources) {
			const { userConfigPath, extensionsPath } = this.resolveSourcePaths(src);

			const hasConfigDir = fs.existsSync(userConfigPath);
			const hasSettings = hasConfigDir && fs.existsSync(path.join(userConfigPath, 'settings.json'));
			const hasKeybindings = hasConfigDir && fs.existsSync(path.join(userConfigPath, 'keybindings.json'));
			const snippetsDir = path.join(userConfigPath, 'snippets');
			const hasSnippets = fs.existsSync(snippetsDir);

			let extensionCount = 0;
			if (fs.existsSync(extensionsPath)) {
				try {
					const items = fs.readdirSync(extensionsPath);
					extensionCount = items.filter((i: string) => !i.startsWith('.')).length;
				} catch {}
			}

			if (hasSettings || hasKeybindings || hasSnippets || extensionCount > 0) {
				const names: Record<FloatMigrationSource, string> = {
					vscode: 'Visual Studio Code',
					cursor: 'Cursor IDE',
					vscodium: 'VSCodium'
				};

				results.push({
					source: src,
					name: names[src],
					userConfigPath,
					extensionsPath,
					hasSettings,
					hasKeybindings,
					hasSnippets,
					extensionCount
				});
			}
		}

		return results;
	}

	public async migrate(options: IFloatMigrationOptions): Promise<IFloatMigrationResult> {
		const runtime = getNodeRuntime();
		if (!runtime) {
			return {
				source: options.source,
				success: false,
				settingsImported: 0,
				keybindingsImported: 0,
				snippetsImported: 0,
				extensionsDiscovered: [],
				errors: ['Node runtime unavailable in browser sandbox']
			};
		}
		const fs = runtime.fs;
		const { userConfigPath, extensionsPath } = this.resolveSourcePaths(options.source);
		const errors: string[] = [];
		let settingsImported = 0;
		let keybindingsImported = 0;
		let snippetsImported = 0;
		const extensionsDiscovered: string[] = [];

		if (!fs.existsSync(userConfigPath) && !fs.existsSync(extensionsPath)) {
			return {
				source: options.source,
				success: false,
				settingsImported: 0,
				keybindingsImported: 0,
				snippetsImported: 0,
				extensionsDiscovered: [],
				errors: [`Source environment ${options.source} not found on this machine.`]
			};
		}

		// Ensure target directory exists
		if (!options.dryRun && !fs.existsSync(this._targetFloatConfigDir)) {
			fs.mkdirSync(this._targetFloatConfigDir, { recursive: true });
		}

		let backupCreatedPath: string | undefined;

		// 1. Settings Migration
		if (options.importSettings !== false) {
			const srcSettingsPath = path.join(userConfigPath, 'settings.json');
			if (fs.existsSync(srcSettingsPath)) {
				try {
					const rawContent = fs.readFileSync(srcSettingsPath, 'utf8');
					const sourceSettings = this._stripJsonCommentsAndParse(rawContent);

					const targetSettingsPath = path.join(this._targetFloatConfigDir, 'settings.json');
					let currentSettings: Record<string, any> = {};

					if (fs.existsSync(targetSettingsPath)) {
						try {
							currentSettings = this._stripJsonCommentsAndParse(fs.readFileSync(targetSettingsPath, 'utf8'));
							// Create backup
							if (!options.dryRun) {
								const ts = Date.now();
								backupCreatedPath = path.join(this._targetFloatConfigDir, `settings.backup.${ts}.json`);
								fs.writeFileSync(backupCreatedPath, JSON.stringify(currentSettings, null, 2), 'utf8');
							}
						} catch {}
					}

					// Non-destructive merge (don't override existing float.* configurations)
					let mergedCount = 0;
					for (const [key, val] of Object.entries(sourceSettings)) {
						if (!key.startsWith('float.') && currentSettings[key] === undefined) {
							currentSettings[key] = val;
							mergedCount++;
						}
					}

					if (!options.dryRun) {
						fs.writeFileSync(targetSettingsPath, JSON.stringify(currentSettings, null, 2), 'utf8');
					}
					settingsImported = mergedCount;
				} catch (err: any) {
					errors.push(`Failed to migrate settings: ${err.message || err}`);
				}
			}
		}

		// 2. Keybindings Migration
		if (options.importKeybindings !== false) {
			const srcKeybindingsPath = path.join(userConfigPath, 'keybindings.json');
			if (fs.existsSync(srcKeybindingsPath)) {
				try {
					const rawContent = fs.readFileSync(srcKeybindingsPath, 'utf8');
					const sourceKeybindings = this._stripJsonCommentsAndParse(rawContent);

					if (Array.isArray(sourceKeybindings)) {
						const targetKeybindingsPath = path.join(this._targetFloatConfigDir, 'keybindings.json');
						let currentKeybindings: any[] = [];

						if (fs.existsSync(targetKeybindingsPath)) {
							try {
								const existing = this._stripJsonCommentsAndParse(fs.readFileSync(targetKeybindingsPath, 'utf8'));
								if (Array.isArray(existing)) {
									currentKeybindings = existing;
								}
							} catch {}
						}

						const existingCommands = new Set(currentKeybindings.map(k => k.command));
						const toAdd = sourceKeybindings.filter(k => k && k.command && !existingCommands.has(k.command));

						if (!options.dryRun && toAdd.length > 0) {
							const combined = [...currentKeybindings, ...toAdd];
							fs.writeFileSync(targetKeybindingsPath, JSON.stringify(combined, null, 2), 'utf8');
						}
						keybindingsImported = toAdd.length;
					}
				} catch (err: any) {
					errors.push(`Failed to migrate keybindings: ${err.message || err}`);
				}
			}
		}

		// 3. Snippets Migration
		if (options.importSnippets !== false) {
			const srcSnippetsDir = path.join(userConfigPath, 'snippets');
			if (fs.existsSync(srcSnippetsDir)) {
				try {
					const targetSnippetsDir = path.join(this._targetFloatConfigDir, 'snippets');
					if (!options.dryRun && !fs.existsSync(targetSnippetsDir)) {
						fs.mkdirSync(targetSnippetsDir, { recursive: true });
					}

					const snippetFiles = fs.readdirSync(srcSnippetsDir);
					for (const file of snippetFiles) {
						if (file.endsWith('.json') || file.endsWith('.code-snippets')) {
							const srcFile = path.join(srcSnippetsDir, file);
							const destFile = path.join(targetSnippetsDir, file);

							if (!fs.existsSync(destFile)) {
								if (!options.dryRun) {
									fs.copyFileSync(srcFile, destFile);
								}
								snippetsImported++;
							}
						}
					}
				} catch (err: any) {
					errors.push(`Failed to migrate snippets: ${err.message || err}`);
				}
			}
		}

		// 4. Extensions Discovery
		if (options.importExtensions !== false && fs.existsSync(extensionsPath)) {
			try {
				const entries = fs.readdirSync(extensionsPath);
				for (const entry of entries) {
					if (entry.startsWith('.') || !fs.statSync(path.join(extensionsPath, entry)).isDirectory()) {
						continue;
					}

					// Extension directories are usually named `publisher.name-version`
					const lastDash = entry.lastIndexOf('-');
					if (lastDash > 0) {
						const extId = entry.substring(0, lastDash);
						if (extId.includes('.')) {
							extensionsDiscovered.push(extId.toLowerCase());
						}
					}
				}
			} catch (err: any) {
				errors.push(`Failed to discover extensions: ${err.message || err}`);
			}
		}

		return {
			source: options.source,
			success: errors.length === 0,
			settingsImported,
			keybindingsImported,
			snippetsImported,
			extensionsDiscovered: Array.from(new Set(extensionsDiscovered)),
			backupCreatedPath,
			errors
		};
	}

	private _stripJsonCommentsAndParse(jsonStr: string): any {
		// Strip standard single-line // and multi-line /* */ comments
		const stripped = jsonStr
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/(^|[^\\:])\/\/.*$/gm, '$1')
			.trim();

		return JSON.parse(stripped || '{}');
	}
}
