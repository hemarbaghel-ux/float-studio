/**
 * FLOAT AI - Conversation Search & Query Engine (Milestone 9)
 *
 * Implements searchable conversation history:
 * - Query by prompt or response text
 * - Filter by projectId, modelId, date boundaries
 * - Scoped strictly to authenticated userId
 * - Paginated results with matched message excerpts
 */

import { AIMessage } from '../../types';

export interface SearchableConversation {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AIMessage[];
}

export interface ConversationSearchQuery {
  queryText: string;
  projectId?: string;
  modelId?: string;
  startDate?: number;
  endDate?: number;
  limit?: number;
  offset?: number;
}

export interface ConversationSearchResult {
  conversationId: string;
  projectId: string;
  title: string;
  matchedMessageId: string;
  matchedRole: 'user' | 'model';
  excerpt: string;
  timestamp: number;
  modelId?: string;
}

export class ConversationSearchService {
  private static store = new Map<string, SearchableConversation>();

  static indexConversation(conversation: SearchableConversation): void {
    this.store.set(conversation.id, conversation);
  }

  static removeConversation(conversationId: string): boolean {
    return this.store.delete(conversationId);
  }

  /**
   * Searches indexed conversations belonging to the user with query filtering and pagination.
   */
  static search(
    userId: string,
    params: ConversationSearchQuery
  ): { results: ConversationSearchResult[]; total: number } {
    const norm = (params.queryText || '').toLowerCase().trim();
    const limit = Math.min(params.limit || 20, 50);
    const offset = Math.max(params.offset || 0, 0);

    const matches: ConversationSearchResult[] = [];

    for (const conv of this.store.values()) {
      if (conv.userId !== userId) continue;
      if (params.projectId && conv.projectId !== params.projectId) continue;
      if (params.startDate && conv.updatedAt < params.startDate) continue;
      if (params.endDate && conv.createdAt > params.endDate) continue;

      for (const msg of conv.messages) {
        if (params.modelId && msg.modelId && msg.modelId !== params.modelId) continue;

        const contentNorm = (msg.content || '').toLowerCase();
        if (!norm || contentNorm.includes(norm)) {
          // Extract snippet around match
          let excerpt = msg.content.slice(0, 150);
          if (norm && contentNorm.includes(norm)) {
            const idx = contentNorm.indexOf(norm);
            const start = Math.max(0, idx - 40);
            const end = Math.min(msg.content.length, idx + norm.length + 60);
            excerpt = (start > 0 ? '...' : '') + msg.content.slice(start, end) + (end < msg.content.length ? '...' : '');
          }

          matches.push({
            conversationId: conv.id,
            projectId: conv.projectId,
            title: conv.title,
            matchedMessageId: msg.id,
            matchedRole: msg.role,
            excerpt,
            timestamp: msg.timestamp,
            modelId: msg.modelId
          });
        }
      }
    }

    // Sort by timestamp descending
    matches.sort((a, b) => b.timestamp - a.timestamp);

    const total = matches.length;
    const paginated = matches.slice(offset, offset + limit);

    return {
      results: paginated,
      total
    };
  }

  static clear(): void {
    this.store.clear();
  }
}
