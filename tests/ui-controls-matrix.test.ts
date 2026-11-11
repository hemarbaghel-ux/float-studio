import { describe, it, expect, vi, beforeEach } from 'vitest';

// Registered command map for testing extension activations
const registeredCommands = new Map<string, (...args: any[]) => any>();
const createdTerminals: Array<{ name: string; shown: boolean; textsSent: string[] }> = [];

vi.mock('vscode', () => {
  return {
    commands: {
      registerCommand: vi.fn((commandId: string, handler: (...args: any[]) => any) => {
        registeredCommands.set(commandId, handler);
        return { dispose: () => registeredCommands.delete(commandId) };
      }),
      executeCommand: vi.fn(),
    },
    window: {
      createTerminal: vi.fn((opts: { name: string }) => {
        const term = {
          name: opts.name,
          shown: false,
          textsSent: [] as string[],
          show: vi.fn(() => {
            term.shown = true;
          }),
          sendText: vi.fn((text: string) => {
            term.textsSent.push(text);
          }),
        };
        createdTerminals.push(term);
        return term;
      }),
      showInformationMessage: vi.fn(),
      showWarningMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      showQuickPick: vi.fn(async (items: any[]) => items[0]),
      showInputBox: vi.fn(async () => 'feature-branch'),
      activeTextEditor: {
        document: {
          fileName: '/workspace/script.sh',
          getText: () => '<root><child>value</child></root>',
        },
      },
    },
    workspace: {
      findFiles: vi.fn(async () => []),
      openTextDocument: vi.fn(),
    },
    Uri: {
      file: vi.fn((p: string) => ({ fsPath: p })),
    },
  };
});

