/**
 * Message Store
 * Persists message history for bots using Redis or in-memory storage.
 */

import type Redis from 'ioredis';
import type { PersistenceConfig, ServerMessage } from './interface';
import { REDIS_KEYS } from './interface';

export interface MessageHistoryOptions {
  limit?: number;
  offset?: number;
}

/**
 * Stores and retrieves message history per bot.
 * Uses Redis (preferred) or in-memory (fallback).
 */
export class MessageStore {
  private memoryStore = new Map<string, ServerMessage[]>();
  private config: PersistenceConfig;

  constructor(
    private redisClient: Redis | null,
    config: PersistenceConfig
  ) {
    this.config = config;
  }

  /**
   * Store a message in the bot's history.
   */
  async store(botId: string, message: ServerMessage): Promise<void> {
    if (this.redisClient) {
      return this.storeRedis(botId, message);
    }
    return this.storeMemory(botId, message);
  }

  /**
   * Get message history for a bot.
   */
  async getHistory(
    botId: string,
    opts: MessageHistoryOptions = {}
  ): Promise<ServerMessage[]> {
    const { limit = 50, offset = 0 } = opts;

    if (this.redisClient) {
      return this.getHistoryRedis(botId, limit, offset);
    }
    return this.getHistoryMemory(botId, limit, offset);
  }

  /**
   * Get a specific message by messageId.
   * Searches through the bot's history.
   */
  async getMessage(botId: string, messageId: string): Promise<ServerMessage | null> {
    const history = await this.getHistory(botId, { limit: this.config.maxMessagesPerBot });
    return history.find((m) => m.messageId === messageId) ?? null;
  }

  /**
   * Get the total message count for a bot.
   */
  async getMessageCount(botId: string): Promise<number> {
    if (this.redisClient) {
      try {
        const key = REDIS_KEYS.MESSAGE_HISTORY(botId);
        return await this.redisClient.llen(key);
      } catch {
        return this.memoryStore.get(botId)?.length ?? 0;
      }
    }
    return this.memoryStore.get(botId)?.length ?? 0;
  }

  // --- Redis implementation ---

  private async storeRedis(botId: string, message: ServerMessage): Promise<void> {
    const key = REDIS_KEYS.MESSAGE_HISTORY(botId);

    try {
      await this.redisClient!.lpush(key, JSON.stringify(message));
      await this.redisClient!.ltrim(key, 0, this.config.maxMessagesPerBot - 1);
      await this.redisClient!.expire(key, this.config.ttlSeconds);
    } catch {
      // Fallback to memory
      this.storeMemory(botId, message);
    }
  }

  private async getHistoryRedis(
    botId: string,
    limit: number,
    offset: number
  ): Promise<ServerMessage[]> {
    const key = REDIS_KEYS.MESSAGE_HISTORY(botId);

    try {
      const items = await this.redisClient!.lrange(key, offset, offset + limit - 1);
      return items.map((item) => JSON.parse(item) as ServerMessage);
    } catch {
      return this.getHistoryMemory(botId, limit, offset);
    }
  }

  // --- Memory implementation ---

  private storeMemory(botId: string, message: ServerMessage): void {
    const history = this.memoryStore.get(botId) || [];
    // Prepend (newest first, same as Redis LPUSH)
    history.unshift(message);
    // Trim to max size
    if (history.length > this.config.maxMessagesPerBot) {
      history.length = this.config.maxMessagesPerBot;
    }
    this.memoryStore.set(botId, history);
  }

  private getHistoryMemory(
    botId: string,
    limit: number,
    offset: number
  ): ServerMessage[] {
    const history = this.memoryStore.get(botId) || [];
    return history.slice(offset, offset + limit);
  }
}
