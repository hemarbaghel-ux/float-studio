/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IFloatService, IFloatMessage } from '../../common/floatService.js';

export interface IFloatChatContextChip {
	type: 'codebase' | 'file' | 'folder' | 'symbol' | 'terminal' | 'git' | 'docs';
	label: string;
	value: string;
}

export interface IFloatCodeBlock {
	id: string;
	language: string;
	code: string;
	targetPath?: string;
}

export interface IFloatChatViewMessage extends IFloatMessage {
	contextChips?: IFloatChatContextChip[];
	codeBlocks?: IFloatCodeBlock[];
	streaming?: boolean;
}

export interface IFloatChatSession {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	messages: IFloatChatViewMessage[];
	modelId: string;
}

export class FloatChatViewPane extends Disposable {
	static readonly ID = 'workbench.view.floatChat';
	static readonly TITLE = 'FLOAT Chat';

	private readonly _sessions = new Map<string, IFloatChatSession>();
	private _activeSessionId: string | null = null;
	private _isStreaming: boolean = false;

	private readonly _onDidChangeActiveSession = this._register(new Emitter<IFloatChatSession | null>());
	public readonly onDidChangeActiveSession: Event<IFloatChatSession | null> = this._onDidChangeActiveSession.event;

	private readonly _onDidChangeMessages = this._register(new Emitter<IFloatChatViewMessage[]>());
	public readonly onDidChangeMessages: Event<IFloatChatViewMessage[]> = this._onDidChangeMessages.event;

	private readonly _onDidStartStreaming = this._register(new Emitter<void>());
	public readonly onDidStartStreaming: Event<void> = this._onDidStartStreaming.event;

	private readonly _onDidStopStreaming = this._register(new Emitter<void>());
	public readonly onDidStopStreaming: Event<void> = this._onDidStopStreaming.event;

	constructor(
		private readonly _floatService?: IFloatService
	) {
		super();
		this.createNewSession('New Chat');
	}

	public getSessions(): IFloatChatSession[] {
		return Array.from(this._sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt);
	}

	public getActiveSession(): IFloatChatSession | null {
		return this._activeSessionId ? (this._sessions.get(this._activeSessionId) || null) : null;
	}

