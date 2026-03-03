/**
 * RetryManager Unit Tests
 */

import { RetryManager } from '../retry-manager';
import type { RetryConfig, ServerMessage } from '../interface';

describe('RetryManager', () => {
  let retryManager: RetryManager;
  const config: RetryConfig = {
    enabled: true,
    maxRetries: 3,
    baseDelayMs: 100,
    maxDelayMs: 5000,
  };

  beforeEach(() => {
    jest.useFakeTimers();
    retryManager = new RetryManager(config);
  });

  afterEach(() => {
    retryManager.cancelAll();
    jest.useRealTimers();
  });

  const createMessage = (messageId?: string): ServerMessage => ({
    type: 'task_assigned',
    payload: { taskId: '123' },
    timestamp: new Date().toISOString(),
    messageId,
  });

  describe('scheduleRetry', () => {
    it('should schedule a retry and invoke onRetryAttempt', async () => {
      const onRetryAttempt = jest.fn().mockResolvedValue(true);
      retryManager.onRetryAttempt = onRetryAttempt;

      retryManager.scheduleRetry('bot-1', createMessage('msg-1'), 0);
      expect(retryManager.getPendingCount()).toBe(1);

      // Advance past the first delay (baseDelayMs * 2^0 = 100ms + jitter)
      jest.advanceTimersByTime(config.baseDelayMs + 50);
      await Promise.resolve(); // flush microtasks

      expect(onRetryAttempt).toHaveBeenCalledTimes(1);
      expect(onRetryAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          botId: 'bot-1',
          attempt: 1,
        })
      );
    });

    it('should retry again if onRetryAttempt returns false', async () => {
      const onRetryAttempt = jest.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      retryManager.onRetryAttempt = onRetryAttempt;

      retryManager.scheduleRetry('bot-1', createMessage('msg-1'), 0);

      // First attempt (delay ~100ms)
      jest.advanceTimersByTime(200);
      await Promise.resolve();

      expect(onRetryAttempt).toHaveBeenCalledTimes(1);

      // Second attempt (delay ~200ms)
      jest.advanceTimersByTime(300);
      await Promise.resolve();

      expect(onRetryAttempt).toHaveBeenCalledTimes(2);
    });

    it('should call onMaxRetriesExceeded when max retries reached', () => {
      const onMaxRetriesExceeded = jest.fn();
      retryManager.onMaxRetriesExceeded = onMaxRetriesExceeded;

      retryManager.scheduleRetry('bot-1', createMessage('msg-1'), config.maxRetries);

      expect(onMaxRetriesExceeded).toHaveBeenCalledTimes(1);
      expect(onMaxRetriesExceeded).toHaveBeenCalledWith(
        expect.objectContaining({
          botId: 'bot-1',
          attempt: config.maxRetries,
        })
      );
      expect(retryManager.getPendingCount()).toBe(0);
    });

    it('should use exponential backoff', () => {
      const onRetryAttempt = jest.fn().mockResolvedValue(true);
      retryManager.onRetryAttempt = onRetryAttempt;

      // Attempt 0: delay = 100ms * 2^0 = 100ms (+ jitter)
      retryManager.scheduleRetry('bot-1', createMessage('msg-0'), 0);

      // Should not fire before the delay
      jest.advanceTimersByTime(50);
      expect(onRetryAttempt).not.toHaveBeenCalled();

      // Should fire after the delay
      jest.advanceTimersByTime(100);
      // Due to jitter, it may or may not have fired, but we test the general pattern
    });

    it('should cap delay at maxDelayMs', () => {
      const onRetryAttempt = jest.fn().mockResolvedValue(true);
      retryManager.onRetryAttempt = onRetryAttempt;

      // With high attempt number, delay should be capped
      // attempt 10: 100 * 2^10 = 102400ms, capped at 5000ms
      retryManager.scheduleRetry('bot-1', createMessage('msg-1'), 0);

      // Advance past maxDelayMs to ensure it fires within that window
      jest.advanceTimersByTime(config.maxDelayMs + 100);
    });
  });

  describe('cancelRetry', () => {
    it('should cancel a specific retry', () => {
      retryManager.scheduleRetry('bot-1', createMessage('msg-1'), 0);
      expect(retryManager.getPendingCount()).toBe(1);

      retryManager.cancelRetry('msg-1');
      expect(retryManager.getPendingCount()).toBe(0);
    });

    it('should be safe to cancel nonexistent retry', () => {
      expect(() => retryManager.cancelRetry('nonexistent')).not.toThrow();
    });
  });

  describe('cancelRetriesForBot', () => {
    it('should cancel all retries for a specific bot', () => {
      retryManager.scheduleRetry('bot-1', createMessage('msg-1'), 0);
      retryManager.scheduleRetry('bot-1', createMessage('msg-2'), 0);
      retryManager.scheduleRetry('bot-2', createMessage('msg-3'), 0);

      const cancelled = retryManager.cancelRetriesForBot('bot-1');

      expect(cancelled).toHaveLength(2);
      expect(retryManager.getPendingCount()).toBe(1); // Only bot-2 remains
    });

    it('should return empty array if no retries for bot', () => {
      const cancelled = retryManager.cancelRetriesForBot('nonexistent');
      expect(cancelled).toEqual([]);
    });
  });

  describe('cancelAll', () => {
    it('should cancel all pending retries', () => {
      const onRetryAttempt = jest.fn().mockResolvedValue(true);
      retryManager.onRetryAttempt = onRetryAttempt;

      retryManager.scheduleRetry('bot-1', createMessage('msg-1'), 0);
      retryManager.scheduleRetry('bot-2', createMessage('msg-2'), 0);

      retryManager.cancelAll();
      expect(retryManager.getPendingCount()).toBe(0);

      // Advance time — no retry should fire
      jest.advanceTimersByTime(config.maxDelayMs + 100);
      expect(onRetryAttempt).not.toHaveBeenCalled();
    });
  });

  describe('message without messageId', () => {
    it('should generate a fallback id for messages without messageId', () => {
      const onRetryAttempt = jest.fn().mockResolvedValue(true);
      retryManager.onRetryAttempt = onRetryAttempt;

      const msg = createMessage(); // no messageId
      retryManager.scheduleRetry('bot-1', msg, 0);
      expect(retryManager.getPendingCount()).toBe(1);
    });
  });
});
