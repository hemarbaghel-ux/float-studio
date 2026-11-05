/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IFloatTaskNode {
	id: string;
	title: string;
	dependencies: string[];
	status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back';
	checkpointId?: string;
}

export interface IFloatDagExecutionSummary {
	goal: string;
	totalTasks: number;
	completed: number;
	failed: number;
	rolledBack: number;
	success: boolean;
	durationMs: number;
}

export class FloatDagTaskPlanner {
	private readonly _tasks = new Map<string, IFloatTaskNode>();
	private readonly _checkpoints = new Map<string, Record<string, string>>();

	public addTask(task: Omit<IFloatTaskNode, 'status'>): void {
		this._tasks.set(task.id, {
			...task,
			status: 'pending'
		});
	}

	public getTasks(): IFloatTaskNode[] {
		return Array.from(this._tasks.values());
	}

	public getTopologicalBatches(): IFloatTaskNode[][] {
		const completedIds = new Set<string>();
		const remaining = new Map(this._tasks);
		const batches: IFloatTaskNode[][] = [];

		while (remaining.size > 0) {
			const readyBatch: IFloatTaskNode[] = [];

			for (const [id, task] of remaining.entries()) {
				const allDepsMet = task.dependencies.every(d => completedIds.has(d));
				if (allDepsMet) {
					readyBatch.push(task);
				}
			}

			if (readyBatch.length === 0) {
				// Circular dependency detected
				throw new Error('Cycle detected in DAG task planner dependencies');
			}

			for (const t of readyBatch) {
				remaining.delete(t.id);
				completedIds.add(t.id);
			}

			batches.push(readyBatch);
		}

		return batches;
	}

	public recordCheckpoint(checkpointId: string, state: Record<string, string>): void {
		this._checkpoints.set(checkpointId, { ...state });
	}

	public getCheckpoint(checkpointId: string): Record<string, string> | undefined {
		return this._checkpoints.get(checkpointId);
	}

	public async executePlan(
		goal: string,
		executor: (taskId: string) => Promise<boolean>
	): Promise<IFloatDagExecutionSummary> {
		const startTime = Date.now();
		const batches = this.getTopologicalBatches();

		let completed = 0;
		let failed = 0;
		let rolledBack = 0;
		let abortExecution = false;

		for (const batch of batches) {
			if (abortExecution) {
				for (const task of batch) {
					task.status = 'rolled_back';
					rolledBack++;
				}
				continue;
			}

			for (const task of batch) {
				task.status = 'running';
				try {
					const ok = await executor(task.id);
					if (ok) {
						task.status = 'completed';
						completed++;
					} else {
						task.status = 'failed';
						failed++;
						abortExecution = true;
					}
				} catch {
					task.status = 'failed';
					failed++;
					abortExecution = true;
				}
			}
		}

		return {
			goal,
			totalTasks: this._tasks.size,
			completed,
			failed,
			rolledBack,
			success: failed === 0,
			durationMs: Date.now() - startTime
		};
	}
}
