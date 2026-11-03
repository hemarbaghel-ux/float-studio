/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

import { IFloatService, FloatService } from '../common/floatService.js';
import { FloatInlineDiffController } from './inline-diff/floatInlineDiffController.js';
import { FloatInlineDiffAction } from './inline-diff/floatInlineDiffActions.js';
import { OpenFloatComposerAction } from './composer/floatComposerActions.js';
import { OpenFloatChatAction } from './chat/floatChatActions.js';
import { FloatTerminalListener } from './terminal/floatTerminalListener.js';
import { FixWithFloatTerminalAction } from './terminal/floatTerminalActions.js';

// 1. Register Core FLOAT Platform Service as Eager Singleton
registerSingleton(IFloatService, FloatService, InstantiationType.Eager);

// 2. Register Inline Diff Controller (Ctrl+K) in Editor
registerEditorContribution(
	FloatInlineDiffController.ID,
	FloatInlineDiffController,
	EditorContributionInstantiation.AfterFirstRender
);

// 3. Register Keybindings & Actions
registerAction2(FloatInlineDiffAction);    // Ctrl+K
registerAction2(OpenFloatComposerAction);  // Ctrl+I
registerAction2(OpenFloatChatAction);      // Ctrl+L
registerAction2(FixWithFloatTerminalAction);

// 4. Register Workbench Terminal Exit-Code Listener
registerWorkbenchContribution2(
	FloatTerminalListener.ID,
	FloatTerminalListener,
	WorkbenchPhase.AfterRestored
);
