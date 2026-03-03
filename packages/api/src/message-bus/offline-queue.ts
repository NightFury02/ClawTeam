/**
 * Offline Message Queue
 * Stores messages for bots that are currently disconnected.
 * Uses Redis when available, falls back to in-memory storage.
 */

import type Redis from 'ioredis';
import type { OfflineQueueConfig, ServerMessage } from './interface';
import { REDIS_KEYS } from './interface';
import { QueueFullError } from './errors';

/**
 * Manages offline message queues per bot.
 * Messages are stored in Redis (preferred) or in-memory (fallback).
 */
export class OfflineQueue {
  private memoryQueue = new Map<string, ServerMessage[]>();
  private config: OfflineQueueConfig;

  constructor(
    private redisClient: Redis | null,
    config: OfflineQueueConfig
  ) {
    this.config = config;
  }

  /**
   * Enqueue a message for an offline bot.
   * Returns true if the message was enqueued, false if the queue is full.
   */
  async enqueue(botId: string, message: ServerMessage): Promise<boolean> {
    if (this.redisClient) {
      return this.enqueueRedis(botId, message);
    }
    return this.enqueueMemory(botId, message);
  }

  /**
   * Flush all queued messages for a bot (on reconnect).
   * Returns the messages in FIFO order and clears the queue.
   */
  async flush(botId: string): Promise<ServerMessage[]> {
    if (this.redisClient) {
      return this.flushRedis(botId);
    }
    return this.flushMemory(botId);
  }

  /**
   * Get the current queue size for a bot.
   */
  async getQueueSize(botId: string): Promise<number> {
    if (this.redisClient) {
      try {
        const key = REDIS_KEYS.OFFLINE_QUEUE(botId);
        return await this.redisClient.llen(key);
      } catch {
        // Fallback to memory
        return this.memoryQueue.get(botId)?.length ?? 0;
      }
    }
    return this.memoryQueue.get(botId)?.length ?? 0;
  }

  /**
   * Clear the queue for a bot.
   */
  async clear(botId: string): Promise<void> {
    if (this.redisClient) {
      try {
        const key = REDIS_KEYS.OFFLINE_QUEUE(botId);
        await this.redisClient.del(key);
      } catch {
        // Fallback
      }
    }
    this.memoryQueue.delete(botId);
  }

  // --- Redis implementation ---

  private async enqueueRedis(botId: string, message: ServerMessage): Promise<boolean> {
    const key = REDIS_KEYS.OFFLINE_QUEUE(botId);

    try {
      const currentSize = await this.redisClient!.llen(key);
      if (currentSize >= this.config.maxQueueSize) {
        return false;
      }

      await this.redisClient!.rpush(key, JSON.stringify(message));
      await this.redisClient!.expire(key, this.config.messageTtlSeconds);
      return true;
    } catch {
      // Redis failure — fallback to memory
      return this.enqueueMemory(botId, message);
    }
  }

  private async flushRedis(botId: string): Promise<ServerMessage[]> {
    const key = REDIS_KEYS.OFFLINE_QUEUE(botId);

    try {
      const items = await this.redisClient!.lrange(key, 0, -1);
      await this.redisClient!.del(key);

      return items.map((item) => JSON.parse(item) as ServerMessage);
    } catch {
      // Redis failure — fallback to memory
      return this.flushMemory(botId);
    }
  }

  // --- Memory implementation ---

  private enqueueMemory(botId: string, message: ServerMessage): boolean {
    const queue = this.memoryQueue.get(botId) || [];

    if (queue.length >= this.config.maxQueueSize) {
      return false;
    }

    queue.push(message);
    this.memoryQueue.set(botId, queue);
    return true;
  }

  private flushMemory(botId: string): ServerMessage[] {
    const queue = this.memoryQueue.get(botId) || [];
    this.memoryQueue.delete(botId);
    return queue;
  }
}
