/**
 * MessageStore Unit Tests
 */

import { MessageStore } from '../message-store';
import type { PersistenceConfig, ServerMessage } from '../interface';
import { REDIS_KEYS } from '../interface';

// Mock Redis client
function createMockRedis() {
  const store = new Map<string, string[]>();

  return {
    lpush: jest.fn(async (key: string, value: string) => {
      const list = store.get(key) || [];
      list.unshift(value); // LPUSH prepends
      store.set(key, list);
      return list.length;
    }),
    lrange: jest.fn(async (key: string, start: number, stop: number) => {
      const list = store.get(key) || [];
      return list.slice(start, stop + 1);
    }),
    ltrim: jest.fn(async (key: string, start: number, stop: number) => {
      const list = store.get(key) || [];
      store.set(key, list.slice(start, stop + 1));
      return 'OK';
    }),
    llen: jest.fn(async (key: string) => {
      return store.get(key)?.length ?? 0;
    }),
    expire: jest.fn(async () => 1),
    _store: store,
  };
}

const config: PersistenceConfig = {
  enabled: true,
  ttlSeconds: 604800,
  maxMessagesPerBot: 10,
};

const createMessage = (id: string = '1', messageId?: string): ServerMessage => ({
  type: 'task_assigned',
  payload: { taskId: id },
  timestamp: new Date().toISOString(),
  messageId,
});

describe('MessageStore - Memory mode', () => {
  let store: MessageStore;

  beforeEach(() => {
    store = new MessageStore(null, config);
  });

  it('should store and retrieve messages', async () => {
    const msg = createMessage('1');
    await store.store('bot-1', msg);

    const history = await store.getHistory('bot-1');
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(msg);
  });

  it('should return messages in newest-first order', async () => {
    await store.store('bot-1', createMessage('1'));
    await store.store('bot-1', createMessage('2'));
    await store.store('bot-1', createMessage('3'));

    const history = await store.getHistory('bot-1');
    expect(history).toHaveLength(3);
    expect(history[0].payload).toEqual({ taskId: '3' });
    expect(history[1].payload).toEqual({ taskId: '2' });
    expect(history[2].payload).toEqual({ taskId: '1' });
  });

  it('should respect limit and offset', async () => {
    for (let i = 0; i < 5; i++) {
      await store.store('bot-1', createMessage(String(i)));
    }

    const page1 = await store.getHistory('bot-1', { limit: 2, offset: 0 });
    expect(page1).toHaveLength(2);

    const page2 = await store.getHistory('bot-1', { limit: 2, offset: 2 });
    expect(page2).toHaveLength(2);
  });

  it('should trim to maxMessagesPerBot', async () => {
    for (let i = 0; i < config.maxMessagesPerBot + 5; i++) {
      await store.store('bot-1', createMessage(String(i)));
    }

    const count = await store.getMessageCount('bot-1');
    expect(count).toBe(config.maxMessagesPerBot);
  });

  it('should find message by messageId', async () => {
    await store.store('bot-1', createMessage('1', 'msg-1'));
    await store.store('bot-1', createMessage('2', 'msg-2'));

    const found = await store.getMessage('bot-1', 'msg-2');
    expect(found).toBeDefined();
    expect(found!.messageId).toBe('msg-2');
  });

  it('should return null for unknown messageId', async () => {
    await store.store('bot-1', createMessage('1', 'msg-1'));

    const found = await store.getMessage('bot-1', 'nonexistent');
    expect(found).toBeNull();
  });

  it('should return empty history for unknown bot', async () => {
    const history = await store.getHistory('unknown-bot');
    expect(history).toEqual([]);
  });

  it('should return 0 count for unknown bot', async () => {
    const count = await store.getMessageCount('unknown-bot');
    expect(count).toBe(0);
  });
});

describe('MessageStore - Redis mode', () => {
  let store: MessageStore;
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    mockRedis = createMockRedis();
    store = new MessageStore(mockRedis as any, config);
  });

  it('should store to Redis with LPUSH', async () => {
    const msg = createMessage();
    await store.store('bot-1', msg);

    expect(mockRedis.lpush).toHaveBeenCalledWith(
      REDIS_KEYS.MESSAGE_HISTORY('bot-1'),
      JSON.stringify(msg)
    );
  });

  it('should trim and set expire on store', async () => {
    await store.store('bot-1', createMessage());

    expect(mockRedis.ltrim).toHaveBeenCalledWith(
      REDIS_KEYS.MESSAGE_HISTORY('bot-1'),
      0,
      config.maxMessagesPerBot - 1
    );
    expect(mockRedis.expire).toHaveBeenCalledWith(
      REDIS_KEYS.MESSAGE_HISTORY('bot-1'),
      config.ttlSeconds
    );
  });

  it('should retrieve history from Redis', async () => {
    const msg = createMessage();
    await store.store('bot-1', msg);

    const history = await store.getHistory('bot-1', { limit: 10, offset: 0 });
    expect(mockRedis.lrange).toHaveBeenCalledWith(
      REDIS_KEYS.MESSAGE_HISTORY('bot-1'),
      0,
      9
    );
    expect(history).toHaveLength(1);
  });

  it('should get count from Redis', async () => {
    await store.store('bot-1', createMessage());
    await store.store('bot-1', createMessage());

    const count = await store.getMessageCount('bot-1');
    expect(count).toBe(2);
    expect(mockRedis.llen).toHaveBeenCalled();
  });

  it('should fallback to memory on Redis store error', async () => {
    mockRedis.lpush.mockRejectedValueOnce(new Error('Redis down'));

    const msg = createMessage();
    // Should not throw
    await store.store('bot-1', msg);
  });

  it('should fallback to memory on Redis getHistory error', async () => {
    mockRedis.lrange.mockRejectedValueOnce(new Error('Redis down'));

    const history = await store.getHistory('bot-1');
    expect(history).toEqual([]);
  });
});
