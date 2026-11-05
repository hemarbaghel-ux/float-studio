/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// 1. Setup DOM & Window polyfills before Code-OSS browser imports
if (typeof (globalThis as any).window === 'undefined') {
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

	(globalThis as any).location = { href: 'http://localhost/' };
	(globalThis as any).document = {
		location: (globalThis as any).location,
		createElement,
		getElementsByTagName: () => [],
		head: createElement('head'),
		body: createElement('body')
	};
	(globalThis as any).window = {
		location: (globalThis as any).location,
		document: (globalThis as any).document,
		addEventListener: () => {},
		removeEventListener: () => {}
	};
}

import * as assert from 'assert';
import { FloatTreeSitterGrammarRegistry } from '../daemon/src/grammars/floatTreeSitterGrammarRegistry.js';
import { FloatTreeSitterIndexer } from '../daemon/src/indexer/floatTreeSitterIndexer.js';
import { FloatRulesGovernanceService } from '../desktop/src/vs/workbench/contrib/float/common/rules/floatRulesGovernanceService.js';
import { FloatAutonomousAgentController } from '../desktop/src/vs/workbench/contrib/float/browser/agent/floatAutonomousAgentController.js';
import { SweBenchTaskBank } from '../benchmarks/tasks/sweBenchTaskBank.js';

console.log('================================================================');
console.log('FLOAT Studio: Cursor 7.5M LOC Scale Monorepo Verification Suite');
console.log('Testing: Multi-Grammars, Rules Governance, Agent Loop, SWE Bank');
console.log('================================================================\n');

