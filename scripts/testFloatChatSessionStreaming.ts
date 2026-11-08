import assert from 'node:assert/strict';
import { FloatChatViewPane } from '../desktop/src/vs/workbench/contrib/float/browser/chat/floatChatViewPane.js';

async function main(): Promise<void> {
  const requestedSessions: string[] = [];
  const cancelledSessions: string[] = [];
  const finishStream = new Map<string, () => void>();
  const fakeFloatService: any = {
    getActiveModel: () => ({ id: 'gpt-6.1-sol' }),
    cancelActiveStream: (conversationId?: string) => {
      if (conversationId) cancelledSessions.push(conversationId);
    },
    streamChat: async (
      _messages: any[],
      callbacks: any,
      _authToken?: string,
      _projectId?: string,
      _contextItems?: any[],
      conversationId?: string
    ) => {
      assert.ok(conversationId, 'each chat stream must carry its owning session ID');
      requestedSessions.push(conversationId);
      await new Promise<void>(resolve => finishStream.set(conversationId, resolve));
      callbacks.onComplete('Completed ' + conversationId);
    }
  };

  const pane = new FloatChatViewPane(fakeFloatService);
  let startEvents = 0;
  let stopEvents = 0;
  pane.onDidStartStreaming(() => startEvents++);
  pane.onDidStopStreaming(() => stopEvents++);

  const firstSession = pane.getActiveSession();
  assert.ok(firstSession);
  const firstRequest = pane.sendUserMessage('Explain the first workspace');

  const secondSession = pane.createNewSession('Second Chat');
  const secondRequest = pane.sendUserMessage('Explain the second workspace');

  assert.deepEqual(requestedSessions, [firstSession.id, secondSession.id],
    'a second session must start while the first session is still generating');
  assert.equal(pane.isStreaming, true);
  assert.equal(pane.isSessionStreaming(firstSession.id), true);
  assert.equal(pane.isSessionStreaming(secondSession.id), true);
  assert.equal(startEvents, 1, 'global start event should fire only on the idle-to-streaming transition');

  finishStream.get(firstSession.id)!();
  await firstRequest;
  assert.equal(pane.isSessionStreaming(firstSession.id), false);
  assert.equal(pane.isSessionStreaming(secondSession.id), true);
  assert.equal(pane.isStreaming, true);
  assert.equal(stopEvents, 0, 'one completed session must not stop the global streaming state while another remains active');

  finishStream.get(secondSession.id)!();
  await secondRequest;
  assert.equal(pane.isStreaming, false);
  assert.equal(pane.isSessionStreaming(secondSession.id), false);
  assert.equal(stopEvents, 1, 'global stop event should fire only when the final stream completes');

  assert.match(firstSession.messages[firstSession.messages.length - 1].content, /Completed chat-session-/);
  assert.match(secondSession.messages[secondSession.messages.length - 1].content, /Completed chat-session-/);

  pane.deleteSession(firstSession.id);
  assert.ok(cancelledSessions.includes(firstSession.id), 'deleting a session should cancel only its owned stream');
  pane.clearActiveSessionMessages();
  assert.ok(cancelledSessions.includes(secondSession.id), 'clearing a session should cancel only its owned stream');

  pane.dispose();
  console.log('FLOAT chat session streaming: independent concurrent sessions, scoped cleanup and aggregate lifecycle events passed.');
}

main().catch(error => {
  console.error('FLOAT chat session streaming test failed:', error);
  process.exit(1);
});
