import { AIContextItem } from '../types';
import { workspaceIndexManager } from '../services/indexing/workspaceIndexManager';
import { isSensitivePath, normalizeWorkspacePath, isBinaryFile } from '../services/indexing/fileFilter';
import { CodeSymbol } from '../services/indexing/types';

export type TaskIntent = 'bugfix' | 'refactor' | 'ui' | 'git' | 'question' | 'general';

export interface ActiveEditorContext {
  filePath?: string;
  language?: string;
  cursorLine?: number;
  cursorColumn?: number;
  selectedText?: string;
  selectionStartLine?: number;
  selectionEndLine?: number;
  surroundingCode?: string;
  surroundingStartLine?: number;
  surroundingEndLine?: number;
  currentSymbol?: string;
}

export interface GitContextInfo {
  gitRepository?: string;
  gitBranch?: string;
  defaultBranch?: string;
  statusSummary?: string;
  gitDiffPaths?: string[];
  diffExcerpt?: string;
}

export interface ConversationTurnSummary {
  role: 'user' | 'model';
  content: string;
}

import { FloatAgentWorkflowMode, getWorkflowModeInstructions } from './agent/agentModes';
import { RulesService } from './rules/rulesService';
import { SkillsService } from './skills/skillsService';
import { MemoryService } from './memory/memoryService';
import { DiagnosticsService } from './diagnostics/diagnosticsService';

export interface ContextBuilderOptions {
  projectName?: string;
  projectId?: string;
  userId?: string;
  modelId?: string;
  maxTotalChars?: number;
  maxPerItemChars?: number;
  activeEditor?: ActiveEditorContext;
  gitContext?: GitContextInfo;
  gitRepository?: string; // backwards compatibility
  gitBranch?: string;     // backwards compatibility
  gitDiffPaths?: string[];// backwards compatibility
  activeFilePath?: string;// backwards compatibility
  conversationHistory?: ConversationTurnSummary[];
  workflowMode?: FloatAgentWorkflowMode;
  rules?: string[];
  skills?: string[];
  memories?: string[];
  diagnostics?: string;
}

export interface ContextExplanationItem {
  id: string;
  name: string;
  type: string;
  source: 'explicit' | 'active_editor' | 'retrieval' | 'symbol' | 'git' | 'terminal' | 'conversation';
  chars: number;
  priority: number;
}

export interface ContextExclusionItem {
  name: string;
  reason: 'sensitive_file' | 'path_traversal' | 'binary_file' | 'duplicate' | 'budget_exceeded';
}

export interface AssembledContext {
  formattedPrompt: string;
  includedCount: number;
  omittedCount: number;
  warnings: string[];
  totalContextChars: number;
  intent: TaskIntent;
  includedItems: ContextExplanationItem[];
  excludedItems: ContextExclusionItem[];
  budgetRemaining: number;
}

// Model-specific context window budgets in characters
const MODEL_BUDGET_MAP: Record<string, number> = {
  'float-basic': 32000,          // ~8,000 tokens
  'gemini-3.8-flash': 64000,     // ~16,000 tokens
  'gemini-2.5-flash': 64000,
  'gemini-2.5-pro': 120000,      // ~30,000 tokens
  'gpt-4o': 48000,               // ~12,000 tokens
  'gpt-4o-mini': 32000,
  'claude-3-5-sonnet': 64000,
  'grok-4.7': 48000
};

const DEFAULT_MAX_TOTAL_CHARS = 28000;
const DEFAULT_MAX_PER_ITEM_CHARS = 8000;

/**
 * Classifies user intent from prompt signals without complex heavy models.
 */
export function classifyTaskIntent(prompt: string): TaskIntent {
  const norm = (prompt || '').toLowerCase();

  // 1. Git intent
  if (/\b(git|branch|commit|push|pull|merge|pull request|pr|diff|stash|status)\b/.test(norm) &&
      !norm.includes('interface') && !norm.includes('component')) {
    return 'git';
  }

  // 2. Bugfix / Error intent
  if (/\b(fix|bug|error|exception|crash|fails|failing|issue|broken|debug|traceback|undefined is not|cannot read prop)\b/.test(norm)) {
    return 'bugfix';
  }

  // 3. UI / Styling intent
  if (/\b(ui|css|tailwind|style|styling|responsive|layout|modal|button|sidebar|flex|grid|padding|margin|color|theme|dark mode)\b/.test(norm)) {
    return 'ui';
  }

  // 4. Refactoring intent
  if (/\b(refactor|refactoring|refactored|rename|extract|move|cleanup|restructure|organize|deprecate|decouple)\b/.test(norm)) {
    return 'refactor';
  }

  // 5. Question intent
  if (/\b(where|what|why|how|explain|describe|who|which file|is there|does this)\b/.test(norm) || norm.endsWith('?')) {
    return 'question';
  }

  return 'general';
}

