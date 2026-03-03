/**
 * Message Bus Core Implementation
 * Combines WebSocketManager and PubSubBridge to implement IMessageBus.
 */

import type { Message, MessageType } from '@clawteam/shared/types';
import type {
  IMessageBus,
  MessageHandler,
  BotStatus,
  ServerMessage,
  MessageBusFeatureConfig,
} from './interface';
import { REDIS_CHANNELS } from './interface';
import { WebSocketManager } from './websocket-manager';
import { PubSubBridge } from './pubsub-bridge';
import { HeartbeatManager } from './heartbeat-manager';
import { AckTracker } from './ack-tracker';
import { OfflineQueue } from './offline-queue';
import { MessageStore, type MessageHistoryOptions } from './message-store';
import { RetryManager } from './retry-manager';
import { BotOfflineError } from './errors';

export interface MessageBusOptions {
  /** Redis configuration */
  redis?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  };
  /** Whether to enable Redis Pub/Sub (default: true) */
  enablePubSub?: boolean;
  /** Phase 2 feature configuration */
  features?: MessageBusFeatureConfig;
  /** Logger instance */
  logger?: {
    info: (msg: string, ...args: unknown[]) => void;
    error: (msg: string, ...args: unknown[]) => void;
    debug: (msg: string, ...args: unknown[]) => void;
  };
}

/**
 * Core Message Bus implementation.
 * Orchestrates WebSocket connections and Redis Pub/Sub.
 */
export class MessageBus implements IMessageBus {
  private wsManager: WebSocketManager;
  private pubSubBridge?: PubSubBridge;
  private heartbeatManager?: HeartbeatManager;
  private ackTracker?: AckTracker;
  private offlineQueue?: OfflineQueue;
  private messageStore?: MessageStore;
  private retryManager?: RetryManager;
  private handlers = new Map<string, MessageHandler>();
  private options: MessageBusOptions;
  private logger: NonNullable<MessageBusOptions['logger']>;

  constructor(options: MessageBusOptions = {}) {
    this.options = options;
    this.logger = options.logger || {
      info: () => {},
      error: () => {},
      debug: () => {},
    };

    // Initialize WebSocket manager
    this.wsManager = new WebSocketManager({
      onConnect: (botId) => {
        this.logger.info(`Bot connected: ${botId}`);
        this.handleBotConnect(botId);
      },
      onDisconnect: (botId) => {
        this.logger.info(`Bot disconnected: ${botId}`);
        this.handleBotDisconnect(botId);
      },
    });

    // Initialize heartbeat manager if enabled
    if (options.features?.heartbeat?.enabled) {
      this.heartbeatManager = new HeartbeatManager(
        this.wsManager,
        options.features.heartbeat
      );
    }

    // Initialize ACK tracker if enabled
    if (options.features?.ack?.enabled) {
      this.ackTracker = new AckTracker(options.features.ack);
      this.ackTracker.onAckTimeout = (pending) => {
        this.logger.debug(
          `ACK timeout for message ${pending.messageId} to bot ${pending.botId}`
        );
      };
    }

    // Initialize offline queue if enabled
    if (options.features?.offlineQueue?.enabled) {
      this.offlineQueue = new OfflineQueue(null, options.features.offlineQueue);
    }

    // Initialize message store if enabled
    if (options.features?.persistence?.enabled) {
      this.messageStore = new MessageStore(null, options.features.persistence);
    }

    // Initialize retry manager if enabled
    if (options.features?.retry?.enabled) {
      this.retryManager = new RetryManager(options.features.retry);

      // Wire up retry attempt: try to resend via WebSocket
      this.retryManager.onRetryAttempt = async (entry) => {
        const sent = this.wsManager.sendToBot(entry.botId, entry.message);
        if (sent) {
          this.logger.debug(
            `Retry succeeded for message ${entry.messageId} to bot ${entry.botId} (attempt ${entry.attempt})`
          );
        }
        return sent;
      };

      // Wire up max retries exceeded: move to dead letter / offline queue
      this.retryManager.onMaxRetriesExceeded = (entry) => {
        this.logger.error(
          `Max retries exceeded for message ${entry.messageId} to bot ${entry.botId}`
        );
        // Store in offline queue as dead letter
        this.offlineQueue?.enqueue(entry.botId, entry.message).catch((err) => {
          this.logger.error('Failed to enqueue dead letter:', err);
        });
      };

      // Wire up ACK timeout → retry (if both ACK and retry are enabled)
      if (this.ackTracker) {
        this.ackTracker.onAckTimeout = (pending) => {
          this.logger.debug(
            `ACK timeout for message ${pending.messageId} to bot ${pending.botId}, scheduling retry`
          );
          this.retryManager!.scheduleRetry(
            pending.botId,
            pending.message,
            pending.retryCount
          );
        };
      }
    }

    // Initialize Pub/Sub bridge if enabled
    if (options.enablePubSub !== false) {
      this.pubSubBridge = new PubSubBridge({
        redis: options.redis,
        onMessage: (channel, message) => {
          this.handlePubSubMessage(channel, message);
        },
        onConnect: () => {
          this.logger.info('Redis Pub/Sub connected');
        },
        onDisconnect: () => {
          this.logger.info('Redis Pub/Sub disconnected');
        },
        onError: (err) => {
          this.logger.error('Redis Pub/Sub error:', err);
        },
      });
    }
  }

