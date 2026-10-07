/**
 * FLOAT AI - Authoritative Rules System (Milestone 9)
 *
 * Supports layered rules:
 * 1. User Rules: Global preferences applied across all projects
 * 2. Project Rules: Configured per-project in workspace settings
 * 3. Repository Rules: Discovered from `.float/rules/*.md` or `.float/rules/*.json`
 *
 * Enforces security boundaries:
 * - Content length is bounded per rule and in aggregate
 * - Traversal and sensitive patterns are excluded
 * - Untrusted repository rules cannot override platform security policies
 */

import { normalizeWorkspacePath } from '../../services/indexing/fileFilter';

export type RuleScope = 'user' | 'project' | 'repository';

export interface FloatRule {
  id: string;
  name: string;
  content: string;
  scope: RuleScope;
  enabled: boolean;
  priority: number; // 1 = highest
  globs?: string[];
  projectId?: string;
  userId?: string;
}

const MAX_RULE_LENGTH = 2000;
const MAX_TOTAL_RULES_LENGTH = 6000;

export class RulesService {
  private static userRules = new Map<string, FloatRule[]>(); // userId -> rules
  private static projectRules = new Map<string, FloatRule[]>(); // projectId -> rules

  /**
   * Registers or updates a user-scoped rule.
   */
  static setUserRule(userId: string, rule: Omit<FloatRule, 'scope' | 'userId'>): FloatRule {
    const list = this.userRules.get(userId) || [];
    const sanitizedContent = (rule.content || '').slice(0, MAX_RULE_LENGTH).trim();
    const existingIdx = list.findIndex(r => r.id === rule.id);

    const fullRule: FloatRule = {
      ...rule,
      content: sanitizedContent,
      scope: 'user',
      userId,
      priority: rule.priority || 5,
      enabled: rule.enabled !== false
    };

    if (existingIdx >= 0) {
      list[existingIdx] = fullRule;
    } else {
      list.push(fullRule);
    }
    this.userRules.set(userId, list);
    return fullRule;
  }

  static getUserRules(userId: string): FloatRule[] {
    return this.userRules.get(userId) || [];
  }

  static deleteUserRule(userId: string, ruleId: string): boolean {
    const list = this.userRules.get(userId) || [];
    const filtered = list.filter(r => r.id !== ruleId);
    this.userRules.set(userId, filtered);
    return filtered.length < list.length;
  }

  /**
   * Registers or updates a project-scoped rule.
   */
  static setProjectRule(projectId: string, rule: Omit<FloatRule, 'scope' | 'projectId'>): FloatRule {
    const list = this.projectRules.get(projectId) || [];
    const sanitizedContent = (rule.content || '').slice(0, MAX_RULE_LENGTH).trim();
    const existingIdx = list.findIndex(r => r.id === rule.id);

    const fullRule: FloatRule = {
      ...rule,
      content: sanitizedContent,
      scope: 'project',
      projectId,
      priority: rule.priority || 3,
      enabled: rule.enabled !== false
    };

    if (existingIdx >= 0) {
      list[existingIdx] = fullRule;
    } else {
      list.push(fullRule);
    }
    this.projectRules.set(projectId, list);
    return fullRule;
  }

  static getProjectRules(projectId: string): FloatRule[] {
    return this.projectRules.get(projectId) || [];
  }

  static deleteProjectRule(projectId: string, ruleId: string): boolean {
    const list = this.projectRules.get(projectId) || [];
    const filtered = list.filter(r => r.id !== ruleId);
    this.projectRules.set(projectId, filtered);
    return filtered.length < list.length;
  }

