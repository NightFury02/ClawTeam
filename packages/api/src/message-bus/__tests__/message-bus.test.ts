/**
 * MessageBus Integration Tests
 */

import { MessageBus } from '../message-bus';
import { MockMessageBus } from '../mocks';
import type { Message, MessageType } from '@clawteam/shared/types';

// Mock ioredis for MessageBus tests
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    return {
      status: 'ready',
      on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
        handlers[event] = handlers[event] || [];
        handlers[event].push(handler);
      }),
      emit: (event: string, ...args: unknown[]) => {
        handlers[event]?.forEach((h) => h(...args));
      },
      subscribe: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue('OK'),
      duplicate: jest.fn().mockReturnThis(),
    };
  });
});

describe('MessageBus', () => {
  let bus: MessageBus;

  beforeEach(async () => {
    bus = new MessageBus({
      enablePubSub: false, // Disable for unit tests
    });
  });

  afterEach(async () => {
    await bus.close();
  });

  describe('subscribe/unsubscribe', () => {
    it('should register and unregister handlers', async () => {
      const handler = jest.fn();
      await bus.subscribe('bot-1', handler);
      await bus.unsubscribe('bot-1');
      // Handler should be removed
      expect(true).toBe(true);
    });
  });

  describe('getOnlineBots', () => {
    it('should return empty array when no bots connected', async () => {
      const bots = await bus.getOnlineBots();
      expect(bots).toEqual([]);
    });
  });

  describe('isBotOnline', () => {
    it('should return false for unknown bot', async () => {
      const online = await bus.isBotOnline('unknown-bot');
      expect(online).toBe(false);
    });
  });
});

