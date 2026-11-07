/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { FloatBrowserDaemonRuntimeService } from '../desktop/src/vs/workbench/contrib/float/browser/floatDaemonRuntimeService.ts';

async function main(): Promise<void> {
	const runtime = new FloatBrowserDaemonRuntimeService();

	assert.equal(runtime.state, 'stopped');
	assert.equal(runtime.getClient(), undefined);
	await runtime.start();
	assert.equal(runtime.state, 'stopped');
	await runtime.stop();
	assert.equal(runtime.getClient(), undefined);

	console.log('FLOAT browser daemon fallback: shared Chat/Composer can safely use local context when native runtime is unavailable.');
}

main().catch(error => {
	console.error('FLOAT browser daemon fallback test failed:', error);
	process.exit(1);
});
