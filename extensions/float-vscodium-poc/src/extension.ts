/**
 * FLOAT Studio - VS Code & VSCodium Extension Entry Point
 *
 * Implements the 4 core Cursor-style desktop workflows:
 * 1. Open and index a local hard drive folder.
 * 2. Connect FLOAT chat/context engine using local files.
 * 3. Generate structured multi-file change proposals with diffs.
 * 4. Apply changes to local files ONLY after explicit human approval (reject leaves files untouched).
 * 5. Inline transformations (Ctrl+K) with live diff decorations.
 * 6. Terminal auto-repair ("Fix with FLOAT").
 */

import * as vscode from 'vscode';
import { FloatVSCodiumEngine } from './floatEngine';
import { FloatComposerViewProvider } from './composerViewProvider';
import { FloatInlineDiffController } from './inlineDiffController';
import { FloatTerminalMonitor } from './terminalMonitor';
import { FloatApiClient } from './floatApiClient';

export * from './floatEngine';
export * from './floatApiClient';

// Global Singleton Engine & API Client
export const globalEngine = new FloatVSCodiumEngine();
export const globalApiClient = new FloatApiClient('http://localhost:3000', 'default-project');

export function activate(context: vscode.ExtensionContext) {
  // Read configured settings if available
  const config = vscode.workspace?.getConfiguration ? vscode.workspace.getConfiguration('float') : null;
  const backendUrl = config?.get<string>('backendUrl') || 'http://localhost:3000';
  const authToken = config?.get<string>('authToken') || null;

  globalApiClient.setBaseUrl(backendUrl);
  if (authToken) {
    globalApiClient.setAuthToken(authToken);
  }

  // 1. Initialize Composer Webview Provider with real API client
  const composerViewProvider = new FloatComposerViewProvider(context.extensionUri, globalEngine, globalApiClient);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(FloatComposerViewProvider.viewType, composerViewProvider)
  );

  // 2. Initialize Inline Diff Controller (Ctrl+K)
  const inlineController = new FloatInlineDiffController();

  // 3. Initialize Terminal Failure Monitor
  const terminalMonitor = new FloatTerminalMonitor(composerViewProvider);
  terminalMonitor.register(context);

  // 4. Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('float.openComposer', () => {
      vscode.commands.executeCommand('workbench.view.extension.float-sidebar');
    }),

    vscode.commands.registerCommand('float.inlineEdit', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('FLOAT: Please open a file in the editor to use Inline Edit (Ctrl+K).');
        return;
      }
      await inlineController.startInlineEdit(editor);
    }),

    vscode.commands.registerCommand('float.acceptInlineHunk', async () => {
      await inlineController.acceptInlineHunk();
    }),

    vscode.commands.registerCommand('float.rejectInlineHunk', async () => {
      await inlineController.rejectInlineHunk();
    }),

    vscode.commands.registerCommand('float.openLocalWorkspace', async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        const rootPath = folders[0].uri.fsPath;
        const res = await globalEngine.openLocalFolder(rootPath);
        if (res.success) {
          vscode.window.showInformationMessage(`FLOAT: Indexed local workspace with ${res.fileCount} files.`);
          composerViewProvider.refreshView();
        }
      }
    })
  );

  // 5. Register Status Bar Indicator
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'float.openComposer';
  statusBarItem.text = '$(sparkle) FLOAT: Ready';
  statusBarItem.tooltip = 'Click to open FLOAT Composer (Ctrl+Shift+I)';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Auto-index open workspace if present
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    globalEngine.openLocalFolder(vscode.workspace.workspaceFolders[0].uri.fsPath);
    globalApiClient.setProjectId(vscode.workspace.workspaceFolders[0].name || 'default-project');
  }
}

export function deactivate() {}
