import { db, auth } from '../lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

export type FeedbackRating = 'thumbs_up' | 'thumbs_down';

export interface ChatFeedbackData {
  id: string;
  ownerId: string;
  chatId: string;
  messageId: string;
  rating: FeedbackRating;
  modelId?: string;
  messageSnippet?: string;
  reason?: string;
  comment?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface SaveFeedbackParams {
  chatId: string;
  messageId: string;
  rating: FeedbackRating;
  modelId?: string;
  messageSnippet?: string;
  reason?: string;
  comment?: string;
}

const LOCAL_STORAGE_PREFIX = 'float_chat_feedback_';

function sanitizeId(str: string): string {
  return str.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 50);
}

export class ChatFeedbackService {
  /**
   * Helper to generate a deterministic document ID for a given chat and message.
   * This guarantees idempotency when updating or toggling feedback.
   */
  static getFeedbackDocId(chatId: string, messageId: string): string {
    const cleanChat = sanitizeId(chatId || 'default');
    const cleanMsg = sanitizeId(messageId || 'msg');
    return `fb_${cleanChat}_${cleanMsg}`;
  }

  /**
   * Read cached feedback for a specific message from localStorage.
   */
  static getLocalFeedback(chatId: string, messageId: string): ChatFeedbackData | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${chatId}`);
      if (!raw) return null;
      const map: Record<string, ChatFeedbackData> = JSON.parse(raw);
      return map[messageId] || null;
    } catch {
      return null;
    }
  }

  /**
   * Persist feedback to local storage for instant optimistic UI rendering.
   */
  static saveLocalFeedback(chatId: string, messageId: string, data: ChatFeedbackData): void {
    if (typeof window === 'undefined') return;
    try {
      const key = `${LOCAL_STORAGE_PREFIX}${chatId}`;
      const raw = localStorage.getItem(key);
      const map: Record<string, ChatFeedbackData> = raw ? JSON.parse(raw) : {};
      map[messageId] = data;
      localStorage.setItem(key, JSON.stringify(map));
    } catch (e) {
      console.warn('Failed to store local chat feedback:', e);
    }
  }

  /**
   * Remove cached feedback for a message from localStorage.
   */
  static removeLocalFeedback(chatId: string, messageId: string): void {
    if (typeof window === 'undefined') return;
    try {
      const key = `${LOCAL_STORAGE_PREFIX}${chatId}`;
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const map: Record<string, ChatFeedbackData> = JSON.parse(raw);
      delete map[messageId];
      localStorage.setItem(key, JSON.stringify(map));
    } catch (e) {
      console.warn('Failed to remove local chat feedback:', e);
    }
  }

  /**
   * Capture and persist thumbs up/down rating into Firestore.
   */
  static async saveFeedback(params: SaveFeedbackParams): Promise<{ success: boolean; data: ChatFeedbackData; error?: string }> {
    const user = auth.currentUser;
    const docId = this.getFeedbackDocId(params.chatId, params.messageId);

    const localData: ChatFeedbackData = {
      id: docId,
      ownerId: user?.uid || 'guest_user',
      chatId: params.chatId,
      messageId: params.messageId,
      rating: params.rating,
      modelId: params.modelId || 'auto',
      messageSnippet: (params.messageSnippet || '').slice(0, 500),
      reason: params.reason ? params.reason.slice(0, 100) : undefined,
      comment: params.comment ? params.comment.slice(0, 1000) : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Always update local cache first for instant feedback responsiveness
    this.saveLocalFeedback(params.chatId, params.messageId, localData);

    // If user is not authenticated, local persistence is preserved
    if (!user) {
      return { success: true, data: localData };
    }

    try {
      const docRef = doc(db, 'chatFeedback', docId);
      const existingDoc = await getDoc(docRef);

      const firestorePayload: any = {
        ownerId: user.uid,
        chatId: params.chatId.slice(0, 128),
        messageId: params.messageId.slice(0, 128),
        rating: params.rating,
        modelId: (params.modelId || 'auto').slice(0, 100),
        messageSnippet: (params.messageSnippet || '').slice(0, 500),
        updatedAt: serverTimestamp()
      };

      if (params.reason) {
        firestorePayload.reason = params.reason.slice(0, 100);
      }
      if (params.comment) {
        firestorePayload.comment = params.comment.slice(0, 1000);
      }

      if (existingDoc.exists()) {
        firestorePayload.createdAt = existingDoc.data().createdAt || serverTimestamp();
        await setDoc(docRef, firestorePayload, { merge: true });
      } else {
        firestorePayload.createdAt = serverTimestamp();
        await setDoc(docRef, firestorePayload);
      }

      return { success: true, data: localData };
    } catch (err: unknown) {
      console.warn('Failed to store feedback in Firestore:', err);
      // Return optimistic success with warning if network or permission error occurred
      return {
        success: false,
        data: localData,
        error: err instanceof Error ? err.message : 'Failed to write to Firestore'
      };
    }
  }

  /**
   * Delete feedback from Firestore and local storage.
   */
  static async removeFeedback(chatId: string, messageId: string): Promise<boolean> {
    this.removeLocalFeedback(chatId, messageId);
    const user = auth.currentUser;
    if (!user) return true;

    try {
      const docId = this.getFeedbackDocId(chatId, messageId);
      const docRef = doc(db, 'chatFeedback', docId);
      await deleteDoc(docRef);
      return true;
    } catch (err) {
      console.warn('Failed to delete feedback in Firestore:', err);
      return false;
    }
  }
}