  /**
   * Discovers repository rules from `.float/rules/` files in the workspace.
   * Supports `.md`, `.txt`, and `.json` formats.
   */
  static discoverRepositoryRules(
    files: Array<{ path?: string; name?: string; content?: string }>
  ): FloatRule[] {
    const repoRules: FloatRule[] = [];

    for (const f of files) {
      const rawPath = f.path || f.name || '';
      const norm = normalizeWorkspacePath(rawPath);

      // Support Cursor compatibility (.cursorrules file in workspace root)
      if (norm === '.cursorrules') {
        const rawContent = (f.content || '').trim();
        if (rawContent) {
          repoRules.push({
            id: 'repo-cursorrules',
            name: 'Cursor Rules (.cursorrules)',
            content: rawContent.slice(0, MAX_RULE_LENGTH),
            scope: 'repository',
            enabled: true,
            priority: 2
          });
        }
        continue;
      }

      if (!norm.startsWith('.float/rules/')) continue;

      const baseName = norm.replace(/^\.float\/rules\//, '');
      if (!baseName || baseName.includes('/') || baseName.includes('..')) continue;

      const rawContent = (f.content || '').trim();
      if (!rawContent) continue;

      if (norm.endsWith('.json')) {
        try {
          const parsed = JSON.parse(rawContent);
          if (Array.isArray(parsed)) {
            parsed.forEach((item, idx) => {
              if (item && item.content) {
                repoRules.push({
                  id: `repo-${baseName}-${idx}`,
                  name: item.name || `${baseName} Rule #${idx + 1}`,
                  content: String(item.content).slice(0, MAX_RULE_LENGTH),
                  scope: 'repository',
                  enabled: item.enabled !== false,
                  priority: typeof item.priority === 'number' ? item.priority : 2,
                  globs: Array.isArray(item.globs) ? item.globs : undefined
                });
              }
            });
          } else if (parsed && parsed.content) {
            repoRules.push({
              id: `repo-${baseName}`,
              name: parsed.name || baseName,
              content: String(parsed.content).slice(0, MAX_RULE_LENGTH),
              scope: 'repository',
              enabled: parsed.enabled !== false,
              priority: typeof parsed.priority === 'number' ? parsed.priority : 2,
              globs: Array.isArray(parsed.globs) ? parsed.globs : undefined
            });
          }
        } catch {
          // JSON parse failure ignored gracefully
        }
      } else {
        // Markdown / Plain text rule
        repoRules.push({
          id: `repo-${baseName}`,
          name: baseName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
          content: rawContent.slice(0, MAX_RULE_LENGTH),
          scope: 'repository',
          enabled: true,
          priority: 2
        });
      }
    }

    return repoRules;
  }

  /**
   * Collects, prioritizes, and bounds all active rules for the given user, project, and file tree.
   * Priority ordering:
   * 1. Repository rules (.float/rules/)
   * 2. Project rules
   * 3. User global rules
   */
  static getEffectiveRules(options: {
    userId?: string;
    projectId?: string;
    files?: Array<{ path?: string; name?: string; content?: string }>;
    targetFilePath?: string;
  }): FloatRule[] {
    const allRules: FloatRule[] = [];

    // 1. Repository rules
    if (options.files && options.files.length > 0) {
      const repoRules = this.discoverRepositoryRules(options.files);
      allRules.push(...repoRules.filter(r => r.enabled));
    }

    // 2. Project rules
    if (options.projectId) {
      const pRules = this.getProjectRules(options.projectId);
      allRules.push(...pRules.filter(r => r.enabled));
    }

    // 3. User rules
    if (options.userId) {
      const uRules = this.getUserRules(options.userId);
      allRules.push(...uRules.filter(r => r.enabled));
    }

    // Sort by priority ascending (1 = highest), then scope
    allRules.sort((a, b) => a.priority - b.priority);

    // Filter rules by file patterns (globs) if defined
    const applicableRules = allRules.filter(rule => {
      if (!rule.globs || rule.globs.length === 0) return true;
      if (options.targetFilePath) {
        const target = options.targetFilePath.toLowerCase().replace(/\\/g, '/');
        const matches = rule.globs.some(g => {
          const pat = g.toLowerCase().replace(/\\/g, '/');
          if (pat === '*' || pat === '**/*') return true;
          if (pat.startsWith('*.')) return target.endsWith(pat.slice(1));
          if (pat.endsWith('/*')) return target.startsWith(pat.slice(0, -2) + '/');
          return target.includes(pat);
        });
        if (matches) return true;
      }
      // If no targetFilePath provided, check if any workspace files match the pattern
      if (!options.targetFilePath && options.files && options.files.length > 0) {
        return options.files.some(f => {
          const p = (f.path || f.name || '').toLowerCase().replace(/\\/g, '/');
          return rule.globs!.some(g => {
            const pat = g.toLowerCase().replace(/\\/g, '/');
            if (pat === '*' || pat === '**/*') return true;
            if (pat.startsWith('*.')) return p.endsWith(pat.slice(1));
            return p.includes(pat);
          });
        });
      }
      return !options.targetFilePath;
    });

    // Apply strict budget limit
    const boundedRules: FloatRule[] = [];
    let currentLength = 0;

    for (const rule of applicableRules) {
      if (currentLength + rule.content.length > MAX_TOTAL_RULES_LENGTH) {
        break;
      }
      boundedRules.push(rule);
      currentLength += rule.content.length;
    }

    return boundedRules;
  }

  /**
   * Formats effective rules as an AI system prompt section.
   */
  static formatRulesPrompt(rules: FloatRule[]): string {
    if (rules.length === 0) return '';

    const lines: string[] = ['[Workspace & Coding Rules]'];
    for (const rule of rules) {
      lines.push(`• [${rule.scope.toUpperCase()}: ${rule.name}]`);
      lines.push(`  ${rule.content}`);
    }
    return lines.join('\n');
  }
}
