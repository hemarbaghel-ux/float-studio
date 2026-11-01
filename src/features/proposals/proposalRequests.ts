export type ProposalRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Send an authenticated rejection request and fail visibly on any unsuccessful response. */
export async function rejectProposalRequest(
  projectId: string,
  proposalId: string,
  request: ProposalRequest
): Promise<void> {
  const path = `/api/projects/${encodeURIComponent(projectId)}/proposals/${encodeURIComponent(proposalId)}/reject`;
  const response = await request(path, { method: 'POST' });
  if (response.ok) return;

  const payload = await response.json().catch(() => ({})) as { error?: unknown };
  const message = typeof payload.error === 'string' && payload.error.trim()
    ? payload.error
    : `Server error (${response.status}) rejecting proposal.`;
  throw new Error(message);
}
