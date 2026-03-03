/**
 * Message Bus Module
 *
 * Real-time communication backbone for the ClawTeam Platform.
 * Handles WebSocket connections, Redis Pub/Sub, and bot status management.
 *
 * @example
 * ```typescript
 * // Using the Fastify plugin with ICapabilityRegistry (recommended)
 * import messageBusPlugin from '@clawteam/api/message-bus';
 * import { MockCapabilityRegistry } from '@clawteam/api/capability-registry';
 *
 * const registry = new MockCapabilityRegistry();
 *
 * fastify.register(messageBusPlugin, {
 *   redis: { host: 'localhost', port: 6379 },
 *   registry, // BotId derived from API key validation
 * });
 *
 * // Access message bus from route handlers
 * fastify.get('/send', async (request, reply) => {
 *   await fastify.messageBus.publish('task_assigned', { taskId: '123' }, 'bot-a');
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Using the mock for testing
 * import { MockMessageBus } from '@clawteam/api/message-bus';
 *
 * const bus = new MockMessageBus();
 * await bus.publish('task_assigned', { taskId: '123' }, 'bot-a');
 * ```
 */

// Core interfaces and types
export type {
  IMessageBus,
  MessageHandler,
  BotStatus,
  ClientMessage,
  ServerMessage,
  ConnectionInfo,
  HeartbeatConfig,
  AckConfig,
  OfflineQueueConfig,
  PersistenceConfig,
  RetryConfig,
  MessageBusFeatureConfig,
} from './interface';
export {
  REDIS_CHANNELS,
  REDIS_KEYS,
  getChannelForEvent,
  getAllChannels,
} from './interface';

// Error types
export {
  MessageBusError,
  AuthenticationError,
  ConnectionError,
  PublishError,
  SubscriptionError,
  BotNotFoundError,
  BotOfflineError,
  AckTimeoutError,
  QueueFullError,
  MaxRetriesExceededError,
  WS_CLOSE_CODES,
} from './errors';
export type { WsCloseCode } from './errors';

// Implementations
export { MessageBus, type MessageBusOptions } from './message-bus';
export { WebSocketManager, type WebSocketManagerOptions } from './websocket-manager';
export { PubSubBridge, type PubSubBridgeOptions } from './pubsub-bridge';

// Phase 2: Feature managers
export { HeartbeatManager } from './heartbeat-manager';
export { AckTracker, type PendingAck } from './ack-tracker';
export { OfflineQueue } from './offline-queue';
export { MessageStore, type MessageHistoryOptions } from './message-store';
export { RetryManager, type RetryEntry } from './retry-manager';

// Mock implementation
export { MockMessageBus } from './mocks';

// Fastify plugin
export { default as messageBusPlugin, type MessageBusPluginOptions } from './plugin';
export { default } from './plugin';
