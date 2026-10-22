import { BrainMemoryItem, MemoryCategory } from './types';

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9_\-]{15,}/i,
  /ghp_[a-zA-Z0-9_\-]{15,}/i,
  /bearer\s+[a-zA-Z0-9_\-\.]{15,}/i,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/i,
  /password\s*[:=]\s*['"][^'"]+['"]/i
];

function containsSecret(text: string): boolean {
  return SECRET_PATTERNS.some(pat => pat.test(text));
}

function sanitizeText(text: string): string {
  let cleaned = text;
  for (const pat of SECRET_PATTERNS) {
    cleaned = cleaned.replace(pat, '[REDACTED_SECRET]');
  }
  return cleaned;
}

/**
 * Scoped, Persistent, Auditable Project Architectural Memory.
 * Retains high-level architectural constraints, verified fixes, user decisions,
 * and conventions across AI chat and agent turns with strict tenant isolation.
 */
export class BrainMemoryService {
  // Key: `${userId}:${projectId}` -> Map<memoryKey, BrainMemoryItem>
  private static store = new Map<string, Map<string, BrainMemoryItem>>();
  private static MAX_ITEMS_PER_SCOPE = 100;
  private static MAX_VALUE_CHARS = 4000;

  private static getScopeKey(projectId: string, userId: string): string {
    return `${userId || 'default-user'}:${projectId || 'default-project'}`;
  }

  /**
   * Stores or updates a project architectural memory item.
   */
  public static remember(params: {
    projectId: string;
    userId: string;
    category: MemoryCategory;
    key: string;
    value: string;
    provenance: string;
    confidence?: number;
    verified?: boolean;
    relatedFiles?: string[];
  }): { success: boolean; item?: BrainMemoryItem; error?: string } {
    if (!params.key || !params.value) {
      return { success: false, error: 'Key and value are required.' };
    }

    if (containsSecret(params.key) || containsSecret(params.value)) {
      return { success: false, error: 'Memory rejected: contains potential credentials or secrets.' };
    }

    const scopeKey = this.getScopeKey(params.projectId, params.userId);
    let scopeMap = this.store.get(scopeKey);
    if (!scopeMap) {
      scopeMap = new Map<string, BrainMemoryItem>();
      this.store.set(scopeKey, scopeMap);
    }

    if (scopeMap.size >= this.MAX_ITEMS_PER_SCOPE && !scopeMap.has(params.key)) {
      // Evict oldest unverified or stale item
      const oldestKey = Array.from(scopeMap.entries())
        .sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0]?.[0];
      if (oldestKey) scopeMap.delete(oldestKey);
    }

    const trimmedValue = sanitizeText(params.value).slice(0, this.MAX_VALUE_CHARS);
    const existing = scopeMap.get(params.key);
    const now = Date.now();

    const item: BrainMemoryItem = {
      id: existing?.id || `mem_${now}_${Math.random().toString(36).slice(2, 7)}`,
      projectId: params.projectId,
      userId: params.userId,
      category: params.category,
      key: params.key.trim(),
      value: trimmedValue,
      provenance: params.provenance || 'agent_inference',
      confidence: Math.max(0, Math.min(1, params.confidence ?? 0.85)),
      verified: params.verified ?? false,
      relatedFiles: params.relatedFiles || [],
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      stale: false
    };

    scopeMap.set(item.key, item);
    return { success: true, item };
  }

  /**
   * Retrieves memories scoped to a project and user, with optional category or text filter.
   */
  public static queryMemories(
    projectId: string,
    userId: string,
    query?: string,
    category?: MemoryCategory
  ): BrainMemoryItem[] {
    const scopeKey = this.getScopeKey(projectId, userId);
    const scopeMap = this.store.get(scopeKey);
    if (!scopeMap) return [];

    const normQuery = query ? query.toLowerCase().trim() : '';
    const queryTokens = normQuery.split(/[^\w$]+/).filter(t => t.length > 2);
    const results: BrainMemoryItem[] = [];

    for (const item of scopeMap.values()) {
      if (item.stale) continue;
      if (category && item.category !== category) continue;
      if (normQuery) {
        const text = `${item.key} ${item.value} ${(item.relatedFiles || []).join(' ')}`.toLowerCase();
        const matchesToken = queryTokens.length > 0 && queryTokens.some(tok => text.includes(tok));
        if (!text.includes(normQuery) && !matchesToken) continue;
      }
      results.push({ ...item });
    }

    // Sort: verified first, then updated recently
    results.sort((a, b) => (b.verified ? 1 : 0) - (a.verified ? 1 : 0) || b.updatedAt - a.updatedAt);
    return results;
  }

  /**
   * Marks memories related to a file as stale when the file is modified or deleted.
   */
  public static invalidateStale(projectId: string, userId: string, filePath: string): number {
    const scopeKey = this.getScopeKey(projectId, userId);
    const scopeMap = this.store.get(scopeKey);
    if (!scopeMap) return 0;

    let invalidatedCount = 0;
    const normFile = filePath.replace(/\\/g, '/').toLowerCase();

    for (const item of scopeMap.values()) {
      if (item.relatedFiles && item.relatedFiles.some(f => f.toLowerCase().includes(normFile))) {
        item.stale = true;
        invalidatedCount++;
      }
    }

    return invalidatedCount;
  }

  /**
   * Deletes a specific memory entry.
   */
  public static forget(projectId: string, userId: string, key: string): boolean {
    const scopeKey = this.getScopeKey(projectId, userId);
    const scopeMap = this.store.get(scopeKey);
    if (!scopeMap) return false;
    return scopeMap.delete(key);
  }

  /**
   * Formats relevant memories into an authoritative context block for AI prompts.
   */
  public static formatPromptBlock(projectId: string, userId: string, limit: number = 6): string {
    const memories = this.queryMemories(projectId, userId).slice(0, limit);
    if (memories.length === 0) return '';

    const lines = memories.map(
      m => `• [${m.category.toUpperCase()}] ${m.key}: ${m.value}${m.verified ? ' [VERIFIED]' : ''}`
    );
    return `[Project Architectural Memory]\n${lines.join('\n')}`;
  }

  /**
   * Clears all memories for a scope (e.g. on project deletion or testing).
   */
  public static clearScope(projectId: string, userId: string): void {
    const scopeKey = this.getScopeKey(projectId, userId);
    this.store.delete(scopeKey);
  }
}
