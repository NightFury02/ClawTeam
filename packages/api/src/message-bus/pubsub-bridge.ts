/**
 * Redis Pub/Sub Bridge
 * Handles Redis Pub/Sub integration for cross-instance event distribution.
 */

import Redis from 'ioredis';
import type { Message, MessageType } from '@clawteam/shared/types';
import {
  getAllChannels,
  getChannelForEvent,
  REDIS_CHANNELS,
  type ServerMessage,
} from './interface';
import { PublishError, SubscriptionError } from './errors';

export type PubSubMessageHandler = (
  channel: string,
  message: ServerMessage
) => void;

export interface PubSubBridgeOptions {
  /** Redis connection URL or config */
  redis?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  };
  /** Custom Redis client (for testing) */
  redisClient?: Redis;
  /** Handler for incoming messages */
  onMessage?: PubSubMessageHandler;
  /** Callback when Redis connection is established */
  onConnect?: () => void;
  /** Callback when Redis connection is lost */
  onDisconnect?: () => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
}

interface RedisMessage {
  type: MessageType;
  payload: unknown;
  timestamp: string;
  traceId?: string;
  targetBotId?: string;
}

/**
 * Redis Pub/Sub bridge for cross-instance event distribution.
 */
export class PubSubBridge {
  private publisher: Redis;
  private subscriber: Redis;
  private isConnected = false;
  private options: PubSubBridgeOptions;

  constructor(options: PubSubBridgeOptions = {}) {
    this.options = options;

    // Create or use provided Redis clients
    const redisConfig = options.redis || {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
    };

    if (options.redisClient) {
      this.publisher = options.redisClient;
      this.subscriber = options.redisClient.duplicate();
    } else {
      this.publisher = new Redis(redisConfig);
      this.subscriber = new Redis(redisConfig);
    }

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Publisher events
    this.publisher.on('connect', () => {
      this.isConnected = true;
      this.options.onConnect?.();
    });

    this.publisher.on('error', (err) => {
      this.options.onError?.(err);
    });

    this.publisher.on('close', () => {
      this.isConnected = false;
      this.options.onDisconnect?.();
    });

    // Subscriber message handler
    this.subscriber.on('message', (channel: string, messageStr: string) => {
      try {
        const message = JSON.parse(messageStr) as RedisMessage;
        this.options.onMessage?.(channel, message as ServerMessage);
      } catch (err) {
        this.options.onError?.(
          new Error(`Failed to parse message from channel ${channel}: ${err}`)
        );
      }
    });
  }

  /**
   * Initialize and subscribe to all channels.
   */
  async connect(): Promise<void> {
    const channels = getAllChannels();

    try {
      await this.subscriber.subscribe(...channels);
    } catch (err) {
      throw new SubscriptionError(
        `Failed to subscribe to channels: ${err}`,
        { channels }
      );
    }
  }

  /**
   * Publish an event to Redis.
   */
  async publish(
    event: MessageType,
    payload: unknown,
    targetBotId?: string,
    traceId?: string
  ): Promise<void> {
    const channel = getChannelForEvent(event);
    const message: RedisMessage = {
      type: event,
      payload,
      timestamp: new Date().toISOString(),
      traceId,
      targetBotId,
    };

    try {
      await this.publisher.publish(channel, JSON.stringify(message));
    } catch (err) {
      throw new PublishError(
        `Failed to publish to channel ${channel}: ${err}`,
        { channel, event, targetBotId }
      );
    }
  }

  /**
   * Publish to the broadcast channel.
   */
  async broadcast(
    event: MessageType,
    payload: unknown,
    traceId?: string
  ): Promise<void> {
    const message: RedisMessage = {
      type: event,
      payload,
      timestamp: new Date().toISOString(),
      traceId,
    };

    try {
      await this.publisher.publish(
        REDIS_CHANNELS.BROADCAST,
        JSON.stringify(message)
      );
    } catch (err) {
      throw new PublishError(
        `Failed to publish to broadcast channel: ${err}`,
        { event }
      );
    }
  }

  /**
   * Check if Redis is connected.
   */
  isReady(): boolean {
    return this.isConnected && this.publisher.status === 'ready';
  }

  /**
   * Close Redis connections.
   */
  async close(): Promise<void> {
    await this.subscriber.unsubscribe();
    await this.subscriber.quit();
    await this.publisher.quit();
    this.isConnected = false;
  }
}
