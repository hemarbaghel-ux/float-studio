/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Defensive Linux keyboard-layout check.
 *
 * Native keyboard metadata can be incomplete in headless CI containers or when
 * the optional native-keymap binding is unavailable. Treat incomplete metadata
 * as unknown (not US) and let the workbench select its key-code fallback mapper.
 */
export interface ILinuxKeyboardLayoutMetadata {
	layout?: unknown;
	group?: unknown;
}

export function isLinuxUsKeyboardLayout(layoutInfo: ILinuxKeyboardLayoutMetadata | null): boolean {
	if (!layoutInfo || typeof layoutInfo.layout !== 'string') {
		return false;
	}

	const layouts = layoutInfo.layout.split(/,/g);
	const group = typeof layoutInfo.group === 'number' && Number.isInteger(layoutInfo.group)
		? layoutInfo.group
		: 0;

	return layouts[group]?.trim() === 'us';
}
