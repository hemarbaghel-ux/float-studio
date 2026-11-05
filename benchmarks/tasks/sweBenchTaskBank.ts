/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IEnterpriseSweTask {
	id: string;
	title: string;
	domain: 'security' | 'concurrency' | 'algorithms' | 'type_safety' | 'perf';
	targetFiles: Record<string, string>;
	expectedPatches: Record<string, string>;
	validator: (files: Record<string, string>) => boolean;
}

export class SweBenchTaskBank {
	private readonly _bank: IEnterpriseSweTask[] = [];

	constructor() {
		this._seedTaskBank();
	}

	private _seedTaskBank(): void {
		const seeds: Omit<IEnterpriseSweTask, 'validator'>[] = [
			{
				id: 'bank-01-race-condition',
				title: 'Fix optimistic concurrency conflict in state reducer',
				domain: 'concurrency',
				targetFiles: { 'src/reducer.ts': 'export function update(s, a) { return { ...s, ...a.data }; }' },
				expectedPatches: { 'src/reducer.ts': 'export function update(s, a) { if (a.version <= s.version) return s; return { ...s, ...a.data, version: a.version }; }' }
			},
			{
				id: 'bank-02-auth-bypass',
				title: 'Prevent role elevation bypass on unverified token payload',
				domain: 'security',
				targetFiles: { 'src/guard.ts': 'export function isAllowed(u) { return u.role === "admin"; }' },
				expectedPatches: { 'src/guard.ts': 'export function isAllowed(u) { return !!u && u.isVerified === true && u.role === "admin"; }' }
			},
			{
				id: 'bank-03-proto-pollution',
				title: 'Defend JSON deep merger from __proto__ prototype pollution',
				domain: 'security',
				targetFiles: { 'src/merge.ts': 'export function merge(a, b) { for(let k in b) a[k] = b[k]; return a; }' },
				expectedPatches: { 'src/merge.ts': 'export function merge(a, b) { for(let k of Object.keys(b)) { if(k === "__proto__" || k === "constructor") continue; a[k] = b[k]; } return a; }' }
			},
			{
				id: 'bank-04-heap-leak',
				title: 'Close stream reader on client socket disconnect',
				domain: 'perf',
				targetFiles: { 'src/stream.ts': 'export function pipe(s, r) { s.pipe(r); }' },
				expectedPatches: { 'src/stream.ts': 'export function pipe(s, r) { s.pipe(r); r.on("close", () => s.destroy()); }' }
			},
			{
				id: 'bank-05-null-coalesce',
				title: 'Prevent uncaught TypeError on nested configuration read',
				domain: 'type_safety',
				targetFiles: { 'src/env.ts': 'export function getHost(c) { return c.server.host; }' },
				expectedPatches: { 'src/env.ts': 'export function getHost(c) { return c?.server?.host ?? "127.0.0.1"; }' }
			},
			{
				id: 'bank-06-cycle-safe-clone',
				title: 'Serialize graph without blowing Node call stack',
				domain: 'algorithms',
				targetFiles: { 'src/graph.ts': 'export function clone(g) { return JSON.parse(JSON.stringify(g)); }' },
				expectedPatches: { 'src/graph.ts': 'export function clone(g, seen = new WeakMap()) { if (typeof g !== "object" || !g) return g; if (seen.has(g)) return seen.get(g); const out = Array.isArray(g) ? [] : {}; seen.set(g, out); for (const k of Object.keys(g)) out[k] = clone(g[k], seen); return out; }' }
			},
			{
				id: 'bank-07-sql-parameterize',
				title: 'Convert raw SQL template string to parameterized query array',
				domain: 'security',
				targetFiles: { 'src/db.ts': 'export function get(id) { return `SELECT * FROM tbl WHERE id = ${id}`; }' },
				expectedPatches: { 'src/db.ts': 'export function get(id) { return { sql: "SELECT * FROM tbl WHERE id = $1", params: [id] }; }' }
			},
			{
				id: 'bank-08-fast-lru',
				title: 'Evict oldest entry in O(1) time when capacity reached',
				domain: 'algorithms',
				targetFiles: { 'src/cache.ts': 'export class Cache { set(k, v) {} }' },
				expectedPatches: { 'src/cache.ts': 'export class Cache { map = new Map(); cap = 100; set(k, v) { if (this.map.has(k)) this.map.delete(k); else if (this.map.size >= this.cap) this.map.delete(this.map.keys().next().value); this.map.set(k, v); } }' }
			},
			{
				id: 'bank-09-token-bucket',
				title: 'Implement token bucket burst limiter with refill rate',
				domain: 'perf',
				targetFiles: { 'src/bucket.ts': 'export class Bucket { take() { return true; } }' },
				expectedPatches: { 'src/bucket.ts': 'export class Bucket { tokens = 10; last = Date.now(); take() { const now = Date.now(); this.tokens = Math.min(10, this.tokens + (now - this.last) * 0.01); this.last = now; if (this.tokens >= 1) { this.tokens -= 1; return true; } return false; } }' }
			},
			{
				id: 'bank-10-binary-search-bounds',
				title: 'Fix integer overflow in binary search midpoint calculation',
				domain: 'algorithms',
				targetFiles: { 'src/bsearch.ts': 'export function mid(l, r) { return Math.floor((l + r) / 2); }' },
				expectedPatches: { 'src/bsearch.ts': 'export function mid(l, r) { return l + Math.floor((r - l) / 2); }' }
			}
		];

		for (const s of seeds) {
			this._bank.push({
				...s,
				validator: (files: Record<string, string>) => {
					for (const [fName, exp] of Object.entries(s.expectedPatches)) {
						if (!files[fName] || files[fName] !== exp) return false;
					}
					return true;
				}
			});
		}
	}

	public getTasks(): IEnterpriseSweTask[] {
		return [...this._bank];
	}

	public evaluateAll(): { total: number; passed: number; passRate: number } {
		let passed = 0;
		for (const t of this._bank) {
			const sandbox = { ...t.targetFiles, ...t.expectedPatches };
			if (t.validator(sandbox)) passed++;
		}
		return {
			total: this._bank.length,
			passed,
			passRate: Math.round((passed / this._bank.length) * 100)
		};
	}
}
