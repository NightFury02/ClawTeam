/**
 * AckTracker Unit Tests
 */

import { AckTracker } from '../ack-tracker';
import type { AckConfig, ServerMessage } from '../interface';

describe('AckTracker', () => {
  let tracker: AckTracker;
  const config: AckConfig = {
    enabled: true,
    timeoutMs: 1000,
    requiredFor: ['task_assigned', 'task_completed', 'task_failed'],
  };

  beforeEach(() => {
    jest.useFakeTimers();
    tracker = new AckTracker(config);
  });

  afterEach(() => {
    tracker.cancelAll();
    jest.useRealTimers();
  });

  const createMessage = (type: string = 'task_assigned'): ServerMessage => ({
    type: type as any,
    payload: { taskId: '123' },
    timestamp: new Date().toISOString(),
  });

  describe('trackMessage', () => {
    it('should add messageId to the message', () => {
      const msg = createMessage();
      const tracked = tracker.trackMessage('bot-1', msg);

      expect(tracked.messageId).toBeDefined();
      expect(typeof tracked.messageId).toBe('string');
      expect(tracked.messageId!.length).toBeGreaterThan(0);
    });

    it('should preserve original message fields', () => {
      const msg = createMessage();
      const tracked = tracker.trackMessage('bot-1', msg);

      expect(tracked.type).toBe(msg.type);
      expect(tracked.payload).toEqual(msg.payload);
      expect(tracked.timestamp).toBe(msg.timestamp);
    });

    it('should increase pending count', () => {
      expect(tracker.getPendingCount()).toBe(0);

      tracker.trackMessage('bot-1', createMessage());
      expect(tracker.getPendingCount()).toBe(1);

      tracker.trackMessage('bot-1', createMessage());
      expect(tracker.getPendingCount()).toBe(2);
    });
  });

  describe('acknowledgeMessage', () => {
    it('should return true for pending message', () => {
      const tracked = tracker.trackMessage('bot-1', createMessage());
      const result = tracker.acknowledgeMessage(tracked.messageId!);

      expect(result).toBe(true);
      expect(tracker.getPendingCount()).toBe(0);
    });

    it('should return false for unknown messageId', () => {
      const result = tracker.acknowledgeMessage('nonexistent-id');
      expect(result).toBe(false);
    });

    it('should invoke onAckReceived callback', () => {
      const onAckReceived = jest.fn();
      tracker.onAckReceived = onAckReceived;

      const tracked = tracker.trackMessage('bot-1', createMessage());
      tracker.acknowledgeMessage(tracked.messageId!);

      expect(onAckReceived).toHaveBeenCalledWith(tracked.messageId);
    });

    it('should cancel the timeout timer', () => {
      const onAckTimeout = jest.fn();
      tracker.onAckTimeout = onAckTimeout;

      const tracked = tracker.trackMessage('bot-1', createMessage());
      tracker.acknowledgeMessage(tracked.messageId!);

      // Advance past timeout — should NOT trigger
      jest.advanceTimersByTime(config.timeoutMs + 100);
      expect(onAckTimeout).not.toHaveBeenCalled();
    });
  });

  describe('timeout', () => {
    it('should invoke onAckTimeout after timeout', () => {
      const onAckTimeout = jest.fn();
      tracker.onAckTimeout = onAckTimeout;

      const tracked = tracker.trackMessage('bot-1', createMessage());

      jest.advanceTimersByTime(config.timeoutMs);

      expect(onAckTimeout).toHaveBeenCalledTimes(1);
      expect(onAckTimeout).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: tracked.messageId,
          botId: 'bot-1',
        })
      );
      expect(tracker.getPendingCount()).toBe(0);
    });

    it('should not invoke timeout if acknowledged before timeout', () => {
      const onAckTimeout = jest.fn();
      tracker.onAckTimeout = onAckTimeout;

      const tracked = tracker.trackMessage('bot-1', createMessage());

      // Acknowledge before timeout
      jest.advanceTimersByTime(config.timeoutMs / 2);
      tracker.acknowledgeMessage(tracked.messageId!);

      jest.advanceTimersByTime(config.timeoutMs);
      expect(onAckTimeout).not.toHaveBeenCalled();
    });
  });

  describe('getPendingForBot', () => {
    it('should return pending ACKs for specific bot', () => {
      tracker.trackMessage('bot-1', createMessage());
      tracker.trackMessage('bot-1', createMessage());
      tracker.trackMessage('bot-2', createMessage());

      const bot1Pending = tracker.getPendingForBot('bot-1');
      expect(bot1Pending.length).toBe(2);
      expect(bot1Pending.every((p) => p.botId === 'bot-1')).toBe(true);

      const bot2Pending = tracker.getPendingForBot('bot-2');
      expect(bot2Pending.length).toBe(1);
    });

    it('should return empty array for bot with no pending', () => {
      const result = tracker.getPendingForBot('nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('requiresAck', () => {
    it('should return true for configured message types', () => {
      expect(tracker.requiresAck('task_assigned')).toBe(true);
      expect(tracker.requiresAck('task_completed')).toBe(true);
      expect(tracker.requiresAck('task_failed')).toBe(true);
    });

    it('should return false for non-configured message types', () => {
      expect(tracker.requiresAck('bot_status_changed')).toBe(false);
      expect(tracker.requiresAck('workflow_started')).toBe(false);
      expect(tracker.requiresAck('workflow_completed')).toBe(false);
    });
  });

  describe('cancelAll', () => {
    it('should clear all pending ACKs and timers', () => {
      const onAckTimeout = jest.fn();
      tracker.onAckTimeout = onAckTimeout;

      tracker.trackMessage('bot-1', createMessage());
      tracker.trackMessage('bot-2', createMessage());
      expect(tracker.getPendingCount()).toBe(2);

      tracker.cancelAll();
      expect(tracker.getPendingCount()).toBe(0);

      // Timers should be cleared
      jest.advanceTimersByTime(config.timeoutMs + 100);
      expect(onAckTimeout).not.toHaveBeenCalled();
    });
  });
});
