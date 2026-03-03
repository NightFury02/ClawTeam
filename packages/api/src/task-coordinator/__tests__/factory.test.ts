/**
 * Factory Function Tests - createTaskCoordinator
 */

import { createTaskCoordinator, MockTaskCoordinator, TaskCoordinatorImpl } from '../index';
import { MockCapabilityRegistry } from '@clawteam/api/capability-registry';
import { MockMessageBus } from '@clawteam/api/message-bus';

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
    get: jest.fn(async () => null),
    set: jest.fn(),
    del: jest.fn(async () => 1),
    exists: jest.fn(async () => false),
    expire: jest.fn(async () => true),
    ttl: jest.fn(async () => -1),
    mget: jest.fn(),
    mset: jest.fn(),
    hget: jest.fn(async () => null),
    hset: jest.fn(async () => 1),
    hgetall: jest.fn(async () => ({})),
    hdel: jest.fn(async () => 1),
    lpush: jest.fn(async () => 1),
    rpush: jest.fn(async () => 1),
    lpop: jest.fn(async () => null),
    rpop: jest.fn(async () => null),
    lrange: jest.fn(async () => []),
    llen: jest.fn(async () => 0),
    lrem: jest.fn(async () => 0),
    sadd: jest.fn(),
    srem: jest.fn(),
    smembers: jest.fn(async () => []),
    sismember: jest.fn(async () => false),
    zadd: jest.fn(async () => 1),
    zrem: jest.fn(async () => 1),
    zrangebyscore: jest.fn(async () => []),
    hincrby: jest.fn(async () => 1),
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

describe('createTaskCoordinator', () => {
  describe('Mock mode', () => {
    it('should return MockTaskCoordinator when useMock is true', () => {
      const coordinator = createTaskCoordinator({ useMock: true });
      expect(coordinator).toBeInstanceOf(MockTaskCoordinator);
    });

    it('should have all ITaskCoordinator methods', () => {
      const coordinator = createTaskCoordinator({ useMock: true });
      expect(typeof coordinator.createTask).toBe('function');
      expect(typeof coordinator.delegate).toBe('function');
      expect(typeof coordinator.poll).toBe('function');
      expect(typeof coordinator.accept).toBe('function');
      expect(typeof coordinator.complete).toBe('function');
      expect(typeof coordinator.cancel).toBe('function');
      expect(typeof coordinator.getTask).toBe('function');
      expect(typeof coordinator.getTasksByBot).toBe('function');
      expect(typeof coordinator.retry).toBe('function');
      expect(typeof coordinator.cleanupExpiredTasks).toBe('function');
    });

    it('should work end-to-end in mock mode', async () => {
      const coordinator = createTaskCoordinator({ useMock: true });

      const task = await coordinator.createTask(
        { prompt: 'test task', capability: 'test', parameters: {} },
        'bot-a'
      );
      await coordinator.delegate(task.id, 'bot-b');
      expect(task.status).toBe('pending');

      const tasks = await coordinator.poll('bot-b');
      expect(tasks).toHaveLength(1);

      await coordinator.accept(task.id, 'bot-b');
      await coordinator.complete(task.id, { status: 'completed', result: 42 }, 'bot-b');

      const completed = await coordinator.getTask(task.id, 'bot-a');
      expect(completed?.status).toBe('completed');
      expect(completed?.result).toBe(42);
    });
  });

  describe('Real mode', () => {
    it('should return TaskCoordinatorImpl when useMock is false/omitted', () => {
      const coordinator = createTaskCoordinator({
        db: createMockDb() as any,
        redis: createMockRedis() as any,
        registry: new MockCapabilityRegistry(),
        messageBus: new MockMessageBus(),
        logger: createMockLogger() as any,
      });

      expect(coordinator).toBeInstanceOf(TaskCoordinatorImpl);
    });

    it('should expose timeoutDetector', () => {
      const coordinator = createTaskCoordinator({
        db: createMockDb() as any,
        redis: createMockRedis() as any,
        registry: new MockCapabilityRegistry(),
        messageBus: new MockMessageBus(),
        logger: createMockLogger() as any,
      });

      expect(coordinator.timeoutDetector).toBeDefined();
      expect(typeof coordinator.timeoutDetector!.start).toBe('function');
      expect(typeof coordinator.timeoutDetector!.stop).toBe('function');
    });

    it('should have all ITaskCoordinator methods', () => {
      const coordinator = createTaskCoordinator({
        db: createMockDb() as any,
        redis: createMockRedis() as any,
        registry: new MockCapabilityRegistry(),
        messageBus: new MockMessageBus(),
        logger: createMockLogger() as any,
      });

      expect(typeof coordinator.createTask).toBe('function');
      expect(typeof coordinator.delegate).toBe('function');
      expect(typeof coordinator.poll).toBe('function');
      expect(typeof coordinator.accept).toBe('function');
      expect(typeof coordinator.complete).toBe('function');
      expect(typeof coordinator.cancel).toBe('function');
      expect(typeof coordinator.getTask).toBe('function');
      expect(typeof coordinator.getTasksByBot).toBe('function');
      expect(typeof coordinator.retry).toBe('function');
      expect(typeof coordinator.cleanupExpiredTasks).toBe('function');
    });

    it('should delegate to dispatcher on delegate()', async () => {
      const db = createMockDb();
      const redis = createMockRedis();
      const registry = new MockCapabilityRegistry();
      const messageBus = new MockMessageBus();
      const logger = createMockLogger();

      // Register a target bot so dispatcher.delegate passes validation
      const regResult = await registry.register({
        name: 'target',
        ownerEmail: 'test@test.com',
        capabilities: [{ name: 'test', description: 'test', async: false, estimatedTime: '1s' }],
      });

      const coordinator = createTaskCoordinator({
        db: db as any,
        redis: redis as any,
        registry,
        messageBus,
        logger: logger as any,
      });

      // Step 1: createTask inserts into DB
      const task = await coordinator.createTask(
        { prompt: 'test task', capability: 'test', parameters: { x: 1 } },
        'from-bot'
      );

      expect(task.id).toBeDefined();
      expect(task.status).toBe('pending');

      // DB should have been called (INSERT for createTask)
      expect(db.query).toHaveBeenCalled();

      // Step 2: delegate enqueues to Redis
      // Set up DB mock to return the task row when delegate does SELECT
      db.query.mockResolvedValueOnce({
        rows: [{
          id: task.id,
          from_bot_id: 'from-bot',
          to_bot_id: '',
          prompt: 'test task',
          capability: 'test',
          parameters: '{"x":1}',
          status: 'pending',
          priority: 'normal',
          type: 'new',
          timeout_seconds: 300,
          retry_count: 0,
          max_retries: 3,
          created_at: new Date(),
        }],
        rowCount: 1,
      });
      // UPDATE to_bot_id
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // INSERT message
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await coordinator.delegate(task.id, regResult.botId);

      // Redis should have been called (rpush + hset for task queue, lpush for inbox)
      expect(redis.rpush).toHaveBeenCalled();
      expect(redis.hset).toHaveBeenCalled();
      expect(redis.lpush).toHaveBeenCalled();
    });
  });
});