  /**
   * Initialize the message bus (connect to Redis).
   */
  async initialize(): Promise<void> {
    if (this.pubSubBridge) {
      await this.pubSubBridge.connect();
    }
  }

  /**
   * Get the WebSocket manager instance.
   * Used by the Fastify plugin to add connections.
   */
  getWebSocketManager(): WebSocketManager {
    return this.wsManager;
  }

  async publish(
    event: MessageType,
    payload: unknown,
    targetBotId?: string
  ): Promise<void> {
    const message: ServerMessage = {
      type: event,
      payload,
      timestamp: new Date().toISOString(),
      targetBotId,
    };

    // If Redis is available, publish through Pub/Sub for cross-instance delivery
    if (this.pubSubBridge?.isReady()) {
      await this.pubSubBridge.publish(event, payload, targetBotId);
    } else {
      // Fallback to direct WebSocket delivery
      this.deliverMessage(message, targetBotId);
    }
  }

  async subscribe(botId: string, handler: MessageHandler): Promise<void> {
    this.handlers.set(botId, handler);
  }

  async unsubscribe(botId: string): Promise<void> {
    this.handlers.delete(botId);
  }

  async updateBotStatus(botId: string, status: BotStatus): Promise<void> {
    const previousStatus = this.wsManager.getBotStatus(botId);
    this.wsManager.updateBotStatus(botId, status);

    if (previousStatus !== status) {
      await this.publish(
        'bot_status_changed',
        {
          botId,
          status,
          previousStatus,
          timestamp: new Date().toISOString(),
        },
        undefined // Broadcast to all
      );
    }
  }

  async getOnlineBots(): Promise<string[]> {
    return this.wsManager.getOnlineBots();
  }

  async isBotOnline(botId: string): Promise<boolean> {
    return this.wsManager.isConnected(botId);
  }

  /**
   * Get the ACK tracker instance.
   * Used by the plugin to handle ACK messages from clients.
   */
  getAckTracker(): AckTracker | undefined {
    return this.ackTracker;
  }

  /**
   * Acknowledge a message by its ID.
   * Returns true if the message was pending and acknowledged.
   */
  acknowledgeMessage(messageId: string): boolean {
    return this.ackTracker?.acknowledgeMessage(messageId) ?? false;
  }

  /**
   * Get message history for a bot.
   * Only available when persistence feature is enabled.
   */
  async getMessageHistory(
    botId: string,
    opts?: MessageHistoryOptions
  ): Promise<ServerMessage[]> {
    if (!this.messageStore) return [];
    return this.messageStore.getHistory(botId, opts);
  }

  async close(): Promise<void> {
    this.heartbeatManager?.stopAll();
    this.ackTracker?.cancelAll();
    this.retryManager?.cancelAll();
    this.wsManager.closeAll();
    if (this.pubSubBridge) {
      await this.pubSubBridge.close();
    }
    this.handlers.clear();
  }

