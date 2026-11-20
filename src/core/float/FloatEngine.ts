/**
 * FLOAT Studio — Master Logic Engine (FloatEngine)
 * 
 * Central facade binding Workspace, Codebase Intelligence, Autonomous Composer,
 * Predictive Editor, Model Gateway, and Sandboxed Terminal into a cohesive,
 * database-free application logic architecture.
 */

import { FloatEngineConfig, ComposerGoalExecution, ShadowDiff } from './types';
import { FloatWorkspaceLogic } from './FloatWorkspaceLogic';
import { FloatIntelligenceLogic } from './FloatIntelligenceLogic';
import { FloatComposerLogic } from './FloatComposerLogic';
import { FloatEditorLogic } from './FloatEditorLogic';
import { FloatGatewayLogic } from './FloatGatewayLogic';
import { FloatTerminalLogic } from './FloatTerminalLogic';

export class FloatEngine {
  private static instance: FloatEngine | null = null;

  public readonly workspace: FloatWorkspaceLogic;
  public readonly intelligence: FloatIntelligenceLogic;
  public readonly composer: FloatComposerLogic;
  public readonly editor: FloatEditorLogic;
  public readonly gateway: FloatGatewayLogic;
  public readonly terminal: FloatTerminalLogic;

  constructor(config: FloatEngineConfig = {}) {
    this.workspace = new FloatWorkspaceLogic(config.workspaceRoot);
    this.intelligence = new FloatIntelligenceLogic(this.workspace);
    this.composer = new FloatComposerLogic(
      this.workspace,
      this.intelligence,
      config.approvalSecret
    );
    this.editor = new FloatEditorLogic();
    this.gateway = new FloatGatewayLogic(config.byokEncryptionKey);
    this.terminal = new FloatTerminalLogic();
  }

  /**
   * Singleton accessor for global engine instance
   */
  public static getInstance(config?: FloatEngineConfig): FloatEngine {
    if (!FloatEngine.instance) {
      FloatEngine.instance = new FloatEngine(config);
    }
    return FloatEngine.instance;
  }

  /**
   * Reset instance (useful for clean unit tests)
   */
  public static resetInstance(): void {
    FloatEngine.instance = null;
  }

  /**
   * Coordinated end-to-end workflow: Autonomous Goal Execution
   */
  public async executeAutonomousTask(
    projectId: string,
    userId: string,
    goalPrompt: string,
    proposedEdits?: Array<{ filePath: string; content: string }>
  ): Promise<ComposerGoalExecution> {
    // 1. Stage shadow edits if provided
    if (proposedEdits && proposedEdits.length > 0) {
      for (const edit of proposedEdits) {
        this.workspace.stageShadowEdit(edit.filePath, edit.content);
        this.intelligence.indexFile(edit.filePath, edit.content);
      }
    }

    // 2. Plan goal
    const goal = await this.composer.planGoal(projectId, userId, goalPrompt);

    // 3. Execute planned tasks
    return await this.composer.executeGoal(goal.goalId, userId);
  }

  /**
   * Coordinated end-to-end workflow: Apply Approved Diffs with Checkpointing
   */
  public async applyApprovedGoal(goalId: string): Promise<{ appliedCount: number; checkpointId: string; diffs: ShadowDiff[] }> {
    const goal = this.composer.getGoal(goalId);
    if (!goal) {
      throw new Error(`GOAL_NOT_FOUND: Goal "${goalId}" does not exist.`);
    }

    const diffs = await this.workspace.getShadowDiffs();
    const result = await this.workspace.commitShadowEdits(`Applied changes for goal "${goalId}"`);
    
    goal.status = 'completed';
    return {
      appliedCount: result.appliedCount,
      checkpointId: result.checkpointId,
      diffs
    };
  }
}
