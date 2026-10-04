import { auth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const rawMsg = error instanceof Error ? error.message : (typeof error === 'string' ? error : (error as any)?.msg || JSON.stringify(error || ''));
  const isCancelled = 
    (error as any)?.type === 'cancelation' ||
    (error as any)?.type === 'cancelled' ||
    (error as any)?.name === 'AbortError' ||
    rawMsg.includes('operation is manually canceled') ||
    rawMsg.includes('cancelation') ||
    /cancel/i.test(rawMsg);

  if (isCancelled) {
    const cancelErr = new Error('Operation was cancelled.');
    (cancelErr as any).type = 'cancelation';
    (cancelErr as any).name = 'AbortError';
    throw cancelErr;
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