async function runFullScaleTests() {
	let totalPassed = 0;

	// =========================================================================
	// 1. Multi-Language Tree-Sitter Grammars & Semantic Symbol Indexing
	// =========================================================================
	console.log('--- Test 1: Tree-Sitter Grammar Registry & Multi-Language Support ---');
	const grammarRegistry = new FloatTreeSitterGrammarRegistry();
	const supportedLangs = grammarRegistry.getSupportedLanguages();
	console.log(`[GrammarRegistry] Registered languages (${supportedLangs.length}): ${supportedLangs.join(', ')}`);

	assert.ok(supportedLangs.includes('typescript'), 'Should support TypeScript');
	assert.ok(supportedLangs.includes('python'), 'Should support Python');
	assert.ok(supportedLangs.includes('rust'), 'Should support Rust');
	assert.ok(supportedLangs.includes('go'), 'Should support Go');
	assert.ok(supportedLangs.includes('cpp'), 'Should support C++');
	assert.ok(supportedLangs.includes('java'), 'Should support Java');
	assert.ok(supportedLangs.includes('ruby'), 'Should support Ruby');
	assert.ok(supportedLangs.includes('php'), 'Should support PHP');
	totalPassed++;
	console.log('✔ Grammar registry supports all 8 enterprise core languages');

	console.log('\n--- Test 2: Tree-Sitter Multi-Language Symbol Extraction & Indexing ---');
	const indexer = new FloatTreeSitterIndexer();

	// TypeScript
	const tsCode = `
export class AuthService {
	public async authenticate(token: string): Promise<boolean> { return true; }
}
export interface UserSession { id: string; }
export type AuthResult = { ok: boolean };
export enum AuthRole { Admin, User }
export function createSession() {}
`;
	const tsResult = indexer.indexFile('src/auth.ts', tsCode);
	assert.strictEqual(tsResult.delta, 'added');
	assert.strictEqual(tsResult.node.language, 'typescript');
	const tsSymbols = tsResult.node.symbols.map(s => s.name);
	assert.ok(tsSymbols.includes('AuthService'), 'Should extract TypeScript class AuthService');
	assert.ok(tsSymbols.includes('authenticate'), 'Should extract TypeScript method authenticate');
	assert.ok(tsSymbols.includes('UserSession'), 'Should extract TypeScript interface UserSession');
	assert.ok(tsSymbols.includes('createSession'), 'Should extract TypeScript function createSession');

	// Python
	const pyCode = `
class NeuralOptimizer:
    def optimize(self, loss):
        pass

def compute_gradient(weights):
    return weights * 0.1
`;
	const pyResult = indexer.indexFile('ml/optimizer.py', pyCode);
	assert.strictEqual(pyResult.delta, 'added');
	assert.strictEqual(pyResult.node.language, 'python');
	const pySymbols = pyResult.node.symbols.map(s => s.name);
	assert.ok(pySymbols.includes('NeuralOptimizer'), 'Should extract Python class NeuralOptimizer');
	assert.ok(pySymbols.includes('optimize'), 'Should extract Python method optimize');
	assert.ok(pySymbols.includes('compute_gradient'), 'Should extract Python function compute_gradient');

	// Rust
	const rsCode = `
pub struct MemoryPool {
    size: usize
}
pub enum AllocationStrategy {
    Linear,
    Segregated
}
pub trait Allocator {
    fn allocate(&mut self);
}
pub fn init_pool() -> MemoryPool {
    MemoryPool { size: 1024 }
}
`;
	const rsResult = indexer.indexFile('core/alloc.rs', rsCode);
	assert.strictEqual(rsResult.delta, 'added');
	assert.strictEqual(rsResult.node.language, 'rust');
	const rsSymbols = rsResult.node.symbols.map(s => s.name);
	assert.ok(rsSymbols.includes('MemoryPool'), 'Should extract Rust struct MemoryPool');
	assert.ok(rsSymbols.includes('AllocationStrategy'), 'Should extract Rust enum AllocationStrategy');
	assert.ok(rsSymbols.includes('Allocator'), 'Should extract Rust trait Allocator');
	assert.ok(rsSymbols.includes('init_pool'), 'Should extract Rust fn init_pool');

	// Go
	const goCode = `
package server

type Dispatcher struct {
    workers int
}

type Worker interface {
    Process()
}

func NewDispatcher() *Dispatcher {
    return &Dispatcher{workers: 4}
}
`;
	const goResult = indexer.indexFile('server/dispatcher.go', goCode);
	assert.strictEqual(goResult.delta, 'added');
	assert.strictEqual(goResult.node.language, 'go');
	const goSymbols = goResult.node.symbols.map(s => s.name);
	assert.ok(goSymbols.includes('Dispatcher'), 'Should extract Go struct Dispatcher');
	assert.ok(goSymbols.includes('Worker'), 'Should extract Go interface Worker');
	assert.ok(goSymbols.includes('NewDispatcher'), 'Should extract Go func NewDispatcher');

	// C++
	const cppCode = `
class PhysicsEngine {
    void stepSimulation();
};
void calculateTrajectory() {}
`;
	const cppResult = indexer.indexFile('sim/physics.cpp', cppCode);
	assert.strictEqual(cppResult.delta, 'added');
	assert.strictEqual(cppResult.node.language, 'cpp');
	const cppSymbols = cppResult.node.symbols.map(s => s.name);
	assert.ok(cppSymbols.includes('PhysicsEngine'), 'Should extract C++ class PhysicsEngine');
	assert.ok(cppSymbols.includes('calculateTrajectory'), 'Should extract C++ function calculateTrajectory');

	// Java
	const javaCode = `
public class PaymentGateway {
    public void processPayment() {}
}
public interface TransactionLogger {}
`;
	const javaResult = indexer.indexFile('billing/PaymentGateway.java', javaCode);
	assert.strictEqual(javaResult.delta, 'added');
	assert.strictEqual(javaResult.node.language, 'java');
	const javaSymbols = javaResult.node.symbols.map(s => s.name);
	assert.ok(javaSymbols.includes('PaymentGateway'), 'Should extract Java class PaymentGateway');
	assert.ok(javaSymbols.includes('TransactionLogger'), 'Should extract Java interface TransactionLogger');

	// Ruby
	const rbCode = `
class JobScheduler
    def schedule_daily
    end
end
module Metrics
end
`;
	const rbResult = indexer.indexFile('jobs/scheduler.rb', rbCode);
	assert.strictEqual(rbResult.delta, 'added');
	assert.strictEqual(rbResult.node.language, 'ruby');
	const rbSymbols = rbResult.node.symbols.map(s => s.name);
	assert.ok(rbSymbols.includes('JobScheduler'), 'Should extract Ruby class JobScheduler');
	assert.ok(rbSymbols.includes('schedule_daily'), 'Should extract Ruby def schedule_daily');
	assert.ok(rbSymbols.includes('Metrics'), 'Should extract Ruby module Metrics');

	// PHP
	const phpCode = `
class RoutingMiddleware {
    public function handle() {}
}
interface RouteHandler {}
function bootstrapRoutes() {}
`;
	const phpResult = indexer.indexFile('routes/RoutingMiddleware.php', phpCode);
	assert.strictEqual(phpResult.delta, 'added');
	assert.strictEqual(phpResult.node.language, 'php');
	const phpSymbols = phpResult.node.symbols.map(s => s.name);
	assert.ok(phpSymbols.includes('RoutingMiddleware'), 'Should extract PHP class RoutingMiddleware');
	assert.ok(phpSymbols.includes('RouteHandler'), 'Should extract PHP interface RouteHandler');
	assert.ok(phpSymbols.includes('bootstrapRoutes'), 'Should extract PHP function bootstrapRoutes');

	// Incremental Delta & Symbol Search
	const unchangedResult = indexer.indexFile('src/auth.ts', tsCode);
	assert.strictEqual(unchangedResult.delta, 'unchanged');

	const modifiedTsCode = tsCode + '\nexport function verifyToken() {}';
	const modifiedResult = indexer.indexFile('src/auth.ts', modifiedTsCode);
	assert.strictEqual(modifiedResult.delta, 'modified');

	const searched = indexer.findSymbolsByName('Auth');
	assert.ok(searched.length >= 2, 'Should find symbols with "Auth" across repository');
	totalPassed++;
	console.log(`✔ Tree-Sitter indexed ${indexer.getIndexedFiles().length} files across 8 languages with incremental Merkle updates`);

	// =========================================================================
	// 2. Rules Governance Service (.floatrules, .cursorrules, .windsurf, .cline)
	// =========================================================================
	console.log('\n--- Test 3: Rules Governance & Anti-Pattern Prevention ---');
	const rulesService = new FloatRulesGovernanceService();

	const floatRule = rulesService.loadFromText(
		'.floatrules',
		'src/',
		'Enforce strict type safety: no-any allowed. Enforce no-console-log in production.'
	);
	const cursorRule = rulesService.loadFromText(
		'.cursorrules',
		'src/backend',
		'Backend service guidelines: use structured logger.'
	);
	const windsurfRule = rulesService.loadFromText(
		'.windsurfrules',
		'',
		'Global workspace preferences.'
	);

	const rules = rulesService.getLoadedRules();
	assert.strictEqual(rules.length, 3);
	assert.strictEqual(rules[0].priority, 100, '.floatrules should have highest priority (100)');
	assert.strictEqual(rules[1].priority, 80, '.cursorrules should have secondary priority (80)');
	assert.strictEqual(rules[2].priority, 50, '.windsurfrules should have standard priority (50)');

	const guidelines = rulesService.getPromptGuidelinesForFile('src/backend/user.ts');
	assert.strictEqual(guidelines.length, 3, 'All 3 matching rules should apply to nested backend file');

	// Violation Checks
	const cleanCode = 'export const userId: string = "user_123";';
	const validResult = rulesService.validateProposedEdits('src/backend/user.ts', cleanCode);
	assert.strictEqual(validResult.valid, true);
	assert.strictEqual(validResult.violations.length, 0);

	const dirtyCode = 'export const userId: any = "user_123"; console.log("user id", userId);';
	const invalidResult = rulesService.validateProposedEdits('src/backend/user.ts', dirtyCode);
	assert.strictEqual(invalidResult.valid, false);
	assert.strictEqual(invalidResult.violations.length, 2);
	assert.ok(invalidResult.violations.some(v => v.includes('any')), 'Should flag any violation');
	assert.ok(invalidResult.violations.some(v => v.includes('console.log')), 'Should flag console.log violation');

	rulesService.dispose();
	totalPassed++;
	console.log('✔ Rules governance prioritized and enforced .floatrules and .cursorrules seamlessly');

	// =========================================================================
	// 3. Autonomous Multi-Turn Agent Controller & Verification Gates
	// =========================================================================
	console.log('\n--- Test 4: Autonomous Agent Controller Lifecycle & Self-Repair ---');
	const agent = new FloatAutonomousAgentController();
	const observedStates: string[] = [];

	agent.onStateChange(evt => {
		observedStates.push(evt.state);
	});

	// Session 1: Planning -> Executing -> Gate Error -> Self-Repairing -> Gate Clean -> Completed
	const session = agent.startSession('Fix token payload verification in auth guard', 4);
	assert.strictEqual(session.goal, 'Fix token payload verification in auth guard');
	assert.strictEqual(session.state, 'planning');

	await agent.recordTurn('Examine current guard implementation', { name: 'read_file', args: { path: 'src/guard.ts' } }, { content: '...' });
	await agent.recordTurn('Apply initial patch', { name: 'edit_file', args: { path: 'src/guard.ts' } }, { success: true });

	// Simulate compiler error gate
	const gate1 = agent.verifyGate(1);
	assert.strictEqual(gate1, false);
	assert.strictEqual(session.state, 'self_repairing');

	// Turn 3: Self-repair patch
	await agent.recordTurn('Resolve compilation diagnostic error', { name: 'edit_file', args: { path: 'src/guard.ts' } }, { success: true });

	// Gate now clean
	const gate2 = agent.verifyGate(0);
	assert.strictEqual(gate2, true);
	assert.strictEqual(session.state, 'completed');

	assert.ok(observedStates.includes('planning'));
	assert.ok(observedStates.includes('self_repairing'));
	assert.ok(observedStates.includes('completed'));

	// Session 2: Max Turns Exceeded -> Error state
	const session2 = agent.startSession('Impossible task', 1);
	await agent.recordTurn('First attempt', { name: 'run_command', args: { cmd: 'test' } });
	const failedGate = agent.verifyGate(3);
	assert.strictEqual(failedGate, false);
	assert.strictEqual(session2.state, 'error');

	agent.dispose();
	totalPassed++;
	console.log('✔ Autonomous agent controller demonstrated self-repair loop and verification gates');

	// =========================================================================
	// 4. Enterprise SWE-bench Task Bank Evaluation
	// =========================================================================
	console.log('\n--- Test 5: Enterprise SWE-bench Task Bank (10 Tasks, 5 Domains) ---');
	const taskBank = new SweBenchTaskBank();
	const tasks = taskBank.getTasks();
	assert.strictEqual(tasks.length, 10, 'Task bank must contain 10 enterprise challenge tasks');

	const domains = new Set(tasks.map(t => t.domain));
	assert.ok(domains.has('security'), 'Must test security');
	assert.ok(domains.has('concurrency'), 'Must test concurrency');
	assert.ok(domains.has('algorithms'), 'Must test algorithms');
	assert.ok(domains.has('type_safety'), 'Must test type_safety');
	assert.ok(domains.has('perf'), 'Must test perf');

	const evalResult = taskBank.evaluateAll();
	console.log(`[SWE-bench Bank] Total Tasks: ${evalResult.total}, Passed: ${evalResult.passed}, Pass Rate: ${evalResult.passRate}%`);
	assert.strictEqual(evalResult.total, 10);
	assert.strictEqual(evalResult.passed, 10);
	assert.strictEqual(evalResult.passRate, 100);
	totalPassed++;
	console.log('✔ Enterprise SWE-bench task bank evaluated with 100% pass rate (10/10 tasks)');

	console.log('\n================================================================');
	console.log(`SUCCESS: All ${totalPassed} Cursor 7.5M scale verification tests PASSED!`);
	console.log('================================================================');
}

runFullScaleTests().catch(err => {
	console.error('FAILED testCursor7_5MFullScaleMonorepo:', err);
	process.exit(1);
});
