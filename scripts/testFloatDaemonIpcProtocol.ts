/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { FloatIpcFramer, IFloatIpcRequest } from '../daemon/src/ipc/floatIpcProtocol.ts';

function main(): void {
	const request: IFloatIpcRequest = {
		id: 'req-framing-test',
		type: 'request',
		method: 'ping',
		params: {}
	};
	const encoded = FloatIpcFramer.encode(request);
	const received: unknown[] = [];

	// Split a single frame across socket reads and ensure the decoder retains
	// the incomplete suffix until the remaining bytes arrive.
	let pending = FloatIpcFramer.decodeStream(encoded.subarray(0, 2), message => received.push(message));
	assert.equal(received.length, 0);
	assert.equal(pending.length, 2);
	pending = FloatIpcFramer.decodeStream(
		Buffer.concat([pending, encoded.subarray(2)]),
		message => received.push(message)
	);
	assert.equal(pending.length, 0);
	assert.deepEqual(received, [request]);

	// Multiple frames in one read must still be decoded in order.
	const second = { ...request, id: 'req-framing-test-2' };
	const combined = Buffer.concat([encoded, FloatIpcFramer.encode(second)]);
	const combinedMessages: unknown[] = [];
	const remainder = FloatIpcFramer.decodeStream(combined, message => combinedMessages.push(message));
	assert.equal(remainder.length, 0);
	assert.deepEqual(combinedMessages, [request, second]);

	// A peer must not be able to announce an unbounded payload or zero-length
	// JSON frame and make the receiver buffer indefinitely.
	const oversizedHeader = Buffer.alloc(4);
	oversizedHeader.writeUInt32BE(FloatIpcFramer.MAX_FRAME_BYTES + 1, 0);
	assert.throws(() => FloatIpcFramer.decodeStream(oversizedHeader, () => undefined), /Invalid FLOAT IPC frame length/);

	const emptyHeader = Buffer.alloc(4);
	emptyHeader.writeUInt32BE(0, 0);
	assert.throws(() => FloatIpcFramer.decodeStream(emptyHeader, () => undefined), /Invalid FLOAT IPC frame length/);

	console.log('FLOAT IPC framing: fragmented frames, coalesced frames and maximum payload guard passed.');
}

try {
	main();
} catch (error) {
	console.error('FLOAT IPC framing test failed:', error);
	process.exit(1);
}
