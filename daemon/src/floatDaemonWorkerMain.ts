/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Server } from '../../desktop/src/vs/base/parts/ipc/node/ipc.mp.js';
import { FloatDaemonWorkerChannel } from './server/floatDaemonWorkerChannel.js';

const ipcServer = new Server();
ipcServer.registerChannel('floatDaemonRuntime', new FloatDaemonWorkerChannel());

// Electron's utility-process lifecycle is owned by Code-OSS. The parent process
// terminates this worker when the workbench window closes or reloads.
