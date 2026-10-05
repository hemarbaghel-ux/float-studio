const ownerKey = (ownerId?: string | null) => ownerId || 'local';

export function conversationCacheKey(conversationId: string, ownerId?: string | null): string {
  return `float_conv_${ownerKey(ownerId)}_${conversationId}`;
}

export function conversationListCacheKey(projectId: string, ownerId?: string | null): string {
  return `float_conv_list_${ownerKey(ownerId)}_${projectId}`;
}