/**
 * Unified Context Pipeline
 * Authoritative context builder for Chat, Plan Mode, Agent Mode, and Background Agents.
 */
export class ContextBuilder {
  /**
   * Main build method: resolves budget, intent, deduplication, prioritization,
   * active editor context, explicit items, and bounds.
   */
  static build(
    userMessage: string,
    contextItems: AIContextItem[] = [],
    options: ContextBuilderOptions = {}
  ): AssembledContext {
    const intent = classifyTaskIntent(userMessage);

    // 1. Determine model-specific context limit
    const modelLimit = options.modelId ? MODEL_BUDGET_MAP[options.modelId] : undefined;
    const maxTotal = options.maxTotalChars ?? (modelLimit ?? DEFAULT_MAX_TOTAL_CHARS);
    const maxPerItem = options.maxPerItemChars ?? DEFAULT_MAX_PER_ITEM_CHARS;
    const projectName = options.projectName || 'Project Workspace';

    const warnings: string[] = [];
    const includedItems: ContextExplanationItem[] = [];
    const excludedItems: ContextExclusionItem[] = [];
    let currentContextChars = 0;
    let includedCount = 0;
    let omittedCount = 0;

    // 2. Internal candidate context pool
    interface InternalCandidate {
      id: string;
      canonicalPath: string;
      name: string;
      type: string;
      source: ContextExplanationItem['source'];
      priority: number;
      content: string;
      startLine?: number;
      endLine?: number;
    }

    const candidates: InternalCandidate[] = [];
    const seenCanonicalPaths = new Set<string>();

    // Helper: add item with security checks & path deduplication
    const addCandidate = (
      id: string,
      rawPath: string,
      name: string,
      type: string,
      source: ContextExplanationItem['source'],
      priority: number,
      content: string,
      startLine?: number,
      endLine?: number
    ): boolean => {
      // Traversal guard check on raw input
      const rawToCheck = rawPath || name || '';
      if (
        rawToCheck.includes('../') ||
        rawToCheck.includes('..\\') ||
        rawToCheck.startsWith('../') ||
        rawToCheck.startsWith('..\\') ||
        rawToCheck.includes('/..') ||
        rawToCheck.includes('\\..') ||
        rawToCheck === '..'
      ) {
        warnings.push(`Omitted path with traversal: "${name}"`);
        excludedItems.push({ name, reason: 'path_traversal' });
        omittedCount++;
        return false;
      }

      const canonical = normalizeWorkspacePath(rawToCheck);

      // Sensitive file guard
      if (canonical && isSensitivePath(canonical)) {
        warnings.push(`Omitted sensitive file from AI context: "${canonical}"`);
        excludedItems.push({ name: canonical, reason: 'sensitive_file' });
        omittedCount++;
        return false;
      }

      // Binary file guard
      if (canonical && isBinaryFile(canonical, content)) {
        warnings.push(`Omitted binary file from AI context: "${canonical}"`);
        excludedItems.push({ name: canonical, reason: 'binary_file' });
        omittedCount++;
        return false;
      }

      // Canonical path deduplication: if exact path already seen, exclude lower-priority candidate
      if (canonical && seenCanonicalPaths.has(canonical)) {
        excludedItems.push({ name: canonical, reason: 'duplicate' });
        omittedCount++;
        return false;
      }

      if (canonical) {
        seenCanonicalPaths.add(canonical);
      }

      candidates.push({
        id,
        canonicalPath: canonical,
        name,
        type,
        source,
        priority,
        content: content || '',
        startLine,
        endLine
      });
      return true;
    };

    // Priority hierarchy (lower number = higher priority):
    // 1. Explicit user selection / @file / @symbol / @terminal / @diff (Priority 1-3)
    // 2. Active editor selection / cursor context (Priority 4)
    // 3. Relevant symbol definitions (Priority 5)
    // 4. Git diff / status context (Priority 6)
    // 5. Direct import / dependency context (Priority 7)
    // 6. Recent conversation turns (Priority 8)
    // 7. Automatic search / retrieval matches (Priority 9)

    // Process explicit contextItems passed in
    for (const item of (contextItems || [])) {
      let priority = 3;
      let src: ContextExplanationItem['source'] = 'explicit';

      if (item.type === 'selection') {
        priority = 1;
        src = 'active_editor';
      } else if (item.type === 'terminal') {
        priority = 2;
        src = 'terminal';
      } else if (item.type === 'search_match' && item.name.includes('[')) {
        priority = 2; // explicit @symbol
        src = 'symbol';
      } else if (item.type === 'attachment' && item.name.toLowerCase().includes('git')) {
        priority = 2;
        src = 'git';
      } else if (item.id && item.id.startsWith('retrieval-')) {
        priority = 9;
        src = 'retrieval';
      } else {
        priority = 3; // explicit @file / @folder
      }

      addCandidate(
        item.id || `item-${candidates.length}`,
        item.path || item.name,
        item.name,
        item.type,
        src,
        priority,
        item.content,
        item.startLine,
        item.endLine
      );
    }

    // Process Active Editor context if provided
    const activeEd = options.activeEditor;
    if (activeEd && activeEd.filePath) {
      const activePath = normalizeWorkspacePath(activeEd.filePath);
      if (activePath && !seenCanonicalPaths.has(activePath)) {
        let content = '';
        let startLine: number | undefined = undefined;
        let endLine: number | undefined = undefined;

        if (activeEd.selectedText?.trim()) {
          content = activeEd.selectedText;
          startLine = activeEd.selectionStartLine;
          endLine = activeEd.selectionEndLine;
        } else if (activeEd.surroundingCode?.trim()) {
          content = activeEd.surroundingCode;
          startLine = activeEd.surroundingStartLine;
          endLine = activeEd.surroundingEndLine;
        }

        if (content) {
          const symInfo = activeEd.currentSymbol ? ` [near ${activeEd.currentSymbol}]` : '';
          addCandidate(
            `active-editor-${activePath}`,
            activePath,
            `Active File: ${activePath}${symInfo}`,
            'selection',
            'active_editor',
            4,
            content,
            startLine,
            endLine
          );
        }
      }
    }

    // Process Git context if provided
    const gitCtx = options.gitContext || {
      gitRepository: options.gitRepository,
      gitBranch: options.gitBranch,
      gitDiffPaths: options.gitDiffPaths
    };

    if (gitCtx.diffExcerpt?.trim() || (gitCtx.gitDiffPaths && gitCtx.gitDiffPaths.length > 0)) {
      const diffContent = gitCtx.diffExcerpt || `Changed files: ${gitCtx.gitDiffPaths?.join(', ')}`;
      const gitPriority = intent === 'git' || intent === 'bugfix' ? 2 : 6;
      addCandidate(
        'git-context-diff',
        'git/diff',
        'Git Working Tree Diff',
        'attachment',
        'git',
        gitPriority,
        diffContent
      );
    }

    // Process bounded conversation turns
    if (options.conversationHistory && options.conversationHistory.length > 0) {
      const recentTurns = options.conversationHistory.slice(-4);
      const conversationText = recentTurns
        .map(t => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content.slice(0, 400)}`)
        .join('\n');

      if (conversationText.trim()) {
        addCandidate(
          'conversation-recent-turns',
          'conversation/history',
          'Recent Conversation Turns',
          'attachment',
          'conversation',
          8,
          conversationText
        );
      }
    }

    // Sort candidates strictly by priority (ascending), then length
    candidates.sort((a, b) => a.priority - b.priority || a.content.length - b.content.length);

    // 3. Assemble and apply budget
    const includedBlocks: string[] = [];

    for (const cand of candidates) {
      const remainingBudget = maxTotal - currentContextChars;
      if (remainingBudget < 350) {
        warnings.push(`Context budget reached. Omitted remaining item: "${cand.name}"`);
        excludedItems.push({ name: cand.name, reason: 'budget_exceeded' });
        omittedCount++;
        continue;
      }

      let content = cand.content;
      let isTruncated = false;

      // Truncate per item limit or remaining total budget
      const allowedForItem = Math.min(maxPerItem, remainingBudget - 150);
      if (content.length > allowedForItem) {
        content = content.slice(0, allowedForItem) + '\n... [Content truncated due to context limits]';
        isTruncated = true;
      }

      let header = '';
      if (cand.type === 'selection') {
        const lines = cand.startLine && cand.endLine ? ` (lines ${cand.startLine}-${cand.endLine})` : '';
        header = `--- Selection: ${cand.canonicalPath || cand.name}${lines} ---`;
      } else if (cand.type === 'attachment') {
        header = `--- Attached: ${cand.name} ---`;
      } else if (cand.type === 'terminal') {
        header = `--- Terminal Output: ${cand.name} ---`;
      } else if (cand.type === 'search_match') {
        const lines = cand.startLine && cand.endLine ? ` (lines ${cand.startLine}-${cand.endLine})` : '';
        header = `--- Codebase Excerpt: ${cand.canonicalPath || cand.name}${lines} ---`;
      } else {
        header = `--- File: ${cand.canonicalPath || cand.name} ---`;
      }

      const block = `${header}\n${content}`;
      includedBlocks.push(block);
      currentContextChars += block.length;
      includedCount++;

      includedItems.push({
        id: cand.id,
        name: cand.name,
        type: cand.type,
        source: cand.source,
        chars: block.length,
        priority: cand.priority
      });

      if (isTruncated) {
        warnings.push(`"${cand.name}" was truncated to fit the context limit.`);
      }
    }

    if (includedBlocks.length === 0) {
      return {
        formattedPrompt: userMessage,
        includedCount: 0,
        omittedCount,
        warnings,
        totalContextChars: 0,
        intent,
        includedItems: [],
        excludedItems,
        budgetRemaining: maxTotal
      };
    }

    let warningSection = '';
    const safeWarnings = warnings.filter(w => !w.includes('../') && !w.includes('..\\'));
    if (safeWarnings.length > 0) {
      warningSection = `[Context Notices: ${safeWarnings.join(' | ')}]\n\n`;
    }

    const gitRepoName = gitCtx.gitRepository || options.gitRepository;
    const gitBranchName = gitCtx.gitBranch || options.gitBranch;
    const gitInfo = gitRepoName ? ` (Linked: ${gitRepoName}${gitBranchName ? `@${gitBranchName}` : ''})` : '';
    const intentTag = ` [Intent: ${intent.toUpperCase()}]`;

    const modeSection = options.workflowMode ? `${getWorkflowModeInstructions(options.workflowMode)}\n\n` : '';
    const rulesSection = options.rules && options.rules.length > 0 ? `[Workspace & Coding Rules]\n${options.rules.join('\n')}\n\n` : '';
    const skillsSection = options.skills && options.skills.length > 0 ? `[Active Domain Skills]\n${options.skills.join('\n')}\n\n` : '';
    const memorySection = options.memories && options.memories.length > 0 ? `[Project Architectural Memory]\n${options.memories.join('\n')}\n\n` : '';
    const diagSection = options.diagnostics ? `${options.diagnostics}\n\n` : '';
    const projectHeader = `[Project Context: ${projectName}${gitInfo}${intentTag}]\n\n`;
    const contextBody = `[Codebase & Attached Context]\n${includedBlocks.join('\n\n')}\n\n`;
    const userPromptSection = `[User Request]\n${userMessage}`;

    const formattedPrompt = `${modeSection}${warningSection}${rulesSection}${skillsSection}${memorySection}${diagSection}${projectHeader}${contextBody}${userPromptSection}`;

    return {
      formattedPrompt,
      includedCount,
      omittedCount,
      warnings,
      totalContextChars: currentContextChars,
      intent,
      includedItems,
      excludedItems,
      budgetRemaining: Math.max(0, maxTotal - currentContextChars)
    };
  }

  /**
   * Smart automatic retrieval using the workspace index, symbol definitions,
   * dependency graph, active file proximity, and intent-aware ranking.
   */
  static retrieveAndBuildBoundedContext(
    userMessage: string,
    projectId: string,
    files: Array<{ path?: string; name?: string; content?: string }> = [],
    explicitItems: AIContextItem[] = [],
    options: ContextBuilderOptions = {}
  ): AssembledContext {
    const combinedItems = [...(explicitItems || [])];
    const explicitPaths = new Set(
      explicitItems.map(item => normalizeWorkspacePath(item.path || item.name || ''))
    );

    const intent = classifyTaskIntent(userMessage);

    if (files.length > 0 && userMessage.trim()) {
      const index = workspaceIndexManager.syncProject(projectId, files);
      const activeFilePath = options.activeEditor?.filePath || options.activeFilePath;
      const gitDiffPaths = options.gitContext?.gitDiffPaths || options.gitDiffPaths;

      // 1. Retrieve bounded code context from the multi-signal index
      const bounded = index.retrieveBoundedContext(userMessage, {
        activeFilePath,
        gitDiffPaths,
        maxTotalChars: 9000
      });

      for (const item of bounded.items) {
        const canonical = normalizeWorkspacePath(item.filePath);
        combinedItems.push({
          id: `retrieval-${canonical}-${item.startLine}`,
          type: 'search_match',
          name: `${canonical}${item.symbol ? ` [${item.symbol.kind} ${item.symbol.name}]` : ''}`,
          path: canonical,
          content: item.excerpt,
          startLine: item.startLine,
          endLine: item.endLine,
          sizeBytes: item.excerpt.length
        });
      }

      // 2. Intent-specific additions:
      // For refactor / bugfix: inspect symbol references if a distinct symbol matches
      if (intent === 'refactor' || intent === 'bugfix') {
        const matchedSymbols = index.getAllSymbols(userMessage).slice(0, 3);
        for (const symMatch of matchedSymbols) {
          const refs = index.findSymbolReferences(symMatch.symbol.name, {
            maxResults: 4,
            excludeDefinitionPath: symMatch.path
          });
          for (const ref of refs) {
            const refCanonical = normalizeWorkspacePath(ref.path);
            if (!explicitPaths.has(refCanonical)) {
              combinedItems.push({
                id: `ref-${refCanonical}-${ref.line}`,
                type: 'search_match',
                name: `${refCanonical} [ref to ${symMatch.symbol.name}]`,
                path: refCanonical,
                content: `${ref.line}: ${ref.text}`,
                startLine: ref.line,
                endLine: ref.line,
                sizeBytes: ref.text.length
              });
            }
          }
        }
      }

      // 3. Proximity / Direct Import additions for the active file
      if (activeFilePath) {
        const activeNorm = normalizeWorkspacePath(activeFilePath);
        const deps = index.getDependencies(activeNorm);
        for (const depPath of deps.imports.slice(0, 3)) {
          if (!explicitPaths.has(depPath)) {
            const doc = index.getFileDocument(depPath);
            if (doc && doc.content) {
              const headExcerpt = doc.lines.slice(0, 40).map((l, i) => `${i + 1}: ${l}`).join('\n');
              combinedItems.push({
                id: `dep-${depPath}`,
                type: 'file',
                name: `${depPath} [direct import]`,
                path: depPath,
                content: headExcerpt,
                sizeBytes: headExcerpt.length
              });
              explicitPaths.add(depPath);
            }
          }
        }
      }
    }

    const mergedOptions: ContextBuilderOptions = { ...options };

    // Auto-attach effective rules if not specified
    if (!mergedOptions.rules && files.length > 0) {
      const effRules = RulesService.getEffectiveRules({ userId: options.userId, projectId, files });
      if (effRules.length > 0) {
        mergedOptions.rules = effRules.map(r => `• [${r.scope.toUpperCase()}: ${r.name}] ${r.content}`);
      }
    }

    // Auto-attach relevant skills if not specified
    if (!mergedOptions.skills) {
      const matchedSkills = SkillsService.selectRelevantSkills(userMessage, 2);
      if (matchedSkills.length > 0) {
        mergedOptions.skills = matchedSkills.map(s => `• Skill: ${s.name}\n${s.instructions}`);
      }
    }

    // Auto-attach project memories if not specified and userId is provided
    if (!mergedOptions.memories && options.userId) {
      const mems = MemoryService.getProjectMemories(projectId, options.userId);
      if (mems.length > 0) {
        mergedOptions.memories = mems.map(m => `• [${m.category.toUpperCase()}]: ${m.key} => ${m.value}`);
      }
    }

    // Auto-attach diagnostics if not specified
    if (!mergedOptions.diagnostics && projectId) {
      const diagPrompt = DiagnosticsService.formatDiagnosticsPrompt(projectId);
      if (diagPrompt) {
        mergedOptions.diagnostics = diagPrompt;
      }
    }

    return ContextBuilder.build(userMessage, combinedItems, mergedOptions);
  }
}
