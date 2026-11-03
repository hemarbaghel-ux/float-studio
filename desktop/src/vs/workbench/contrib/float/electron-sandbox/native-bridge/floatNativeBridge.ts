/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IFloatNativeBridgeChannel {
	send(channel: string, data: any): void;
	on(channel: string, listener: (event: any, ...args: any[]) => void): void;
}

export class FloatNativeBridge {
	private static _channel: IFloatNativeBridgeChannel | null = null;

	public static registerChannel(channel: IFloatNativeBridgeChannel): void {
		this._channel = channel;
	}

	public static getChannel(): IFloatNativeBridgeChannel | null {
		return this._channel;
	}
}
