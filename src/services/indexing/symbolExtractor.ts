import { CodeSymbol, SymbolKind } from './types';

export interface ExtractionResult {
  symbols: CodeSymbol[];
  imports: string[];
  exports: string[];
}

/**
 * Robust, language-aware symbol and import extractor.
 * Extracts functions, classes, interfaces, types, enums, methods, imports, and exports.
 * Gracefully falls back to empty symbols for unsupported or plain text files without errors.
 */
export function extractSymbols(filePath: string, content: string): ExtractionResult {
  const symbols: CodeSymbol[] = [];
  const imports: string[] = [];
  const exports: string[] = [];

  if (!content || typeof content !== 'string') {
    return { symbols, imports, exports };
  }

  const lines = content.split(/\r?\n/);
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
    extractTypeScriptSymbols(lines, symbols, imports, exports);
  } else if (ext === 'py') {
    extractPythonSymbols(lines, symbols, imports, exports);
  }

  return { symbols, imports, exports };
}

/**
 * Extracts symbols from TypeScript / JavaScript source lines.
 */
function extractTypeScriptSymbols(
  lines: string[],
  symbols: CodeSymbol[],
  imports: string[],
  exports: string[]
): void {
  let currentClass: string | null = null;
  let classBraceDepth = 0;
  let currentBraceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNum = i + 1; // 1-indexed
    const trimmed = rawLine.trim();

    // Skip empty lines and single-line comment headers
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue;
    }

    // Track block brace depth for class methods
    const openBraces = (trimmed.match(/{/g) || []).length;
    const closeBraces = (trimmed.match(/}/g) || []).length;

    // 1. Imports
    // e.g. import { foo, bar } from './baz'; or import foo from 'baz';
    const importMatch = trimmed.match(/^import\s+(?:type\s+)?(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/);
    if (importMatch) {
      const importPath = importMatch[1];
      if (importPath && !imports.includes(importPath)) {
        imports.push(importPath);
      }
      symbols.push({
        name: importPath,
        kind: 'import',
        line: lineNum,
        signature: trimmed.slice(0, 100)
      });
      currentBraceDepth += (openBraces - closeBraces);
      continue;
    }

    // require('...') imports
    const requireMatch = trimmed.match(/(?:const|let|var)\s+(?:\{[^}]+\}|\w+)\s*=\s*require\(['"]([^'"]+)['"]\)/);
    if (requireMatch) {
      const importPath = requireMatch[1];
      if (importPath && !imports.includes(importPath)) {
        imports.push(importPath);
      }
    }

    // 2. Exports list or default
    if (trimmed.startsWith('export default')) {
      const defMatch = trimmed.match(/^export\s+default\s+(?:function|class)?\s*([a-zA-Z0-9_$]+)?/);
      if (defMatch && defMatch[1]) {
        exports.push(defMatch[1]);
      }
    } else if (trimmed.startsWith('export {')) {
      const exportItems = trimmed.match(/^export\s*\{([^}]+)\}/);
      if (exportItems && exportItems[1]) {
        for (const item of exportItems[1].split(',')) {
          const name = item.trim().split(/\s+as\s+/)[0]?.trim();
          if (name && !exports.includes(name)) exports.push(name);
        }
      }
    }

    // 3. Classes
    // e.g. [export] [abstract] class Foo [extends Bar] [implements Baz] {
    const classMatch = trimmed.match(/^(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([a-zA-Z0-9_$]+)(?:<[^>]+>)?(?:\s+extends\s+[a-zA-Z0-9_$.<>\s]+)?(?:\s+implements\s+[a-zA-Z0-9_$.<>\s,]+)?/);
    if (classMatch) {
      const className = classMatch[1];
      symbols.push({
        name: className,
        kind: 'class',
        line: lineNum,
        signature: trimmed.slice(0, 120)
      });
      if (trimmed.startsWith('export')) exports.push(className);
      currentClass = className;
      classBraceDepth = currentBraceDepth;
      currentBraceDepth += (openBraces - closeBraces);
      continue;
    }

    // 4. Interfaces
    // e.g. [export] interface Foo [extends Bar] {
    const interfaceMatch = trimmed.match(/^(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)(?:<[^>]+>)?(?:\s+extends\s+[a-zA-Z0-9_$.<>\s,]+)?/);
    if (interfaceMatch) {
      const interfaceName = interfaceMatch[1];
      symbols.push({
        name: interfaceName,
        kind: 'interface',
        line: lineNum,
        signature: trimmed.slice(0, 120)
      });
      if (trimmed.startsWith('export')) exports.push(interfaceName);
      currentBraceDepth += (openBraces - closeBraces);
      continue;
    }

    // 5. Types
    // e.g. [export] type Foo = ...
    const typeMatch = trimmed.match(/^(?:export\s+)?type\s+([a-zA-Z0-9_$]+)(?:<[^>]+>)?\s*=/);
    if (typeMatch) {
      const typeName = typeMatch[1];
      symbols.push({
        name: typeName,
        kind: 'type',
        line: lineNum,
        signature: trimmed.slice(0, 100)
      });
      if (trimmed.startsWith('export')) exports.push(typeName);
      currentBraceDepth += (openBraces - closeBraces);
      continue;
    }

    // 6. Enums
    // e.g. [export] [const] enum Foo {
    const enumMatch = trimmed.match(/^(?:export\s+)?(?:const\s+)?enum\s+([a-zA-Z0-9_$]+)/);
    if (enumMatch) {
      const enumName = enumMatch[1];
      symbols.push({
        name: enumName,
        kind: 'enum',
        line: lineNum,
        signature: trimmed.slice(0, 100)
      });
      if (trimmed.startsWith('export')) exports.push(enumName);
      currentBraceDepth += (openBraces - closeBraces);
      continue;
    }

    // 7. Functions (function keyword)
    // e.g. [export] [async] function foo(...)
    const funcMatch = trimmed.match(/^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*([a-zA-Z0-9_$]+)?\s*\(([^)]*)\)/);
    if (funcMatch) {
      const funcName = funcMatch[1] || 'anonymous';
      if (funcName !== 'anonymous') {
        symbols.push({
          name: funcName,
          kind: 'function',
          line: lineNum,
          signature: trimmed.slice(0, 120)
        });
        if (trimmed.startsWith('export')) exports.push(funcName);
      }
      currentBraceDepth += (openBraces - closeBraces);
      continue;
    }

    // 8. Variable functions / arrows
    // e.g. [export] const foo = (..) => or const foo = async (..) => or const foo = function(..)
    const arrowMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/);
    if (arrowMatch) {
      const varName = arrowMatch[1];
      symbols.push({
        name: varName,
        kind: 'function',
        line: lineNum,
        signature: trimmed.slice(0, 120)
      });
      if (trimmed.startsWith('export')) exports.push(varName);
      currentBraceDepth += (openBraces - closeBraces);
      continue;
    }

    const funcVarMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?function\b/);
    if (funcVarMatch) {
      const varName = funcVarMatch[1];
      symbols.push({
        name: varName,
        kind: 'function',
        line: lineNum,
        signature: trimmed.slice(0, 120)
      });
      if (trimmed.startsWith('export')) exports.push(varName);
      currentBraceDepth += (openBraces - closeBraces);
      continue;
    }

    // 9. Class Methods
    // e.g. static foo(...) or async foo(...) or foo(...)
    if (currentClass && currentBraceDepth > classBraceDepth) {
      const methodMatch = trimmed.match(/^(?:(?:public|private|protected|static|async|override|readonly)\s+)*([a-zA-Z0-9_$]+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)(?::\s*[^{]+)?\s*\{/);
      if (methodMatch) {
        const methodName = methodMatch[1];
        if (!['if', 'for', 'while', 'switch', 'catch'].includes(methodName)) {
          symbols.push({
            name: methodName,
            kind: 'method',
            line: lineNum,
            containerName: currentClass,
            signature: `${currentClass}.${trimmed.slice(0, 100)}`
          });
        }
      }
    }

    // Reset currentClass if closing its enclosing scope
    currentBraceDepth += (openBraces - closeBraces);
    if (currentClass && currentBraceDepth <= classBraceDepth) {
      currentClass = null;
    }
  }
}

