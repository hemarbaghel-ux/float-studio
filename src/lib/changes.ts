import { getState } from './store';

export function acceptChanges(chatId: string, ids?: string[]) {
  const chat = getState().chats.find((c) => c.id === chatId);
  if (!chat) return;
  const targets = ids ?? chat.changes.filter((c) => c.status === 'pending').map((c) => c.id);
  getState().setChangeStatus(chatId, targets, 'accepted');
}

/** Reverts changes newest-first so stacked edits to the same file unwind correctly. */
export function rejectChanges(chatId: string, ids?: string[]) {
  const s = getState();
  const chat = s.chats.find((c) => c.id === chatId);
  if (!chat) return;
  const set = new Set(ids ?? chat.changes.filter((c) => c.status === 'pending').map((c) => c.id));
  const list = chat.changes.filter((c) => set.has(c.id) && c.status !== 'rejected').sort((a, b) => b.at - a.at);
  for (const ch of list) {
    if (ch.before == null) s.deleteFile(ch.path);
    else s.writeFile(ch.path, ch.before);
  }
  s.setChangeStatus(chatId, [...set], 'rejected');
}
