import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  where,
  writeBatch,
  type Firestore
} from 'firebase/firestore';
import type { FileNode } from '../types';
import { auth } from '../lib/firebase';
import {
  joinProjectFileTreeChunks,
  parseLegacyProjectFileTree,
  PROJECT_CONTENT_BATCH_SIZE,
  PROJECT_CONTENT_STORAGE_VERSION,
  type ProjectContentChunk,
  type ProjectContentManifest
} from './projectCloudFiles';

const projectContentCollection = (database: Firestore, projectId: string) =>
  collection(database, 'projects', projectId, 'projectContent');

const projectSaveQueues = new Map<string, Promise<void>>();

/** Serialize full snapshot publication per owner/project so a slower stale save cannot win last. */
export function runSerialProjectCloudWrite<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = projectSaveQueues.get(key) || Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const settled = result.then(() => undefined, () => undefined);
  projectSaveQueues.set(key, settled);
  return result.finally(() => {
    if (projectSaveQueues.get(key) === settled) projectSaveQueues.delete(key);
  });
}

export async function writeProjectContentGeneration(
  database: Firestore,
  projectId: string,
  ownerId: string,
  generation: string,
  contentChunks: string[]
): Promise<void> {
  if (!contentChunks.length) throw new Error('A project snapshot must contain at least one content chunk.');
  const collectionRef = projectContentCollection(database, projectId);
  for (let start = 0; start < contentChunks.length; start += PROJECT_CONTENT_BATCH_SIZE) {
    const batch = writeBatch(database);
    const end = Math.min(start + PROJECT_CONTENT_BATCH_SIZE, contentChunks.length);
    for (let index = start; index < end; index += 1) {
      const contentRef = doc(collectionRef, `${generation}_${String(index).padStart(8, '0')}`);
      batch.set(contentRef, { ownerId, generation, index, content: contentChunks[index] });
    }
    await batch.commit();
  }
}

export async function loadProjectFileTree(
  database: Firestore,
  projectId: string,
  projectData: Record<string, unknown>
): Promise<FileNode[]> {
  if (projectData.fileStorageVersion !== PROJECT_CONTENT_STORAGE_VERSION) {
    return parseLegacyProjectFileTree(projectData.files);
  }

  const generation = projectData.fileGeneration;
  if (typeof generation !== 'string') throw new Error('Project file snapshot is missing its generation ID.');
  const ownerId = auth.currentUser?.uid;
  if (!ownerId) throw new Error('Sign in to load this cloud workspace.');
  const snapshot = await getDocs(query(
    projectContentCollection(database, projectId),
    where('ownerId', '==', ownerId),
    where('generation', '==', generation)
  ));
  const chunks = snapshot.docs.map(document => {
    const data = document.data();
    return {
      generation: data.generation,
      index: data.index,
      content: data.content
    } as ProjectContentChunk;
  });
  return joinProjectFileTreeChunks(chunks, projectData as unknown as ProjectContentManifest);
}

export async function deleteProjectContent(database: Firestore, projectId: string): Promise<void> {
  const ownerId = auth.currentUser?.uid;
  if (!ownerId) throw new Error('Sign in to delete cloud workspace content.');
  const collectionRef = projectContentCollection(database, projectId);
  while (true) {
    const snapshot = await getDocs(query(
      collectionRef,
      where('ownerId', '==', ownerId),
      limit(PROJECT_CONTENT_BATCH_SIZE)
    ));
    if (snapshot.empty) return;
    for (let start = 0; start < snapshot.docs.length; start += PROJECT_CONTENT_BATCH_SIZE) {
      const batch = writeBatch(database);
      for (const document of snapshot.docs.slice(start, start + PROJECT_CONTENT_BATCH_SIZE)) batch.delete(document.ref);
      await batch.commit();
    }
  }
}

export async function deleteProjectContentGeneration(
  database: Firestore,
  projectId: string,
  generation: string
): Promise<void> {
  const ownerId = auth.currentUser?.uid;
  if (!ownerId) throw new Error('Sign in to delete cloud workspace content.');
  const contentQuery = query(
    projectContentCollection(database, projectId),
    where('ownerId', '==', ownerId),
    where('generation', '==', generation),
    limit(PROJECT_CONTENT_BATCH_SIZE)
  );
  while (true) {
    const snapshot = await getDocs(contentQuery);
    if (snapshot.empty) return;
    const batch = writeBatch(database);
    for (const document of snapshot.docs) batch.delete(document.ref);
    await batch.commit();
  }
}
