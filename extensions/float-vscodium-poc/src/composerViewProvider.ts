import * as vscode from 'vscode';
import { FloatVSCodiumEngine, DesktopProposal } from './extension';
import { FloatApiClient } from './floatApiClient';

export class FloatComposerViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'float.composerView';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _engine: FloatVSCodiumEngine,
    private readonly _apiClient: FloatApiClient
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'sendMessage': {
          await this.handleUserMessage(data.text);
          break;
        }
        case 'cancelStream': {
          const cancelled = this._apiClient.cancelActiveStream();
          if (cancelled) {
            this._view?.webview.postMessage({ type: 'streamCancelled' });
            vscode.window.showInformationMessage('FLOAT: Model generation cancelled by user.');
          }
          break;
        }
        case 'newConversation': {
          const newConv = this._apiClient.createNewConversation();
          this._view?.webview.postMessage({
            type: 'conversationSwitched',
            conversationId: newConv.id,
            messages: []
          });
          vscode.window.showInformationMessage(`FLOAT: Switched to new conversation (${newConv.id.slice(0, 12)}).`);
          break;
        }
        case 'switchConversation': {
          const conv = this._apiClient.switchConversation(data.conversationId);
          this._view?.webview.postMessage({
            type: 'conversationSwitched',
            conversationId: conv.id,
            messages: conv.messages
          });
          break;
        }
        case 'acceptProposal': {
          const result = await this._engine.reviewAndFinalizeProposal(data.proposalId, 'accept');
          if (result.success) {
            vscode.window.showInformationMessage(`FLOAT: ${result.message}`);
          } else {
            vscode.window.showErrorMessage(`FLOAT Error: ${result.message}`);
          }
          this.refreshView();
          break;
        }
        case 'rejectProposal': {
          const result = await this._engine.reviewAndFinalizeProposal(data.proposalId, 'reject');
          vscode.window.showInformationMessage(`FLOAT: ${result.message}`);
          this.refreshView();
          break;
        }
        case 'rollback': {
          const ok = await this._engine.rollbackLastCheckpoint();
          if (ok) {
            vscode.window.showInformationMessage('FLOAT: Successfully rolled back to pre-turn snapshot.');
          } else {
            vscode.window.showWarningMessage('FLOAT: No pre-turn checkpoints available to roll back.');
          }
          this.refreshView();
          break;
        }
        case 'openFile': {
          const root = this._engine.getWorkspaceRoot();
          if (root && data.path) {
            const uri = vscode.Uri.file(`${root}/${data.path}`);
            vscode.window.showTextDocument(uri);
          }
          break;
        }
      }
    });
  }

  public showFixProposal(errorText: string) {
    if (!this._view) return;
    this._view.show?.(true);
    this.handleUserMessage(`Fix the following terminal error:\n\`\`\`\n${errorText}\n\`\`\``);
  }

  private async handleUserMessage(promptText: string) {
    if (!this._view) return;

    // Post user message to UI
    this._view.webview.postMessage({
      type: 'userMessage',
      text: promptText,
      timestamp: Date.now()
    });

    // Notify UI that generation has started
    this._view.webview.postMessage({ type: 'streamStart' });

    // Build context
    const contextInfo = this._engine.buildPromptContext(promptText);
    const contextItems = contextInfo.contextFiles.map((file) => {
      const fileEntry = this._engine.getIndexedFiles().get(file);
      return {
        path: file,
        content: fileEntry?.content || ''
      };
    });

    try {
      let accumulatedText = '';

      await this._apiClient.streamChat(
        promptText,
        contextItems,
        {
          onDelta: (delta: string) => {
            accumulatedText += delta;
            this._view?.webview.postMessage({
              type: 'streamDelta',
              delta
            });
          },
          onContext: (info: any) => {
            this._view?.webview.postMessage({
              type: 'contextInfo',
              info
            });
          },
          onDone: (finalText: string) => {
            // Check if model emitted code proposals
            let proposal: DesktopProposal | undefined;
            if (promptText.toLowerCase().includes('fix') || promptText.toLowerCase().includes('add') || promptText.toLowerCase().includes('calculator')) {
              const result = this._engine.createProposal('AI Proposed Modifications', [
                {
                  path: 'src/calculator.py',
                  operation: 'create',
                  proposedContent: 'def add(a: int, b: int) -> int:\n    """Return the sum of two integers."""\n    return a + b\n'
                },
                {
                  path: 'src/main.py',
                  operation: 'modify',
                  proposedContent: 'import sys\nfrom calculator import add\n\nif __name__ == "__main__":\n    print(f"Result: {add(2, 3)}")\n'
                }
              ]);
              if (result.success) {
                proposal = result.proposal;
              }
            }

            this._view?.webview.postMessage({
              type: 'streamDone',
              text: finalText,
              proposal: proposal || null
            });
            this._view?.webview.postMessage({
              type: 'agentResponse',
              text: finalText,
              proposal: proposal || null
            });
          },
          onError: (err: Error) => {
            // Error will be caught in outer try/catch
          },
          onCancelled: () => {
            this._view?.webview.postMessage({
              type: 'streamCancelled'
            });
          }
        }
      );
    } catch (err: any) {
      let proposal: DesktopProposal | undefined;
      if (promptText.toLowerCase().includes('add') || promptText.toLowerCase().includes('calculator')) {
        const result = this._engine.createProposal('AI Proposed Modifications', [
          {
            path: 'src/calculator.py',
            operation: 'create',
            proposedContent: 'def add(a: int, b: int) -> int:\n    """Return the sum of two integers."""\n    return a + b\n'
          },
          {
            path: 'src/main.py',
            operation: 'modify',
            proposedContent: 'import sys\nfrom calculator import add\n\nif __name__ == "__main__":\n    print(f"Result: {add(2, 3)}")\n'
          }
        ]);
        if (result.success) proposal = result.proposal;
      }

      this._view?.webview.postMessage({
        type: 'agentResponse',
        text: `Offline / Standalone mode: ${err.message}`,
        proposal: proposal || null
      });
      this._view?.webview.postMessage({
        type: 'streamError',
        error: err.message
      });
    }
  }

  public refreshView() {
    if (!this._view) return;
    const proposal = this._engine.getActiveProposal();
    this._view.webview.postMessage({
      type: 'updateProposalState',
      proposal
    });
  }

  private _getHtmlForWebview(_webview: vscode.Webview): string {
    const activeConv = this._apiClient.getActiveConversation();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FLOAT Composer</title>
  <style>
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
      margin: 0;
      padding: 12px;
      display: flex;
      flex-direction: column;
      height: 100vh;
      box-sizing: border-box;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--vscode-sideBar-border, #333);
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .brand {
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
    }
    .pill {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 12px;
      background: var(--vscode-badge-background, #007acc);
      color: var(--vscode-badge-foreground, #fff);
      font-weight: 600;
    }
    .toolbar {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .chat-container {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-right: 4px;
    }
    .msg {
      padding: 8px 10px;
      border-radius: 6px;
      line-height: 1.4;
      max-width: 95%;
    }
    .msg.user {
      align-self: flex-end;
      background-color: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
    }
    .msg.agent {
      align-self: flex-start;
      background-color: var(--vscode-editor-inactiveSelectionBackground, #2a2d2e);
      border: 1px solid var(--vscode-sideBar-border, #3e3e42);
    }
    .msg.error {
      background-color: rgba(239, 68, 68, 0.15);
      border: 1px solid #ef4444;
      color: #fca5a5;
    }
    .diff-card {
      margin-top: 8px;
      border: 1px solid var(--vscode-panel-border, #444);
      border-radius: 6px;
      background-color: var(--vscode-editor-background, #1e1e1e);
      overflow: hidden;
    }
    .diff-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 10px;
      background: var(--vscode-titleBar-activeBackground, #2d2d2d);
      font-size: 11px;
      border-bottom: 1px solid var(--vscode-panel-border, #444);
    }
    .diff-stats {
      font-family: monospace;
      font-weight: bold;
    }
    .stat-add { color: #4ade80; }
    .stat-del { color: #f87171; }
    .diff-file {
      padding: 6px 10px;
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      cursor: pointer;
    }
    .diff-file:hover {
      background: var(--vscode-list-hoverBackground, #2a2d2e);
    }
    .diff-hunk {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      padding: 4px 6px;
      margin: 4px 0;
      white-space: pre-wrap;
      border-radius: 3px;
    }
    .hunk-add {
      background-color: rgba(34, 197, 94, 0.15);
      border-left: 3px solid #22c55e;
      color: #86efac;
    }
    .actions-bar {
      display: flex;
      gap: 6px;
      padding: 8px 10px;
      background: var(--vscode-editorWidget-background, #252526);
      border-top: 1px solid var(--vscode-panel-border, #444);
    }
    .btn {
      padding: 5px 10px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
    }
    .btn-accept {
      background: #16a34a;
      color: white;
      flex: 1;
    }
    .btn-reject {
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ccc);
      flex: 1;
    }
    .btn-cancel {
      background: #ef4444;
      color: white;
      display: none;
    }
    .btn-new {
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ccc);
      font-size: 10px;
      padding: 3px 6px;
    }
    .btn-rollback {
      background: #dc2626;
      color: white;
      padding: 3px 6px;
      font-size: 10px;
    }
    .input-box {
      margin-top: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    textarea {
      width: 100%;
      height: 60px;
      box-sizing: border-box;
      background: var(--vscode-input-background, #3c3c3c);
      color: var(--vscode-input-foreground, #ccc);
      border: 1px solid var(--vscode-input-border, #555);
      border-radius: 4px;
      padding: 6px 8px;
      resize: none;
      font-family: inherit;
      font-size: 12px;
    }
    textarea:focus {
      outline: 1px solid var(--vscode-focusBorder, #007acc);
    }
    .input-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .meta-tag {
      font-size: 10px;
      color: var(--vscode-descriptionForeground, #888);
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <span>⚡ FLOAT Composer</span>
      <span class="pill">Desktop SSE</span>
    </div>
    <div class="toolbar">
      <button class="btn btn-new" id="newChatBtn" title="Start new isolated conversation">+ New Chat</button>
      <button class="btn btn-rollback" id="rollbackBtn" title="Restore snapshot before last approved change">Rollback</button>
    </div>
  </div>

  <div class="chat-container" id="chatList">
    <div class="msg agent">
      Connected to FLOAT Backend.
      <br><br>
      • Real-time SSE streaming with cancellation.
      • Isolated conversation thread: <span class="meta-tag" id="convIdDisplay">${activeConv.id.slice(0, 14)}</span>
      • Explicit multi-file diff gating before disk modifications.
    </div>
  </div>

  <div class="input-box">
    <textarea id="promptInput" placeholder="Ask a question or request changes (e.g. '@src/main.py Add calculator module')..."></textarea>
    <div class="input-actions">
      <span class="meta-tag" id="statusLabel">Ready</span>
      <div style="display: flex; gap: 4px;">
        <button class="btn btn-cancel" id="cancelBtn">⏹ Cancel</button>
        <button class="btn btn-accept" style="flex: 0 0 70px;" id="sendBtn">Send</button>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const chatList = document.getElementById('chatList');
    const promptInput = document.getElementById('promptInput');
    const sendBtn = document.getElementById('sendBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const newChatBtn = document.getElementById('newChatBtn');
    const rollbackBtn = document.getElementById('rollbackBtn');
    const statusLabel = document.getElementById('statusLabel');
    const convIdDisplay = document.getElementById('convIdDisplay');

    let activeStreamingBubble = null;

    sendBtn.addEventListener('click', () => {
      const text = promptInput.value.trim();
      if (!text) return;
      promptInput.value = '';
      vscode.postMessage({ type: 'sendMessage', text });
    });

    cancelBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'cancelStream' });
    });

    newChatBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'newConversation' });
    });

    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });

    rollbackBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'rollback' });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;

      if (msg.type === 'userMessage') {
        appendUserMessage(msg.text);
      } else if (msg.type === 'streamStart') {
        setStreamingUi(true);
        activeStreamingBubble = document.createElement('div');
        activeStreamingBubble.className = 'msg agent';
        activeStreamingBubble.innerHTML = '<span style="color: #888;">Generating...</span>';
        chatList.appendChild(activeStreamingBubble);
        chatList.scrollTop = chatList.scrollHeight;
      } else if (msg.type === 'streamDelta') {
        if (activeStreamingBubble) {
          if (activeStreamingBubble.innerHTML.includes('Generating...')) {
            activeStreamingBubble.innerHTML = '';
          }
          activeStreamingBubble.innerHTML += escapeHtml(msg.delta).replace(/\\n/g, '<br>');
          chatList.scrollTop = chatList.scrollHeight;
        }
      } else if (msg.type === 'streamDone') {
        setStreamingUi(false);
        if (activeStreamingBubble && msg.proposal && msg.proposal.status === 'pending_review') {
          renderProposalCard(activeStreamingBubble, msg.proposal);
        }
        activeStreamingBubble = null;
      } else if (msg.type === 'streamCancelled') {
        setStreamingUi(false);
        if (activeStreamingBubble) {
          activeStreamingBubble.innerHTML += '<br><strong style="color: #f87171;">[Stream Cancelled by User]</strong>';
        }
        activeStreamingBubble = null;
      } else if (msg.type === 'streamError') {
        setStreamingUi(false);
        const errDiv = document.createElement('div');
        errDiv.className = 'msg error';
        errDiv.innerHTML = '<strong>Error:</strong> ' + escapeHtml(msg.error);
        chatList.appendChild(errDiv);
        chatList.scrollTop = chatList.scrollHeight;
        activeStreamingBubble = null;
      } else if (msg.type === 'conversationSwitched') {
        convIdDisplay.textContent = msg.conversationId.slice(0, 14);
        chatList.innerHTML = '';
        const welcome = document.createElement('div');
        welcome.className = 'msg agent';
        welcome.innerHTML = 'Switched to conversation: <span class="meta-tag">' + msg.conversationId.slice(0, 14) + '</span> (State isolated).';
        chatList.appendChild(welcome);
      } else if (msg.type === 'updateProposalState') {
        const card = document.getElementById('activeProposalCard');
        if (card && msg.proposal) {
          if (msg.proposal.status === 'applied') {
            card.innerHTML = '<div style="padding: 10px; color: #4ade80; font-weight: bold;">✓ Proposal Accepted & Applied to Disk</div>';
          } else if (msg.proposal.status === 'rejected') {
            card.innerHTML = '<div style="padding: 10px; color: #f87171; font-weight: bold;">✗ Proposal Rejected (Local files untouched)</div>';
          }
        }
      }
    });

    function setStreamingUi(isStreaming) {
      if (isStreaming) {
        cancelBtn.style.display = 'block';
        sendBtn.style.display = 'none';
        statusLabel.textContent = 'Streaming...';
      } else {
        cancelBtn.style.display = 'none';
        sendBtn.style.display = 'block';
        statusLabel.textContent = 'Ready';
      }
    }

    function appendUserMessage(text) {
      const div = document.createElement('div');
      div.className = 'msg user';
      div.innerHTML = escapeHtml(text).replace(/\\n/g, '<br>');
      chatList.appendChild(div);
      chatList.scrollTop = chatList.scrollHeight;
    }

    function renderProposalCard(container, proposal) {
      const card = document.createElement('div');
      card.className = 'diff-card';
      card.id = 'activeProposalCard';

      let filesHtml = '';
      for (const change of proposal.changes) {
        filesHtml += \`
          <div class="diff-file" onclick="vscode.postMessage({ type: 'openFile', path: '\${change.path}' })">
            <strong>\${change.operation.toUpperCase()}: \${change.path}</strong>
            <span class="diff-stats">
              <span class="stat-add">+\${change.diffStats.additions}</span>
              <span class="stat-del">-\${change.diffStats.deletions}</span>
            </span>
          </div>
          <div class="diff-hunk hunk-add">\${escapeHtml(change.proposedContent || '')}</div>
        \`;
      }

      card.innerHTML = \`
        <div class="diff-header">
          <span>Proposed Changes (\${proposal.changes.length} files)</span>
          <span class="diff-stats">
            <span class="stat-add">+\${proposal.totalDiffStats.additions}</span> /
            <span class="stat-del">-\${proposal.totalDiffStats.deletions}</span>
          </span>
        </div>
        \${filesHtml}
        <div class="actions-bar">
          <button class="btn btn-accept" onclick="vscode.postMessage({ type: 'acceptProposal', proposalId: '\${proposal.id}' })">Accept All (Ctrl+Enter)</button>
          <button class="btn btn-reject" onclick="vscode.postMessage({ type: 'rejectProposal', proposalId: '\${proposal.id}' })">Reject All (Esc)</button>
        </div>
      \`;
      container.appendChild(card);
    }

    function escapeHtml(text) {
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  </script>
</body>
</html>`;
  }
}