/**
 * Extracts symbols from Python source lines.
 */
function extractPythonSymbols(
  lines: string[],
  symbols: CodeSymbol[],
  imports: string[],
  exports: string[]
): void {
  let currentClass: string | null = null;
  let classIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNum = i + 1; // 1-indexed
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const indent = rawLine.search(/\S/);

    // Reset class context if indentation returned to or below class level
    if (currentClass !== null && indent <= classIndent && trimmed.length > 0) {
      currentClass = null;
      classIndent = -1;
    }

    // 1. Imports
    // e.g. import foo, bar or from foo import bar
    const pyImportMatch = trimmed.match(/^import\s+([a-zA-Z0-9_$,\s]+)/);
    if (pyImportMatch) {
      const modules = pyImportMatch[1].split(',').map(m => m.trim().split(/\s+as\s+/)[0]);
      for (const mod of modules) {
        if (mod && !imports.includes(mod)) imports.push(mod);
      }
      symbols.push({
        name: modules[0] || 'import',
        kind: 'import',
        line: lineNum,
        signature: trimmed.slice(0, 80)
      });
      continue;
    }

    const pyFromMatch = trimmed.match(/^from\s+([a-zA-Z0-9_.]+)\s+import\s+/);
    if (pyFromMatch) {
      const mod = pyFromMatch[1];
      if (mod && !imports.includes(mod)) imports.push(mod);
      symbols.push({
        name: mod,
        kind: 'import',
        line: lineNum,
        signature: trimmed.slice(0, 80)
      });
      continue;
    }

    // 2. Classes
    // e.g. class Foo: or class Foo(Bar):
    const classMatch = trimmed.match(/^class\s+([a-zA-Z0-9_]+)(?:\s*\(([^)]*)\))?\s*:/);
    if (classMatch) {
      const className = classMatch[1];
      symbols.push({
        name: className,
        kind: 'class',
        line: lineNum,
        signature: trimmed.slice(0, 100)
      });
      exports.push(className);
      currentClass = className;
      classIndent = indent;
      continue;
    }

    // 3. Functions & Methods
    // e.g. def foo(self, ...): or async def foo(...):
    const defMatch = trimmed.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*(?:->[^:]+)?\s*:/);
    if (defMatch) {
      const funcName = defMatch[1];
      if (currentClass && indent > classIndent) {
        symbols.push({
          name: funcName,
          kind: 'method',
          line: lineNum,
          containerName: currentClass,
          signature: `${currentClass}.${funcName}(...)`
        });
      } else {
        symbols.push({
          name: funcName,
          kind: 'function',
          line: lineNum,
          signature: trimmed.slice(0, 100)
        });
        exports.push(funcName);
      }
    }
  }
}
