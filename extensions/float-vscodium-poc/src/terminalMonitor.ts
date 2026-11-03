import * as vscode from 'vscode';
import { FloatComposerViewProvider } from './composerViewProvider';

export class FloatTerminalMonitor {
  private lastTerminalError: string | null = null;

  constructor(private readonly composerView: FloatComposerViewProvider) {}

  register(context: vscode.ExtensionContext): void {
    // Listen to terminal close events to detect potential failure
    context.subscriptions.push(
      vscode.window.onDidCloseTerminal((terminal) => {
        if (terminal.exitStatus && terminal.exitStatus.code !== undefined && terminal.exitStatus.code !== 0) {
          const code = terminal.exitStatus.code;
          this.lastTerminalError = `Process "${terminal.name}" exited with code ${code}.`;

          vscode.window.showErrorMessage(
            `FLOAT: Terminal process "${terminal.name}" failed with exit code ${code}`,
            'Fix with FLOAT'
          ).then((action) => {
            if (action === 'Fix with FLOAT') {
              this.composerView.showFixProposal(this.lastTerminalError || `Exit code ${code}`);
            }
          });
        }
      })
    );

    // Also register manual command
    context.subscriptions.push(
      vscode.commands.registerCommand('float.fixTerminalError', () => {
        if (this.lastTerminalError) {
          this.composerView.showFixProposal(this.lastTerminalError);
        } else {
          vscode.window.showInformationMessage('FLOAT: No recent terminal failures recorded.');
        }
      })
    );
  }

  recordTerminalError(errorOutput: string): void {
    this.lastTerminalError = errorOutput;
    vscode.window.showErrorMessage(
      `FLOAT: Terminal execution failed.`,
      'Fix with FLOAT'
    ).then((action) => {
      if (action === 'Fix with FLOAT') {
        this.composerView.showFixProposal(errorOutput);
      }
    });
  }
}
