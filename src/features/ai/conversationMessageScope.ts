import type { AIMessage } from '../../types';

/** Select only messages owned by the conversation being persisted. */
export function messagesForConversation(messages: AIMessage[], conversationId: string): AIMessage[] {
  return messages.filter(message => message.conversationId === conversationId);
}
