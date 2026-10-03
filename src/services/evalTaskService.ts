import { collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { EvalTask } from '../types';
import { evalTaskConverter } from '../lib/converters';
import { v4 as uuidv4 } from 'uuid';
import { OperationType, handleFirestoreError } from '../lib/firestoreErrors';

const COLLECTION_NAME = 'evalTasks';

export const evalTaskService = {
  /**
   * Create a new EvalTask
   */
  async createEvalTask(taskData: Omit<EvalTask, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'>): Promise<string> {
    if (!auth.currentUser) {
      throw new Error('Must be authenticated to create a task');
    }
    
    const taskId = uuidv4();
    const taskRef = doc(db, COLLECTION_NAME, taskId).withConverter(evalTaskConverter);
    
    const newTask: EvalTask = {
      id: taskId,
      ...taskData,
      ownerId: auth.currentUser.uid,
    };
    
    try {
      await setDoc(taskRef, newTask);
      return taskId;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `${COLLECTION_NAME}/${taskId}`);
    }
  },

  /**
   * Get a single EvalTask by ID
   */
  async getEvalTask(taskId: string): Promise<EvalTask | null> {
    const taskRef = doc(db, COLLECTION_NAME, taskId).withConverter(evalTaskConverter);
    try {
      const snapshot = await getDoc(taskRef);
      if (snapshot.exists()) {
        return snapshot.data();
      }
      return null;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `${COLLECTION_NAME}/${taskId}`);
    }
  },

  /**
   * Get all EvalTasks for a specific user
   */
  async getEvalTasksByOwner(ownerId: string): Promise<EvalTask[]> {
    const q = query(
      collection(db, COLLECTION_NAME).withConverter(evalTaskConverter),
      where('ownerId', '==', ownerId)
    );
    
    try {
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data());
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, COLLECTION_NAME);
    }
  },

  /**
   * Update an existing EvalTask
   */
  async updateEvalTask(taskId: string, updates: Partial<EvalTask>): Promise<void> {
    if (!auth.currentUser) {
      throw new Error('Must be authenticated to update a task');
    }

    const taskRef = doc(db, COLLECTION_NAME, taskId);
    
    // Clean up undefined fields and strictly protect read-only fields
    const cleanUpdates = Object.entries(updates).reduce((acc, [key, value]) => {
      if (value !== undefined && key !== 'id' && key !== 'createdAt' && key !== 'ownerId') {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, any>);
    
    // Always update the timestamp when modifying
    cleanUpdates.updatedAt = serverTimestamp();
    
    try {
      await updateDoc(taskRef, cleanUpdates);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${COLLECTION_NAME}/${taskId}`);
    }
  },

  /**
   * Delete an EvalTask
   */
  async deleteEvalTask(taskId: string): Promise<void> {
    if (!auth.currentUser) {
      throw new Error('Must be authenticated to delete a task');
    }
    
    const taskRef = doc(db, COLLECTION_NAME, taskId);
    try {
      await deleteDoc(taskRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${COLLECTION_NAME}/${taskId}`);
    }
  }
};
