/**
 * Heartbeat Manager
 * Uses native WebSocket ping/pong frames to detect stale connections.
 */

import type { WebSocket } from 'ws';
import type { HeartbeatConfig } from './interface';
import { WS_CLOSE_CODES } from './errors';
import { WebSocketManager } from './websocket-manager';

/**
 * Monitors WebSocket connections via ping/pong heartbeat.
 * Closes connections that fail to respond within the timeout.
 */
export class HeartbeatManager {
  private intervals = new Map<string, NodeJS.Timeout>();
  private config: HeartbeatConfig;

  constructor(
    private wsManager: WebSocketManager,
    config: HeartbeatConfig
  ) {
    this.config = config;
  }

  /**
   * Start monitoring heartbeat for a bot's connections.
   * Sends periodic ping frames and checks for pong responses.
   */
  startMonitoring(botId: string): void {
    // Don't start if already monitoring
    if (this.intervals.has(botId)) return;

    const interval = setInterval(() => {
      this.checkConnections(botId);
    }, this.config.intervalMs);

    this.intervals.set(botId, interval);
  }

  /**
   * Stop monitoring heartbeat for a bot.
   */
  stopMonitoring(botId: string): void {
    const interval = this.intervals.get(botId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(botId);
    }
  }

  /**
   * Handle pong response from a WebSocket connection.
   * Updates lastPongAt in connection info.
   */
  handlePong(botId: string, ws: WebSocket): void {
    this.wsManager.updateConnectionInfo(ws, {
      lastPongAt: new Date(),
    });
  }

  /**
   * Stop all heartbeat monitoring.
   */
  stopAll(): void {
    for (const [botId, interval] of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }

  /**
   * Check connections for a bot — send ping and close timed-out connections.
   */
  private checkConnections(botId: string): void {
    const connections = this.wsManager.getConnectionsForBot(botId);

    for (const ws of connections) {
      if (ws.readyState !== ws.OPEN) continue;

      const info = this.wsManager.getConnectionInfo(ws);
      if (!info) continue;

      // Check if previous ping timed out (sent ping but no pong received)
      if (info.lastPingAt && !this.hasRecentPong(info)) {
        // Pong not received within timeout — close connection
        try {
          ws.close(WS_CLOSE_CODES.HEARTBEAT_TIMEOUT, 'Heartbeat timeout');
        } catch {
          // Ignore close errors
        }
        continue;
      }

      // Send new ping
      try {
        ws.ping();
        this.wsManager.updateConnectionInfo(ws, {
          lastPingAt: new Date(),
        });
      } catch {
        // Ignore ping errors — connection may be closing
      }
    }
  }

  /**
   * Check if a connection has received a pong since the last ping.
   */
  private hasRecentPong(info: { lastPingAt?: Date; lastPongAt?: Date }): boolean {
    if (!info.lastPingAt) return true; // No ping sent yet
    if (!info.lastPongAt) return false; // Ping sent but no pong ever received
    return info.lastPongAt.getTime() >= info.lastPingAt.getTime();
  }
}
