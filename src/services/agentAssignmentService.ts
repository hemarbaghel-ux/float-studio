import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { AgentModelAssignment } from '../types/ai';
import { agentAssignmentConverter } from '../lib/converters';
import { OperationType, handleFirestoreError } from '../lib/firestoreErrors';

const COLLECTION_NAME = 'agentAssignments';

/**
 * Generate a deterministic document ID for a user's agent assignment
 * Enforces 1-to-1 relationship per user per agent and satisfies `isValidId` rule regex
 */
export function getAssignmentDocId(uid: string, agentId: string): string {
  const sanitizedAgent = agentId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  const sanitizedUid = uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  return `${sanitizedUid}_${sanitizedAgent}`;
}

export const agentAssignmentService = {
  /**
   * Fetch all agent model assignments for a specific user from Firestore
   */
  async getUserAssignments(ownerId: string): Promise<AgentModelAssignment[]> {
    if (!ownerId) return [];

    try {
      const q = query(
        collection(db, COLLECTION_NAME).withConverter(agentAssignmentConverter),
        where('ownerId', '==', ownerId)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(docSnapshot => ({
        ...docSnapshot.data(),
        id: docSnapshot.id
      }));
    } catch (error) {
      console.error('Failed to fetch agent assignments from Firestore:', error);
      handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
    }
  },

  /**
   * Save or update an agent model assignment for the currently authenticated user
   */
  async saveAssignment(
    agentId: string,
    primaryModel: string,
    fallbackModel: string = ''
  ): Promise<AgentModelAssignment> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Authentication required to save agent model assignments to Firestore');
    }

    const docId = getAssignmentDocId(user.uid, agentId);
    const docRef = doc(db, COLLECTION_NAME, docId);

    try {
      const docSnapshot = await getDoc(docRef);

      if (docSnapshot.exists()) {
        // Update existing assignment
        await updateDoc(docRef, {
          primaryModel: primaryModel.slice(0, 100),
          fallbackModel: (fallbackModel || '').slice(0, 100),
          updatedAt: serverTimestamp()
        });

        return {
          id: docId,
          ownerId: user.uid,
          agentId,
          primaryModel,
          fallbackModel: fallbackModel || '',
          updatedAt: new Date()
        };
      } else {
        // Create new assignment document
        const newAssignment: AgentModelAssignment = {
          id: docId,
          ownerId: user.uid,
          agentId: agentId.slice(0, 100),
          primaryModel: primaryModel.slice(0, 100),
          fallbackModel: (fallbackModel || '').slice(0, 100)
        };

        const convertedRef = doc(db, COLLECTION_NAME, docId).withConverter(agentAssignmentConverter);
        await setDoc(convertedRef, newAssignment);

        return {
          ...newAssignment,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${COLLECTION_NAME}/${docId}`);
    }
  },

  /**
   * Batch save multiple agent assignments
   */
  async batchSaveAssignments(
    assignments: Array<{ agentId: string; primaryModel: string; fallbackModel?: string }>
  ): Promise<AgentModelAssignment[]> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Authentication required to save agent assignments');
    }

    const results: AgentModelAssignment[] = [];
    for (const assignment of assignments) {
      const saved = await this.saveAssignment(
        assignment.agentId,
        assignment.primaryModel,
        assignment.fallbackModel || ''
      );
      results.push(saved);
    }
    return results;
  },

  /**
   * Delete an assignment by document ID
   */
  async deleteAssignment(assignmentId: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Authentication required to delete agent assignments');
    }

    const docRef = doc(db, COLLECTION_NAME, assignmentId);
    try {
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${assignmentId}`);
    }
  }
};