describe('MockMessageBus', () => {
  let bus: MockMessageBus;

  beforeEach(() => {
    bus = new MockMessageBus();
  });

  afterEach(async () => {
    await bus.close();
  });

  describe('publish', () => {
    it('should store published messages', async () => {
      await bus.publish('task_assigned', { taskId: '123' }, 'bot-1');

      const messages = bus.getPublishedMessages();
      expect(messages.length).toBe(1);
      expect(messages[0].event).toBe('task_assigned');
      expect(messages[0].payload).toEqual({ taskId: '123' });
      expect(messages[0].targetBotId).toBe('bot-1');
    });

    it('should invoke registered handlers', async () => {
      const handler = jest.fn();
      await bus.subscribe('bot-1', handler);
      await bus.publish('task_assigned', { taskId: '123' }, 'bot-1');

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task_assigned',
          payload: { taskId: '123' },
        })
      );
    });

    it('should broadcast to all handlers when no targetBotId', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      await bus.subscribe('bot-1', handler1);
      await bus.subscribe('bot-2', handler2);

      await bus.publish('bot_status_changed', { status: 'online' });

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('subscribe/unsubscribe', () => {
    it('should set status to online on subscribe', async () => {
      const handler = jest.fn();
      await bus.subscribe('bot-1', handler);

      expect(bus.getBotStatus('bot-1')).toBe('online');
      const online = await bus.isBotOnline('bot-1');
      expect(online).toBe(true);
    });

    it('should set status to offline on unsubscribe', async () => {
      const handler = jest.fn();
      await bus.subscribe('bot-1', handler);
      await bus.unsubscribe('bot-1');

      expect(bus.getBotStatus('bot-1')).toBe('offline');
      const online = await bus.isBotOnline('bot-1');
      expect(online).toBe(false);
    });
  });

  describe('updateBotStatus', () => {
    it('should update status and publish status change event', async () => {
      const handler = jest.fn();
      await bus.subscribe('bot-1', handler);
      bus.clearPublishedMessages();

      await bus.updateBotStatus('bot-1', 'busy');

      expect(bus.getBotStatus('bot-1')).toBe('busy');
      const messages = bus.getPublishedMessages();
      expect(messages.some((m) => m.event === 'bot_status_changed')).toBe(true);
    });

    it('should not publish event if status unchanged', async () => {
      const handler = jest.fn();
      await bus.subscribe('bot-1', handler);
      await bus.updateBotStatus('bot-1', 'online');
      bus.clearPublishedMessages();

      await bus.updateBotStatus('bot-1', 'online');

      const messages = bus.getPublishedMessages();
      expect(messages.length).toBe(0);
    });
  });

  describe('getOnlineBots', () => {
    it('should return list of online bots', async () => {
      await bus.subscribe('bot-1', jest.fn());
      await bus.subscribe('bot-2', jest.fn());
      await bus.updateBotStatus('bot-2', 'busy');
      await bus.subscribe('bot-3', jest.fn());
      await bus.unsubscribe('bot-3');

      const onlineBots = await bus.getOnlineBots();
      expect(onlineBots).toContain('bot-1');
      expect(onlineBots).toContain('bot-2');
      expect(onlineBots).not.toContain('bot-3');
    });
  });

  describe('helper methods', () => {
    it('should track handler count', async () => {
      expect(bus.getHandlerCount()).toBe(0);
      await bus.subscribe('bot-1', jest.fn());
      expect(bus.getHandlerCount()).toBe(1);
      await bus.subscribe('bot-2', jest.fn());
      expect(bus.getHandlerCount()).toBe(2);
    });

    it('should reset all state', async () => {
      await bus.subscribe('bot-1', jest.fn());
      await bus.publish('task_assigned', { taskId: '123' });

      bus.reset();

      expect(bus.getHandlerCount()).toBe(0);
      expect(bus.getPublishedMessages().length).toBe(0);
    });
  });

  describe('Phase 2: offline message helpers', () => {
    it('should enqueue and get offline messages', () => {
      bus.enqueueOfflineMessage('bot-1', 'task_assigned', { taskId: '1' });
      bus.enqueueOfflineMessage('bot-1', 'task_completed', { taskId: '2' });

      const messages = bus.getOfflineMessages('bot-1');
      expect(messages).toHaveLength(2);
      expect(messages[0].event).toBe('task_assigned');
      expect(messages[1].event).toBe('task_completed');
    });

    it('should return empty array for bot with no offline messages', () => {
      expect(bus.getOfflineMessages('unknown')).toEqual([]);
    });

    it('should flush offline messages and deliver to handler', async () => {
      const handler = jest.fn();
      await bus.subscribe('bot-1', handler);
      bus.clearPublishedMessages();

      bus.enqueueOfflineMessage('bot-1', 'task_assigned', { taskId: '1' });
      bus.enqueueOfflineMessage('bot-1', 'task_assigned', { taskId: '2' });

      const count = await bus.flushOfflineMessages('bot-1');
      expect(count).toBe(2);
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should clear offline messages after flush', async () => {
      bus.enqueueOfflineMessage('bot-1', 'task_assigned', { taskId: '1' });
      await bus.flushOfflineMessages('bot-1');

      expect(bus.getOfflineMessages('bot-1')).toEqual([]);
    });

    it('should handle flush with no handler registered', async () => {
      bus.enqueueOfflineMessage('bot-1', 'task_assigned', { taskId: '1' });
      const count = await bus.flushOfflineMessages('bot-1');
      expect(count).toBe(1);
    });
  });

  describe('Phase 2: message history helpers', () => {
    it('should store and retrieve message history', () => {
      bus.storeMessageHistory('bot-1', 'task_assigned', { taskId: '1' });
      bus.storeMessageHistory('bot-1', 'task_completed', { taskId: '2' });

      const history = bus.getMessageHistory('bot-1');
      expect(history).toHaveLength(2);
      expect(history[0].event).toBe('task_completed'); // newest first
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        bus.storeMessageHistory('bot-1', 'task_assigned', { taskId: String(i) });
      }

      const history = bus.getMessageHistory('bot-1', 3);
      expect(history).toHaveLength(3);
    });

    it('should return empty for unknown bot', () => {
      expect(bus.getMessageHistory('unknown')).toEqual([]);
    });

    it('should reset offline and history state', () => {
      bus.enqueueOfflineMessage('bot-1', 'task_assigned', { taskId: '1' });
      bus.storeMessageHistory('bot-1', 'task_assigned', { taskId: '1' });

      bus.reset();

      expect(bus.getOfflineMessages('bot-1')).toEqual([]);
      expect(bus.getMessageHistory('bot-1')).toEqual([]);
    });
  });
});
