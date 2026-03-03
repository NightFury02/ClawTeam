/**
 * OfflineQueue Unit Tests
 */

import { OfflineQueue } from '../offline-queue';
import type { OfflineQueueConfig, ServerMessage } from '../interface';
import { REDIS_KEYS } from '../interface';

// Mock Redis client
function createMockRedis() {
  const store = new Map<string, string[]>();

  return {
    rpush: jest.fn(async (key: string, value: string) => {
      const list = store.get(key) || [];
      list.push(value);
      store.set(key, list);
      return list.length;
    }),
    lrange: jest.fn(async (key: string, start: number, stop: number) => {
      const list = store.get(key) || [];
      if (stop === -1) return [...list];
      return list.slice(start, stop + 1);
    }),
    llen: jest.fn(async (key: string) => {
      return store.get(key)?.length ?? 0;
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    expire: jest.fn(async () => 1),
    _store: store,
  };
}

const config: OfflineQueueConfig = {
  enabled: true,
  maxQueueSize: 5,
  messageTtlSeconds: 86400,
};

const createMessage = (taskId: string = '123'): ServerMessage => ({
  type: 'task_assigned',
  payload: { taskId },
  timestamp: new Date().toISOString(),
});

describe('OfflineQueue - Memory mode (no Redis)', () => {
  let queue: OfflineQueue;

  beforeEach(() => {
    queue = new OfflineQueue(null, config);
  });

  it('should enqueue and flush messages', async () => {
    const msg1 = createMessage('1');
    const msg2 = createMessage('2');

    await queue.enqueue('bot-1', msg1);
    await queue.enqueue('bot-1', msg2);

    const messages = await queue.flush('bot-1');
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual(msg1);
    expect(messages[1]).toEqual(msg2);
  });

  it('should return empty array when flushing empty queue', async () => {
    const messages = await queue.flush('bot-1');
    expect(messages).toEqual([]);
  });

  it('should clear queue after flush', async () => {
    await queue.enqueue('bot-1', createMessage());
    await queue.flush('bot-1');

    const size = await queue.getQueueSize('bot-1');
    expect(size).toBe(0);
  });

  it('should reject when queue is full', async () => {
    for (let i = 0; i < config.maxQueueSize; i++) {
      const result = await queue.enqueue('bot-1', createMessage(String(i)));
      expect(result).toBe(true);
    }

    // Queue is full
    const result = await queue.enqueue('bot-1', createMessage('overflow'));
    expect(result).toBe(false);
  });

  it('should track queue size correctly', async () => {
    expect(await queue.getQueueSize('bot-1')).toBe(0);

    await queue.enqueue('bot-1', createMessage());
    expect(await queue.getQueueSize('bot-1')).toBe(1);

    await queue.enqueue('bot-1', createMessage());
    expect(await queue.getQueueSize('bot-1')).toBe(2);
  });

  it('should clear queue for a bot', async () => {
    await queue.enqueue('bot-1', createMessage());
    await queue.enqueue('bot-1', createMessage());

    await queue.clear('bot-1');
    expect(await queue.getQueueSize('bot-1')).toBe(0);
  });

  it('should maintain separate queues per bot', async () => {
    await queue.enqueue('bot-1', createMessage('1'));
    await queue.enqueue('bot-2', createMessage('2'));

    const bot1Messages = await queue.flush('bot-1');
    const bot2Messages = await queue.flush('bot-2');

    expect(bot1Messages).toHaveLength(1);
    expect(bot2Messages).toHaveLength(1);
    expect(bot1Messages[0].payload).toEqual({ taskId: '1' });
    expect(bot2Messages[0].payload).toEqual({ taskId: '2' });
  });
});

describe('OfflineQueue - Redis mode', () => {
  let queue: OfflineQueue;
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    mockRedis = createMockRedis();
    queue = new OfflineQueue(mockRedis as any, config);
  });

  it('should enqueue to Redis', async () => {
    const msg = createMessage();
    const result = await queue.enqueue('bot-1', msg);

    expect(result).toBe(true);
    expect(mockRedis.rpush).toHaveBeenCalledWith(
      REDIS_KEYS.OFFLINE_QUEUE('bot-1'),
      JSON.stringify(msg)
    );
    expect(mockRedis.expire).toHaveBeenCalledWith(
      REDIS_KEYS.OFFLINE_QUEUE('bot-1'),
      config.messageTtlSeconds
    );
  });

  it('should flush from Redis', async () => {
    const msg = createMessage();
    await queue.enqueue('bot-1', msg);

    const messages = await queue.flush('bot-1');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(msg);
    expect(mockRedis.del).toHaveBeenCalledWith(REDIS_KEYS.OFFLINE_QUEUE('bot-1'));
  });

  it('should reject when Redis queue is full', async () => {
    for (let i = 0; i < config.maxQueueSize; i++) {
      await queue.enqueue('bot-1', createMessage(String(i)));
    }

    const result = await queue.enqueue('bot-1', createMessage('overflow'));
    expect(result).toBe(false);
  });

  it('should get queue size from Redis', async () => {
    await queue.enqueue('bot-1', createMessage());
    await queue.enqueue('bot-1', createMessage());

    const size = await queue.getQueueSize('bot-1');
    expect(size).toBe(2);
    expect(mockRedis.llen).toHaveBeenCalled();
  });

  it('should fallback to memory on Redis error during enqueue', async () => {
    mockRedis.llen.mockRejectedValueOnce(new Error('Redis down'));

    const msg = createMessage();
    const result = await queue.enqueue('bot-1', msg);

    // Should succeed using memory fallback
    expect(result).toBe(true);
  });

  it('should fallback to memory on Redis error during flush', async () => {
    // Enqueue to memory fallback first
    mockRedis.lrange.mockRejectedValueOnce(new Error('Redis down'));

    const messages = await queue.flush('bot-1');
    expect(messages).toEqual([]);
  });
});