	public createNewSession(title: string = 'New Conversation'): IFloatChatSession {
		const id = `chat-session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
		const modelId = this._floatService ? this._floatService.getActiveModel().id : 'gpt-6-astra';
		const session: IFloatChatSession = {
			id,
			title,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			messages: [],
			modelId
		};
		this._sessions.set(id, session);
		this.setActiveSession(id);
		return session;
	}

	public setActiveSession(sessionId: string): boolean {
		const session = this._sessions.get(sessionId);
		if (!session) {
			return false;
		}
		this._activeSessionId = sessionId;
		this._onDidChangeActiveSession.fire(session);
		this._onDidChangeMessages.fire(session.messages);
		return true;
	}

	public deleteSession(sessionId: string): boolean {
		this._floatService?.cancelActiveStream(sessionId);
		const deleted = this._sessions.delete(sessionId);
		if (this._activeSessionId === sessionId) {
			const remaining = this.getSessions();
			if (remaining.length > 0) {
				this.setActiveSession(remaining[0].id);
			} else {
				this.createNewSession('New Chat');
			}
		}
		return deleted;
	}

	public clearActiveSessionMessages(): void {
		const session = this.getActiveSession();
		if (!session) {
			return;
		}
		this._floatService?.cancelActiveStream(session.id);
		session.messages = [];
		session.updatedAt = Date.now();
		this._onDidChangeMessages.fire([]);
	}

	public async sendUserMessage(
		text: string,
		contextChips: IFloatChatContextChip[] = []
	): Promise<void> {
		const session = this.getActiveSession();
		if (!session || !text.trim() || this._isStreaming) {
			return;
		}

		const userMsg: IFloatChatViewMessage = {
			id: `msg-${Date.now()}-user`,
			role: 'user',
			content: text.trim(),
			timestamp: Date.now(),
			contextChips: [...contextChips]
		};

		session.messages.push(userMsg);
		session.updatedAt = Date.now();
		if (session.messages.length === 1 && (session.title === 'New Chat' || session.title === 'New Conversation')) {
			session.title = text.trim().slice(0, 36) + (text.length > 36 ? '...' : '');
		}
		this._onDidChangeMessages.fire(session.messages);

		const assistantMsg: IFloatChatViewMessage = {
			id: `msg-${Date.now()}-assistant`,
			role: 'assistant',
			content: '',
			timestamp: Date.now(),
			streaming: true
		};
		session.messages.push(assistantMsg);
		this._onDidChangeMessages.fire(session.messages);

		this._isStreaming = true;
		this._onDidStartStreaming.fire();

		try {
			if (this._floatService) {
				const apiMessages = session.messages
					.filter(m => m !== assistantMsg)
					.map(m => ({
						id: m.id,
						role: m.role,
						content: m.content,
						timestamp: m.timestamp
					}));

				await this._floatService.streamChat(apiMessages, {
					onChunk: (delta: string) => {
						assistantMsg.content += delta;
						assistantMsg.codeBlocks = this.extractCodeBlocks(assistantMsg.content);
						this._onDidChangeMessages.fire(session.messages);
					},
					onError: (err: Error) => {
						assistantMsg.content += `\n\n**Error during inference:** ${err.message}`;
						assistantMsg.streaming = false;
						this._onDidChangeMessages.fire(session.messages);
					},
					onComplete: (fullText: string) => {
						assistantMsg.content = fullText || assistantMsg.content;
						assistantMsg.codeBlocks = this.extractCodeBlocks(assistantMsg.content);
						assistantMsg.streaming = false;
						session.updatedAt = Date.now();
						this._onDidChangeMessages.fire(session.messages);
					},
					undefined,
					undefined,
					undefined,
					session.id
				);
			} else {
				// Local fallback when no service injected
				assistantMsg.content = `FLOAT Chat ready. Received query: "${text.trim()}".`;
				assistantMsg.codeBlocks = this.extractCodeBlocks(assistantMsg.content);
				assistantMsg.streaming = false;
				this._onDidChangeMessages.fire(session.messages);
			}
		} finally {
			this._isStreaming = false;
			this._onDidStopStreaming.fire();
		}
	}

	public extractCodeBlocks(markdown: string): IFloatCodeBlock[] {
		const blocks: IFloatCodeBlock[] = [];
		const fenceRegex = /```([a-zA-Z0-9_\-+]*)\n([\s\S]*?)```/g;
		let match: RegExpExecArray | null;
		let index = 0;

		while ((match = fenceRegex.exec(markdown)) !== null) {
			const language = (match[1] || 'plaintext').trim();
			const code = match[2];
			blocks.push({
				id: `code-${index++}`,
				language,
				code
			});
		}

		return blocks;
	}

	public exportConversationToMarkdown(): string {
		const session = this.getActiveSession();
		if (!session) {
			return '';
		}

		let md = `# ${session.title}\n\n*Created on ${new Date(session.createdAt).toISOString()}*\n\n---\n\n`;
		for (const msg of session.messages) {
			const sender = msg.role === 'user' ? '👤 **User**' : '✨ **FLOAT AI**';
			md += `${sender} (${new Date(msg.timestamp).toLocaleTimeString()}):\n\n${msg.content}\n\n---\n\n`;
		}
		return md;
	}

	public renderDOM(container: HTMLElement): HTMLElement {
		container.innerHTML = '';
		const root = document.createElement('div');
		root.className = 'float-chat-view-container';
		root.style.display = 'flex';
		root.style.flexDirection = 'column';
		root.style.height = '100%';
		root.style.overflow = 'hidden';

		const header = document.createElement('div');
		header.className = 'float-chat-header';
		header.style.padding = '8px 12px';
		header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
		header.style.display = 'flex';
		header.style.justifyContent = 'space-between';
		header.style.alignItems = 'center';

		const titleSpan = document.createElement('span');
		titleSpan.textContent = this.getActiveSession()?.title || 'FLOAT Chat';
		titleSpan.style.fontWeight = '600';
		header.appendChild(titleSpan);

		const threadContainer = document.createElement('div');
		threadContainer.className = 'float-chat-messages-thread';
		threadContainer.style.flex = '1';
		threadContainer.style.overflowY = 'auto';
		threadContainer.style.padding = '12px';

		const inputArea = document.createElement('div');
		inputArea.className = 'float-chat-input-area';
		inputArea.style.padding = '8px 12px';
		inputArea.style.borderTop = '1px solid rgba(255, 255, 255, 0.1)';

		root.appendChild(header);
		root.appendChild(threadContainer);
		root.appendChild(inputArea);

		container.appendChild(root);
		return root;
	}

	public override dispose(): void {
		this._sessions.clear();
		super.dispose();
	}
}
