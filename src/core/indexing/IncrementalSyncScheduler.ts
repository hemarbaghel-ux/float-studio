/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export const FIVE_MINUTES_MS = 5 * 60 * 1000;

export class IncrementalSyncScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private lastSyncTimestamp: number = 0;

  constructor(
    private readonly onSyncCallback: () => Promise<void>,
    private readonly intervalMs: number = FIVE_MINUTES_MS
  ) {}

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      await this.triggerSync();
    }, this.intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async triggerSync(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;
    try {
      await this.onSyncCallback();
      this.lastSyncTimestamp = Date.now();
    } finally {
      this.isSyncing = false;
    }
  }

  public getLastSyncTime(): number {
    return this.lastSyncTimestamp;
  }
}
