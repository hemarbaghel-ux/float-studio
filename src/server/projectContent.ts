import type { FileNode } from '../types';
import { adminDb } from './adminFirebase';
import {
  joinProjectFileTreeChunks,
  parseLegacyProjectFileTree,
  type ProjectContentChunk,
  type ProjectContentManifest
} from '../services/projectCloudFiles';

export async function loadProjectFileTreeAdmin(
  projectId: string,
  projectData: Record<string, unknown>
): Promise<FileNode[]> {
  if (projectData.fileStorageVersion !== 2) return parseLegacyProjectFileTree(projectData.files);
  const generation = projectData.fileGeneration;
  if (typeof generation !== 'string') throw new Error('Project file snapshot is missing its generation ID.');
  const snapshot = await adminDb.collection('projects').doc(projectId)
    .collection('projectContent').where('generation', '==', generation).get();
  const chunks = snapshot.docs.map((document: any) => {
    const data = document.data();
    return {
      generation: data.generation,
      index: data.index,
      content: data.content
    } as ProjectContentChunk;
  });
  return joinProjectFileTreeChunks(chunks, projectData as unknown as ProjectContentManifest);
}

export const MAX_BATCH_BYTES = 8 * 1024 * 1024; // 8 MiB safety margin under 10 MiB Firestore limit
export const MAX_BATCH_OPERATIONS = 400; // max 400 writes under Firestore 500 limit

export async function writeProjectFileTreeAdmin(
  projectId: string,
  ownerId: string,
  generation: string,
  chunks: string[]
): Promise<void> {
  const fileCollection = adminDb.collection('projects').doc(projectId).collection('projectContent');
  
  let currentBatch = adminDb.batch();
  let currentBytes = 0;
  let currentOps = 0;

  for (let index = 0; index < chunks.length; index += 1) {
    const chunkContent = chunks[index];
    const estimatedDocBytes = Buffer.byteLength(chunkContent, 'utf8') + 512; // payload + field overhead

    // If adding this chunk breaches 8 MiB or 400 ops, commit current batch first
    if (currentOps > 0 && (currentBytes + estimatedDocBytes > MAX_BATCH_BYTES || currentOps >= MAX_BATCH_OPERATIONS)) {
      await currentBatch.commit();
      currentBatch = adminDb.batch();
      currentBytes = 0;
      currentOps = 0;
    }

    const docRef = fileCollection.doc(`${generation}_${String(index).padStart(8, '0')}`);
    currentBatch.create(docRef, {
      ownerId,
      generation,
      index,
      content: chunkContent
    });

    currentBytes += estimatedDocBytes;
    currentOps += 1;
  }

  if (currentOps > 0) {
    await currentBatch.commit();
  }
}

export async function deleteProjectContentAdmin(projectId: string): Promise<void> {
  const fileCollection = adminDb.collection('projects').doc(projectId).collection('projectContent');
  while (true) {
    const snapshot = await fileCollection.limit(400).get();
    if (snapshot.empty) return;
    const batch = adminDb.batch();
    snapshot.docs.forEach((document: any) => batch.delete(document.ref));
    await batch.commit();
  }
}

export async function deleteProjectContentGenerationAdmin(projectId: string, generation: string): Promise<void> {
  const fileCollection = adminDb.collection('projects').doc(projectId).collection('projectContent');
  while (true) {
    const snapshot = await fileCollection.where('generation', '==', generation).limit(400).get();
    if (snapshot.empty) return;
    const batch = adminDb.batch();
    snapshot.docs.forEach((document: any) => batch.delete(document.ref));
    await batch.commit();
  }
}
