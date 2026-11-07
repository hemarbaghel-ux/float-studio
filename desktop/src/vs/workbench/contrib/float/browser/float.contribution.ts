/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { registerWorkbenchContribution2, WorkbenchPhase, IWorkbenchContribution } from '../../../common/contributions.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';

import { IFloatService, FloatService } from '../common/floatService.js';
import { IFloatDaemonRuntimeService } from '../common/daemon/floatDaemonRuntimeService.js';
import { FloatBrowserDaemonRuntimeService } from './floatDaemonRuntimeService.js';
import { FloatInlineDiffController } from './inline-diff/floatInlineDiffController.js';
import { FloatInlineDiffAction } from './inline-diff/floatInlineDiffActions.js';
import { OpenFloatComposerAction } from './composer/floatComposerActions.js';
import { OpenFloatChatAction } from './chat/floatChatActions.js';
import { FloatTerminalListener } from './terminal/floatTerminalListener.js';
import { FixWithFloatTerminalAction } from './terminal/floatTerminalActions.js';
import { ToggleFloatAutocompleteAction } from './autocomplete/floatAutocompleteActions.js';
import { FloatPredictiveAutocomplete } from './autocomplete/floatPredictiveAutocomplete.js';

// 1. Register Core FLOAT Platform Service as Eager Singleton
registerSingleton(IFloatService, FloatService, InstantiationType.Eager);

// Browser-safe default; the Electron workbench registers its native implementation later.
registerSingleton(IFloatDaemonRuntimeService, FloatBrowserDaemonRuntimeService, InstantiationType.Delayed);

// 2. Register Inline Diff Controller (Ctrl+K) in Editor
registerEditorContribution(
	FloatInlineDiffController.ID,
	FloatInlineDiffController,
	EditorContributionInstantiation.AfterFirstRender
);

// 3. Register Keybindings & Actions
registerAction2(FloatInlineDiffAction);           // Ctrl+K
registerAction2(OpenFloatComposerAction);         // Ctrl+I
registerAction2(OpenFloatChatAction);             // Ctrl+L
registerAction2(FixWithFloatTerminalAction);      // Terminal Fix
registerAction2(ToggleFloatAutocompleteAction);   // Alt+Shift+A (Predictive Autocomplete)

// 4. Register Workbench Terminal Exit-Code Listener
registerWorkbenchContribution2(
	FloatTerminalListener.ID,
	FloatTerminalListener,
	WorkbenchPhase.AfterRestored
);

// 5. Register Predictive Autocomplete (Cursor Tab) Contribution
export class FloatPredictiveAutocompleteContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.floatPredictiveAutocomplete';

	private readonly _provider: FloatPredictiveAutocomplete;

	constructor(
		@IFloatService floatService: IFloatService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService
	) {
		this._provider = new FloatPredictiveAutocomplete(floatService, languageFeaturesService);
	}

	public get provider(): FloatPredictiveAutocomplete {
		return this._provider;
	}
}

registerWorkbenchContribution2(
	FloatPredictiveAutocompleteContribution.ID,
	FloatPredictiveAutocompleteContribution,
	WorkbenchPhase.AfterRestored
);