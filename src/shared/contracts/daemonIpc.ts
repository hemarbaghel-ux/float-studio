/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Versioned Daemon IPC Protocol Contracts (Phase 2)
 *
 * Defines the canonical IPC protocol between the editor workbench and the local
 * indexing/semantic background daemon. Provides length-prefixed framing, version
 * negotiation, request/response matching, streaming chunking, and graceful lifecycle controls.
 */

export const DAEMON_IPC_VERSION = 1;

export type DaemonState = 'stopped' | 'starting' | 'ready' | 'busy' | 'restarting' | 'shutting_down';

export type DaemonIpcMessageType =
  | 'request'
  | 'response'
  | 'event'
  | 'stream_chunk'
  | 'stream_end'
  | 'error';

export interface IDaemonIpcHeader {
  readonly version: number;
  readonly id: string;
  readonly type: DaemonIpcMessageType;
  readonly method?: string;
  readonly channel?: string;
}

export interface IDaemonIpcRequest<T = any> {
  readonly id: string;
  readonly type: 'request';
  readonly method: string;
  readonly params: T;
  readonly timeoutMs?: number;
}

export interface IDaemonIpcResponse<T = any> {
  readonly id: string;
  readonly type: 'response';
  readonly result?: T;
  readonly error?: {
    readonly code: number;
    readonly message: string;
    readonly data?: any;
  };
}

export interface IDaemonIpcStreamChunk<T = any> {
  readonly id: string;
  readonly type: 'stream_chunk';
  readonly sequence: number;
  readonly chunk: T;
}

export interface IDaemonIpcStreamEnd {
  readonly id: string;
  readonly type: 'stream_end';
  readonly totalChunks: number;
  readonly summary?: any;
}

export interface IDaemonIpcEvent<T = any> {
  readonly id: string;
  readonly type: 'event';
  readonly channel: string;
  readonly data: T;
}

export type DaemonIpcMessage =
  | IDaemonIpcRequest
  | IDaemonIpcResponse
  | IDaemonIpcStreamChunk
  | IDaemonIpcStreamEnd
  | IDaemonIpcEvent;

export interface IDaemonHandshakeParams {
  readonly clientVersion: number;
  readonly workspaceRoot: string;
  readonly capabilities: readonly string[];
}

export interface IDaemonHandshakeResult {
  readonly serverVersion: number;
  readonly accepted: boolean;
  readonly daemonState: DaemonState;
  readonly supportedMethods: readonly string[];
}

/**
 * 4-byte BE length-prefixed binary framer for robust cross-process IPC streaming.
 */
export class DaemonIpcFramer {
  /**
   * Encodes a DaemonIpcMessage into a 4-byte big-endian length-prefixed Buffer.
   */
  public static encode(message: DaemonIpcMessage): Buffer {
    const jsonStr = JSON.stringify(message);
    const payload = Buffer.from(jsonStr, 'utf8');
    const buffer = Buffer.allocUnsafe(4 + payload.length);
    buffer.writeUInt32BE(payload.length, 0);
    payload.copy(buffer, 4);
    return buffer;
  }

  /**
   * Decodes incoming buffered chunks into discrete DaemonIpcMessage objects.
   * Returns unparsed trailing buffer bytes.
   */
  public static decodeStream(
    buffer: Buffer,
    onMessage: (message: DaemonIpcMessage) => void
  ): Buffer {
    let offset = 0;

    while (offset + 4 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      if (offset + 4 + length > buffer.length) {
        break;
      }
      const jsonBuffer = buffer.subarray(offset + 4, offset + 4 + length);
      offset += 4 + length;

      try {
        const message = JSON.parse(jsonBuffer.toString('utf8')) as DaemonIpcMessage;
        onMessage(message);
      } catch (err) {
        console.error('[DaemonIpcFramer] Malformed JSON in IPC payload:', err);
      }
    }

    return offset > 0 ? buffer.subarray(offset) : buffer;
  }
}
