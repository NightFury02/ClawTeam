/**
 * Session Tracker Tests
 */

import { SessionTracker } from '../src/routing/session-tracker';

describe('SessionTracker', () => {
  let tracker: SessionTracker;

  beforeEach(() => {
    tracker = new SessionTracker();
  });

  describe('track()', () => {
    it('records taskId → sessionKey mapping', () => {
      tracker.track('task-1', 'session-a');
      expect(tracker.getSessionForTask('task-1')).toBe('session-a');
    });

    it('records sessionKey → taskId mapping', () => {
      tracker.track('task-1', 'session-a');
      tracker.track('task-2', 'session-a');
      expect(tracker.getTasksForSession('session-a')).toEqual(
        expect.arrayContaining(['task-1', 'task-2']),
      );
    });

    it('handles multiple sessions', () => {
      tracker.track('task-1', 'session-a');
      tracker.track('task-2', 'session-b');

      expect(tracker.getSessionForTask('task-1')).toBe('session-a');
      expect(tracker.getSessionForTask('task-2')).toBe('session-b');
    });

    it('removes taskId from retired when re-tracked', () => {
      tracker.track('task-1', 'session-a');
      tracker.untrack('task-1');

      // Now in retired
      expect(tracker.getStats().retiredTasks).toBe(1);

      // Re-track moves it back to active and clears retired
      tracker.track('task-1', 'session-b');
      expect(tracker.getStats().retiredTasks).toBe(0);
      expect(tracker.isTracked('task-1')).toBe(true);
      expect(tracker.getSessionForTask('task-1')).toBe('session-b');
    });
  });

  describe('getSessionForTask()', () => {
    it('returns undefined for untracked task', () => {
      expect(tracker.getSessionForTask('unknown')).toBeUndefined();
    });
  });

  describe('getTasksForSession()', () => {
    it('returns empty array for unknown session', () => {
      expect(tracker.getTasksForSession('unknown')).toEqual([]);
    });
  });

  describe('untrack()', () => {
    it('removes task from active maps but retains in retired', () => {
      tracker.track('task-1', 'session-a');
      tracker.untrack('task-1');

      // Not in active
      expect(tracker.isTracked('task-1')).toBe(false);
      expect(tracker.getTasksForSession('session-a')).toEqual([]);

      // Still resolvable via retired
      expect(tracker.getSessionForTask('task-1')).toBe('session-a');
    });

    it('does not affect other tasks in the same session', () => {
      tracker.track('task-1', 'session-a');
      tracker.track('task-2', 'session-a');
      tracker.untrack('task-1');

      // task-1 retired but still resolvable
      expect(tracker.isTracked('task-1')).toBe(false);
      expect(tracker.getSessionForTask('task-1')).toBe('session-a');
      // task-2 still active
      expect(tracker.getSessionForTask('task-2')).toBe('session-a');
      expect(tracker.getTasksForSession('session-a')).toEqual(['task-2']);
    });

    it('cleans up empty session entry', () => {
      tracker.track('task-1', 'session-a');
      tracker.untrack('task-1');

      const stats = tracker.getStats();
      expect(stats.activeSessions).toBe(0);
    });

    it('is a no-op for untracked task', () => {
      tracker.untrack('unknown');
      expect(tracker.getStats().trackedTasks).toBe(0);
      expect(tracker.getStats().retiredTasks).toBe(0);
    });
  });

  describe('retired retention', () => {
    it('getSessionForTask returns sessionKey after untrack (within TTL)', () => {
      tracker.track('task-1', 'session-a');
      tracker.untrack('task-1');

      expect(tracker.getSessionForTask('task-1')).toBe('session-a');
    });

    it('getSessionForTask returns undefined after TTL expires', () => {
      // Use a very short retention for testing
      const shortTracker = new SessionTracker(100); // 100ms
      shortTracker.track('task-1', 'session-a');
      shortTracker.untrack('task-1');

      // Immediately should still resolve
      expect(shortTracker.getSessionForTask('task-1')).toBe('session-a');

      // Manually expire by manipulating retiredAt
      // Access private field for testing
      const retired = (shortTracker as any).retired as Map<string, { sessionKey: string; retiredAt: number }>;
      const entry = retired.get('task-1')!;
      entry.retiredAt = Date.now() - 200; // 200ms ago, past 100ms TTL

      expect(shortTracker.getSessionForTask('task-1')).toBeUndefined();
      // Should also have been cleaned from retired map
      expect(retired.has('task-1')).toBe(false);
    });

    it('cleanupRetired removes expired entries', () => {
      const shortTracker = new SessionTracker(100);
      shortTracker.track('task-1', 'session-a');
      shortTracker.track('task-2', 'session-b');
      shortTracker.untrack('task-1');
      shortTracker.untrack('task-2');

      // Expire task-1 only
      const retired = (shortTracker as any).retired as Map<string, { sessionKey: string; retiredAt: number }>;
      retired.get('task-1')!.retiredAt = Date.now() - 200;

      const removed = shortTracker.cleanupRetired();
      expect(removed).toBe(1);
      expect(shortTracker.getSessionForTask('task-1')).toBeUndefined();
      expect(shortTracker.getSessionForTask('task-2')).toBe('session-b');
    });

    it('cleanupRetired returns 0 when nothing is expired', () => {
      tracker.track('task-1', 'session-a');
      tracker.untrack('task-1');

      const removed = tracker.cleanupRetired();
      expect(removed).toBe(0);
    });
  });

  describe('getAllTracked()', () => {
    it('returns empty array when no tasks tracked', () => {
      expect(tracker.getAllTracked()).toEqual([]);
    });

    it('returns all tracked task→session pairs', () => {
      tracker.track('task-1', 'session-a');
      tracker.track('task-2', 'session-b');
      tracker.track('task-3', 'session-a');

      const pairs = tracker.getAllTracked();
      expect(pairs).toHaveLength(3);
      expect(pairs).toEqual(
        expect.arrayContaining([
          { taskId: 'task-1', sessionKey: 'session-a' },
          { taskId: 'task-2', sessionKey: 'session-b' },
          { taskId: 'task-3', sessionKey: 'session-a' },
        ]),
      );
    });

    it('reflects untrack changes (retired tasks not in getAllTracked)', () => {
      tracker.track('task-1', 'session-a');
      tracker.track('task-2', 'session-b');
      tracker.untrack('task-1');

      const pairs = tracker.getAllTracked();
      expect(pairs).toEqual([{ taskId: 'task-2', sessionKey: 'session-b' }]);
    });
  });

  describe('isTracked()', () => {
    it('returns true for tracked task', () => {
      tracker.track('task-1', 'session-a');
      expect(tracker.isTracked('task-1')).toBe(true);
    });

    it('returns false for untracked task', () => {
      expect(tracker.isTracked('unknown')).toBe(false);
    });

    it('returns false after untrack (isTracked checks active only)', () => {
      tracker.track('task-1', 'session-a');
      tracker.untrack('task-1');
      expect(tracker.isTracked('task-1')).toBe(false);
    });
  });

  describe('getStats()', () => {
    it('returns zero counts when empty', () => {
      expect(tracker.getStats()).toEqual({
        trackedTasks: 0,
        activeSessions: 0,
        retiredTasks: 0,
      });
    });

    it('returns correct counts', () => {
      tracker.track('task-1', 'session-a');
      tracker.track('task-2', 'session-a');
      tracker.track('task-3', 'session-b');

      expect(tracker.getStats()).toEqual({
        trackedTasks: 3,
        activeSessions: 2,
        retiredTasks: 0,
      });
    });

    it('updates after untrack', () => {
      tracker.track('task-1', 'session-a');
      tracker.track('task-2', 'session-b');
      tracker.untrack('task-1');

      expect(tracker.getStats()).toEqual({
        trackedTasks: 1,
        activeSessions: 1,
        retiredTasks: 1,
      });
    });
  });
});
