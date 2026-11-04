import assert from 'node:assert';

// 1. Setup DOM & Window polyfills before importing Code-OSS browser modules
globalThis.location = { href: 'http://localhost/' } as any;

const createElement = (tag: string) => {
	const children: any[] = [];
	const listeners: Record<string, Function[]> = {};
	const el: any = {
		tagName: tag.toUpperCase(),
		style: {} as Record<string, string>,
		classList: { add: () => {}, remove: () => {}, contains: () => false },
		children,
		childNodes: children,
		appendChild: (child: any) => { children.push(child); return child; },
		append: (...nodes: any[]) => {
			for (const n of nodes) {
				children.push(typeof n === 'string' ? { textContent: n } : n);
			}
		},
		remove: () => {},
		addEventListener: (evt: string, fn: Function) => {
			listeners[evt] = listeners[evt] || [];
			listeners[evt].push(fn);
		},
		removeEventListener: (evt: string, fn: Function) => {
			listeners[evt] = (listeners[evt] || []).filter(f => f !== fn);
		},
		dispatchEvent: (event: any) => {
			(listeners[event.type] || []).forEach(fn => fn(event));
		},
		focus: () => {},
		select: () => {},
		value: '',
		textContent: '',
		innerHTML: '',
		_listeners: listeners
	};
	return el;
};

globalThis.document = {
	location: globalThis.location,
	createElement,
	getElementsByTagName: () => [],
	head: createElement('head'),
	body: createElement('body')
} as any;

globalThis.window = {
	location: globalThis.location,
	document: globalThis.document,
	addEventListener: () => {},
	removeEventListener: () => {}
} as any;

async function runTrack2Tests() {
	console.log('🧪 Starting Track 2: Workbench UI Magic & UX Polish Tests...\n');

	// Dynamically import widgets after window/document polyfills are established
	const { FloatFloatingComposerWidget } = await import('../desktop/src/vs/workbench/contrib/float/browser/composer/floatFloatingComposerWidget.js');
	const { FloatCursorJumpWidget } = await import('../desktop/src/vs/workbench/contrib/float/browser/autocomplete/floatCursorJumpWidget.js');
	const { FloatContextMentionMenu } = await import('../desktop/src/vs/workbench/contrib/float/browser/context/floatContextMentionMenu.js');

	// Mock ICodeEditor
	const overlayWidgets = new Map<string, any>();
	const contentWidgets = new Map<string, any>();

	const mockEditor: any = {
		addOverlayWidget: (widget: any) => { overlayWidgets.set(widget.getId(), widget); },
		removeOverlayWidget: (widget: any) => { overlayWidgets.delete(widget.getId()); },
		layoutOverlayWidget: () => {},
		addContentWidget: (widget: any) => { contentWidgets.set(widget.getId(), widget); },
		removeContentWidget: (widget: any) => { contentWidgets.delete(widget.getId()); },
		layoutContentWidget: () => {},
		focus: () => {}
	};

	// Test 1: FloatFloatingComposerWidget (Ctrl+I In-Editor Modal)
	console.log('Test 1: FloatFloatingComposerWidget In-Editor Docking...');
	const composerWidget = new FloatFloatingComposerWidget(mockEditor, 'gpt-6-astra');
	assert(overlayWidgets.has(FloatFloatingComposerWidget.ID), 'Should register as Monaco overlay widget');
	assert.strictEqual(composerWidget.getId(), 'float.floatingComposerWidget');

	composerWidget.show();
	assert.strictEqual(composerWidget.isVisible, true, 'Widget should be visible after show()');

	// Verify shadow validation badge
	composerWidget.setShadowValidation(true);
	assert.strictEqual(composerWidget.getDomNode().children.length > 0, true);

	// Verify proposal summary staging
	composerWidget.setProposalReady(3, 45, 12);

	let submittedPrompt = '';
	let submittedMode = '';
	composerWidget.onSubmit(e => {
		submittedPrompt = e.prompt;
		submittedMode = e.mode;
	});

	// Simulate submit
	(composerWidget as any)._inputArea.value = 'Add OAuth2 login';
	(composerWidget as any)._triggerSubmit();
	assert.strictEqual(submittedPrompt, 'Add OAuth2 login');
	assert.strictEqual(submittedMode, 'agent');
	console.log('  ✓ Floating Composer modal registered, rendered, and dispatched submit event.');

	// Test 2: FloatCursorJumpWidget (Tab Jump Pill)
	console.log('\nTest 2: FloatCursorJumpWidget (Tab Jump Pill)...');
	const jumpWidget = new FloatCursorJumpWidget(mockEditor);
	assert(contentWidgets.has(FloatCursorJumpWidget.ID), 'Should register as Monaco content widget');

	let triggeredJump: any = null;
	jumpWidget.onTriggerJump(rec => {
		triggeredJump = rec;
	});

	jumpWidget.showRecommendation(
		{ lineNumber: 14, column: 5 },
		{
			targetFilePath: 'src/controllers/authController.ts',
			targetLine: 42,
			targetColumn: 8,
			reason: 'Update call site of verifyToken',
			confidence: 0.95
		}
	);

	assert(jumpWidget.getDomNode().innerHTML.includes('Jump to authController.ts:42'), 'Should format jump pill text');

	// Simulate pill click
	jumpWidget.getDomNode().dispatchEvent({ type: 'click', preventDefault: () => {}, stopPropagation: () => {} });
	assert(triggeredJump !== null, 'Pill click should trigger jump event');
	assert.strictEqual(triggeredJump.targetFilePath, 'src/controllers/authController.ts');
	assert.strictEqual(triggeredJump.targetLine, 42);
	console.log('  ✓ Cursor Tab visual jump pill docked and delivered jump event.');

	// Test 3: FloatContextMentionMenu (@ Mention Menu)
	console.log('\nTest 3: FloatContextMentionMenu (@ Context Mentions)...');
	const parentDom = createElement('div');
	const mentionMenu = new FloatContextMentionMenu(parentDom);

	mentionMenu.showAt(100, 150, 'code');
	assert.strictEqual(mentionMenu.isVisible, true, 'Menu should be visible');

	// Verify filter worked for @codebase
	let selectedItem: any = null;
	mentionMenu.onSelect(item => {
		selectedItem = item;
	});

	const confirmed = mentionMenu.confirmSelection();
	assert(confirmed !== undefined, 'Should confirm top matched item');
	assert.strictEqual(confirmed.key, '@codebase');
	assert.strictEqual(selectedItem?.key, '@codebase');
	console.log('  ✓ @ Context Mention menu filtered and confirmed @codebase selection.');

	// Cleanup
	composerWidget.dispose();
	jumpWidget.dispose();
	mentionMenu.dispose();

	assert.strictEqual(overlayWidgets.size, 0, 'Overlay widgets should be cleaned up');
	assert.strictEqual(contentWidgets.size, 0, 'Content widgets should be cleaned up');

	console.log('\n✅ All Track 2 Workbench UI Magic tests PASSED successfully!\n');
}

runTrack2Tests().catch(err => {
	console.error('❌ Track 2 test failed:', err);
	process.exit(1);
});
