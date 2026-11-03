import * as vscode from 'vscode';

export class FloatInlineDiffController {
  private addedDecorationType: vscode.TextEditorDecorationType;
  private removedDecorationType: vscode.TextEditorDecorationType;
  private activeSession: {
    editor: vscode.TextEditor;
    range: vscode.Range;
    originalText: string;
    proposedText: string;
  } | null = null;

  constructor() {
    this.addedDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(34, 197, 94, 0.25)',
      isWholeLine: true,
      overviewRulerColor: 'green',
      overviewRulerLane: vscode.OverviewRulerLane.Left
    });

    this.removedDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(239, 68, 68, 0.25)',
      isWholeLine: true,
      textDecoration: 'line-through',
      overviewRulerColor: 'red',
      overviewRulerLane: vscode.OverviewRulerLane.Right
    });
  }

  /**
   * Triggered on Ctrl+K / Cmd+K
   */
  async startInlineEdit(editor: vscode.TextEditor): Promise<void> {
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection.isEmpty ? undefined : selection);

    const prompt = await vscode.window.showInputBox({
      prompt: 'FLOAT: Describe code change for inline transformation...',
      placeHolder: 'e.g. Add type hints and defensive validation'
    });

    if (!prompt) return;

    // Generate proposed transformation
    const proposedText = this.transformCode(selectedText, prompt);

    const targetRange = selection.isEmpty
      ? new vscode.Range(selection.start.line, 0, selection.start.line, editor.document.lineAt(selection.start.line).text.length)
      : selection;

    this.activeSession = {
      editor,
      range: targetRange,
      originalText: selectedText,
      proposedText
    };

    // Apply inline diff decorations
    editor.setDecorations(this.addedDecorationType, [targetRange]);
    await vscode.commands.executeCommand('setContext', 'floatInlineEditActive', true);

    vscode.window.showInformationMessage(
      `FLOAT Inline Edit: Proposed changes ready. Press [Tab] to Accept or [Esc] to Reject.`,
      'Accept (Tab)',
      'Reject (Esc)'
    ).then((selection) => {
      if (selection === 'Accept (Tab)') {
        this.acceptInlineHunk();
      } else if (selection === 'Reject (Esc)') {
        this.rejectInlineHunk();
      }
    });
  }

  /**
   * Tab: Accept hunk and update editor buffer
   */
  async acceptInlineHunk(): Promise<void> {
    if (!this.activeSession) return;

    const { editor, range, proposedText } = this.activeSession;
    await editor.edit((editBuilder) => {
      editBuilder.replace(range, proposedText);
    });

    this.clearDecorations();
    vscode.window.showInformationMessage('FLOAT: Inline transformation accepted.');
  }

  /**
   * Escape: Reject hunk, clear decorations, leave buffer 100% unchanged
   */
  async rejectInlineHunk(): Promise<void> {
    if (!this.activeSession) return;

    this.clearDecorations();
    vscode.window.showInformationMessage('FLOAT: Inline transformation rejected (Buffer untouched).');
  }

  private clearDecorations(): void {
    if (this.activeSession) {
      this.activeSession.editor.setDecorations(this.addedDecorationType, []);
      this.activeSession.editor.setDecorations(this.removedDecorationType, []);
      this.activeSession = null;
    }
    vscode.commands.executeCommand('setContext', 'floatInlineEditActive', false);
  }

  private transformCode(code: string, instruction: string): string {
    if (instruction.toLowerCase().includes('validation') || instruction.toLowerCase().includes('type')) {
      return code
        .split('\n')
        .map((line) => {
          if (line.includes('def ') && !line.includes('->')) {
            return line.replace(/\((.*?)\):/, '($1) -> None:  # Added type hint');
          }
          return line;
        })
        .join('\n');
    }
    return `# Modified with FLOAT: ${instruction}\n` + code;
  }
}
