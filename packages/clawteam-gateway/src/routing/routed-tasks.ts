/**
 * Routed Tasks Tracker
 *
 * Prevents duplicate routing of the same task across poll cycles.
 * Tasks stay in pending status between routing and acceptance by the
 * sub-session, so successive polls would re-route the same task.
 *
 * Uses a TTL-based map: entries expire after a configurable duration
 * (default 1 hour) to handle cases where tasks are never accepted.
 */

export class RoutedTasksTracker {
  /** taskId → timestamp when it was routed */
  private routed = new Map<string, number>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = 60 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  /** Mark a task as routed */
  markRouted(taskId: string): void {
    this.routed.set(taskId, Date.now());
  }

  /** Remove a task from the routed set (e.g. after API reset to allow re-routing) */
  remove(taskId: string): boolean {
    return this.routed.delete(taskId);
  }

  /** Check if a task has already been routed (and TTL hasn't expired) */
  isRouted(taskId: string): boolean {
    const routedAt = this.routed.get(taskId);
    if (routedAt === undefined) return false;

    if (Date.now() - routedAt > this.ttlMs) {
      this.routed.delete(taskId);
      return false;
    }

    return true;
  }

  /** Remove expired entries */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [taskId, routedAt] of this.routed) {
      if (now - routedAt > this.ttlMs) {
        this.routed.delete(taskId);
        removed++;
      }
    }
    return removed;
  }

  /** Get stats for monitoring */
  getStats(): { trackedCount: number } {
    return { trackedCount: this.routed.size };
  }
}
