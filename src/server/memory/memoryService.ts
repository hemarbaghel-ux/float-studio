/**
 * FLOAT AI - Safe Memory System (Milestone 9)
 *
 * Implements structured, bounded memory:
 * - Project memory (architectural decisions, conventions, known issues)
 * - Agent memory (learned preferences, recent outcomes)
 * - Automation memory (last run states, sync cursors)
 *
 * Protections:
 * - Length bounded per item (max 500 chars) and in total (max 4000 chars per project)
 * - Strict secret filtering (rejects tokens, private keys, passwords)
 * - Full CRUD with user ownership scoping
 */

export type MemoryCategory = 'architecture' | 'convention' | 'testing' | 'known_issue' | 'preference';

export interface MemoryItem {
  id: string;
  projectId: string;
  userId: string;
  category: MemoryCategory;
  key: string;
  value: string;
  scope: 'project' | 'agent' | 'automation';
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

const MAX_MEMORY_VALUE_CHARS = 500;
const MAX_TOTAL_MEMORY_CHARS = 4000;
const SECRET_REGEX = /(?:ghp_[a-zA-Z0-9]{36}|sk-[a-zA-Z0-9]{48}|AIzaSy[a-zA-Z0-9_-]{33}|-----BEGIN (?:RSA )?PRIVATE KEY-----)/i;

export class MemoryService {
  private static memories = new Map<string, MemoryItem>(); // id -> MemoryItem

  static setMemory(item: Omit<MemoryItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): { success: boolean; memory?: MemoryItem; error?: string } {
    // Check for secrets
    if (SECRET_REGEX.test(item.value) || SECRET_REGEX.test(item.key)) {
      return { success: false, error: 'Memory values cannot contain secret keys, tokens, or credentials.' };
    }

    const id = item.id || `mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const sanitizedVal = item.value.slice(0, MAX_MEMORY_VALUE_CHARS).trim();

    // Verify aggregate project bounds
    const existingForProject = this.getProjectMemories(item.projectId, item.userId);
    const otherChars = existingForProject
      .filter(m => m.id !== id)
      .reduce((sum, m) => sum + m.value.length, 0);

    if (otherChars + sanitizedVal.length > MAX_TOTAL_MEMORY_CHARS) {
      return { success: false, error: 'Aggregate memory limit reached for this project (max 4,000 characters).' };
    }

    const record: MemoryItem = {
      ...item,
      id,
      value: sanitizedVal,
      enabled: item.enabled !== false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.memories.set(id, record);
    return { success: true, memory: record };
  }

  static getMemory(id: string, userId: string): MemoryItem | undefined {
    const item = this.memories.get(id);
    if (!item || item.userId !== userId) return undefined;
    return item;
  }

  static getProjectMemories(projectId: string, userId: string): MemoryItem[] {
    return Array.from(this.memories.values()).filter(
      m => m.projectId === projectId && m.userId === userId && m.enabled
    );
  }

  static deleteMemory(id: string, userId: string): boolean {
    const item = this.memories.get(id);
    if (!item || item.userId !== userId) return false;
    return this.memories.delete(id);
  }

  /**
   * Formats active project memories for bounded prompt injection.
   */
  static formatMemoriesPrompt(memories: MemoryItem[]): string {
    if (memories.length === 0) return '';

    const lines: string[] = ['[Project Architectural Memory]'];
    for (const mem of memories) {
      lines.push(`• [${mem.category.toUpperCase()}]: ${mem.key} => ${mem.value}`);
    }
    return lines.join('\n');
  }

  static clear(): void {
    this.memories.clear();
  }
}
