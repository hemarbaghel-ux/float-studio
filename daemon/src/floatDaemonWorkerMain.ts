/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

class Server {
	registerChannel(_name: string, _channel: any) {}
}
import { FloatDaemonWorkerChannel } from './server/floatDaemonWorkerChannel.js';

const ipcServer = new Server();
ipcServer.registerChannel('floatDaemonRuntime', new FloatDaemonWorkerChannel());

// Electron's utility-process lifecycle is owned by Code-OSS. The parent process
// terminates this worker when the workbench window closes or reloads.
