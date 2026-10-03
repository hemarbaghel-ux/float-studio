import { db, auth } from '../lib/firebase';
import { 
  collection, query, where, getDocs, doc, getDoc, 
  setDoc, updateDoc, deleteDoc, serverTimestamp, orderBy, limit 
} from 'firebase/firestore';
import { AIMessage } from '../types';
import { OperationType, handleFirestoreError } from '../lib/firestoreErrors';

export interface ConversationRecord {
  id: string;
  projectId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AIMessage[];
}

export interface ConversationMeta {
  id: string;
  projectId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

const STORAGE_PREFIX = 'float_conv_';
const LIST_PREFIX = 'float_conv_list_';

export class ConversationService {
  /**
   * Local storage helpers for instant hydration & offline resilience
   */
  static getLocalList(projectId: string): ConversationMeta[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(`${LIST_PREFIX}${projectId}`);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) return list;
      }
    } catch (e) {
      console.warn('Failed to parse local conversation list:', e);
    }
    return [];
  }

  static saveLocalList(projectId: string, list: ConversationMeta[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(`${LIST_PREFIX}${projectId}`, JSON.stringify(list));
    } catch (e) {
      console.warn('Failed to persist local conversation list:', e);
    }
  }

  static getLocalConversation(conversationId: string): ConversationRecord | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${conversationId}`);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn(`Failed to parse local conversation ${conversationId}:`, e);
    }
    return null;
  }

  static saveLocalConversation(record: ConversationRecord): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${record.id}`, JSON.stringify(record));
      
      // Update list index
      const list = this.getLocalList(record.projectId);
      const existingIdx = list.findIndex(c => c.id === record.id);
      const meta: ConversationMeta = {
        id: record.id,
        projectId: record.projectId,
        title: record.title,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        messageCount: record.messages.length
      };

      if (existingIdx >= 0) {
        list[existingIdx] = meta;
      } else {
        list.unshift(meta);
      }
      this.saveLocalList(record.projectId, list);
    } catch (e) {
      console.warn(`Failed to persist local conversation ${record.id}:`, e);
    }
  }

  static deleteLocal(conversationId: string, projectId: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}${conversationId}`);
      const list = this.getLocalList(projectId).filter(c => c.id !== conversationId);
      this.saveLocalList(projectId, list);
    } catch (e) {
      console.warn('Failed to delete local conversation:', e);
    }
  }

  /**
   * Cloud Firestore persistence with strict owner verification
   */
  static async syncToCloud(record: ConversationRecord): Promise<void> {
    // Always save locally first
    this.saveLocalConversation(record);

    const user = auth.currentUser;
    if (!user) return; // Unauthenticated users use local storage only

    const convRef = doc(db, 'conversations', record.id);

    try {
      let docExists = false;
      let isOwner = false;

      try {
        const snap = await getDoc(convRef);
        if (snap.exists()) {
          docExists = true;
          isOwner = snap.data().ownerId === user.uid;
        }
      } catch (readErr) {
        docExists = false;
        isOwner = false;
      }

      // Cap stored messages payload string length for safety (< 2MB)
      const serializedMessages = JSON.stringify(record.messages).slice(0, 1900000);

      if (docExists && isOwner) {
        await updateDoc(convRef, {
          title: record.title.slice(0, 190),
          messages: serializedMessages,
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(convRef, {
          ownerId: user.uid,
          projectId: record.projectId,
          title: record.title.slice(0, 190),
          messages: serializedMessages,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    } catch (err: any) {
      console.error('Failed to sync conversation to Cloud Firestore:', err);
      // Non-fatal: local copy is preserved
    }
  }

  static async fetchCloudList(projectId: string): Promise<ConversationMeta[]> {
    const local = this.getLocalList(projectId);
    const user = auth.currentUser;
    if (!user) return local;

    try {
      const q = query(
        collection(db, 'conversations'),
        where('ownerId', '==', user.uid),
        where('projectId', '==', projectId)
      );

      const snapshot = await getDocs(q);
      const cloudList: ConversationMeta[] = [];

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        let msgCount = 0;
        try {
          const parsed = JSON.parse(data.messages || '[]');
          msgCount = Array.isArray(parsed) ? parsed.length : 0;
        } catch {
          msgCount = 0;
        }

        cloudList.push({
          id: docSnap.id,
          projectId: data.projectId,
          title: data.title || 'Untitled Chat',
          createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now(),
          updatedAt: data.updatedAt?.toMillis ? data.updatedAt.toMillis() : Date.now(),
          messageCount: msgCount
        });
      });

      cloudList.sort((a, b) => b.updatedAt - a.updatedAt);

      if (cloudList.length > 0) {
        this.saveLocalList(projectId, cloudList);
        return cloudList;
      }
    } catch (err) {
      console.warn('Could not fetch cloud conversations; using local cache:', err);
    }

    return local;
  }

  static async fetchCloudConversation(conversationId: string): Promise<AIMessage[] | null> {
    const local = this.getLocalConversation(conversationId);
    const user = auth.currentUser;
    if (!user) return local?.messages || null;

    try {
      const convRef = doc(db, 'conversations', conversationId);
      const snap = await getDoc(convRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.ownerId === user.uid && data.messages) {
          const messages = JSON.parse(data.messages);
          if (Array.isArray(messages)) {
            // Update local cache
            this.saveLocalConversation({
              id: conversationId,
              projectId: data.projectId,
              title: data.title || 'Chat',
              createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now(),
              updatedAt: data.updatedAt?.toMillis ? data.updatedAt.toMillis() : Date.now(),
              messages
            });
            return messages;
          }
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch cloud conversation ${conversationId}, falling back to local:`, err);
    }

    return local?.messages || null;
  }

  static async deleteConversation(conversationId: string, projectId: string): Promise<void> {
    this.deleteLocal(conversationId, projectId);
    const user = auth.currentUser;
    if (!user) return;

    try {
      const convRef = doc(db, 'conversations', conversationId);
      const snap = await getDoc(convRef);
      if (snap.exists() && snap.data().ownerId === user.uid) {
        await deleteDoc(convRef);
      }
    } catch (err: any) {
      if (err?.code === 'permission-denied' || /permission/i.test(err?.message || '')) {
        // Document does not exist or was already removed; non-fatal
        return;
      }
      console.warn('Could not delete cloud conversation:', err?.message || err);
    }
  }

  static async renameConversation(conversationId: string, newTitle: string, projectId: string): Promise<void> {
    const trimmed = newTitle.trim().slice(0, 190);
    if (!trimmed) return;

    // Update local cache
    const local = this.getLocalConversation(conversationId);
    if (local) {
      local.title = trimmed;
      local.updatedAt = Date.now();
      this.saveLocalConversation(local);
    }
    const list = this.getLocalList(projectId);
    const item = list.find(c => c.id === conversationId);
    if (item) {
      item.title = trimmed;
      item.updatedAt = Date.now();
      this.saveLocalList(projectId, list);
    }

    const user = auth.currentUser;
    if (!user) return;

    try {
      const convRef = doc(db, 'conversations', conversationId);
      await updateDoc(convRef, {
        title: trimmed,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn('Failed to rename conversation in cloud:', err);
    }
  }

  static async fetchAllUserConversations(): Promise<ConversationMeta[]> {
    const user = auth.currentUser;
    if (!user) return this.getLocalList('default-project');

    try {
      const q = query(
        collection(db, 'conversations'),
        where('ownerId', '==', user.uid)
      );

      const snapshot = await getDocs(q);
      const cloudList: ConversationMeta[] = [];

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        let msgCount = 0;
        try {
          const parsed = JSON.parse(data.messages || '[]');
          msgCount = Array.isArray(parsed) ? parsed.length : 0;
        } catch {
          msgCount = 0;
        }

        cloudList.push({
          id: docSnap.id,
          projectId: data.projectId || 'default-project',
          title: data.title || 'Untitled Chat',
          createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now(),
          updatedAt: data.updatedAt?.toMillis ? data.updatedAt.toMillis() : Date.now(),
          messageCount: msgCount
        });
      });

      cloudList.sort((a, b) => b.updatedAt - a.updatedAt);
      return cloudList;
    } catch (err) {
      console.warn('Could not fetch all user conversations from cloud:', err);
      return this.getLocalList('default-project');
    }
  }
}
