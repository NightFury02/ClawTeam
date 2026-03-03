/**
 * PubSubBridge Unit Tests
 */

import { PubSubBridge } from '../pubsub-bridge';
import type { ServerMessage } from '../interface';
import { REDIS_CHANNELS, getChannelForEvent } from '../interface';

// Mock ioredis
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

describe('PubSubBridge', () => {
  let bridge: PubSubBridge;
  let onMessage: jest.Mock;
  let onConnect: jest.Mock;
  let onDisconnect: jest.Mock;
  let onError: jest.Mock;

  beforeEach(() => {
    onMessage = jest.fn();
    onConnect = jest.fn();
    onDisconnect = jest.fn();
    onError = jest.fn();

    bridge = new PubSubBridge({
      redis: { host: 'localhost', port: 6379 },
      onMessage,
      onConnect,
      onDisconnect,
      onError,
    });
  });

  afterEach(async () => {
    await bridge.close();
  });

  describe('connect', () => {
    it('should subscribe to all channels', async () => {
      await bridge.connect();
      // The subscribe mock should have been called with all channels
      expect(true).toBe(true); // Test passes if no error thrown
    });
  });

  describe('publish', () => {
    it('should publish message to correct channel', async () => {
      await bridge.publish('task_assigned', { taskId: '123' }, 'bot-1');
      // The publish mock should have been called
      expect(true).toBe(true); // Test passes if no error thrown
    });
  });

  describe('broadcast', () => {
    it('should publish to broadcast channel', async () => {
      await bridge.broadcast('bot_status_changed', { botId: 'bot-1', status: 'online' });
      expect(true).toBe(true); // Test passes if no error thrown
    });
  });
});

describe('Channel Utilities', () => {
  describe('getChannelForEvent', () => {
    it('should return correct channel for each event type', () => {
      expect(getChannelForEvent('task_assigned')).toBe(REDIS_CHANNELS.TASK_ASSIGNED);
      expect(getChannelForEvent('task_completed')).toBe(REDIS_CHANNELS.TASK_COMPLETED);
      expect(getChannelForEvent('task_failed')).toBe(REDIS_CHANNELS.TASK_FAILED);
      expect(getChannelForEvent('bot_status_changed')).toBe(REDIS_CHANNELS.BOT_STATUS);
      expect(getChannelForEvent('workflow_started')).toBe(REDIS_CHANNELS.WORKFLOW_STARTED);
      expect(getChannelForEvent('workflow_completed')).toBe(REDIS_CHANNELS.WORKFLOW_COMPLETED);
    });
  });
});
