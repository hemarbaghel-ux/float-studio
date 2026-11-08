/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export type FloatAgentRole = 'architect' | 'coder' | 'reviewer' | 'tester';
export type FloatTaskNodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface IFloatAgentTaskNode {
	id: string;
	title: string;
	role: FloatAgentRole;
	dependencies: string[];
	status: FloatTaskNodeStatus;
	inputPayload?: any;
	outputResult?: any;
	error?: string;
	retryCount: number;
	maxRetries: number;
}

export interface IFloatGraphStats {
	total: number;
	completed: number;
	failed: number;
	running: number;
	pending: number;
	skipped: number;
}

export class FloatAgentTaskDag {
	private readonly _nodes = new Map<string, IFloatAgentTaskNode>();

	public addTaskNode(node: IFloatAgentTaskNode): void {
		if (this._nodes.has(node.id)) {
			throw new Error(`Task node with id "${node.id}" already exists in DAG.`);
		}
		this._nodes.set(node.id, { ...node });
	}

	public getNode(id: string): IFloatAgentTaskNode | undefined {
		return this._nodes.get(id);
	}

	public getAllNodes(): IFloatAgentTaskNode[] {
		return Array.from(this._nodes.values());
	}

	public hasCycle(): boolean {
		const visited = new Set<string>();
		const recStack = new Set<string>();

		const isCyclic = (id: string): boolean => {
			visited.add(id);
			recStack.add(id);

			const node = this._nodes.get(id);
			if (node) {
				for (const depId of node.dependencies) {
					if (!visited.has(depId)) {
						if (isCyclic(depId)) {
							return true;
						}
					} else if (recStack.has(depId)) {
						return true;
					}
				}
			}

			recStack.delete(id);
			return false;
		};

		for (const id of this._nodes.keys()) {
			if (!visited.has(id)) {
				if (isCyclic(id)) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Returns array of stages (batches). Each stage contains tasks that can execute in parallel.
	 */
	public getExecutionBatches(): string[][] {
		if (this.hasCycle()) {
			throw new Error('Cannot compute execution batches: DAG contains a cycle.');
		}

		const inDegree = new Map<string, number>();
		const adj = new Map<string, string[]>();

		for (const id of this._nodes.keys()) {
			inDegree.set(id, 0);
			adj.set(id, []);
		}

		for (const node of this._nodes.values()) {
			for (const depId of node.dependencies) {
				if (!this._nodes.has(depId)) {
					throw new Error(`Dependency "${depId}" not found for task "${node.id}".`);
				}
				// depId -> node.id (dep must finish before node can run)
				adj.get(depId)!.push(node.id);
				inDegree.set(node.id, (inDegree.get(node.id) || 0) + 1);
			}
		}

		const batches: string[][] = [];
		let currentBatch: string[] = [];

		for (const [id, deg] of inDegree.entries()) {
			if (deg === 0) {
				currentBatch.push(id);
			}
		}

		while (currentBatch.length > 0) {
			batches.push(currentBatch);
			const nextBatch: string[] = [];

			for (const id of currentBatch) {
				for (const neighbor of adj.get(id) || []) {
					const newDeg = (inDegree.get(neighbor) || 0) - 1;
					inDegree.set(neighbor, newDeg);
					if (newDeg === 0) {
						nextBatch.push(neighbor);
					}
				}
			}

			currentBatch = nextBatch;
		}

		return batches;
	}

	public getReadyTasks(): IFloatAgentTaskNode[] {
		const ready: IFloatAgentTaskNode[] = [];

		for (const node of this._nodes.values()) {
			if (node.status === 'pending') {
				const allDepsMet = node.dependencies.every(depId => {
					const dep = this._nodes.get(depId);
					return dep && dep.status === 'completed';
				});

				const hasFailedDep = node.dependencies.some(depId => {
					const dep = this._nodes.get(depId);
					return dep && (dep.status === 'failed' || dep.status === 'skipped');
				});

				if (hasFailedDep) {
					node.status = 'skipped';
				} else if (allDepsMet) {
					ready.push(node);
				}
			}
		}

		return ready;
	}

	public markTaskStatus(
		id: string,
		status: FloatTaskNodeStatus,
		outputResult?: any,
		error?: string
	): void {
		const node = this._nodes.get(id);
		if (!node) {
			throw new Error(`Cannot update status: task "${id}" does not exist.`);
		}

		node.status = status;
		if (outputResult !== undefined) {
			node.outputResult = outputResult;
		}
		if (error !== undefined) {
			node.error = error;
		}
	}

	public isFinished(): boolean {
		for (const node of this._nodes.values()) {
			if (node.status === 'pending' || node.status === 'running') {
				return false;
			}
		}
		return true;
	}

	public getGraphStats(): IFloatGraphStats {
		const stats: IFloatGraphStats = {
			total: this._nodes.size,
			completed: 0,
			failed: 0,
			running: 0,
			pending: 0,
			skipped: 0
		};

		for (const node of this._nodes.values()) {
			switch (node.status) {
				case 'completed':
					stats.completed++;
					break;
				case 'failed':
					stats.failed++;
					break;
				case 'running':
					stats.running++;
					break;
				case 'pending':
					stats.pending++;
					break;
				case 'skipped':
					stats.skipped++;
					break;
			}
		}

		return stats;
	}

	public reset(): void {
		for (const node of this._nodes.values()) {
			node.status = 'pending';
			node.outputResult = undefined;
			node.error = undefined;
			node.retryCount = 0;
		}
	}
}
