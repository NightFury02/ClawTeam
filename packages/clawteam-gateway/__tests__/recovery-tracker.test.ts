/**
 * Recovery Attempt Tracker Tests
 */

import { RecoveryAttemptTracker } from '../src/recovery/recovery-tracker';

describe('RecoveryAttemptTracker', () => {
  let tracker: RecoveryAttemptTracker;

  beforeEach(() => {
    tracker = new RecoveryAttemptTracker(3);
  });

  describe('recordAttempt()', () => {
    it('records first attempt', () => {
      tracker.recordAttempt('task-1', 'idle');
      const record = tracker.getRecord('task-1');
      expect(record).toBeDefined();
      expect(record!.attempts).toBe(1);
      expect(record!.lastSessionState).toBe('idle');
    });

    it('increments attempt count', () => {
      tracker.recordAttempt('task-1', 'idle');
      tracker.recordAttempt('task-1', 'errored');
      const record = tracker.getRecord('task-1');
      expect(record!.attempts).toBe(2);
      expect(record!.lastSessionState).toBe('errored');
    });
  });

  describe('isExhausted()', () => {
    it('returns false when under limit', () => {
      tracker.recordAttempt('task-1', 'idle');
      tracker.recordAttempt('task-1', 'idle');
      expect(tracker.isExhausted('task-1')).toBe(false);
    });

    it('returns true when at limit', () => {
      tracker.recordAttempt('task-1', 'idle');
      tracker.recordAttempt('task-1', 'idle');
      tracker.recordAttempt('task-1', 'idle');
      expect(tracker.isExhausted('task-1')).toBe(true);
    });

    it('returns false for unknown task', () => {
      expect(tracker.isExhausted('unknown')).toBe(false);
    });
  });

  describe('getRecord()', () => {
    it('returns undefined for unknown task', () => {
      expect(tracker.getRecord('unknown')).toBeUndefined();
    });
  });

  describe('remove()', () => {
    it('clears the record', () => {
      tracker.recordAttempt('task-1', 'idle');
      tracker.remove('task-1');
      expect(tracker.getRecord('task-1')).toBeUndefined();
      expect(tracker.isExhausted('task-1')).toBe(false);
    });
  });

  describe('getStats()', () => {
    it('returns zero counts when empty', () => {
      expect(tracker.getStats()).toEqual({ tracked: 0, exhausted: 0 });
    });

    it('returns correct counts', () => {
      tracker.recordAttempt('task-1', 'idle');
      tracker.recordAttempt('task-1', 'idle');
      tracker.recordAttempt('task-1', 'idle'); // exhausted
      tracker.recordAttempt('task-2', 'dead');  // not exhausted

      expect(tracker.getStats()).toEqual({ tracked: 2, exhausted: 1 });
    });
  });
});
