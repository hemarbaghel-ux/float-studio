/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export type FloatIpcMessageType = 'request' | 'response' | 'event' | 'stream_chunk' | 'stream_end' | 'error';

export interface IFloatIpcHeader {
	version: number;
	id: string;
	type: FloatIpcMessageType;
	method?: string;
	channel?: string;
}

export interface IFloatIpcRequest<T = any> {
	id: string;
	type: 'request';
	method: string;
	params: T;
}

export interface IFloatIpcResponse<T = any> {
	id: string;
	type: 'response';
	result?: T;
	error?: {
		code: number;
		message: string;
		data?: any;
	};
}

export interface IFloatIpcStreamChunk<T = any> {
	id: string;
	type: 'stream_chunk';
	sequence: number;
	chunk: T;
}

export interface IFloatIpcStreamEnd {
	id: string;
	type: 'stream_end';
	totalChunks: number;
	summary?: any;
}

export interface IFloatIpcEvent<T = any> {
	id: string;
	type: 'event';
	channel: string;
	data: T;
}

export type FloatIpcMessage =
	| IFloatIpcRequest
	| IFloatIpcResponse
	| IFloatIpcStreamChunk
	| IFloatIpcStreamEnd
	| IFloatIpcEvent;

export class FloatIpcFramer {
	/**
	 * Encodes a message with a 4-byte big-endian length prefix.
	 */
	public static encode(message: FloatIpcMessage): Buffer {
		const jsonStr = JSON.stringify(message);
		const payload = Buffer.from(jsonStr, 'utf8');
		const buffer = Buffer.allocUnsafe(4 + payload.length);
		buffer.writeUInt32BE(payload.length, 0);
		payload.copy(buffer, 4);
		return buffer;
	}

	/**
	 * Decodes incoming buffered chunks into discrete FloatIpcMessage objects.
	 */
	public static decodeStream(
		buffer: Buffer,
		onMessage: (message: FloatIpcMessage) => void
	): Buffer {
		let current = buffer;

		while (current.length >= 4) {
			const payloadLength = current.readUInt32BE(0);
			const totalLength = 4 + payloadLength;

			if (current.length < totalLength) {
				// Waiting for remaining bytes of the current frame
				break;
			}

			const payloadSlice = current.subarray(4, totalLength);
			current = current.subarray(totalLength);

			try {
				const jsonStr = payloadSlice.toString('utf8');
				const msg = JSON.parse(jsonStr) as FloatIpcMessage;
				onMessage(msg);
			} catch (err) {
				console.error('Failed to parse IPC message payload:', err);
			}
		}

		return current;
	}
}
