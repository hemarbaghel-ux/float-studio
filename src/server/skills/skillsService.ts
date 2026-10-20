/**
 * FLOAT AI - Reusable Skills System (Milestone 9)
 *
 * Implements modular skill packages containing targeted domain instructions,
 * permitted tool subsets, and relevance matchers.
 *
 * Security & Budget guarantees:
 * - Skills are selectively matched against prompt intent/keywords (never dumped wholesale)
 * - Custom skills are strictly partitioned by userId (and optional projectId) so tenants
 *   cannot poison global built-in skills or other users' prompt contexts
 * - Tools assigned to skills cannot bypass tool authorization or execution policies
 * - Skills cannot read or leak sensitive credentials
 */

export interface FloatSkill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  allowedTools: string[];
  scope: 'built-in' | 'project' | 'user';
  enabled: boolean;
  keywords: string[];
  permissionsRequired: Array<'read' | 'write' | 'network' | 'git'>;
  userId?: string;
  projectId?: string;
}

export const BUILT_IN_SKILLS: ReadonlyArray<FloatSkill> = Object.freeze([
  Object.freeze({
    id: 'skill-react-patterns',
    name: 'React 19 & Architecture',
    description: 'Best practices for React components, hooks, suspense, and rendering performance.',
    instructions: `When working with React components:
- Prefer clean functional components with TypeScript props.
- Keep state local where possible; use Zustand for shared state.
- Ensure hooks do not violate rules of hooks or produce unnecessary re-renders.
- Wrap side effects safely with cleanup functions in useEffect.`,
    allowedTools: ['list_project_files', 'read_project_file', 'search_codebase', 'propose_changes'],
    scope: 'built-in',
    enabled: true,
    keywords: ['react', 'component', 'jsx', 'tsx', 'hook', 'useeffect', 'usestate', 'zustand'],
    permissionsRequired: ['read']
  }),
  Object.freeze({
    id: 'skill-firebase-debugging',
    name: 'Firebase & Firestore Governance',
    description: 'Patterns for Firebase auth, Firestore security rules, and admin SDK safety.',
    instructions: `When working with Firebase/Firestore:
- Never commit or expose Firebase service account private keys or credentials.
- Always enforce tenant ownership checks (ownerId === userId) on Firestore documents.
- Use atomic transactions or batched writes for interdependent records.
- Handle offline / unauthenticated states gracefully with fallback handling.`,
    allowedTools: ['list_project_files', 'read_project_file', 'search_codebase', 'propose_changes'],
    scope: 'built-in',
    enabled: true,
    keywords: ['firebase', 'firestore', 'auth', 'rules', 'security rules', 'collection', 'document', 'tenant'],
    permissionsRequired: ['read']
  }),
  Object.freeze({
    id: 'skill-testing-practices',
    name: 'Automated Testing & Verification',
    description: 'Patterns for unit tests, assertion libraries, and reproducible test suites.',
    instructions: `When writing or debugging tests:
- Write deterministic tests with clear assertion messages.
- Test both sunny-day scenarios and edge cases (e.g. invalid inputs, null safety, boundary values).
- Clean up any mock state or temporary resources in teardown.
- Never fake test results; run real validations against code files.`,
    allowedTools: ['list_project_files', 'read_project_file', 'search_codebase', 'propose_changes'],
    scope: 'built-in',
    enabled: true,
    keywords: ['test', 'spec', 'unit test', 'assertion', 'assert', 'mock', 'coverage', 'verify', 'regression'],
    permissionsRequired: ['read']
  }),
  Object.freeze({
    id: 'skill-git-workflow',
    name: 'Git & GitHub Developer Workflow',
    description: 'Safe branching, commit message formatting, and pull request hygiene.',
    instructions: `When preparing Git operations:
- Follow Conventional Commits format (feat:, fix:, chore:, refactor:, test:).
- Never commit secrets, .env files, or build artifacts.
- Keep branch names descriptive and sanitized (e.g. feat/feature-name, fix/issue-name).
- Maintain clean PR descriptions summarizing changes and verification steps.`,
    allowedTools: ['list_project_files', 'read_project_file', 'propose_changes'],
    scope: 'built-in',
    enabled: true,
    keywords: ['git', 'github', 'commit', 'branch', 'pr', 'pull request', 'merge', 'diff', 'stash'],
    permissionsRequired: ['git', 'read']
  }),
  Object.freeze({
    id: 'skill-api-design',
    name: 'Express & REST API Security',
    description: 'Secure API routing, parameter validation, rate limiting, and status codes.',
    instructions: `When designing Express endpoints:
- Protect sensitive endpoints with requireAuth middleware.
- Validate all request params and body payloads before processing.
- Reject path traversal (../) and null bytes on all path arguments.
- Return consistent JSON error envelopes with proper HTTP status codes.`,
    allowedTools: ['list_project_files', 'read_project_file', 'search_codebase', 'propose_changes'],
    scope: 'built-in',
    enabled: true,
    keywords: ['api', 'endpoint', 'express', 'router', 'route', 'req', 'res', 'middleware', 'status', 'rest'],
    permissionsRequired: ['read']
  }),
  Object.freeze({
    id: 'skill-ui-accessibility',
    name: 'UI Accessibility & ARIA',
    description: 'Keyboard navigation, screen reader accessibility, and color contrast.',
    instructions: `When building user interfaces:
- Ensure all interactive elements are focusable and keyboard navigable.
- Provide descriptive aria-label attributes on icon-only buttons.
- Maintain adequate color contrast ratios and avoid relying on color alone.
- Manage modal focus traps and Esc key dismissal cleanly.`,
    allowedTools: ['list_project_files', 'read_project_file', 'search_codebase', 'propose_changes'],
    scope: 'built-in',
    enabled: true,
    keywords: ['accessibility', 'a11y', 'aria', 'contrast', 'keyboard', 'focus', 'screen reader'],
    permissionsRequired: ['read']
  })
]);

