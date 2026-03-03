/**
 * Routed Tasks Tracker Tests
 */

import { RoutedTasksTracker } from '../src/routing/routed-tasks';

describe('RoutedTasksTracker', () => {
  describe('markRouted() + isRouted()', () => {
    it('tracks routed tasks', () => {
      const tracker = new RoutedTasksTracker();
      tracker.markRouted('task-1');

      expect(tracker.isRouted('task-1')).toBe(true);
      expect(tracker.isRouted('task-2')).toBe(false);
    });

    it('tracks multiple tasks', () => {
      const tracker = new RoutedTasksTracker();
      tracker.markRouted('task-1');
      tracker.markRouted('task-2');
      tracker.markRouted('task-3');

      expect(tracker.isRouted('task-1')).toBe(true);
      expect(tracker.isRouted('task-2')).toBe(true);
      expect(tracker.isRouted('task-3')).toBe(true);
      expect(tracker.isRouted('task-4')).toBe(false);
    });
  });

  describe('TTL expiration', () => {
    it('returns false for expired entries', () => {
      const tracker = new RoutedTasksTracker(100); // 100ms TTL
      tracker.markRouted('task-1');

      // Manually set the timestamp to the past
      (tracker as any).routed.set('task-1', Date.now() - 200);

      expect(tracker.isRouted('task-1')).toBe(false);
    });

    it('returns true for entries within TTL', () => {
      const tracker = new RoutedTasksTracker(60_000); // 60s TTL
      tracker.markRouted('task-1');

      expect(tracker.isRouted('task-1')).toBe(true);
    });
  });

  describe('cleanup()', () => {
    it('removes expired entries', () => {
      const tracker = new RoutedTasksTracker(100);
      tracker.markRouted('task-1');
      tracker.markRouted('task-2');

      // Expire task-1
      (tracker as any).routed.set('task-1', Date.now() - 200);

      const removed = tracker.cleanup();

      expect(removed).toBe(1);
      expect(tracker.isRouted('task-1')).toBe(false);
      expect(tracker.isRouted('task-2')).toBe(true);
    });

    it('returns 0 when nothing to clean', () => {
      const tracker = new RoutedTasksTracker(60_000);
      tracker.markRouted('task-1');

      const removed = tracker.cleanup();
      expect(removed).toBe(0);
    });

    it('handles empty tracker', () => {
      const tracker = new RoutedTasksTracker();
      expect(tracker.cleanup()).toBe(0);
    });
  });

  describe('remove()', () => {
    it('removes a routed task and returns true', () => {
      const tracker = new RoutedTasksTracker();
      tracker.markRouted('task-1');
      expect(tracker.isRouted('task-1')).toBe(true);

      const removed = tracker.remove('task-1');
      expect(removed).toBe(true);
      expect(tracker.isRouted('task-1')).toBe(false);
    });

    it('returns false when task was not routed', () => {
      const tracker = new RoutedTasksTracker();
      expect(tracker.remove('task-1')).toBe(false);
    });

    it('allows task to be re-routed after removal', () => {
      const tracker = new RoutedTasksTracker();
      tracker.markRouted('task-1');
      tracker.remove('task-1');
      tracker.markRouted('task-1');
      expect(tracker.isRouted('task-1')).toBe(true);
    });

    it('decrements tracked count', () => {
      const tracker = new RoutedTasksTracker();
      tracker.markRouted('task-1');
      tracker.markRouted('task-2');
      expect(tracker.getStats()).toEqual({ trackedCount: 2 });

      tracker.remove('task-1');
      expect(tracker.getStats()).toEqual({ trackedCount: 1 });
    });
  });

  describe('getStats()', () => {
    it('returns zero for empty tracker', () => {
      const tracker = new RoutedTasksTracker();
      expect(tracker.getStats()).toEqual({ trackedCount: 0 });
    });

    it('returns correct count', () => {
      const tracker = new RoutedTasksTracker();
      tracker.markRouted('task-1');
      tracker.markRouted('task-2');
      expect(tracker.getStats()).toEqual({ trackedCount: 2 });
    });
  });
});
