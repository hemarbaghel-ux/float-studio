import React, { useRef, useState, useEffect } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { useIDEStore } from '../../store';
import { useAIStore } from '../../store/aiStore';
import { auth } from '../../lib/firebase';
import { InlineAssistantModal } from './InlineAssistantModal';

interface CodeEditorProps {
  fileId: string;
  fileName: string;
  content: string;
}

export function CodeEditor({ fileId, fileName, content }: CodeEditorProps) {
  const {
    updateFileContent,
    markTabModified,
    settings,
    runActiveCode,
    saveProject,
    setActiveSelection,
    setReviewChangeSet
  } = useIDEStore();

  const { selectedModel, providers } = useAIStore();
  const editorRef = useRef<any>(null);
  const monaco = useMonaco();
  const [isInlineAssistantOpen, setIsInlineAssistantOpen] = useState(false);
  const [inlinePosition, setInlinePosition] = useState<{ top: number; left: number } | null>(null);
  const [inlineInstruction, setInlineInstruction] = useState<string>('');
  const [inlineSelection, setInlineSelection] = useState<{
    text: string;
    startLine?: number;
    endLine?: number;
  }>({ text: '' });

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

  const currentLanguage = getLanguage(fileName);

  // Register Ghost-Text Inline Completions Provider with Monaco
  useEffect(() => {
    if (!monaco) return;

    let abortController: AbortController | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const providerDisposable = monaco.languages.registerInlineCompletionsProvider(
      currentLanguage,
      {
        provideInlineCompletions: async (model: any, position: any, context: any, token: any) => {
          // If token was cancelled before starting, exit immediately
          if (token.isCancellationRequested) {
            return { items: [] };
          }

          // Check if provider is configured
          const hasConfiguredProvider = Boolean(
            providers.openai?.configured ||
            providers.google?.configured ||
            providers.anthropic?.configured ||
            providers.ollama?.configured
          );

          if (!hasConfiguredProvider) {
            return { items: [] };
          }

          // Abort previous in-flight request
          if (abortController) {
            abortController.abort();
            abortController = null;
          }
          if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
          }

          // Debounce completion call by 250ms
          return new Promise((resolve) => {
            debounceTimer = setTimeout(async () => {
              if (token.isCancellationRequested) {
                return resolve({ items: [] });
              }

              abortController = new AbortController();
              const reqSignal = abortController.signal;

              token.onCancellationRequested(() => {
                if (abortController) {
                  abortController.abort();
                }
                resolve({ items: [] });
              });

              try {
                const fullText = model.getValue();
                const offset = model.getOffsetAt(position);
                const prefix = fullText.slice(0, offset);
                const suffix = fullText.slice(offset);

                // If on an empty line with no context, do not request
                if (!prefix.trim()) {
                  return resolve({ items: [] });
                }

                const authToken = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : '';

                const response = await fetch('/api/ai/complete', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                  },
                  signal: reqSignal,
                  body: JSON.stringify({
                    prefix,
                    suffix,
                    fileName,
                    language: currentLanguage,
                    model: selectedModel || 'gpt-6.1-sol'
                  })
                });

                if (!response.ok || token.isCancellationRequested) {
                  return resolve({ items: [] });
                }

                const data = await response.json();
                if (data.cancelled || !data.completion) {
                  return resolve({ items: [] });
                }

                resolve({
                  items: [
                    {
                      insertText: data.completion,
                      range: new monaco.Range(
                        position.lineNumber,
                        position.column,
                        position.lineNumber,
                        position.column
                      )
                    }
                  ]
                });
              } catch (err: any) {
                // Ignore cancellations cleanly; show no fake completion on error
                resolve({ items: [] });
              }
            }, 250);
          });
        },
        disposeInlineCompletions: () => {
          // Lifecycle cleanup
        }
      }
    );

    return () => {
      if (abortController) abortController.abort();
      if (debounceTimer) clearTimeout(debounceTimer);
      providerDisposable.dispose();
    };
  }, [monaco, currentLanguage, fileName, selectedModel, providers]);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      updateFileContent(fileId, value);
      markTabModified(fileId, true);
    }
  };

  const handleEditorDidMount = (editor: any, monacoInstance: any) => {
    editorRef.current = editor;

    // Add save command (Ctrl+S / Cmd+S)
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
      markTabModified(fileId, false);
      saveProject();
    });

    // Add run command (Ctrl+Enter / Cmd+Enter)
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter, () => {
      runActiveCode();
    });

    // Add Inline Assistant command (Ctrl+K / Cmd+K)
    const openInlineAssistant = (instructionText?: string) => {
      const selection = editor.getSelection();
      const model = editor.getModel();
      let text = '';
      let startLine: number | undefined = undefined;
      let endLine: number | undefined = undefined;
      let posCoords: { top: number; left: number } | null = null;

      if (selection && model && !selection.isEmpty()) {
        text = model.getValueInRange(selection);
        startLine = selection.startLineNumber;
        endLine = selection.endLineNumber;
        const scrolledPos = editor.getScrolledVisiblePosition(selection.getEndPosition());
        if (scrolledPos) {
          const editorDom = editor.getDomNode();
          const rect = editorDom?.getBoundingClientRect();
          if (rect) {
            posCoords = {
              top: rect.top + scrolledPos.top + scrolledPos.height + 8,
              left: Math.max(rect.left + 24, Math.min(rect.left + scrolledPos.left, rect.right - 580))
            };
          }
        }
      } else if (selection) {
        const scrolledPos = editor.getScrolledVisiblePosition(selection.getPosition());
        if (scrolledPos) {
          const editorDom = editor.getDomNode();
          const rect = editorDom?.getBoundingClientRect();
          if (rect) {
            posCoords = {
              top: rect.top + scrolledPos.top + scrolledPos.height + 8,
              left: Math.max(rect.left + 24, Math.min(rect.left + scrolledPos.left, rect.right - 580))
            };
          }
        }
      }

      setInlineSelection({ text, startLine, endLine });
      setInlinePosition(posCoords);
      setInlineInstruction(instructionText || '');
      setIsInlineAssistantOpen(true);
    };

    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyK, () => {
      openInlineAssistant();
    });

    // Register Monaco Code Action Quick Fix: "✨ Fix with FLOAT AI"
    const codeActionDisposable = monacoInstance.languages.registerCodeActionProvider(currentLanguage, {
      provideCodeActions: (_model: any, _range: any, context: any) => {
        const markers = context.markers || [];
        if (markers.length === 0) return { actions: [], dispose: () => {} };

        const actions = markers.map((marker: any) => ({
          title: `✨ Fix with FLOAT AI: ${marker.message}`,
          kind: 'quickfix',
          isPreferred: true,
          command: {
            id: 'float.quickfix.marker',
            title: 'Fix with FLOAT AI',
            arguments: [marker]
          }
        }));

        return {
          actions,
          dispose: () => {}
        };
      }
    });

    const cmdDisposable = monacoInstance.editor.registerCommand('float.quickfix.marker', (_accessor: any, marker: any) => {
      if (marker) {
        editor.setSelection({
          startLineNumber: marker.startLineNumber,
          startColumn: marker.startColumn,
          endLineNumber: marker.endLineNumber,
          endColumn: marker.endColumn
        });
        openInlineAssistant(`Fix error: ${marker.message}`);
      }
    });

    // Add Composer command (Ctrl+I / Cmd+I)
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyI, () => {
      if (!useIDEStore.getState().rightSidebarOpen) {
        useIDEStore.getState().toggleRightSidebar();
      }
      window.dispatchEvent(new CustomEvent('switch-ai-mode', { detail: { mode: 'agent' } }));
      setTimeout(() => {
        const aiInput = document.querySelector('textarea[placeholder*="Ask"], textarea[placeholder*="Plan"], textarea[placeholder*="Edit"], textarea[placeholder*="Agent"]') as HTMLTextAreaElement;
        aiInput?.focus();
      }, 80);
    });

    const handleGlobalInlineAssistant = () => {
      openInlineAssistant();
    };
    window.addEventListener('open-inline-assistant', handleGlobalInlineAssistant);

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

  const isDark = typeof document !== 'undefined'
    ? document.documentElement.classList.contains('dark')
    : settings.theme !== 'light';

  return (
    <>
      <Editor
        height="100%"
        language={currentLanguage}
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
          inlineSuggest: {
            enabled: true,
            mode: 'subwordSmart'
          }
        }}
        className="absolute inset-0"
      />

      {/* Monaco Inline Assistant (Ctrl+K) */}
      <InlineAssistantModal
        isOpen={isInlineAssistantOpen}
        onClose={() => setIsInlineAssistantOpen(false)}
        fileName={fileName}
        filePath={fileName}
        language={currentLanguage}
        fullCode={content}
        selectedCode={inlineSelection.text}
        startLine={inlineSelection.startLine}
        endLine={inlineSelection.endLine}
        editorPosition={inlinePosition}
        initialInstruction={inlineInstruction}
        onProposalCreated={(changeSet) => {
          setReviewChangeSet(changeSet);
        }}
        onApplyDirectly={(newContent) => {
          updateFileContent(fileId, newContent);
          markTabModified(fileId, true);
        }}
      />
    </>
  );
}
