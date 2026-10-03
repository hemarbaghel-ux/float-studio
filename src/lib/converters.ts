import { FirestoreDataConverter, QueryDocumentSnapshot, SnapshotOptions, DocumentData, serverTimestamp } from 'firebase/firestore';
import { EvalTask } from '../types';
import { AgentModelAssignment } from '../types/ai';

export const agentAssignmentConverter: FirestoreDataConverter<AgentModelAssignment> = {
  toFirestore(assignment: AgentModelAssignment): DocumentData {
    const data: DocumentData = {
      ownerId: assignment.ownerId,
      agentId: assignment.agentId,
      primaryModel: assignment.primaryModel,
      fallbackModel: assignment.fallbackModel || '',
      updatedAt: serverTimestamp()
    };

    if (assignment.createdAt) {
      data.createdAt = assignment.createdAt;
    } else {
      data.createdAt = serverTimestamp();
    }

    return data;
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): AgentModelAssignment {
    const data = snapshot.data(options)!;
    return {
      id: snapshot.id,
      ownerId: data.ownerId,
      agentId: data.agentId,
      primaryModel: data.primaryModel,
      fallbackModel: data.fallbackModel || '',
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  }
};

export const evalTaskConverter: FirestoreDataConverter<EvalTask> = {
  toFirestore(task: EvalTask): DocumentData {
    const data: DocumentData = {
      name: task.name,
      description: task.description,
      category: task.category,
      difficulty: task.difficulty,
      prompt: task.prompt,
      validationType: task.validationType || task.validationMethod || 'Tests',
      updatedAt: serverTimestamp()
    };
    
    // Add ownerId if it exists (usually set on creation)
    if (task.ownerId) {
      data.ownerId = task.ownerId;
    }
    
    // Set createdAt if it exists, otherwise it's handled by the caller or left out
    if (task.createdAt) {
      data.createdAt = task.createdAt;
    } else {
      data.createdAt = serverTimestamp();
    }

    return data;
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): EvalTask {
    const data = snapshot.data(options)!;
    return {
      id: snapshot.id,
      ownerId: data.ownerId,
      name: data.name,
      description: data.description,
      category: data.category,
      difficulty: data.difficulty,
      prompt: data.prompt,
      expectedBehavior: data.expectedBehavior || '',
      files: data.files || [],
      validationType: data.validationType,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  }
};

export const evaluationRunConverter: FirestoreDataConverter<any> = {
  toFirestore(run: any): DocumentData {
    const data: DocumentData = {
      ownerId: run.ownerId,
      taskId: run.taskId,
      modelId: run.modelId,
      providerId: run.providerId,
      agentId: run.agentId,
      benchmarkId: run.benchmarkId || '',
      status: run.status?.toLowerCase() || 'queued',
      durationMs: run.durationMs || (run.duration ? run.duration * 1000 : 0),
      inputTokens: run.inputTokens || 0,
      outputTokens: run.outputTokens || 0,
      totalTokens: run.totalTokens || 0,
      estimatedCost: run.estimatedCost || 0,
      score: run.score || 0,
      patchValid: !!run.patchValid,
      buildPassed: !!run.buildPassed,
      testsPassed: !!run.testsPassed,
      testCount: run.testCount || 0,
      testsPassedCount: run.testsPassedCount || 0,
      errorType: run.errorType || '',
      errorMessage: run.errorMessage || '',
      updatedAt: serverTimestamp()
    };

    if (run.createdAt) {
      data.createdAt = run.createdAt;
    } else {
      data.createdAt = serverTimestamp();
    }

    return data;
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): any {
    const data = snapshot.data(options)!;
    return {
      id: snapshot.id,
      ...data
    };
  }
};