const BUILT_IN_SKILL_IDS = new Set(BUILT_IN_SKILLS.map(s => s.id));
const DEFAULT_TEST_NAMESPACE = '__unscoped_test__';

export class SkillsService {
  // userId -> (skillId -> FloatSkill)
  private static customSkillsByUser = new Map<string, Map<string, FloatSkill>>();

  static isBuiltInSkillId(id: string): boolean {
    return BUILT_IN_SKILL_IDS.has(id);
  }

  static registerSkill(skill: FloatSkill, userId?: string): FloatSkill {
    if (!skill || !skill.id) {
      throw new Error('Skill id is required.');
    }
    if (BUILT_IN_SKILL_IDS.has(skill.id)) {
      throw new Error(`Cannot overwrite built-in system skill "${skill.id}".`);
    }
    const ownerKey = (userId || skill.userId || DEFAULT_TEST_NAMESPACE).trim();
    let bucket = this.customSkillsByUser.get(ownerKey);
    if (!bucket) {
      bucket = new Map<string, FloatSkill>();
      this.customSkillsByUser.set(ownerKey, bucket);
    }
    const stored: FloatSkill = {
      ...skill,
      scope: skill.projectId ? 'project' : 'user',
      userId: ownerKey === DEFAULT_TEST_NAMESPACE ? undefined : ownerKey,
      enabled: skill.enabled !== false
    };
    bucket.set(stored.id, stored);
    return stored;
  }

  static getSkill(id: string, userId?: string, projectId?: string): FloatSkill | undefined {
    const builtIn = BUILT_IN_SKILLS.find(s => s.id === id);
    if (builtIn) return builtIn;

    const ownerKey = (userId || DEFAULT_TEST_NAMESPACE).trim();
    const bucket = this.customSkillsByUser.get(ownerKey);
    const custom = bucket?.get(id);
    if (!custom) return undefined;
    if (custom.projectId && projectId && custom.projectId !== projectId) {
      return undefined;
    }
    return custom;
  }

  static deleteSkill(id: string, userId: string): boolean {
    if (!userId || BUILT_IN_SKILL_IDS.has(id)) return false;
    const bucket = this.customSkillsByUser.get(userId.trim());
    if (!bucket) return false;
    return bucket.delete(id);
  }

  static getAllSkills(userId?: string, projectId?: string): FloatSkill[] {
    const list: FloatSkill[] = [...BUILT_IN_SKILLS];
    const ownerKey = (userId || DEFAULT_TEST_NAMESPACE).trim();
    const bucket = this.customSkillsByUser.get(ownerKey);
    if (!bucket) return list;

    for (const custom of bucket.values()) {
      if (custom.projectId && projectId && custom.projectId !== projectId) {
        continue;
      }
      if (custom.projectId && !projectId && userId) {
        // Project-scoped skills are only returned when matching projectId is supplied
        continue;
      }
      list.push(custom);
    }
    return list;
  }

  /**
   * Selectively identifies relevant skills based on prompt tokens and intent,
   * strictly scoped to the requesting userId and projectId.
   */
  static selectRelevantSkills(prompt: string, maxSkills = 2, userId?: string, projectId?: string): FloatSkill[] {
    const norm = prompt.toLowerCase();
    const promptWords = new Set(
      prompt.toLowerCase().split(/[^\p{L}\p{N}_$]+/u).filter(w => w.length > 0)
    );
    const skills = this.getAllSkills(userId, projectId).filter(s => s.enabled);

    const scored: Array<{ skill: FloatSkill; score: number }> = [];

    for (const skill of skills) {
      let score = 0;
      for (const kw of skill.keywords) {
        if (kw.includes(' ')) {
          if (norm.includes(kw)) score += 15;
        } else if (promptWords.has(kw)) {
          score += 10;
        }
      }
      if (score > 0) {
        scored.push({ skill, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxSkills).map(s => s.skill);
  }

  /**
   * Formats selected skills into a bounded AI instruction block.
   */
  static formatSkillsPrompt(skills: FloatSkill[]): string {
    if (skills.length === 0) return '';

    const lines: string[] = ['[Active Domain Skills]'];
    for (const skill of skills) {
      lines.push(`• Skill: ${skill.name}`);
      lines.push(skill.instructions);
    }
    return lines.join('\n');
  }

  static clear(): void {
    this.customSkillsByUser.clear();
  }
}
