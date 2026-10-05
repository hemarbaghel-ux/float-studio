import { adminDb } from '../adminFirebase';
import type { CodeProposal } from '../../types/proposal';

const proposals = () => adminDb.collection('codeProposals');
const MAX_PROPOSAL_BYTES = 850 * 1024;

export async function saveCodeProposal(proposal: CodeProposal): Promise<void> {
  const serialized = JSON.stringify(proposal);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PROPOSAL_BYTES) {
    throw new Error('This proposal is too large to save safely. Ask FLOAT to split it into smaller changes.');
  }
  await proposals().doc(proposal.id).set(JSON.parse(serialized));
}

export async function getCodeProposal(id: string, ownerId: string): Promise<CodeProposal | null> {
  const snapshot = await proposals().doc(id).get();
  if (!snapshot.exists || snapshot.get('ownerId') !== ownerId) return null;
  return snapshot.data() as CodeProposal;
}

export async function listCodeProposals(projectId: string, ownerId: string): Promise<CodeProposal[]> {
  const snapshot = await proposals().where('ownerId', '==', ownerId).get();
  return snapshot.docs
    .map((document) => document.data() as CodeProposal)
    .filter((proposal) => proposal.projectId === projectId)
    .sort((a, b) => b.createdAt - a.createdAt);
}
