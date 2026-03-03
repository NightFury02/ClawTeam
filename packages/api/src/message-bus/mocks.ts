/**
 * Mock Message Bus Implementation
 * Used for testing and development when Redis is not available.
 */

import type { Message, MessageType } from '@clawteam/shared/types';
import type { IMessageBus, MessageHandler, BotStatus } from './interface';

/**
 * In-memory mock implementation of IMessageBus.
 * Useful for unit testing and parallel development.
 */
export class MockMessageBus implements IMessageBus {
  private handlers = new Map<string, MessageHandler>();
  private botStatuses = new Map<string, BotStatus>();
  private publishedMessages: Array<{
    event: MessageType;
    payload: unknown;
    targetBotId?: string;
    timestamp: Date;
  }> = [];

  async publish(
    event: MessageType,
    payload: unknown,
    targetBotId?: string
  ): Promise<void> {
    const message: Message = {
      type: event,
      payload,
      timestamp: new Date().toISOString(),
    };

    this.publishedMessages.push({
      event,
      payload,
      targetBotId,
      timestamp: new Date(),
    });

    if (targetBotId) {
      const handler = this.handlers.get(targetBotId);
      if (handler) {
        await handler(message);
      }
    } else {
      // Broadcast to all handlers
      for (const handler of this.handlers.values()) {
        await handler(message);
      }
    }
  }

  async subscribe(botId: string, handler: MessageHandler): Promise<void> {
    this.handlers.set(botId, handler);
    this.botStatuses.set(botId, 'online');
  }

  async unsubscribe(botId: string): Promise<void> {
    this.handlers.delete(botId);
    this.botStatuses.set(botId, 'offline');
  }

  async updateBotStatus(botId: string, status: BotStatus): Promise<void> {
    const previousStatus = this.botStatuses.get(botId);
    this.botStatuses.set(botId, status);

    if (previousStatus !== status) {
      await this.publish(
        'bot_status_changed',
        { botId, status, previousStatus, timestamp: new Date().toISOString() },
        undefined
      );
    }
  }

  async getOnlineBots(): Promise<string[]> {
    const onlineBots: string[] = [];
    for (const [botId, status] of this.botStatuses) {
      if (status === 'online' || status === 'busy' || status === 'focus_mode') {
        onlineBots.push(botId);
      }
    }
    return onlineBots;
  }

  async isBotOnline(botId: string): Promise<boolean> {
    const status = this.botStatuses.get(botId);
    return status === 'online' || status === 'busy' || status === 'focus_mode';
  }

  async close(): Promise<void> {
    this.handlers.clear();
    this.botStatuses.clear();
  }

  // Test helpers

  /** Get all published messages for testing */
  getPublishedMessages() {
    return [...this.publishedMessages];
  }

  /** Clear published messages history */
  clearPublishedMessages() {
    this.publishedMessages = [];
  }

  /** Get current status for a bot */
  getBotStatus(botId: string): BotStatus | undefined {
    return this.botStatuses.get(botId);
  }

  /** Get count of registered handlers */
  getHandlerCount(): number {
    return this.handlers.size;
  }

  /** Reset all state */
  reset() {
    this.handlers.clear();
    this.botStatuses.clear();
    this.publishedMessages = [];
    this.offlineMessages.clear();
    this.messageHistory.clear();
  }

  // Phase 2 test helpers

  private offlineMessages = new Map<string, Array<{ event: MessageType; payload: unknown }>>();
  private messageHistory = new Map<string, Array<{ event: MessageType; payload: unknown; timestamp: Date }>>();

  /** Simulate enqueuing a message for an offline bot */
  enqueueOfflineMessage(botId: string, event: MessageType, payload: unknown): void {
    const queue = this.offlineMessages.get(botId) || [];
    queue.push({ event, payload });
    this.offlineMessages.set(botId, queue);
  }

  /** Get offline messages for a bot */
  getOfflineMessages(botId: string) {
    return [...(this.offlineMessages.get(botId) || [])];
  }

  /** Flush offline messages and deliver them (invoke handler) */
  async flushOfflineMessages(botId: string): Promise<number> {
    const queue = this.offlineMessages.get(botId) || [];
    this.offlineMessages.delete(botId);

    const handler = this.handlers.get(botId);
    if (handler) {
      for (const msg of queue) {
        await handler({
          type: msg.event,
          payload: msg.payload,
          timestamp: new Date().toISOString(),
        });
      }
    }
    return queue.length;
  }

  /** Store a message in history */
  storeMessageHistory(botId: string, event: MessageType, payload: unknown): void {
    const history = this.messageHistory.get(botId) || [];
    history.unshift({ event, payload, timestamp: new Date() });
    this.messageHistory.set(botId, history);
  }

  /** Get message history for a bot */
  getMessageHistory(botId: string, limit: number = 50) {
    const history = this.messageHistory.get(botId) || [];
    return history.slice(0, limit);
  }
}
