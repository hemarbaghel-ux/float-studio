/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IFloatMention {
	readonly type: 'file' | 'folder' | 'codebase' | 'symbol';
	readonly value: string;
	readonly raw: string;
}

const MENTION_REGEX = /@(file|folder|codebase|symbol)(?::([^\s]+)|(?:\(([^)]+)\)))?/gi;

export function parseFloatMentions(text: string): IFloatMention[] {
	const mentions: IFloatMention[] = [];
	let match: RegExpExecArray | null;

	while ((match = MENTION_REGEX.exec(text)) !== null) {
		const type = (match[1] || '').toLowerCase() as IFloatMention['type'];
		const value = (match[2] || match[3] || '').trim();
		mentions.push({
			type,
			value,
			raw: match[0]
		});
	}

	return mentions;
}