  /**
   * Handle incoming Pub/Sub message and route to appropriate handlers/connections.
   */
  private handlePubSubMessage(channel: string, message: ServerMessage): void {
    this.logger.debug(`Received Pub/Sub message on ${channel}:`, message);
    this.deliverMessage(message, message.targetBotId);
  }

  /**
   * Deliver a message to the appropriate recipient(s).
   */
  private deliverMessage(message: ServerMessage, targetBotId?: string): void {
    if (targetBotId) {
      // Track message for ACK if required
      let deliveryMessage = message;
      if (this.ackTracker?.requiresAck(message.type)) {
        deliveryMessage = this.ackTracker.trackMessage(targetBotId, message);
      }

      // Deliver to specific bot
      const sent = this.wsManager.sendToBot(targetBotId, deliveryMessage);
      if (sent) {
        this.logger.debug(`Delivered message to bot ${targetBotId}`);
        // Persist message
        this.messageStore?.store(targetBotId, deliveryMessage).catch((err) => {
          this.logger.error(`Failed to persist message for ${targetBotId}:`, err);
        });
      } else if (this.offlineQueue) {
        // Bot is offline — enqueue for later delivery
        this.offlineQueue.enqueue(targetBotId, deliveryMessage).catch((err) => {
          this.logger.error(`Failed to enqueue offline message for ${targetBotId}:`, err);
        });
      }

      // Also invoke the handler if registered
      const handler = this.handlers.get(targetBotId);
      if (handler) {
        handler(message).catch((err) => {
          this.logger.error(
            `Handler error for bot ${targetBotId}:`,
            err
          );
        });
      }
    } else {
      // Broadcast to all connected bots
      const count = this.wsManager.broadcast(message);
      this.logger.debug(`Broadcast message to ${count} connections`);

      // Invoke all handlers
      for (const [botId, handler] of this.handlers) {
        handler(message).catch((err) => {
          this.logger.error(`Handler error for bot ${botId}:`, err);
        });
      }
    }
  }

  /**
   * Handle bot connection event.
   */
  private handleBotConnect(botId: string): void {
    // Start heartbeat monitoring
    this.heartbeatManager?.startMonitoring(botId);

    // Flush offline queue
    if (this.offlineQueue) {
      this.offlineQueue.flush(botId).then((messages) => {
        for (const msg of messages) {
          this.wsManager.sendToBot(botId, msg);
        }
        if (messages.length > 0) {
          this.logger.info(`Flushed ${messages.length} offline messages to bot ${botId}`);
        }
      }).catch((err) => {
        this.logger.error(`Failed to flush offline queue for ${botId}:`, err);
      });
    }

    // Broadcast status change
    this.publish(
      'bot_status_changed',
      {
        botId,
        status: 'online',
        previousStatus: 'offline',
        timestamp: new Date().toISOString(),
      },
      undefined
    ).catch((err) => {
      this.logger.error('Failed to publish connect status:', err);
    });
  }

  /**
   * Handle bot disconnection event.
   */
  private handleBotDisconnect(botId: string): void {
    // Stop heartbeat monitoring
    this.heartbeatManager?.stopMonitoring(botId);

    // Cancel pending retries and move to offline queue
    if (this.retryManager) {
      const cancelled = this.retryManager.cancelRetriesForBot(botId);
      if (this.offlineQueue && cancelled.length > 0) {
        for (const entry of cancelled) {
          this.offlineQueue.enqueue(botId, entry.message).catch((err) => {
            this.logger.error(`Failed to enqueue cancelled retry for ${botId}:`, err);
          });
        }
      }
    }

    // Broadcast status change
    this.publish(
      'bot_status_changed',
      {
        botId,
        status: 'offline',
        previousStatus: this.wsManager.getBotStatus(botId),
        timestamp: new Date().toISOString(),
      },
      undefined
    ).catch((err) => {
      this.logger.error('Failed to publish disconnect status:', err);
    });
  }
}
