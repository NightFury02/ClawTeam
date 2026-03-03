/**
 * WebSocket Connection Manager
 * Manages WebSocket connections from Bots.
 */

import type { WebSocket } from 'ws';
import type { Message, MessageType } from '@clawteam/shared/types';
import type { BotStatus, ConnectionInfo, ServerMessage } from './interface';
import { BotOfflineError, ConnectionError } from './errors';

export type WebSocketConnectionHandler = (botId: string) => void;
export type WebSocketMessageHandler = (botId: string, message: Message) => void;

export interface WebSocketManagerOptions {
  /** Callback when a bot connects */
  onConnect?: WebSocketConnectionHandler;
  /** Callback when a bot disconnects */
  onDisconnect?: WebSocketConnectionHandler;
}

/**
 * Manages WebSocket connections from Bots.
 * Supports multiple connections per bot and handles connection lifecycle.
 */
export class WebSocketManager {
  /** Map of botId → array of WebSocket connections */
  private connections = new Map<string, WebSocket[]>();

  /** Map of WebSocket → connection info */
  private connectionInfo = new WeakMap<WebSocket, ConnectionInfo>();

  /** Bot status cache */
  private botStatuses = new Map<string, BotStatus>();

  private options: WebSocketManagerOptions;

  constructor(options: WebSocketManagerOptions = {}) {
    this.options = options;
  }

  /**
   * Add a new WebSocket connection for a bot.
   */
  addConnection(botId: string, ws: WebSocket): void {
    const connections = this.connections.get(botId) || [];
    connections.push(ws);
    this.connections.set(botId, connections);

    this.connectionInfo.set(ws, {
      botId,
      connectedAt: new Date(),
    });

    // Set status to online if this is the first connection
    if (connections.length === 1) {
      this.botStatuses.set(botId, 'online');
      this.options.onConnect?.(botId);
    }

    // Handle connection close
    ws.on('close', () => {
      this.removeConnection(botId, ws);
    });

    ws.on('error', () => {
      this.removeConnection(botId, ws);
    });
  }

  /**
   * Remove a WebSocket connection for a bot.
   */
  removeConnection(botId: string, ws: WebSocket): void {
    const connections = this.connections.get(botId);
    if (!connections) return;

    const index = connections.indexOf(ws);
    if (index !== -1) {
      connections.splice(index, 1);
    }

    this.connectionInfo.delete(ws);

    if (connections.length === 0) {
      this.connections.delete(botId);
      this.botStatuses.set(botId, 'offline');
      this.options.onDisconnect?.(botId);
    }
  }

  /**
   * Send a message to a specific bot.
   * Returns true if at least one connection received the message.
   */
  sendToBot(botId: string, message: ServerMessage): boolean {
    const connections = this.connections.get(botId);
    if (!connections || connections.length === 0) {
      return false;
    }

    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    for (const ws of connections) {
      if (ws.readyState === ws.OPEN) {
        try {
          ws.send(messageStr);
          sentCount++;

          // Update last message time
          const info = this.connectionInfo.get(ws);
          if (info) {
            info.lastMessageAt = new Date();
          }
        } catch {
          // Connection might have closed
        }
      }
    }

    return sentCount > 0;
  }

  /**
   * Broadcast a message to all connected bots.
   */
  broadcast(message: ServerMessage): number {
    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    for (const connections of this.connections.values()) {
      for (const ws of connections) {
        if (ws.readyState === ws.OPEN) {
          try {
            ws.send(messageStr);
            sentCount++;
          } catch {
            // Connection might have closed
          }
        }
      }
    }

    return sentCount;
  }

  /**
   * Update a bot's status.
   */
  updateBotStatus(botId: string, status: BotStatus): void {
    this.botStatuses.set(botId, status);
  }

  /**
   * Get a bot's current status.
   */
  getBotStatus(botId: string): BotStatus {
    return this.botStatuses.get(botId) || 'offline';
  }

  /**
   * Check if a bot has any active connections.
   */
  isConnected(botId: string): boolean {
    const connections = this.connections.get(botId);
    if (!connections || connections.length === 0) {
      return false;
    }
    return connections.some((ws) => ws.readyState === ws.OPEN);
  }

  /**
   * Get list of connected bot IDs.
   */
  getConnectedBots(): string[] {
    const connectedBots: string[] = [];
    for (const [botId, connections] of this.connections) {
      if (connections.some((ws) => ws.readyState === ws.OPEN)) {
        connectedBots.push(botId);
      }
    }
    return connectedBots;
  }

  /**
   * Get list of online bot IDs (includes busy/focus_mode states).
   */
  getOnlineBots(): string[] {
    const onlineBots: string[] = [];
    for (const [botId, status] of this.botStatuses) {
      if (status !== 'offline' && this.isConnected(botId)) {
        onlineBots.push(botId);
      }
    }
    return onlineBots;
  }

  /**
   * Get connection count for a specific bot.
   */
  getConnectionCount(botId: string): number {
    const connections = this.connections.get(botId);
    return connections
      ? connections.filter((ws) => ws.readyState === ws.OPEN).length
      : 0;
  }

  /**
   * Get total number of active connections.
   */
  getTotalConnectionCount(): number {
    let count = 0;
    for (const connections of this.connections.values()) {
      count += connections.filter((ws) => ws.readyState === ws.OPEN).length;
    }
    return count;
  }

  /**
   * Get all WebSocket connections for a bot.
   */
  getConnectionsForBot(botId: string): WebSocket[] {
    return this.connections.get(botId) || [];
  }

  /**
   * Get connection info for a WebSocket.
   */
  getConnectionInfo(ws: WebSocket): ConnectionInfo | undefined {
    return this.connectionInfo.get(ws);
  }

  /**
   * Update connection info for a WebSocket.
   */
  updateConnectionInfo(ws: WebSocket, update: Partial<ConnectionInfo>): void {
    const info = this.connectionInfo.get(ws);
    if (info) {
      Object.assign(info, update);
    }
  }

  /**
   * Close all connections and clean up.
   */
  closeAll(): void {
    for (const connections of this.connections.values()) {
      for (const ws of connections) {
        try {
          ws.close(1000, 'Server shutting down');
        } catch {
          // Ignore close errors
        }
      }
    }
    this.connections.clear();
    this.botStatuses.clear();
  }
}
