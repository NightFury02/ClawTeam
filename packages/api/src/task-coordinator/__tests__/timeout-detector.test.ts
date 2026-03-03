/**
 * TimeoutDetector Tests
 */

import { TimeoutDetector } from '../timeout-detector';
import { MockMessageBus } from '@clawteam/api/message-bus';
import { REDIS_KEYS } from '../constants';

function createMockDb() {
  return {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    getClient: jest.fn(),
    transaction: jest.fn(),
    close: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
  };
}

function createMockRedis() {
  return {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(async () => 1),
    exists: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
    mget: jest.fn(),
    mset: jest.fn(),
    hget: jest.fn(),
    hset: jest.fn(),
    hgetall: jest.fn(),
    hdel: jest.fn(),
    lpush: jest.fn(),
    rpush: jest.fn(async () => 1),
    lpop: jest.fn(),
    rpop: jest.fn(),
    lrange: jest.fn(async () => []),
    llen: jest.fn(async () => 0),
    lrem: jest.fn(async () => 0),
    sadd: jest.fn(),
    srem: jest.fn(),
    smembers: jest.fn(async () => []),
    sismember: jest.fn(async () => false),
    zadd: jest.fn(),
    zrem: jest.fn(async () => 1),
    zrangebyscore: jest.fn(async () => []),
    getClient: jest.fn(),
    duplicate: jest.fn(),
    close: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
  };
}

function createMockLogger() {
  return {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn().mockReturnThis(),
  };
}

function createTimeoutRow(overrides: Record<string, any> = {}) {
  const pastDate = new Date(Date.now() - 600_000); // 10 minutes ago
  return {
    id: 'task-timeout',
    from_bot_id: 'bot-a',
    to_bot_id: 'bot-b',
    capability: 'test',
    parameters: {},
    status: 'pending',
    priority: 'normal',
    result: null,
    error: null,
    timeout_seconds: 300,
    retry_count: 0,
    max_retries: 3,
    created_at: pastDate,
    accepted_at: null,
    started_at: null,
    completed_at: null,
    human_context: null,
    conversation_id: null,
    workflow_id: null,
    metadata: null,
    ...overrides,
  };
}

describe('TimeoutDetector', () => {
  let detector: TimeoutDetector;
  let db: ReturnType<typeof createMockDb>;
  let redis: ReturnType<typeof createMockRedis>;
  let messageBus: MockMessageBus;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    jest.useFakeTimers();
    db = createMockDb();
    redis = createMockRedis();
    messageBus = new MockMessageBus();
    logger = createMockLogger();

    detector = new TimeoutDetector({
      db: db as any,
      redis: redis as any,
      messageBus,
      logger: logger as any,
      checkIntervalMs: 1000, // Short interval for testing
    });
  });

  afterEach(() => {
    detector.stop();
    jest.useRealTimers();
  });

  describe('start/stop', () => {
    it('should start the interval timer', () => {
      detector.start();
      expect(logger.info).toHaveBeenCalledWith(
        'Starting timeout detector',
        expect.any(Object)
      );
    });

    it('should warn if already started', () => {
      detector.start();
      detector.start();
      expect(logger.warn).toHaveBeenCalledWith('TimeoutDetector already started');
    });

    it('should stop the interval timer', () => {
      detector.start();
      detector.stop();
      expect(logger.info).toHaveBeenCalledWith('Timeout detector stopped');
    });

    it('should be safe to stop when not started', () => {
      detector.stop();
      // Should not throw
    });
  });

  describe('detectTimeouts', () => {
    it('should return 0 when no tasks are timed out', async () => {
      const count = await detector.detectTimeouts();
      expect(count).toBe(0);
    });

    it('should retry task with remaining retries', async () => {
      const row = createTimeoutRow({ retry_count: 0, max_retries: 3 });
      db.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const count = await detector.detectTimeouts();
      expect(count).toBe(1);

      // Should update retry count
      const updateCall = db.query.mock.calls[1];
      expect(updateCall[0]).toContain("status = 'pending'");
      expect(updateCall[1][0]).toBe(1); // newRetryCount

      // Should re-enqueue
      expect(redis.rpush).toHaveBeenCalled();

      // Should remove from processing ZSET
      expect(redis.zrem).toHaveBeenCalledWith(REDIS_KEYS.PROCESSING_SET, 'task-timeout');
    });

    it('should mark task as timeout when retries exhausted', async () => {
      const row = createTimeoutRow({ retry_count: 3, max_retries: 3 });
      db.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const count = await detector.detectTimeouts();
      expect(count).toBe(1);

      // Should update status to timeout
      const updateCall = db.query.mock.calls[1];
      expect(updateCall[0]).toContain("status = 'timeout'");

      // Should clean up Redis
      expect(redis.lrem).toHaveBeenCalled();
      expect(redis.zrem).toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalled();

      // Should notify originating bot
      const messages = messageBus.getPublishedMessages();
      expect(messages.some(m => m.event === 'task_failed')).toBe(true);
    });

    it('should handle multiple timeout tasks', async () => {
      const rows = [
        createTimeoutRow({ id: 't1', retry_count: 0 }),
        createTimeoutRow({ id: 't2', retry_count: 3, max_retries: 3 }),
      ];
      db.query.mockResolvedValueOnce({ rows, rowCount: 2 });

      const count = await detector.detectTimeouts();
      expect(count).toBe(2);
    });

    it('should not fail when message bus publish fails', async () => {
      const row = createTimeoutRow({ retry_count: 3, max_retries: 3 });
      db.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      // Replace messageBus with a failing one
      const failingBus = new MockMessageBus();
      failingBus.publish = jest.fn().mockRejectedValue(new Error('bus down'));

      const failDetector = new TimeoutDetector({
        db: db as any,
        redis: redis as any,
        messageBus: failingBus,
        logger: logger as any,
        checkIntervalMs: 1000,
      });

      const count = await failDetector.detectTimeouts();
      expect(count).toBe(1);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
