/**
 * TaskPoller Tests
 */

import { TaskPoller } from '../poller';
import { MockCapabilityRegistry } from '@clawteam/api/capability-registry';
import { REDIS_KEYS } from '../constants';
import type { Task } from '@clawteam/shared/types';

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
  const lists = new Map<string, string[]>();
  const hashes = new Map<string, Map<string, string>>();

  return {
    get: jest.fn(async (key: string) => null),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(async (key: string) => hashes.has(key)),
    expire: jest.fn(async () => true),
    ttl: jest.fn(async () => -1),
    mget: jest.fn(),
    mset: jest.fn(),
    hget: jest.fn(async (key: string, field: string) => {
      return hashes.get(key)?.get(field) ?? null;
    }),
    hset: jest.fn(async (key: string, field: string, value: string) => {
      if (!hashes.has(key)) hashes.set(key, new Map());
      hashes.get(key)!.set(field, value);
      return 1;
    }),
    hgetall: jest.fn(),
    hdel: jest.fn(),
    lpush: jest.fn(),
    rpush: jest.fn(),
    lpop: jest.fn(),
    rpop: jest.fn(),
    lrange: jest.fn(async (key: string, start: number, stop: number) => {
      const list = lists.get(key) || [];
      return list.slice(start, stop + 1);
    }),
    llen: jest.fn(async (key: string) => (lists.get(key) || []).length),
    lrem: jest.fn(),
    sadd: jest.fn(),
    srem: jest.fn(),
    smembers: jest.fn(async () => []),
    sismember: jest.fn(async () => false),
    getClient: jest.fn(),
    duplicate: jest.fn(),
    close: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
    _lists: lists,
    _hashes: hashes,
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

describe('TaskPoller', () => {
  let poller: TaskPoller;
  let db: ReturnType<typeof createMockDb>;
  let redis: ReturnType<typeof createMockRedis>;
  let registry: MockCapabilityRegistry;
  let logger: ReturnType<typeof createMockLogger>;

  const sampleTask: Task = {
    id: 'task-1',
    fromBotId: 'bot-a',
    toBotId: 'bot-b',
    capability: 'test',
    parameters: { key: 'val' },
    status: 'pending',
    priority: 'normal',
    timeoutSeconds: 300,
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    db = createMockDb();
    redis = createMockRedis();
    registry = new MockCapabilityRegistry();
    logger = createMockLogger();

    poller = new TaskPoller({
      db: db as any,
      redis: redis as any,
      registry,
      logger: logger as any,
    });
  });

  describe('poll', () => {
    it('should return empty array when no tasks in queue', async () => {
      const tasks = await poller.poll('bot-b');
      expect(tasks).toHaveLength(0);
    });

    it('should return tasks from Redis cache', async () => {
      // Add task to queue
      const queueKey = `${REDIS_KEYS.TASK_QUEUE}:bot-b:normal`;
      redis._lists.set(queueKey, ['task-1']);

      // Add task to cache
      const cacheKey = `${REDIS_KEYS.TASK_CACHE}:task-1`;
      redis._hashes.set(cacheKey, new Map([
        ['data', JSON.stringify(sampleTask)],
      ]));

      const tasks = await poller.poll('bot-b');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-1');
      expect(tasks[0].capability).toBe('test');
    });

    it('should respect priority ordering', async () => {
      const urgentTask: Task = { ...sampleTask, id: 'task-urgent', priority: 'urgent', capability: 'urgent-cap' };
      const normalTask: Task = { ...sampleTask, id: 'task-normal', priority: 'normal', capability: 'normal-cap' };

      redis._lists.set(`${REDIS_KEYS.TASK_QUEUE}:bot-b:urgent`, ['task-urgent']);
      redis._lists.set(`${REDIS_KEYS.TASK_QUEUE}:bot-b:normal`, ['task-normal']);

      redis._hashes.set(`${REDIS_KEYS.TASK_CACHE}:task-urgent`, new Map([
        ['data', JSON.stringify(urgentTask)],
      ]));
      redis._hashes.set(`${REDIS_KEYS.TASK_CACHE}:task-normal`, new Map([
        ['data', JSON.stringify(normalTask)],
      ]));

      const tasks = await poller.poll('bot-b');
      expect(tasks).toHaveLength(2);
      expect(tasks[0].id).toBe('task-urgent');
      expect(tasks[1].id).toBe('task-normal');
    });

    it('should respect limit parameter', async () => {
      redis._lists.set(`${REDIS_KEYS.TASK_QUEUE}:bot-b:normal`, ['t1', 't2', 't3']);

      redis._hashes.set(`${REDIS_KEYS.TASK_CACHE}:t1`, new Map([
        ['data', JSON.stringify({ ...sampleTask, id: 't1' })],
      ]));
      redis._hashes.set(`${REDIS_KEYS.TASK_CACHE}:t2`, new Map([
        ['data', JSON.stringify({ ...sampleTask, id: 't2' })],
      ]));
      redis._hashes.set(`${REDIS_KEYS.TASK_CACHE}:t3`, new Map([
        ['data', JSON.stringify({ ...sampleTask, id: 't3' })],
      ]));

      const tasks = await poller.poll('bot-b', 2);
      expect(tasks).toHaveLength(2);
    });

    it('should clamp limit to MAX_POLL_LIMIT', async () => {
      const tasks = await poller.poll('bot-b', 999);
      // Should not throw, just use the clamped value
      expect(tasks).toHaveLength(0);
    });

    it('should fall back to database when cache misses', async () => {
      redis._lists.set(`${REDIS_KEYS.TASK_QUEUE}:bot-b:normal`, ['task-db']);

      // No cache entry — should hit DB
      const now = new Date();
      db.query.mockResolvedValueOnce({
        rows: [{
          id: 'task-db',
          from_bot_id: 'bot-a',
          to_bot_id: 'bot-b',
          capability: 'db-test',
          parameters: {},
          status: 'pending',
          priority: 'normal',
          result: null,
          error: null,
          timeout_seconds: 300,
          retry_count: 0,
          max_retries: 3,
          created_at: now,
          accepted_at: null,
          started_at: null,
          completed_at: null,
          human_context: null,
          conversation_id: null,
          workflow_id: null,
          metadata: null,
        }],
        rowCount: 1,
      });

      const tasks = await poller.poll('bot-b');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-db');
      expect(tasks[0].capability).toBe('db-test');

      // Should have written back to cache
      expect(redis.hset).toHaveBeenCalled();
    });

    it('should skip tasks not found in cache or database', async () => {
      redis._lists.set(`${REDIS_KEYS.TASK_QUEUE}:bot-b:normal`, ['ghost-task']);

      // No cache, no DB result
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const tasks = await poller.poll('bot-b');
      expect(tasks).toHaveLength(0);
    });
  });
});
