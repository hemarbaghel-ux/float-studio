/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';

export interface IFloatWebWorkbenchConfig {
	workspaceUri?: string | URI;
	folderUri?: string | URI;
	domElementId?: string;
	theme?: 'Default Dark Modern' | 'Default Light Modern';
	additionalSettings?: Record<string, any>;
}

export interface IFloatWebWorkbenchHandle extends IDisposable {
	readonly workspaceUri: URI | null;
	readonly isMounted: boolean;
	openWorkspace(uri: URI): Promise<void>;
	shutdown(): Promise<void>;
}

export class FloatWebWorkbenchMounter extends Disposable {
	private _isMounted = false;
	private _activeWorkspaceUri: URI | null = null;
	private _container: any = null;

	private readonly _onDidMount = this._register(new Emitter<{ workspaceUri: URI | null }>());
	public readonly onDidMount: Event<{ workspaceUri: URI | null }> = this._onDidMount.event;

	private readonly _onDidUnmount = this._register(new Emitter<void>());
	public readonly onDidUnmount: Event<void> = this._onDidUnmount.event;

	private readonly _onDidChangeWorkspace = this._register(new Emitter<URI>());
	public readonly onDidChangeWorkspace: Event<URI> = this._onDidChangeWorkspace.event;

	public isMounted(): boolean {
		return this._isMounted;
	}

	public getActiveWorkspaceUri(): URI | null {
		return this._activeWorkspaceUri;
	}

	public async mount(container: any, config?: IFloatWebWorkbenchConfig): Promise<IFloatWebWorkbenchHandle> {
		if (this._isMounted) {
			throw new Error('FloatWebWorkbench is already mounted. Call unmount() first.');
		}

		this._container = container;
		const rawUri = config?.workspaceUri || config?.folderUri || 'float-workspace://localhost/workspace';
		this._activeWorkspaceUri = typeof rawUri === 'string' ? URI.parse(rawUri) : rawUri;

		// Build product configuration and default settings for Code-OSS web embedding
		const defaults = {
			'float.ai.enabled': true,
			'float.cursorTab.enabled': true,
			'float.debugAutoRepair.enabled': true,
			'workbench.colorTheme': config?.theme || 'Default Dark Modern',
			'editor.fontSize': 14,
			'editor.tabSize': 2,
			'editor.minimap.enabled': false,
			...(config?.additionalSettings || {})
		};

		// Simulate mounting lifecycle into the provided DOM container
		this._isMounted = true;
		if (this._container && typeof this._container.setAttribute === 'function') {
			this._container.setAttribute('data-float-mounted', 'true');
			this._container.setAttribute('data-float-theme', defaults['workbench.colorTheme']);
		}

		this._onDidMount.fire({ workspaceUri: this._activeWorkspaceUri });

		const handle: IFloatWebWorkbenchHandle = {
			workspaceUri: this._activeWorkspaceUri,
			isMounted: true,
			openWorkspace: async (newUri: URI) => {
				this._activeWorkspaceUri = newUri;
				this._onDidChangeWorkspace.fire(newUri);
			},
			shutdown: async () => {
				await this.unmount();
			},
			dispose: () => {
				this.unmount();
			}
		};

		return handle;
	}

	public async unmount(): Promise<void> {
		if (!this._isMounted) {
			return;
		}

		if (this._container && typeof this._container.removeAttribute === 'function') {
			this._container.removeAttribute('data-float-mounted');
		}

		this._isMounted = false;
		this._activeWorkspaceUri = null;
		this._container = null;
		this._onDidUnmount.fire();
	}

	public override dispose(): void {
		this.unmount();
		super.dispose();
	}
}
