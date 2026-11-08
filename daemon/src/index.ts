/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { FloatDaemonServer } from './server/floatDaemonServer.js';

async function bootstrap() {
	const customPipe = process.env.FLOAT_DAEMON_PIPE;
	const server = new FloatDaemonServer(customPipe ? { pipeName: customPipe } : undefined);

	console.log(`[FLOAT Daemon] Starting server on ${server.getPipePath()} (PID: ${process.pid})...`);
	await server.start();
	console.log(`[FLOAT Daemon] Server successfully listening on ${server.getPipePath()}`);

	const shutdown = async (signal: string) => {
		console.log(`[FLOAT Daemon] Received ${signal}. Shutting down gracefully...`);
		try {
			await server.stop();
			console.log('[FLOAT Daemon] Server stopped successfully.');
			process.exit(0);
		} catch (err) {
			console.error('[FLOAT Daemon] Error during shutdown:', err);
			process.exit(1);
		}
	};

	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));

	if (process.platform !== 'win32') {
		process.on('SIGHUP', () => shutdown('SIGHUP'));
	}
}

bootstrap().catch(err => {
	console.error('[FLOAT Daemon] Fatal error on startup:', err);
	process.exit(1);
});
