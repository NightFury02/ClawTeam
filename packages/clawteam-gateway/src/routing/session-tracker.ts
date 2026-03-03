/**
 * Session Tracker
 *
 * In-memory bidirectional map tracking which session handles which task.
 * Intentionally in-memory (not Redis) because:
 * 1. Single process — no distributed state needed
 * 2. If process restarts, re-polls and re-routes (idempotent)
 * 3. Minimal dependency footprint
 */

export class SessionTracker {
  /** taskId → sessionKey */
  private taskToSession = new Map<string, string>();
  /** sessionKey → Set<taskId> */
  private sessionToTasks = new Map<string, Set<string>>();
  /** taskId → { sessionKey, retiredAt } — completed tasks retained for sub-task resolution */
  private retired = new Map<string, { sessionKey: string; retiredAt: number }>();
  private readonly retentionMs: number;

  constructor(retentionMs: number = 24 * 60 * 60 * 1000) {
    this.retentionMs = retentionMs;
  }

  /** Record that a task is being handled by a session */
  track(taskId: string, sessionKey: string): void {
    // Clear any retired entry for this taskId to avoid data inconsistency
    this.retired.delete(taskId);

    this.taskToSession.set(taskId, sessionKey);

    let tasks = this.sessionToTasks.get(sessionKey);
    if (!tasks) {
      tasks = new Set();
      this.sessionToTasks.set(sessionKey, tasks);
    }
    tasks.add(taskId);
  }

  /** Check if a task is currently tracked (active only, not retired) */
  isTracked(taskId: string): boolean {
    return this.taskToSession.has(taskId);
  }

  /** Look up which session handles a given task (checks active first, then retired with TTL) */
  getSessionForTask(taskId: string): string | undefined {
    const active = this.taskToSession.get(taskId);
    if (active) return active;

    const entry = this.retired.get(taskId);
    if (entry) {
      if (Date.now() - entry.retiredAt > this.retentionMs) {
        this.retired.delete(taskId);
        return undefined;
      }
      return entry.sessionKey;
    }
    return undefined;
  }

  /** Get all tasks for a given session */
  getTasksForSession(sessionKey: string): string[] {
    const tasks = this.sessionToTasks.get(sessionKey);
    return tasks ? Array.from(tasks) : [];
  }

  /** Remove tracking for a completed/cancelled task (retains mapping for sub-task resolution) */
  untrack(taskId: string): void {
    const sessionKey = this.taskToSession.get(taskId);
    if (sessionKey) {
      this.taskToSession.delete(taskId);
      const tasks = this.sessionToTasks.get(sessionKey);
      if (tasks) {
        tasks.delete(taskId);
        if (tasks.size === 0) {
          this.sessionToTasks.delete(sessionKey);
        }
      }
      // Retain for sub-task resolution
      this.retired.set(taskId, { sessionKey, retiredAt: Date.now() });
    }
  }

  /** Get all tracked task→session pairs */
  getAllTracked(): Array<{ taskId: string; sessionKey: string }> {
    const pairs: Array<{ taskId: string; sessionKey: string }> = [];
    for (const [taskId, sessionKey] of this.taskToSession) {
      pairs.push({ taskId, sessionKey });
    }
    return pairs;
  }

  /** Clean up expired retired entries. Returns the number of entries removed. */
  cleanupRetired(): number {
    const now = Date.now();
    let removed = 0;
    for (const [taskId, entry] of this.retired) {
      if (now - entry.retiredAt > this.retentionMs) {
        this.retired.delete(taskId);
        removed++;
      }
    }
    return removed;
  }

  /** Get stats for health monitoring */
  getStats(): { trackedTasks: number; activeSessions: number; retiredTasks: number } {
    return {
      trackedTasks: this.taskToSession.size,
      activeSessions: this.sessionToTasks.size,
      retiredTasks: this.retired.size,
    };
  }
}
