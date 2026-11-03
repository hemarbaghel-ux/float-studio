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

export async function writeProjectFileTreeAdmin(
  projectId: string,
  ownerId: string,
  generation: string,
  chunks: string[]
): Promise<void> {
  const fileCollection = adminDb.collection('projects').doc(projectId).collection('projectContent');
  const batchSize = 400;
  for (let start = 0; start < chunks.length; start += batchSize) {
    const batch = adminDb.batch();
    const end = Math.min(start + batchSize, chunks.length);
    for (let index = start; index < end; index += 1) {
      batch.create(fileCollection.doc(`${generation}_${String(index).padStart(8, '0')}`), {
        ownerId,
        generation,
        index,
        content: chunks[index]
      });
    }
    await batch.commit();
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
