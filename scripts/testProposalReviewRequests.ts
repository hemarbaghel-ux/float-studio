import { rejectProposalRequest } from '../src/features/proposals/proposalRequests';

async function runTests() {
  let passed = 0;
  let failed = 0;
  const assert = (condition: boolean, label: string) => {
    if (condition) {
      console.log(`[PASS] ${label}`);
      passed += 1;
    } else {
      console.error(`[FAIL] ${label}`);
      failed += 1;
    }
  };

  let requestedPath = '';
  let requestMethod = '';
  await rejectProposalRequest('project / one', 'proposal?one', async (input, init) => {
    requestedPath = String(input);
    requestMethod = init?.method || '';
    return new Response(null, { status: 200 });
  });
  assert(requestedPath === '/api/projects/project%20%2F%20one/proposals/proposal%3Fone/reject', 'Encodes project and proposal IDs in the rejection route');
  assert(requestMethod === 'POST', 'Uses POST for proposal rejection');

  let serverError = '';
  try {
    await rejectProposalRequest('project', 'proposal', async () => new Response(
      JSON.stringify({ error: 'Proposal is no longer pending review.' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    ));
  } catch (error) {
    serverError = error instanceof Error ? error.message : String(error);
  }
  assert(serverError === 'Proposal is no longer pending review.', 'Surfaces the server rejection error to the caller');

  let fallbackError = '';
  try {
    await rejectProposalRequest('project', 'proposal', async () => new Response('not-json', { status: 503 }));
  } catch (error) {
    fallbackError = error instanceof Error ? error.message : String(error);
  }
  assert(fallbackError === 'Server error (503) rejecting proposal.', 'Reports an understandable error for non-JSON failures');

  let networkError = '';
  try {
    await rejectProposalRequest('project', 'proposal', async () => { throw new Error('offline'); });
  } catch (error) {
    networkError = error instanceof Error ? error.message : String(error);
  }
  assert(networkError === 'offline', 'Propagates network failure instead of treating rejection as successful');

  if (failed > 0) process.exit(1);
  console.log(`Proposal review request tests: ${passed} passed, ${failed} failed.`);
}

runTests().catch((error) => {
  console.error('Proposal review request tests failed:', error);
  process.exit(1);
});