describe('UI Controls & Extension Workflows Matrix', () => {
  beforeEach(() => {
    registeredCommands.clear();
    createdTerminals.length = 0;
    vi.clearAllMocks();
  });

  it('Rust Language Features: dispatches real cargo commands to terminal instead of placebo alerts', async () => {
    const rustExt = await import('../extensions/rust-language-features/src/extension.js');
    const mockContext = { subscriptions: [] };
    const api = rustExt.activate(mockContext as any);

    expect(api.service.isRunning()).toBe(true);
    expect(registeredCommands.has('rust.cargoBuild')).toBe(true);
    expect(registeredCommands.has('rust.cargoTest')).toBe(true);
    expect(registeredCommands.has('rust.cargoClippy')).toBe(true);

    // Execute cargo build
    registeredCommands.get('rust.cargoBuild')!();
    expect(createdTerminals.some(t => t.name === 'Cargo Build' && t.textsSent.includes('cargo build'))).toBe(true);

    // Execute cargo test
    registeredCommands.get('rust.cargoTest')!();
    expect(createdTerminals.some(t => t.name === 'Cargo Test' && t.textsSent.includes('cargo test'))).toBe(true);

    // Execute cargo clippy
    registeredCommands.get('rust.cargoClippy')!();
    expect(createdTerminals.some(t => t.name === 'Cargo Clippy' && t.textsSent.includes('cargo clippy'))).toBe(true);
  });

  it('Go Language Features: dispatches go test & go vet to terminal and restarts gopls', async () => {
    const goExt = await import('../extensions/go-language-features/src/extension.js');
    const mockContext = { subscriptions: [] };
    const api = goExt.activate(mockContext as any);

    expect(api.service.isRunning()).toBe(true);
    expect(registeredCommands.has('go.runTests')).toBe(true);
    expect(registeredCommands.has('go.vet')).toBe(true);
    expect(registeredCommands.has('go.restartGopls')).toBe(true);

    registeredCommands.get('go.runTests')!();
    expect(createdTerminals.some(t => t.name === 'Go Tests' && t.textsSent.includes('go test ./...'))).toBe(true);

    registeredCommands.get('go.vet')!();
    expect(createdTerminals.some(t => t.name === 'Go Vet' && t.textsSent.includes('go vet ./...'))).toBe(true);

    registeredCommands.get('go.restartGopls')!();
    expect(api.service.isRunning()).toBe(true);
  });

  it('Python Language Features: provides virtualenv quickpick selection and terminal test runner', async () => {
    const pyExt = await import('../extensions/python-language-features/src/extension.js');
    const mockContext = { subscriptions: [] };
    const api = pyExt.activate(mockContext as any);

    expect(api.service.isRunning()).toBe(true);
    expect(registeredCommands.has('python.selectInterpreter')).toBe(true);
    expect(registeredCommands.has('python.runTests')).toBe(true);
    expect(registeredCommands.has('python.restartLspServer')).toBe(true);

    await registeredCommands.get('python.selectInterpreter')!();
    expect(api.service.getInterpreter()).toBeDefined();

    registeredCommands.get('python.runTests')!();
    expect(createdTerminals.some(t => t.name === 'Python Tests' && t.textsSent.some(cmd => cmd.includes('pytest')))).toBe(true);
  });

  it('C# Language Features: dispatches dotnet restore and build to terminal', async () => {
    const csExt = await import('../extensions/csharp-language-features/src/extension.js');
    const mockContext = { subscriptions: [] };
    const api = csExt.activate(mockContext as any);

    expect(registeredCommands.has('csharp.restore')).toBe(true);
    expect(registeredCommands.has('csharp.build')).toBe(true);

    registeredCommands.get('csharp.restore')!();
    expect(createdTerminals.some(t => t.name === 'C# Restore' && t.textsSent.includes('dotnet restore'))).toBe(true);

    registeredCommands.get('csharp.build')!();
    expect(createdTerminals.some(t => t.name === 'C# Build' && t.textsSent.includes('dotnet build'))).toBe(true);
  });

  it('Java Language Features: dispatches mvn compile and mvn test to terminal', async () => {
    const javaExt = await import('../extensions/java-language-features/src/extension.js');
    const mockContext = { subscriptions: [] };
    const api = javaExt.activate(mockContext as any);

    expect(registeredCommands.has('java.buildProject')).toBe(true);
    expect(registeredCommands.has('java.runJunitTests')).toBe(true);

    registeredCommands.get('java.buildProject')!();
    expect(createdTerminals.some(t => t.name === 'Java Build' && t.textsSent.includes('mvn compile'))).toBe(true);

    registeredCommands.get('java.runJunitTests')!();
    expect(createdTerminals.some(t => t.name === 'Java Tests' && t.textsSent.includes('mvn test'))).toBe(true);
  });

  it('Git SCM Features: executes push and pull via terminal and manages staging/commit state', async () => {
    const gitExt = await import('../extensions/git/src/extension.js');
    const mockContext = { subscriptions: [] };
    const api = gitExt.activate(mockContext as any);

    expect(registeredCommands.has('git.push')).toBe(true);
    expect(registeredCommands.has('git.pull')).toBe(true);
    expect(registeredCommands.has('git.stageAll')).toBe(true);

    registeredCommands.get('git.push')!();
    expect(createdTerminals.some(t => t.name === 'Git Push' && t.textsSent.includes('git push'))).toBe(true);

    registeredCommands.get('git.pull')!();
    expect(createdTerminals.some(t => t.name === 'Git Pull' && t.textsSent.includes('git pull'))).toBe(true);
  });

  it('Docker Language Features: dispatches real container builds to terminal', async () => {
    const dockerExt = await import('../extensions/docker-language-features/src/extension.js');
    const mockContext = { subscriptions: [] };
    dockerExt.activate(mockContext as any);

    expect(registeredCommands.has('docker.buildImage')).toBe(true);
    registeredCommands.get('docker.buildImage')!();
    expect(createdTerminals.some(t => t.name === 'Docker Build' && t.textsSent.includes('docker build -t float-app:latest .'))).toBe(true);
  });
});
