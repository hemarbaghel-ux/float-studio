/**
 * FLOAT AI - Reusable Skills System (Milestone 9)
 *
 * Implements modular skill packages containing targeted domain instructions,
 * permitted tool subsets, and relevance matchers.
 *
 * Security & Budget guarantees:
 * - Skills are selectively matched against prompt intent/keywords (never dumped wholesale)
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
}

export const BUILT_IN_SKILLS: FloatSkill[] = [
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  }
];

export class SkillsService {
  private static customSkills = new Map<string, FloatSkill>(); // skillId -> Skill

  static registerSkill(skill: FloatSkill): void {
    this.customSkills.set(skill.id, skill);
  }

  static getSkill(id: string): FloatSkill | undefined {
    return this.customSkills.get(id) || BUILT_IN_SKILLS.find(s => s.id === id);
  }

  static getAllSkills(): FloatSkill[] {
    const list = [...BUILT_IN_SKILLS];
    for (const custom of this.customSkills.values()) {
      const idx = list.findIndex(s => s.id === custom.id);
      if (idx >= 0) list[idx] = custom;
      else list.push(custom);
    }
    return list;
  }

  /**
   * Selectively identifies relevant skills based on prompt tokens and intent.
   * Never injects more than maxSkills (default 2) to prevent context pollution.
   */
  static selectRelevantSkills(prompt: string, maxSkills = 2): FloatSkill[] {
    const norm = prompt.toLowerCase();
    const promptWords = new Set(
      prompt.toLowerCase().split(/[^\p{L}\p{N}_$]+/u).filter(w => w.length > 0)
    );
    const skills = this.getAllSkills().filter(s => s.enabled);

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
}
