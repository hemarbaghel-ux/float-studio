import React, { useRef } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { useIDEStore } from '../../store';

interface CodeEditorProps {
  fileId: string;
  fileName: string;
  content: string;
}

export function CodeEditor({ fileId, fileName, content }: CodeEditorProps) {
  const { updateFileContent, markTabModified, settings, runActiveCode, saveProject, setActiveSelection } = useIDEStore();
  const editorRef = useRef<any>(null);
  const monaco = useMonaco();

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      updateFileContent(fileId, value);
      markTabModified(fileId, true);
    }
  };

  const handleEditorDidMount = (editor: any, monacoInstance: any) => {
    editorRef.current = editor;

    // Add save command
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
      markTabModified(fileId, false);
      saveProject();
    });

    // Add run command (Ctrl+Enter or Cmd+Enter)
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter, () => {
      runActiveCode();
    });

    // Track active selection
    editor.onDidChangeCursorSelection(() => {
      const selection = editor.getSelection();
      const model = editor.getModel();
      if (selection && model && !selection.isEmpty()) {
        const selectedText = model.getValueInRange(selection);
        if (selectedText && selectedText.trim()) {
          setActiveSelection({
            fileId,
            filePath: fileName,
            text: selectedText,
            startLine: selection.startLineNumber,
            endLine: selection.endLineNumber
          });
          return;
        }
      }
      const current = useIDEStore.getState().activeSelection;
      if (current?.fileId === fileId) {
        setActiveSelection(null);
      }
    });
  };

  const getLanguage = (name: string) => {
    if (name.endsWith('.py')) return 'python';
    if (name.endsWith('.ts') || name.endsWith('.tsx')) return 'typescript';
    if (name.endsWith('.js') || name.endsWith('.jsx')) return 'javascript';
    if (name.endsWith('.json')) return 'json';
    if (name.endsWith('.css')) return 'css';
    if (name.endsWith('.html')) return 'html';
    if (name.endsWith('.md')) return 'markdown';
    return 'plaintext';
  };

  const isDark = typeof document !== 'undefined'
    ? document.documentElement.classList.contains('dark')
    : settings.theme !== 'light';

  return (
    <Editor
      height="100%"
      language={getLanguage(fileName)}
      theme={isDark ? 'vs-dark' : 'light'}
      value={content}
      onChange={handleEditorChange}
      onMount={handleEditorDidMount}
      options={{
        fontSize: settings.fontSize,
        wordWrap: settings.wordWrap,
        minimap: { enabled: settings.minimap },
        tabSize: settings.tabSize,
        padding: { top: 16 },
        fontFamily: settings.fontFamily || "'JetBrains Mono', 'Fira Code', Consolas, monospace",
        formatOnPaste: true,
        smoothScrolling: true,
      }}
      className="absolute inset-0"
    />
  );
}
