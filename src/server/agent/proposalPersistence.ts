import type { CodeProposal } from '../../types/proposal';
import {
  DEFAULT_TTL_MS,
  LARGE_PAYLOAD_THRESHOLD_BYTES,
  loadLargePayloadDurable,
  listServerDocsDurable,
  saveLargePayloadDurable
} from '../durableState';

const COLLECTION = 'codeProposals';
const MAX_PROPOSAL_HARD_LIMIT_BYTES = 10 * 1024 * 1024; // 10 MB hard ceiling

export async function saveCodeProposal(proposal: CodeProposal): Promise<void> {
  const serialized = JSON.stringify(proposal);
  const byteLength = Buffer.byteLength(serialized, 'utf8');
  if (byteLength > MAX_PROPOSAL_HARD_LIMIT_BYTES) {
    throw new Error('This proposal exceeds the 10 MB maximum size limit. Ask FLOAT to split it into smaller changes.');
  }

  await saveLargePayloadDurable({
    collectionName: COLLECTION,
    docId: proposal.id,
    ownerId: proposal.ownerId,
    projectId: proposal.projectId,
    payload: proposal,
    extraFields: {
      id: proposal.id,
      ownerId: proposal.ownerId,
      projectId: proposal.projectId,
      status: proposal.status,
      description: proposal.description,
      affectedFiles: proposal.affectedFiles,
      agentTaskId: proposal.agentTaskId || null,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt
    },
    ttlMs: DEFAULT_TTL_MS,
    thresholdBytes: LARGE_PAYLOAD_THRESHOLD_BYTES
  });
}

export async function getCodeProposal(id: string, ownerId: string): Promise<CodeProposal | null> {
  const loaded = await loadLargePayloadDurable<CodeProposal>({
    collectionName: COLLECTION,
    docId: id,
    ownerId
  });
  return loaded ? loaded.payload : null;
}

export async function listCodeProposals(projectId: string, ownerId: string): Promise<CodeProposal[]> {
  const manifests = await listServerDocsDurable<Record<string, any>>(COLLECTION, ownerId, projectId);
  const proposals: CodeProposal[] = [];

  for (const doc of manifests) {
    if (doc.projectId !== projectId || doc.ownerId !== ownerId) continue;
    if (doc.storageBackend === 'inline' && doc.payload) {
      proposals.push(doc.payload as CodeProposal);
    } else if (doc.changes && Array.isArray(doc.changes)) {
      proposals.push(doc as unknown as CodeProposal);
    } else {
      const full = await getCodeProposal(String(doc.id), ownerId);
      if (full) proposals.push(full);
    }
  }

  return proposals.sort((a, b) => b.createdAt - a.createdAt);
}
