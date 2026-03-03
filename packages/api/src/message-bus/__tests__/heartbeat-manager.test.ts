/**
 * HeartbeatManager Unit Tests
 */

import { HeartbeatManager } from '../heartbeat-manager';
import { WebSocketManager } from '../websocket-manager';
import { WS_CLOSE_CODES } from '../errors';
import type { WebSocket } from 'ws';
import type { HeartbeatConfig } from '../interface';

function createMockWebSocket(readyState: number = 1): WebSocket {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    readyState,
    OPEN: 1,
    CLOSED: 3,
    send: jest.fn(),
    close: jest.fn(),
    ping: jest.fn(),
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handlers[event] || [];
      handlers[event].push(handler);
    }),
    emit: (event: string, ...args: unknown[]) => {
      handlers[event]?.forEach((h) => h(...args));
    },
  } as unknown as WebSocket & { emit: (event: string, ...args: unknown[]) => void };
}

describe('HeartbeatManager', () => {
  let wsManager: WebSocketManager;
  let heartbeat: HeartbeatManager;
  const config: HeartbeatConfig = {
    enabled: true,
    intervalMs: 1000,
    timeoutMs: 500,
  };

  beforeEach(() => {
    jest.useFakeTimers();
    wsManager = new WebSocketManager();
    heartbeat = new HeartbeatManager(wsManager, config);
  });

  afterEach(() => {
    heartbeat.stopAll();
    wsManager.closeAll();
    jest.useRealTimers();
  });

  it('should start monitoring and send ping at interval', () => {
    const ws = createMockWebSocket();
    wsManager.addConnection('bot-1', ws);

    heartbeat.startMonitoring('bot-1');

    // Advance past one interval
    jest.advanceTimersByTime(config.intervalMs);

    expect(ws.ping).toHaveBeenCalled();
  });

  it('should not start duplicate monitoring for same bot', () => {
    const ws = createMockWebSocket();
    wsManager.addConnection('bot-1', ws);

    heartbeat.startMonitoring('bot-1');
    heartbeat.startMonitoring('bot-1');

    jest.advanceTimersByTime(config.intervalMs);

    // Only one interval should be running, so ping called once
    expect(ws.ping).toHaveBeenCalledTimes(1);
  });

  it('should update lastPongAt on handlePong', () => {
    const ws = createMockWebSocket();
    wsManager.addConnection('bot-1', ws);

    const before = new Date();
    heartbeat.handlePong('bot-1', ws);

    const info = wsManager.getConnectionInfo(ws);
    expect(info?.lastPongAt).toBeDefined();
    expect(info!.lastPongAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('should close connection on heartbeat timeout', () => {
    const ws = createMockWebSocket();
    wsManager.addConnection('bot-1', ws);

    heartbeat.startMonitoring('bot-1');

    // First interval: sends ping, sets lastPingAt
    jest.advanceTimersByTime(config.intervalMs);
    expect(ws.ping).toHaveBeenCalledTimes(1);

    // No pong received — second interval detects timeout
    jest.advanceTimersByTime(config.intervalMs);
    expect(ws.close).toHaveBeenCalledWith(
      WS_CLOSE_CODES.HEARTBEAT_TIMEOUT,
      'Heartbeat timeout'
    );
  });

  it('should not close connection if pong is received', () => {
    const ws = createMockWebSocket();
    wsManager.addConnection('bot-1', ws);

    heartbeat.startMonitoring('bot-1');

    // First interval: sends ping
    jest.advanceTimersByTime(config.intervalMs);
    expect(ws.ping).toHaveBeenCalledTimes(1);

    // Simulate pong response
    heartbeat.handlePong('bot-1', ws);

    // Second interval: should send another ping, NOT close
    jest.advanceTimersByTime(config.intervalMs);
    expect(ws.close).not.toHaveBeenCalled();
    expect(ws.ping).toHaveBeenCalledTimes(2);
  });

  it('should stop monitoring for a bot', () => {
    const ws = createMockWebSocket();
    wsManager.addConnection('bot-1', ws);

    heartbeat.startMonitoring('bot-1');
    heartbeat.stopMonitoring('bot-1');

    jest.advanceTimersByTime(config.intervalMs * 3);
    expect(ws.ping).not.toHaveBeenCalled();
  });

  it('should stop all monitoring', () => {
    const ws1 = createMockWebSocket();
    const ws2 = createMockWebSocket();
    wsManager.addConnection('bot-1', ws1);
    wsManager.addConnection('bot-2', ws2);

    heartbeat.startMonitoring('bot-1');
    heartbeat.startMonitoring('bot-2');
    heartbeat.stopAll();

    jest.advanceTimersByTime(config.intervalMs * 3);
    expect(ws1.ping).not.toHaveBeenCalled();
    expect(ws2.ping).not.toHaveBeenCalled();
  });

  it('should skip closed connections during check', () => {
    const wsOpen = createMockWebSocket(1);
    const wsClosed = createMockWebSocket(3);
    wsManager.addConnection('bot-1', wsOpen);
    wsManager.addConnection('bot-1', wsClosed);

    heartbeat.startMonitoring('bot-1');
    jest.advanceTimersByTime(config.intervalMs);

    expect(wsOpen.ping).toHaveBeenCalled();
    expect(wsClosed.ping).not.toHaveBeenCalled();
  });

  it('should handle ping errors gracefully', () => {
    const ws = createMockWebSocket();
    (ws.ping as jest.Mock).mockImplementation(() => {
      throw new Error('Connection reset');
    });
    wsManager.addConnection('bot-1', ws);

    heartbeat.startMonitoring('bot-1');

    // Should not throw
    expect(() => jest.advanceTimersByTime(config.intervalMs)).not.toThrow();
  });

  it('should handle close errors gracefully on timeout', () => {
    const ws = createMockWebSocket();
    (ws.close as jest.Mock).mockImplementation(() => {
      throw new Error('Already closed');
    });
    wsManager.addConnection('bot-1', ws);

    heartbeat.startMonitoring('bot-1');

    // First ping
    jest.advanceTimersByTime(config.intervalMs);
    // Timeout — close should be called but error ignored
    expect(() => jest.advanceTimersByTime(config.intervalMs)).not.toThrow();
  });

  it('should stopMonitoring be safe when not monitoring', () => {
    // Should not throw
    expect(() => heartbeat.stopMonitoring('nonexistent-bot')).not.toThrow();
  });
});
