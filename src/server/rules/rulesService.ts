/**
 * FLOAT AI - Authoritative Rules System (Milestone 9)
 *
 * Supports layered rules:
 * 1. User Rules: Global preferences applied across all projects owned by that user
 * 2. Project Rules: Configured per-project and bound to the project owner
 * 3. Repository Rules: Discovered from `.float/rules/*.md` or `.float/rules/*.json`
 *
 * Enforces security boundaries:
 * - Content length is bounded per rule and in aggregate
 * - Traversal and sensitive patterns are excluded
 * - Project rules enforce tenant ownership when userId is provided
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
  private static projectRuleOwners = new Map<string, string>(); // projectId -> owner userId

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
   * Registers or updates a project-scoped rule with tenant ownership enforcement.
   */
  static setProjectRule(
    projectId: string,
    rule: Omit<FloatRule, 'scope' | 'projectId'>,
    userId?: string
  ): FloatRule {
    const recordedOwner = this.projectRuleOwners.get(projectId);
    const effectiveUserId = userId ?? rule.userId;
    if (recordedOwner && effectiveUserId && recordedOwner !== effectiveUserId) {
      throw new Error('Forbidden: Cannot modify rules for a project owned by another user.');
    }
    if (effectiveUserId && !recordedOwner) {
      this.projectRuleOwners.set(projectId, effectiveUserId);
    }

    const list = this.projectRules.get(projectId) || [];
    const sanitizedContent = (rule.content || '').slice(0, MAX_RULE_LENGTH).trim();
    const existingIdx = list.findIndex(r => r.id === rule.id);

    const fullRule: FloatRule = {
      ...rule,
      content: sanitizedContent,
      scope: 'project',
      projectId,
      userId: effectiveUserId,
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

  static getProjectRules(projectId: string, userId?: string): FloatRule[] {
    const recordedOwner = this.projectRuleOwners.get(projectId);
    if (recordedOwner && userId && recordedOwner !== userId) {
      return [];
    }
    const list = this.projectRules.get(projectId) || [];
    if (userId) {
      return list.filter(r => !r.userId || r.userId === userId);
    }
    return list;
  }

  static deleteProjectRule(projectId: string, ruleId: string, userId?: string): boolean {
    const recordedOwner = this.projectRuleOwners.get(projectId);
    if (recordedOwner && userId && recordedOwner !== userId) {
      return false;
    }
    const list = this.projectRules.get(projectId) || [];
    const filtered = list.filter(r => {
      if (r.id !== ruleId) return true;
      if (userId && r.userId && r.userId !== userId) return true;
      return false;
    });
    this.projectRules.set(projectId, filtered);
    return filtered.length < list.length;
  }

  static clear(): void {
    this.userRules.clear();
    this.projectRules.clear();
    this.projectRuleOwners.clear();
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

      if (norm === '.cursorrules' || norm === '.floatrules') {
        const rawContent = (f.content || '').trim();
        if (rawContent) {
          repoRules.push({
            id: `repo-${norm.replace('.', '')}`,
            name: norm === '.floatrules' ? 'FLOAT Rules (.floatrules)' : 'Cursor Rules (.cursorrules)',
            content: rawContent.slice(0, MAX_RULE_LENGTH),
            scope: 'repository',
            enabled: true,
            priority: norm === '.floatrules' ? 1 : 2
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
   */
  static getEffectiveRules(options: {
    userId?: string;
    projectId?: string;
    files?: Array<{ path?: string; name?: string; content?: string }>;
    targetFilePath?: string;
  }): FloatRule[] {
    const allRules: FloatRule[] = [];

    if (options.files && options.files.length > 0) {
      const repoRules = this.discoverRepositoryRules(options.files);
      allRules.push(...repoRules.filter(r => r.enabled));
    }

    if (options.projectId) {
      const pRules = this.getProjectRules(options.projectId, options.userId);
      allRules.push(...pRules.filter(r => r.enabled));
    }

    if (options.userId) {
      const uRules = this.getUserRules(options.userId);
      allRules.push(...uRules.filter(r => r.enabled));
    }

    allRules.sort((a, b) => a.priority - b.priority);

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
