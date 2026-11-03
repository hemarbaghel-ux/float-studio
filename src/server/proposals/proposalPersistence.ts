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

/** Persist Apply status only if the project snapshot and proposal revision are unchanged. */
export async function saveAppliedCodeProposalForProjectRevision(
  proposal: CodeProposal,
  expectedProjectData: Record<string, unknown>,
  expectedProposal: CodeProposal
): Promise<void> {
  const serialized = JSON.stringify(proposal);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PROPOSAL_BYTES) {
    throw new Error('This proposal is too large to save safely. Ask FLOAT to split it into smaller changes.');
  }

  const projectRef = adminDb.collection('projects').doc(proposal.projectId);
  const proposalRef = proposals().doc(proposal.id);
  await adminDb.runTransaction(async (transaction: any) => {
    const projectSnapshot = await transaction.get(projectRef);
    const proposalSnapshot = await transaction.get(proposalRef);
    if (!projectSnapshot.exists || !proposalSnapshot.exists) {
      throw new Error('Project or proposal was removed before Apply could be recorded.');
    }

    const currentProject = projectSnapshot.data() || {};
    const currentProposal = proposalSnapshot.data() || {};
    if (currentProject.ownerId !== proposal.ownerId || currentProposal.ownerId !== proposal.ownerId ||
        currentProposal.projectId !== proposal.projectId) {
      throw new Error('Project or proposal ownership changed before Apply could be recorded.');
    }
    const currentChangeStates = Array.isArray(currentProposal.changes)
      ? currentProposal.changes.map((change: any) => [change.path, change.status])
      : [];
    const expectedChangeStates = expectedProposal.changes.map(change => [change.path, change.status]);
    if (currentProposal.updatedAt !== expectedProposal.updatedAt ||
        currentProposal.status !== expectedProposal.status ||
        JSON.stringify(currentProposal.appliedFiles || []) !== JSON.stringify(expectedProposal.appliedFiles || []) ||
        JSON.stringify(currentChangeStates) !== JSON.stringify(expectedChangeStates)) {
      const conflict = new Error('Proposal changed during Apply. Reload it and retry.') as Error & { code: string };
      conflict.code = 'aborted';
      throw conflict;
    }

    const expectedGeneration = expectedProjectData.fileGeneration;
    const expectedVersion = expectedProjectData.fileStorageVersion;
    const sameSnapshot = expectedVersion === 2
      ? currentProject.fileStorageVersion === 2 &&
        currentProject.fileGeneration === expectedGeneration &&
        currentProject.fileSnapshotComplete === true
      : currentProject.fileStorageVersion !== 2 &&
        JSON.stringify(currentProject.files) === JSON.stringify(expectedProjectData.files);
    if (!sameSnapshot) {
      const conflict = new Error('Workspace changed while Apply was being recorded. Reload the project and review the proposal again.') as Error & { code: string };
      conflict.code = 'aborted';
      throw conflict;
    }

    transaction.set(proposalRef, JSON.parse(serialized));
  });
}

export async function getCodeProposal(id: string, ownerId: string): Promise<CodeProposal | null> {
  const snapshot = await proposals().doc(id).get();
  if (!snapshot.exists || snapshot.get('ownerId') !== ownerId) return null;
  return snapshot.data() as CodeProposal;
}

export async function listCodeProposals(projectId: string, ownerId: string): Promise<CodeProposal[]> {
  const snapshot = await proposals().where('ownerId', '==', ownerId).get();
  return snapshot.docs
    .map((document: any) => document.data() as CodeProposal)
    .filter((proposal: CodeProposal) => proposal.projectId === projectId)
    .sort((a: CodeProposal, b: CodeProposal) => b.createdAt - a.createdAt);
}
