/**
 * WebSocketManager Unit Tests
 */

import { WebSocketManager } from '../websocket-manager';
import type { WebSocket } from 'ws';
import type { ServerMessage } from '../interface';

// Mock WebSocket
function createMockWebSocket(
  readyState: number = 1 // OPEN
): WebSocket {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    readyState,
    OPEN: 1,
    CLOSED: 3,
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handlers[event] || [];
      handlers[event].push(handler);
    }),
    emit: (event: string, ...args: unknown[]) => {
      handlers[event]?.forEach((h) => h(...args));
    },
  } as unknown as WebSocket & { emit: (event: string, ...args: unknown[]) => void };
}

describe('WebSocketManager', () => {
  let manager: WebSocketManager;
  let onConnect: jest.Mock;
  let onDisconnect: jest.Mock;

  beforeEach(() => {
    onConnect = jest.fn();
    onDisconnect = jest.fn();
    manager = new WebSocketManager({
      onConnect,
      onDisconnect,
    });
  });

  afterEach(() => {
    manager.closeAll();
  });

  describe('addConnection', () => {
    it('should add a connection and call onConnect', () => {
      const ws = createMockWebSocket();
      manager.addConnection('bot-1', ws);

      expect(manager.isConnected('bot-1')).toBe(true);
      expect(onConnect).toHaveBeenCalledWith('bot-1');
    });

    it('should support multiple connections for the same bot', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      manager.addConnection('bot-1', ws1);
      manager.addConnection('bot-1', ws2);

      expect(manager.getConnectionCount('bot-1')).toBe(2);
      // onConnect should only be called once (first connection)
      expect(onConnect).toHaveBeenCalledTimes(1);
    });

    it('should set status to online on first connection', () => {
      const ws = createMockWebSocket();
      manager.addConnection('bot-1', ws);

      expect(manager.getBotStatus('bot-1')).toBe('online');
    });
  });

  describe('removeConnection', () => {
    it('should remove a connection and call onDisconnect when last connection is removed', () => {
      const ws = createMockWebSocket();
      manager.addConnection('bot-1', ws);
      manager.removeConnection('bot-1', ws);

      expect(manager.isConnected('bot-1')).toBe(false);
      expect(onDisconnect).toHaveBeenCalledWith('bot-1');
    });

    it('should not call onDisconnect if other connections remain', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      manager.addConnection('bot-1', ws1);
      manager.addConnection('bot-1', ws2);
      manager.removeConnection('bot-1', ws1);

      expect(manager.isConnected('bot-1')).toBe(true);
      expect(onDisconnect).not.toHaveBeenCalled();
    });

    it('should set status to offline when last connection is removed', () => {
      const ws = createMockWebSocket();
      manager.addConnection('bot-1', ws);
      manager.removeConnection('bot-1', ws);

      expect(manager.getBotStatus('bot-1')).toBe('offline');
    });
  });

  describe('sendToBot', () => {
    it('should send message to all bot connections', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      manager.addConnection('bot-1', ws1);
      manager.addConnection('bot-1', ws2);

      const message: ServerMessage = {
        type: 'task_assigned',
        payload: { taskId: '123' },
        timestamp: new Date().toISOString(),
      };

      const result = manager.sendToBot('bot-1', message);

      expect(result).toBe(true);
      expect(ws1.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(ws2.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should return false if bot has no connections', () => {
      const message: ServerMessage = {
        type: 'task_assigned',
        payload: { taskId: '123' },
        timestamp: new Date().toISOString(),
      };

      const result = manager.sendToBot('bot-unknown', message);
      expect(result).toBe(false);
    });

    it('should skip closed connections', () => {
      const wsOpen = createMockWebSocket(1);
      const wsClosed = createMockWebSocket(3);

      manager.addConnection('bot-1', wsOpen);
      manager.addConnection('bot-1', wsClosed);

      const message: ServerMessage = {
        type: 'task_assigned',
        payload: { taskId: '123' },
        timestamp: new Date().toISOString(),
      };

      manager.sendToBot('bot-1', message);

      expect(wsOpen.send).toHaveBeenCalled();
      expect(wsClosed.send).not.toHaveBeenCalled();
    });
  });

  describe('broadcast', () => {
    it('should send message to all connected bots', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      manager.addConnection('bot-1', ws1);
      manager.addConnection('bot-2', ws2);

      const message: ServerMessage = {
        type: 'bot_status_changed',
        payload: { botId: 'bot-1', status: 'busy' },
        timestamp: new Date().toISOString(),
      };

      const count = manager.broadcast(message);

      expect(count).toBe(2);
      expect(ws1.send).toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalled();
    });
  });

  describe('status management', () => {
    it('should update and retrieve bot status', () => {
      const ws = createMockWebSocket();
      manager.addConnection('bot-1', ws);

      manager.updateBotStatus('bot-1', 'busy');
      expect(manager.getBotStatus('bot-1')).toBe('busy');

      manager.updateBotStatus('bot-1', 'focus_mode');
      expect(manager.getBotStatus('bot-1')).toBe('focus_mode');
    });

    it('should return offline for unknown bots', () => {
      expect(manager.getBotStatus('unknown-bot')).toBe('offline');
    });
  });

  describe('getConnectedBots', () => {
    it('should return list of connected bot IDs', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      manager.addConnection('bot-1', ws1);
      manager.addConnection('bot-2', ws2);

      const bots = manager.getConnectedBots();
      expect(bots).toContain('bot-1');
      expect(bots).toContain('bot-2');
      expect(bots.length).toBe(2);
    });
  });

  describe('getOnlineBots', () => {
    it('should return only connected bots with non-offline status', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      manager.addConnection('bot-1', ws1);
      manager.addConnection('bot-2', ws2);
      manager.updateBotStatus('bot-2', 'busy');

      const onlineBots = manager.getOnlineBots();
      expect(onlineBots).toContain('bot-1');
      expect(onlineBots).toContain('bot-2');
    });
  });

  describe('closeAll', () => {
    it('should close all connections', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      manager.addConnection('bot-1', ws1);
      manager.addConnection('bot-2', ws2);

      manager.closeAll();

      expect(ws1.close).toHaveBeenCalledWith(1000, 'Server shutting down');
      expect(ws2.close).toHaveBeenCalledWith(1000, 'Server shutting down');
      expect(manager.getTotalConnectionCount()).toBe(0);
    });
  });
});
